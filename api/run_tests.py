#!/usr/bin/env python3
"""
Test runner that handles database setup automatically.
STRICT: PostgreSQL ONLY. SQLite fallback is removed.
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
        # If port is already allocated, assume local PostgreSQL is running
        if "port is already allocated" in (result.stderr or ""):
            print("Port 5432 is already in use. Assuming PostgreSQL is running locally.")
            return True
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


def run_tests_with_postgres(test_args: list[str] | None = None):
    """Run tests with PostgreSQL database."""
    print("Running tests with PostgreSQL...")

    # Set environment variables for PostgreSQL
    env = os.environ.copy()
    env["TEST_DATABASE_URL"] = "postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test"
    env["ASYNC_TEST_DATABASE_URL"] = (
        "postgresql+asyncpg://pooldrv:pooldrv@localhost:5432/pooldb_test"
    )

    # Run tests
    cmd = [sys.executable, "-m", "pytest", "-v"]
    if test_args:
        cmd.extend(test_args)
    else:
        cmd.append("api/tests/")
    result = subprocess.run(cmd, env=env)

    return result.returncode


def ensure_postgres():
    """Ensure PostgreSQL is available. If Docker is present, start container; else assume local PG.

    Returns True if postgres is assumed ready or started successfully.
    """
    if check_docker_available():
        print("Docker is available.")
        if not check_postgres_running():
            return start_postgres_container()
        print("PostgreSQL test container is already running.")
        return True
    else:
        print("Docker is not available. Assuming local PostgreSQL is available on 5432...")
        # Best-effort: try connecting via psql if available
        try:
            result = subprocess.run(
                [
                    "pg_isready",
                    "-h",
                    "localhost",
                    "-p",
                    "5432",
                    "-U",
                    "pooldrv",
                ],
                capture_output=True,
            )
            if result.returncode == 0:
                print("Local PostgreSQL is ready.")
                return True
        except FileNotFoundError:
            pass
        # If pg_isready is not available, proceed; tests will fail fast if PG is missing
        return True


def main():
    """Main test runner."""
    print("=" * 60)
    print("poolDRV Test Runner")
    print("=" * 60)

    # Check if specific test files were requested
    test_args = sys.argv[1:] if len(sys.argv) > 1 else []

    if not ensure_postgres():
        print("Failed to ensure PostgreSQL is available.")
        return 1

    return run_tests_with_postgres(test_args)


if __name__ == "__main__":
    sys.exit(main())
