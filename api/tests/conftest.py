import os
from collections.abc import AsyncGenerator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import NullPool

from api.core.database import Base, get_db, get_session
from api.main import app as fastapi_app

# Get PostgreSQL test database URL from environment or use default
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL", "postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test"
)
ASYNC_TEST_DATABASE_URL = os.getenv(
    "ASYNC_TEST_DATABASE_URL", "postgresql+asyncpg://pooldrv:pooldrv@localhost:5432/pooldb_test"
)


# Sync database for migrations
@pytest.fixture(scope="function")
def test_db():
    engine = create_engine(
        TEST_DATABASE_URL,
        poolclass=NullPool,
    )
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

    Base.metadata.create_all(bind=engine)

    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()
        Base.metadata.drop_all(bind=engine)


# Async database engine
@pytest_asyncio.fixture(scope="function")
async def async_engine():
    """Create async database engine for testing."""
    engine = create_async_engine(
        ASYNC_TEST_DATABASE_URL,
        poolclass=NullPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield engine

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


# Async database for API tests
@pytest_asyncio.fixture(scope="function")
async def async_test_db():
    engine = create_async_engine(
        ASYNC_TEST_DATABASE_URL,
        poolclass=NullPool,
    )

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    AsyncTestingSessionLocal = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autoflush=False,
    )

    async with AsyncTestingSessionLocal() as session:
        try:
            yield session
            # Don't commit in fixture - let tests handle their own transactions
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)

    await engine.dispose()


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
