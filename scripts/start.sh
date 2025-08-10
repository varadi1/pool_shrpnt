#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

compose() {
  if command -v docker-compose >/dev/null 2>&1; then
    docker-compose "$@"
  else
    docker compose "$@"
  fi
}

ensure_docker_running() {
  if docker info >/dev/null 2>&1; then
    echo -e "${GREEN}Docker engine is running.${NC}"
    return 0
  fi

  echo -e "${YELLOW}Docker engine is not running. Attempting to start Docker Desktop...${NC}"

  case "$(uname -s)" in
    Darwin)
      # Try to start Docker Desktop on macOS
      osascript -e 'tell application "Docker" to activate' >/dev/null 2>&1 || \
      open -a Docker >/dev/null 2>&1 || true
      ;;
    Linux)
      # Best-effort non-interactive start for Docker service on Linux (may be ignored)
      if command -v systemctl >/dev/null 2>&1; then
        sudo -n systemctl start docker >/dev/null 2>&1 || true
      fi
      ;;
    *) ;;
  esac

  # Wait up to 120s for Docker to become ready
  for i in $(seq 1 120); do
    if docker info >/dev/null 2>&1; then
      echo -e "${GREEN}Docker engine is ready.${NC}"
      return 0
    fi
    sleep 1
  done

  echo -e "${RED}Docker did not become ready within 120 seconds. Please start Docker manually and retry.${NC}"
  exit 1
}

echo -e "${GREEN}Starting application stack...${NC}"

# Ensure Docker engine is running (start if needed)
ensure_docker_running

# Start infrastructure first
echo -e "${YELLOW}Starting database and cache...${NC}"
compose up -d postgres redis

echo -e "${YELLOW}Waiting for PostgreSQL to be ready...${NC}"
until compose exec -T postgres pg_isready >/dev/null 2>&1; do
  sleep 1
done

# Start application services
echo -e "${YELLOW}Starting application services...${NC}"
compose up -d api worker scheduler frontend

echo -e "${YELLOW}Waiting for services to stabilize...${NC}"
sleep 5

echo -e "\n${GREEN}Service Status:${NC}"
compose ps

echo -e "\n${GREEN}Application is ready!${NC}"
echo "Frontend: http://localhost:3000"
echo "API Docs: http://localhost:8000/docs"
echo -e "\nView logs: $(command -v docker-compose >/dev/null 2>&1 && echo docker-compose || echo 'docker compose') logs -f"


