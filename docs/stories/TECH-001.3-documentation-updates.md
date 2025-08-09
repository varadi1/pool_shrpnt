# Story TECH-001.3: Update Documentation and Scripts

## Status
Draft

## Story

**As a** new team member,  
**I want** updated documentation reflecting the containerized frontend setup,  
**so that** I can quickly onboard and start developing with the correct workflow

## Story Context

**Prerequisites:**
- **REQUIRED:** Story TECH-001.1 must be completed (Frontend Dockerfile created)
- **REQUIRED:** Story TECH-001.2 must be completed (Docker Compose integration working)
- Both frontend container configurations must be tested and functional

**Existing System Integration:**

- Integrates with: README.md, startup scripts, developer documentation
- Technology: Markdown documentation, Shell scripts, Docker commands
- Follows pattern: Current documentation structure and formatting
- Touch points: README.md, CONTRIBUTING.md (if exists), setup scripts, environment templates
- References: Configurations from TECH-001.1 (Dockerfile) and TECH-001.2 (docker-compose.yml)

## Acceptance Criteria

**Functional Requirements:**

1. README.md updated with new Docker-based setup instructions
2. Quick start section shows single docker-compose command for full stack
3. Development workflow documentation includes hot-reload instructions
4. Troubleshooting section covers common Docker frontend issues
5. Environment variable documentation updated for container context

**Integration Requirements:**

6. Legacy local development instructions preserved as alternative option
7. Migration guide provided for developers using existing local setup
8. Scripts updated to support both Docker and local development modes
9. .env.example updated with frontend-specific variables

**Quality Requirements:**

10. Documentation follows existing project style and formatting
11. All commands in documentation are tested and working
12. Clear distinction between development and production workflows
13. Visual diagram or table showing service architecture with frontend

## Tasks / Subtasks

- [ ] Update README.md main setup section (AC: 1, 2)
  - [ ] Add prerequisites (Docker, Docker Compose versions)
  - [ ] Replace/update quick start with docker-compose instructions
  - [ ] Add section explaining the containerized architecture
- [ ] Document development workflow (AC: 3, 4)
  - [ ] Explain hot-reload functionality in containers
  - [ ] Document volume mounting for development
  - [ ] Add debugging tips for containerized frontend
- [ ] Create migration guide (AC: 7)
  - [ ] Write section "Migrating from Local Development"
  - [ ] List differences and benefits
  - [ ] Provide step-by-step migration instructions
- [ ] Update/create helper scripts (AC: 8)
  - [ ] Create start.sh for full stack startup
  - [ ] Create dev.sh for development mode
  - [ ] Add stop.sh for graceful shutdown
- [ ] Update environment documentation (AC: 5, 9)
  - [ ] Update .env.example with VITE_API_URL
  - [ ] Document all frontend environment variables
  - [ ] Explain Docker networking for API communication
- [ ] Add troubleshooting guide (AC: 4)
  - [ ] Document specific issues from TECH-001.1 and TECH-001.2:
    - [ ] Port 3000 already in use
    - [ ] Frontend can't connect to API (http://api:8000)
    - [ ] Hot-reload not working with Docker volumes
    - [ ] CORS errors when accessing API
    - [ ] Container fails to start (missing Dockerfile)
    - [ ] npm install fails in container
    - [ ] Production build exceeds size limit
- [ ] Create architecture diagram (AC: 13)
  - [ ] Use ASCII art or Mermaid format
  - [ ] Show services: postgres, redis, api, worker, frontend
  - [ ] Include port mappings: 3000, 5432, 6379, 8000
  - [ ] Show network: app-network
  - [ ] Highlight new frontend integration

## Technical Notes

**Documentation Structure:**
```
README.md
├── Prerequisites
├── Quick Start (Docker - Primary)
├── Architecture Overview
├── Development Workflow
│   ├── Using Docker (Recommended)
│   ├── Local Development (Alternative)
│   └── Hot Reload Setup
├── Environment Variables
├── Troubleshooting
└── Migration Guide
```

**Concrete README Template:**

```markdown
# Project Name

## Prerequisites

- Docker >= 20.10
- Docker Compose >= 2.0
- 8GB RAM minimum
- Port 3000, 5432, 6379, 8000 available

## Quick Start

### 🚀 Docker Setup (Recommended)

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd <project-directory>
   ```

2. Copy environment variables:
   ```bash
   cp .env.example .env
   ```

3. Start the entire stack:
   ```bash
   docker-compose up
   ```

