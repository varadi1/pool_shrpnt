"""
Alternative test configuration using SQLite for tests that don't require PostgreSQL.
This allows tests to run without Docker/PostgreSQL being available.
"""
import os
import tempfile
from collections.abc import AsyncGenerator
from pathlib import Path

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool, StaticPool

from api.core.database import Base, get_db, get_session
from api.main import app as fastapi_app

# Create a temporary directory for SQLite databases
TEST_DB_DIR = Path(tempfile.gettempdir()) / "pooldrv_tests"
TEST_DB_DIR.mkdir(exist_ok=True)


# Sync database for migrations (using SQLite)
@pytest.fixture(scope="function")
def test_db():
    # Use an in-memory SQLite database for each test
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


# Async database engine (using aiosqlite)
@pytest_asyncio.fixture(scope="function")
async def async_engine():
    """Create async database engine for testing with SQLite."""
    # Create a unique database file for this test
    db_file = TEST_DB_DIR / f"test_{os.getpid()}_{id(object())}.db"

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()

    # Clean up the database file
    if db_file.exists():
        db_file.unlink()


# Async database for API tests
@pytest_asyncio.fixture(scope="function")
async def async_test_db():
    """Create async test database session with SQLite."""
    # Create a unique database file for this test
    db_file = TEST_DB_DIR / f"test_{os.getpid()}_{id(object())}.db"

    engine = create_async_engine(
        f"sqlite+aiosqlite:///{db_file}",
        connect_args={"check_same_thread": False},
        poolclass=NullPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncTestingSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )

    async with AsyncTestingSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()

    # Clean up the database file
    if db_file.exists():
        db_file.unlink()


@pytest_asyncio.fixture(scope="function")
async def db_session(async_test_db):
    """Alias for async_test_db for compatibility"""
    yield async_test_db


@pytest.fixture(scope="function")
def client(test_db):
    from fastapi.testclient import TestClient

    def override_get_db():
        try:
            yield test_db
        finally:
            pass

    fastapi_app.dependency_overrides[get_db] = override_get_db

    with TestClient(fastapi_app) as test_client:
        yield test_client

    fastapi_app.dependency_overrides.clear()


@pytest_asyncio.fixture(scope="function")
async def async_client(async_test_db) -> AsyncGenerator[AsyncClient, None]:
    """Async test client for testing async endpoints"""
    from httpx import ASGITransport

    async def override_get_session():
        yield async_test_db

    fastapi_app.dependency_overrides[get_session] = override_get_session

    transport = ASGITransport(app=fastapi_app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    fastapi_app.dependency_overrides.clear()
