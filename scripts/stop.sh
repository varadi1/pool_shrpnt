#!/usr/bin/env bash
set -euo pipefail

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

echo "Stopping all services..."
compose down

echo "To remove volumes (database data), run:"
echo "  $(command -v docker-compose >/dev/null 2>&1 && echo docker-compose || echo 'docker compose') down -v"