4. Access the application:
   - Frontend: http://localhost:3000
   - API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Architecture Overview

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│     API     │────▶│  PostgreSQL │
│  Port 3000  │     │  Port 8000  │     │  Port 5432  │
└─────────────┘     └─────────────┘     └─────────────┘
                           │                    
                           ▼                    
                    ┌─────────────┐     ┌─────────────┐
                    │    Worker   │────▶│    Redis    │
                    │   (Celery)  │     │  Port 6379  │
                    └─────────────┘     └─────────────┘
```

All services run in Docker containers on the `app-network`.

## Development Workflow

### Using Docker (Recommended)

#### Starting Development Environment
```bash
# Start all services
docker-compose up

# Or run in background
docker-compose up -d

# View logs
docker-compose logs -f frontend
```

#### Hot Reload
The frontend container is configured with hot-reload enabled:
- Source code is mounted as a volume
- Changes to files in `web/src` trigger automatic browser refresh
- Vite HMR websocket connection maintained through Docker

#### Useful Commands
```bash
# Rebuild frontend after package.json changes
docker-compose build frontend

# Access frontend container shell
docker-compose exec frontend sh

# Run npm commands in container
docker-compose exec frontend npm install <package>
```

### Local Development (Alternative)

If you prefer local development:

1. Start backend services:
   ```bash
   docker-compose up postgres redis api worker
   ```

2. Run frontend locally:
   ```bash
   cd web
   npm install
   npm run dev
   ```

## Environment Variables

### Frontend Variables
```env
# API Configuration
VITE_API_URL=http://localhost:8000  # Local development
# In Docker: http://api:8000

# Environment
NODE_ENV=development
```

### Backend Variables
```env
DATABASE_URL=postgresql://user:pass@postgres:5432/dbname
REDIS_URL=redis://redis:6379
```
```

**Complete Script Examples:**

**start.sh - Full Stack Startup:**
```bash
#!/bin/bash
set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m' # No Color

# Check Docker is running
if ! docker info > /dev/null 2>&1; then
    echo -e "${RED}Docker is not running. Please start Docker first.${NC}"
    exit 1
fi

# Check Docker Compose
if ! docker-compose version > /dev/null 2>&1; then
    echo -e "${RED}Docker Compose is not installed.${NC}"
    exit 1
fi

echo -e "${GREEN}Starting application stack...${NC}"

# Start infrastructure first
echo "Starting database and cache..."
docker-compose up -d postgres redis

# Wait for postgres to be healthy
echo "Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready > /dev/null 2>&1; do
    sleep 1
done

# Start application services
echo "Starting application services..."
docker-compose up -d api worker frontend

# Wait for services to be healthy
echo "Waiting for services to be ready..."
sleep 5

# Check service status
echo -e "\n${GREEN}Service Status:${NC}"
docker-compose ps

echo -e "\n${GREEN}Application is ready!${NC}"
echo "Frontend: http://localhost:3000"
echo "API: http://localhost:8000/docs"
echo -e "\nView logs: docker-compose logs -f"
```

**dev.sh - Development Mode:**
```bash
#!/bin/bash
set -e

# Enable hot reload and verbose logging
export COMPOSE_FILE=docker-compose.yml
export NODE_ENV=development

echo "Starting in development mode with hot-reload..."
docker-compose up --build
```

**stop.sh - Graceful Shutdown:**
```bash
#!/bin/bash
echo "Stopping all services..."
docker-compose down

echo "To remove volumes (database data), run:"
echo "  docker-compose down -v"
```

**Key Documentation Updates:**

Old Quick Start:
```bash
# Backend
docker-compose up -d postgres redis
docker-compose up api worker

# Frontend (separate terminal)
cd web
npm install
npm run dev
```

New Quick Start:
```bash
# Entire stack with one command
docker-compose up

# Or in background
docker-compose up -d

# View logs
docker-compose logs -f frontend
```

**Troubleshooting Section Template:**

```markdown
## Troubleshooting

### Port 3000 Already in Use
**Error:** `bind: address already in use`

**Solution:**
```bash
# Find process using port
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# Kill the process or change port in docker-compose.yml
```

### Frontend Can't Connect to API
**Error:** `ERR_CONNECTION_REFUSED` or `CORS error`

**Solution:**
1. Verify API is running: `docker-compose ps api`
2. Check network: `docker network inspect <project>_app-network`
3. Ensure VITE_API_URL is set correctly:
   - Docker: `http://api:8000`
   - Local: `http://localhost:8000`
4. Check API CORS settings allow `http://localhost:3000`

