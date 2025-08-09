#!/usr/bin/env python3
"""
Initialize database with all required tables
"""
import os
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import create_engine

from api.core.database import Base
from api.models import (  # noqa: F401
    audit,
    base,
    change_request,
    contract,
    folder,
    group,
    guest,
    lock,
    notification,
    rbac,
    sharepoint,
    template,
    template_version,
)  # Import all models to ensure they're registered with SQLAlchemy

# Database URL
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://pooldrv:pooldrv@localhost:5432/pooldrv")


def init_database():
    """Create all tables in the database"""
    print(f"Connecting to: {DATABASE_URL}")

    # Create engine
    engine = create_engine(DATABASE_URL)

    # Drop all tables (optional - comment out if you want to keep existing data)
    print("Dropping existing tables...")
    Base.metadata.drop_all(bind=engine)

    # Create all tables
    print("Creating all tables...")
    Base.metadata.create_all(bind=engine)

    print("✅ Database initialized successfully!")

    # List created tables
    from sqlalchemy import inspect

    inspector = inspect(engine)
    tables = inspector.get_table_names()
    print(f"\n📋 Created {len(tables)} tables:")
    for table in sorted(tables):
        print(f"   - {table}")


if __name__ == "__main__":
    init_database()
