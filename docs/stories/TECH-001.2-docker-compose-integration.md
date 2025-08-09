# Story TECH-001.2: Integrate Frontend Container into Docker Compose

## Status
Draft

## Story

**As a** developer,  
**I want** the frontend container integrated into docker-compose.yml,  
**so that** I can start the entire application stack with a single docker-compose command

## Story Context

**Prerequisites:**
- **REQUIRED:** Story TECH-001.1 must be completed (Frontend Dockerfile created and tested)
- The Dockerfile from TECH-001.1 must support both development and production targets

**Existing System Integration:**

- Integrates with: Existing docker-compose.yml with postgres, redis, api, and worker services
- Technology: Docker Compose v2, Docker networks, environment configuration
- Follows pattern: Current service definition patterns in docker-compose.yml
- Touch points: Docker network configuration, volume mounts, environment variables, service dependencies
- Network: Services use 'app-network' (or default bridge if not specified)

## Acceptance Criteria

**Functional Requirements:**

1. Frontend service added to docker-compose.yml with proper configuration
2. Development configuration uses bind mounts for hot-reload functionality
3. Frontend container connects to API through Docker internal network
4. Service starts automatically with `docker-compose up` command
5. Frontend accessible on host port 3000 (matching current local setup)

**Integration Requirements:**

6. Frontend service properly depends on API service availability
7. Environment variables for API_URL configured to use Docker service names
8. Existing services (postgres, redis, api, worker) remain unchanged
9. Frontend can communicate with API service on internal Docker network
10. CORS configuration adjusted if needed for container-to-container communication

**Quality Requirements:**

11. Container startup order ensures API is ready before frontend
12. Logs from all services remain accessible via docker-compose logs
13. Development workflow supports `docker-compose up` for full stack startup
14. Production override file (docker-compose.prod.yml) created for production config

## Tasks / Subtasks

- [ ] Verify prerequisites (TECH-001.1 completion)
  - [ ] Confirm Dockerfile exists in web/ directory
  - [ ] Verify Dockerfile builds successfully
- [ ] Add frontend service to docker-compose.yml (AC: 1, 3, 5)
  - [ ] Define service using Dockerfile from Story TECH-001.1
  - [ ] Configure port mapping (3000:3000)
  - [ ] Set up proper network configuration
- [ ] Configure development volumes (AC: 2)
  - [ ] Add bind mount for source code (./web:/app)
  - [ ] Add named volume for node_modules
  - [ ] Exclude dist/ and other build artifacts
- [ ] Set up service dependencies and health checks (AC: 6, 11)
  - [ ] Add depends_on with condition: service_healthy for API
  - [ ] Configure health check for startup validation
  - [ ] Set appropriate start_period for initial startup
  - [ ] Verify API health check is properly configured
- [ ] Configure environment variables (AC: 7, 9)
  - [ ] Set VITE_API_URL to http://api:8000
  - [ ] Pass through necessary development variables
  - [ ] Document required environment settings
- [ ] Create production override file (AC: 14)
  - [ ] Create docker-compose.prod.yml
  - [ ] Configure production-specific settings
  - [ ] Remove development volumes and bindings
- [ ] Test inter-service communication (AC: 9, 10)
  - [ ] Verify frontend can reach API endpoints
  - [ ] Check CORS headers if applicable
  - [ ] Validate WebSocket connections for hot-reload

## Technical Notes

**Integration Approach:**
- Add frontend service to existing docker-compose.yml
- Use same network as other services for internal communication
- Implement override pattern for dev vs prod configurations

**Existing Pattern Reference:**
- Follow service definition structure of API service
- Use similar health check patterns
- Apply consistent labeling and naming conventions

**Key Constraints:**
- Must not break existing service configurations
- Port 3000 must remain available on host
- Development performance must remain acceptable

**Example Docker Compose Configuration:**

