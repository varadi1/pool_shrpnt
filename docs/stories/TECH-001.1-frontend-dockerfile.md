# Story TECH-001.1: Create Frontend Dockerfile

## Status
go

## Story

**As a** DevOps engineer,  
**I want** a multi-stage Dockerfile for the React frontend application,  
**so that** the frontend can run in Docker containers for both development and production environments

## Story Context

**Existing System Integration:**

- Integrates with: Existing Docker Compose microservice architecture
- Technology: React 18, Vite 5, Node.js 18, Nginx (for production)
- Follows pattern: Multi-stage Docker builds used in API service
- Touch points: Package.json scripts, Vite configuration, environment variables

## Acceptance Criteria

**Functional Requirements:**

1. Dockerfile supports development mode with hot-reload capability via Vite HMR
2. Dockerfile supports production mode with optimized static build served via Nginx
3. Development stage properly handles node_modules and package-lock.json caching
4. Production build creates minimal final image (< 50MB excluding app code)
5. Container exposes port 3000 for consistency with current setup

**Integration Requirements:**

6. Existing npm scripts (dev, build, preview) work within container environment
7. Vite configuration adjusted to accept connections from Docker host (--host 0.0.0.0)
8. Environment variables passed correctly for API endpoint configuration
9. Source maps excluded from production build for security

**Quality Requirements:**

10. Docker build uses layer caching effectively to minimize rebuild time
11. Health check endpoint configured for container orchestration
12. Security scanning shows no critical vulnerabilities in base images

## Tasks / Subtasks

- [ ] Create multi-stage Dockerfile in web/ directory (AC: 1, 2)
  - [ ] Define development stage with Node 18 Alpine base
  - [ ] Configure WORKDIR and package installation with cache optimization
  - [ ] Set up development CMD with proper Vite host binding
- [ ] Implement production build stage (AC: 2, 4)
  - [ ] Create build stage for npm run build
  - [ ] Configure final Nginx stage with optimized settings
  - [ ] Copy built assets and configure nginx.conf
- [ ] Configure environment handling (AC: 8)
  - [ ] Set up ARG/ENV for build-time and runtime variables
  - [ ] Ensure VITE_API_URL can be configured
- [ ] Add Docker ignore file (AC: 10)
  - [ ] Exclude node_modules, dist, .env files
  - [ ] Include only necessary source files
  - [ ] Create .dockerignore with the following content:
    ```
    node_modules
    dist
    .env
    .env.local
    .git
    .gitignore
    README.md
    .vscode
    .idea
    *.log
    .DS_Store
    coverage
    .nyc_output
    ```
- [ ] Implement health check (AC: 11)
  - [ ] Add HEALTHCHECK instruction for container monitoring
  - [ ] Configure appropriate interval and timeout

## Technical Notes

**Integration Approach:** 
- Use bind mounts in development for source code hot-reload
- Named volume for node_modules to avoid platform conflicts
- Multi-stage build pattern: development → build → production

**Existing Pattern Reference:**
- Follow API service Dockerfile structure where applicable
- Use Alpine-based images for minimal size
- Apply similar caching strategies as backend services

**Key Constraints:**
- Must maintain sub-second hot-reload in development
- Production image must be under 50MB base size
- Cannot break existing local development workflow

**Example Dockerfile Structure:**

```dockerfile
# Development stage
FROM node:18-alpine AS development
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=development
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

# Build stage
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1
```

**Example nginx.conf Structure:**

```nginx
server {
    listen 3000;
    server_name localhost;
    root /usr/share/nginx/html;
    index index.html;
    
    # Handle React Router
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
```

**Note on npm ci vs npm install:**
- Use `npm ci` for reproducible builds (reads from package-lock.json)
- Use `npm ci --only=development` in dev stage to exclude production dependencies
- Use `npm ci` in build stage to include all dependencies for building

## Definition of Done

- [ ] Functional requirements met (AC 1-5)
- [ ] Integration requirements verified (AC 6-9)
- [ ] Existing functionality regression tested
- [ ] Code follows existing patterns and standards
- [ ] Docker build completes successfully for both dev and prod targets
- [ ] Container runs and serves application correctly
- [ ] Hot-reload works in development mode
- [ ] Production build is optimized and secure

## Risk and Compatibility Check

**Primary Risk:** Hot-reload performance degradation in containerized environment  
**Mitigation:** Use bind mounts for source, optimize file watching configuration  
**Rollback:** Existing local development remains functional as fallback

**Compatibility Verification:**

- [x] No breaking changes to existing APIs
- [x] Database changes (if any) are additive only (N/A)
- [x] UI changes follow existing design patterns (no UI changes)
- [x] Performance impact is negligible (container overhead only)

## Dev Notes

### Relevant Source Tree
- web/ - Frontend application root
- web/package.json - Dependencies and scripts
- web/vite.config.js - Vite configuration
- web/src/ - React source code
- docker-compose.yml - Existing container orchestration

### Testing Standards

**Build Verification Commands:**
```bash
# Test development build
docker build --target development -t frontend:dev ./web
docker run -p 3000:3000 -v $(pwd)/web:/app -v /app/node_modules frontend:dev

# Test production build
docker build --target production -t frontend:prod ./web
docker run -p 3000:3000 frontend:prod

# Verify image sizes
docker images | grep frontend

# Test health check
docker inspect --format='{{json .State.Health}}' <container_id>
```

**Functional Testing Checklist:**
- [ ] Development container starts successfully
- [ ] Hot-reload triggers on file changes (modify a component, see instant update)
- [ ] Production container serves static files correctly
- [ ] Health check endpoint responds with 200 status
- [ ] Environment variables are properly injected (check VITE_API_URL)
- [ ] Browser can access application on http://localhost:3000
- [ ] React Router navigation works in production build
- [ ] Static assets are properly cached in production

**Layer Caching Verification:**
```bash
# Build once
time docker build --target production -t frontend:prod ./web

# Make a small change to source code (not package.json)
# Build again and verify faster build time due to layer caching
time docker build --target production -t frontend:prod ./web
```

**Security Scan:**
```bash
# Scan for vulnerabilities
docker scan frontend:prod
```

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2025-08-09 | 1.0 | Initial story creation | Sarah (PO) |
| 2025-08-09 | 1.1 | Enhanced testing guidance and added nginx.conf example | Bob (SM) |