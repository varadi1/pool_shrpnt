# Multi-stage Dockerfile for frontend (Vite + React)

# Development stage with hot-reload (HMR)
FROM node:20-alpine AS development
WORKDIR /app

# Install only dev dependencies for faster iteration
COPY package*.json ./
RUN npm ci --include=dev

# Copy source (will be overridden by bind mount in docker-compose dev)
COPY . .

EXPOSE 3000

# Vite v7: listen on all interfaces for Docker and use port 3000
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]


# Build stage for optimized production assets
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build


# Production stage using nginx to serve static files
FROM nginx:alpine AS production

# Copy built assets
COPY --from=build /app/dist /usr/share/nginx/html

# Provide nginx configuration (listens on 3000)
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 3000

# Healthcheck for orchestrators
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1