```yaml
services:
  frontend:
    build:
      context: ./web
      target: development
      dockerfile: Dockerfile  # From TECH-001.1
    ports:
      - "3000:3000"
    volumes:
      - ./web:/app
      - /app/node_modules
    environment:
      - VITE_API_URL=http://api:8000
      - NODE_ENV=development
    depends_on:
      api:
        condition: service_healthy  # Wait for API to be healthy
    networks:
      - app-network
    healthcheck:
      test: ["CMD", "wget", "--spider", "-q", "http://localhost:3000"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

**Production Override Configuration (docker-compose.prod.yml):**

```yaml
services:
  frontend:
    build:
      target: production
    volumes: []  # No volumes in production
    environment:
      - VITE_API_URL=${VITE_API_URL:-http://api:8000}
      - NODE_ENV=production
```

**Environment File Updates (.env.example):**

```bash
# Frontend Configuration
VITE_API_URL=http://localhost:8000  # For local development
NODE_ENV=development
```

## Definition of Done

- [ ] Functional requirements met (AC 1-5)
- [ ] Integration requirements verified (AC 6-10)
- [ ] Quality requirements satisfied (AC 11-14)
- [ ] Full stack starts with single docker-compose up command
- [ ] All services communicate correctly
- [ ] Hot-reload works in development
- [ ] Production configuration separated and functional
- [ ] No regression in existing services

## Risk and Compatibility Check

**Primary Risk:** Network communication issues between frontend and API containers  
**Mitigation:** Use Docker's internal DNS, verify network configuration, test CORS settings  
**Rollback:** Comment out frontend service to restore original configuration

**Compatibility Verification:**

- [x] No breaking changes to existing APIs
- [x] Database changes (if any) are additive only (N/A)
- [x] Existing service configurations unchanged
- [x] Performance impact is minimal

## Dev Notes

### Relevant Source Tree
- docker-compose.yml - Main orchestration file
- docker-compose.prod.yml - Production override (to be created)
- web/ - Frontend application directory
- web/Dockerfile - Frontend Dockerfile (from TECH-001.1)
- .env.example - Environment variable template
- api/ - Backend API service (for reference)

### Configuration References
Current docker-compose.yml structure:
- postgres service on port 5432
- redis service on port 6379  
- api service on port 8000
- worker service (no exposed ports)
- All services use default bridge network

### Testing Standards

**Service Startup Verification:**
```bash
# Start the full stack
docker-compose up -d

# Check all services are running
docker-compose ps
# Expected: All services should show 'Up' status

# Monitor frontend logs
docker-compose logs -f frontend
# Expected: Vite dev server running on port 3000
```

**API Connectivity Testing:**
```bash
# Test API connectivity from frontend container
docker-compose exec frontend wget -O- http://api:8000/health
# Expected: API health check response

# Test frontend accessibility from host
curl http://localhost:3000
# Expected: HTML response from React app

# Test API calls from browser console
# Open http://localhost:3000 in browser
# Open DevTools Console and run:
fetch('/api/health').then(r => r.json()).then(console.log)
# Expected: Successful API response
```

**Hot-Reload Testing:**
```bash
# 1. Open http://localhost:3000 in browser
# 2. Modify web/src/App.jsx (change some text)
# 3. Save the file
# Expected: Browser should auto-refresh with changes within 1-2 seconds
```

**Network Verification:**
```bash
# Inspect network configuration
docker network ls
docker network inspect <network_name>

# Test internal DNS resolution
docker-compose exec frontend nslookup api
# Expected: Should resolve to internal IP
```

**Production Build Testing:**
```bash
# Test with production override
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up -d frontend

# Verify production build is served
curl -I http://localhost:3000
# Expected: Response headers with nginx server
```

### Troubleshooting Guide

**Common Issues and Solutions:**

1. **Port 3000 already in use:**
   ```bash
   # Find process using port
   lsof -i :3000
   # Kill process or change port mapping in docker-compose.yml
   ```

2. **Frontend can't connect to API:**
   - Check API health: `docker-compose exec api curl http://localhost:8000/health`
   - Verify network: `docker-compose exec frontend ping api`
   - Check CORS settings in API if getting CORS errors

3. **Hot-reload not working:**
   - Ensure volume mount is correct: `./web:/app`
   - Check Vite config has `--host 0.0.0.0`
   - On Windows/Mac, check Docker Desktop file sharing settings

4. **Container fails to start:**
   ```bash
   # Check detailed logs
   docker-compose logs --tail=50 frontend
   # Rebuild if needed
   docker-compose build --no-cache frontend
   ```

5. **CORS errors in browser:**
   - Add to API CORS configuration:
   ```python
   # In API service
   origins = ["http://localhost:3000", "http://frontend:3000"]
   ```

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-09 | 1.0 | Initial story creation | Sarah (PO) |
| 2025-08-09 | 1.1 | Added prerequisites, testing commands, and troubleshooting | Bob (SM) |