#!/usr/bin/env python3
"""
Test runner that handles database setup automatically.
Tries to use Docker PostgreSQL if available, falls back to SQLite.
"""
import os
import subprocess
import sys
import time
from pathlib import Path


def check_docker_available():
    """Check if Docker is available and running."""
    try:
        result = subprocess.run(["docker", "info"], capture_output=True, text=True, timeout=5)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def check_postgres_running():
    """Check if PostgreSQL container is already running."""
    try:
        result = subprocess.run(
            ["docker", "ps", "--filter", "name=pooldrv-postgres-test", "--format", "{{.Names}}"],
            capture_output=True,
            text=True,
        )
        return "pooldrv-postgres-test" in result.stdout
    except FileNotFoundError:
        return False


def start_postgres_container():
    """Start a PostgreSQL container for testing."""
    print("Starting PostgreSQL test container...")

    # Stop existing container if any
    subprocess.run(["docker", "rm", "-f", "pooldrv-postgres-test"], capture_output=True)

    # Start new container
    result = subprocess.run(
        [
            "docker",
            "run",
            "--name",
            "pooldrv-postgres-test",
            "-e",
            "POSTGRES_USER=pooldrv",
            "-e",
            "POSTGRES_PASSWORD=pooldrv",
            "-e",
            "POSTGRES_DB=pooldb_test",
            "-p",
            "5432:5432",
            "-d",
            "postgres:15-alpine",
        ],
        capture_output=True,
        text=True,
    )

    if result.returncode != 0:
        print(f"Failed to start PostgreSQL container: {result.stderr}")
        return False

    # Wait for PostgreSQL to be ready
    print("Waiting for PostgreSQL to be ready...")
    for i in range(30):
        result = subprocess.run(
            ["docker", "exec", "pooldrv-postgres-test", "pg_isready", "-U", "pooldrv"],
            capture_output=True,
        )

        if result.returncode == 0:
            print("PostgreSQL is ready!")
            return True

        time.sleep(1)

    print("PostgreSQL failed to start in time")
    return False


def run_tests_with_postgres():
    """Run tests with PostgreSQL database."""
    print("Running tests with PostgreSQL...")

    # Set environment variables for PostgreSQL
    env = os.environ.copy()
    env["TEST_DATABASE_URL"] = "postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test"
    env[
        "ASYNC_TEST_DATABASE_URL"
    ] = "postgresql+asyncpg://pooldrv:pooldrv@localhost:5432/pooldb_test"

    # Run tests
    result = subprocess.run([sys.executable, "-m", "pytest", "-v", "api/tests/"], env=env)

    return result.returncode


def run_tests_with_sqlite():
    """Run tests with SQLite database."""
    print("Running tests with SQLite (Docker not available)...")
    print("Note: Some integration tests may be skipped in SQLite mode.")

    # Copy SQLite conftest over the regular one temporarily
    import shutil

    conftest_path = Path("api/tests/conftest.py")
    conftest_backup = Path("api/tests/conftest.py.bak")
    conftest_sqlite = Path("api/tests/conftest_sqlite.py")

    # Backup original conftest
    shutil.copy2(conftest_path, conftest_backup)

    try:
        # Use SQLite conftest
        shutil.copy2(conftest_sqlite, conftest_path)

        # Run tests
        result = subprocess.run(
            [
                sys.executable,
                "-m",
                "pytest",
                "-v",
                "api/tests/",
                "-m",
                "not requires_postgres",
            ]  # Skip tests that require PostgreSQL
        )

        return result.returncode
    finally:
        # Restore original conftest
        shutil.copy2(conftest_backup, conftest_path)
        conftest_backup.unlink()


def main():
    """Main test runner."""
    print("=" * 60)
    print("poolDRV Test Runner")
    print("=" * 60)

    # Check if specific test files were requested
    test_args = sys.argv[1:] if len(sys.argv) > 1 else []

    if check_docker_available():
        print("Docker is available.")

        if not check_postgres_running():
            if not start_postgres_container():
                print("Failed to start PostgreSQL, falling back to SQLite...")
                return run_tests_with_sqlite()
        else:
            print("PostgreSQL test container is already running.")

        return run_tests_with_postgres()
    else:
        print("Docker is not available.")
        return run_tests_with_sqlite()


if __name__ == "__main__":
    sys.exit(main())
