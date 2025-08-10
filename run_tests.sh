#!/bin/bash
# Test runner script for poolDRV project

# Set test environment variables
export AZURE_TENANT_ID="test-tenant"
export AZURE_CLIENT_ID="test-client"
export AZURE_CLIENT_SECRET="test-secret"
export POOLDRV_AZURE_TENANT_ID="test-tenant"
export POOLDRV_AZURE_CLIENT_ID="test-client"
export POOLDRV_AZURE_CLIENT_SECRET="test-secret"
export POOLDRV_SHAREPOINT_SITE_URL="https://test.sharepoint.com/sites/test"
export POOLDRV_SHAREPOINT_TENANT_NAME="test"

# Database configuration - PostgreSQL only for tests
# NOTE: SQLite is not supported in this project
export DATABASE_URL="postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test"
export POOLDRV_DATABASE_URL="postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test"
export TEST_DATABASE_URL="postgresql://pooldrv:pooldrv@localhost:5432/pooldb_test"
export ASYNC_TEST_DATABASE_URL="postgresql+asyncpg://pooldrv:pooldrv@localhost:5432/pooldb_test"

# Run tests
echo "Running poolDRV tests..."
echo "========================="

if [ "$1" == "--story-34" ]; then
    echo "Running Story 3.4 notification tests only (PostgreSQL)..."
    python3 api/run_tests.py api/tests/test_notifications.py api/tests/test_teams_notifications.py api/tests/test_notification_monitoring.py -v | cat
elif [ "$1" == "--all" ]; then
    echo "Running all tests with PostgreSQL..."
    python3 api/run_tests.py -v | cat
else
    # Run specific test file(s) if provided
    if [ -n "$1" ]; then
        echo "Running tests (PostgreSQL): $@"
        python3 api/run_tests.py "$@" | cat
    else
        # Default: run story 3.4 tests
        echo "Running Story 3.4 notification tests (PostgreSQL)..."
        python3 api/run_tests.py api/tests/test_notifications.py api/tests/test_teams_notifications.py api/tests/test_notification_monitoring.py -v | cat
    fi
fi