### Hot-Reload Not Working
**Issue:** Changes to code don't reflect in browser

**Solution:**
1. Verify volume mount in docker-compose.yml:
   ```yaml
   volumes:
     - ./web:/app
     - /app/node_modules
   ```
2. Check Vite config has `--host 0.0.0.0`
3. On Windows/Mac: Check Docker Desktop file sharing settings
4. Restart container: `docker-compose restart frontend`

### Container Fails to Start
**Error:** `Cannot find module` or `npm ERR!`

**Solution:**
1. Rebuild container: `docker-compose build --no-cache frontend`
2. Check Dockerfile exists in web/ (from TECH-001.1)
3. Verify package.json is valid
4. Clear Docker cache: `docker system prune`
```

**Migration Guide Template:**

```markdown
## Migration Guide: Local to Docker Development

### Before Migration
- Ensure all local changes are committed
- Note your current Node version: `node --version`
- Stop any running local services

### Migration Steps

1. **Stop Local Frontend:**
   ```bash
   # In your frontend terminal, press Ctrl+C
   # Or find and kill the process:
   lsof -i :3000
   kill <PID>
   ```

2. **Clean Local Environment:**
   ```bash
   cd web
   rm -rf node_modules
   rm package-lock.json
   ```

3. **Pull Latest Changes:**
   ```bash
   git pull origin main
   ```

4. **Start Docker Environment:**
   ```bash
   docker-compose up --build
   ```

5. **Verify Migration:**
   - Frontend loads at http://localhost:3000
   - Hot-reload works (edit a file, see change)
   - API calls succeed

### Benefits After Migration
- ✅ Consistent environment across team
- ✅ No Node version conflicts
- ✅ Single command startup
- ✅ Isolated dependencies
- ✅ Closer to production environment

### Rollback if Needed
To return to local development:
```bash
docker-compose down
cd web && npm install && npm run dev
```
```

## Definition of Done

- [ ] All documentation sections updated (AC 1-5)
- [ ] Migration path clearly documented (AC 6-7)
- [ ] Helper scripts created and tested (AC 8)
- [ ] Environment configuration complete (AC 9)
- [ ] Documentation quality verified (AC 10-13)
- [ ] All code examples tested and working
- [ ] No broken links or outdated references
- [ ] Team review of documentation completed

## Risk and Compatibility Check

**Primary Risk:** Confusion between Docker and local development workflows  
**Mitigation:** Clear separation of workflows, preserve both options, provide migration guide  
**Rollback:** Documentation under version control, can revert if needed

**Compatibility Verification:**

- [x] Existing local workflow remains documented
- [x] No breaking changes for current developers
- [x] Both development modes supported
- [x] Clear upgrade path provided

## Dev Notes

### Files to Update
- README.md - Main documentation
- .env.example - Environment template
- .gitignore - Ensure Docker artifacts ignored
- CONTRIBUTING.md - If exists, update development setup
- scripts/ - Create helper scripts directory

### Documentation Standards
- Use markdown formatting consistently
- Include code blocks with syntax highlighting
- Provide copy-paste ready commands
- Test all documented procedures
- Include expected output where helpful

### Testing the Documentation

**Validation Checklist:**
- [ ] Prerequisites section lists correct Docker/Compose versions
- [ ] Quick Start commands execute without errors:
  ```bash
  git clone <repo>
  cd <project>
  cp .env.example .env
  docker-compose up
  ```
- [ ] Frontend accessible at http://localhost:3000
- [ ] API accessible at http://localhost:8000/docs
- [ ] Hot-reload works (modify web/src/App.jsx, see change)
- [ ] All scripts execute successfully:
  ```bash
  chmod +x scripts/*.sh
  ./scripts/start.sh  # Should start all services
  ./scripts/stop.sh   # Should stop all services
  ```
- [ ] Troubleshooting covers issues from Stories 1 & 2:
  - [ ] Port conflict resolution works
  - [ ] API connection issue solution works
  - [ ] CORS configuration documented
- [ ] Migration guide successfully transitions a developer
- [ ] Architecture diagram accurately reflects system
- [ ] Environment variables properly documented
- [ ] Both Docker and local workflows functional

**Test with New Developer:**
1. Give documentation to someone unfamiliar with project
2. Time how long setup takes (target: < 10 minutes)
3. Note any confusion points
4. Verify they can make a code change and see it reflected

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-09 | 1.0 | Initial story creation | Sarah (PO) |
| 2025-08-09 | 1.1 | Added prerequisites, concrete templates, and detailed examples | Bob (SM) |