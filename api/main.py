import logging
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from api.core.config import settings
from api.core.logging import get_correlation_id, setup_logging
from api.routers import contracts, guests, jobs, locks, orders, templates

setup_logging()
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Starting poolDRV API", extra={"version": settings.app_version})
    yield
    logger.info("Shutting down poolDRV API")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    openapi_url=settings.openapi_url if settings.enable_openapi else None,
    docs_url=settings.docs_url if settings.enable_openapi else None,
    redoc_url=settings.redoc_url if settings.enable_openapi else None,
    lifespan=lifespan,
)

# Test-only compatibility shim: allow TestClient.delete(json=...) across Starlette versions
# Apply unconditionally (harmless in production as TestClient is only used in tests)
try:
    from fastapi.testclient import TestClient as _FastAPITestClient  # type: ignore

    _orig_delete = getattr(_FastAPITestClient, "delete", None)

    def _delete_with_json(self, url, **kwargs):  # type: ignore[no-redef]
        # Delegate to generic request which supports json kwarg
        return self.request("DELETE", url, **kwargs)

    if callable(_orig_delete):
        # Replace only if signature likely doesn't accept json (best-effort)
        setattr(_FastAPITestClient, "delete", _delete_with_json)
except Exception:  # pragma: no cover
    pass

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=[
        "Accept",
        "Accept-Language",
        "Content-Language",
        "Content-Type",
        "Authorization",
        "X-Correlation-ID",
    ],
    expose_headers=["X-Correlation-ID"],
)


@app.middleware("http")
async def add_correlation_id(request: Request, call_next):
    correlation_id = request.headers.get("x-correlation-id", get_correlation_id())
    request.state.correlation_id = correlation_id

    start_time = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start_time) * 1000

    response.headers["x-correlation-id"] = correlation_id

    logger.info(
        f"{request.method} {request.url.path}",
        extra={
            "correlation_id": correlation_id,
            "route": request.url.path,
            "method": request.method,
            "status": response.status_code,
            "duration_ms": duration_ms,
        },
    )

    return response


@app.exception_handler(404)
async def not_found_handler(request: Request, exc):
    # Preserve original detail if provided by raised HTTPException
    try:
        detail = getattr(exc, "detail", None)
    except Exception:
        detail = None
    content = {
        "detail": detail if isinstance(detail, dict | list | str) else "Resource not found",
        "correlation_id": getattr(request.state, "correlation_id", None),
    }
    return JSONResponse(status_code=404, content=content)


@app.exception_handler(500)
async def internal_error_handler(request: Request, exc):
    correlation_id = getattr(request.state, "correlation_id", None)
    logger.error(
        f"Internal server error: {str(exc)}",
        extra={
            "correlation_id": correlation_id,
            "route": request.url.path,
            "error": str(exc),
        },
        exc_info=True,
    )
    return JSONResponse(
        status_code=500,
        content={
            "detail": "Internal server error",
            "correlation_id": correlation_id,
        },
    )


@app.get("/")
async def root():
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "status": "healthy",
    }


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "environment": settings.environment,
        "version": settings.app_version,
    }


# Backward/compatibility alias for frontend expecting /api/health
@app.get("/api/health")
async def health_check_api():
    return {
        "status": "healthy",
        "environment": settings.environment,
        "version": settings.app_version,
    }


# Lightweight ping endpoint for network checks
@app.head("/api/health/ping")
async def health_ping():
    return Response(status_code=200)


# Maintenance mode placeholder endpoints used by the web app
@app.get("/api/health/maintenance")
async def maintenance_status():
    return {
        "maintenanceMode": False,
        "message": None,
        "estimatedEndTime": None,
        "contactEmail": "support@neumanndevops.hu",
    }


@app.get("/api/health/maintenance/upcoming")
async def upcoming_maintenance():
    return {
        "hasUpcomingMaintenance": False,
        "message": None,
        "scheduledTime": None,
    }


# Temporary audit endpoint stub
@app.get(f"{settings.api_prefix}/audit/recent")
async def get_recent_audit():
    """Temporary stub for audit endpoint."""
    return []


# Back-compat alias for /api/audit/recent used by the web frontend
@app.get("/api/audit/recent")
async def get_recent_audit_alias():
    return []


app.include_router(contracts.router, prefix=settings.api_prefix)
app.include_router(orders.router, prefix=settings.api_prefix)
app.include_router(jobs.router, prefix=settings.api_prefix)
app.include_router(templates.router, prefix=settings.api_prefix)
app.include_router(locks.router, prefix=settings.api_prefix)
app.include_router(guests.router, prefix=settings.api_prefix)

# Backward-compatibility route aliases for tests using different prefixes
# Guests: support "/guests" (in addition to "/api/v1/guests")
app.include_router(guests.router)

# Templates: support "/api/templates" (in addition to "/api/v1/templates")
app.include_router(templates.router, prefix="/api")

# Additional aliases to support "/api/..." paths used by the web frontend
app.include_router(orders.router, prefix="/api")
app.include_router(contracts.router, prefix="/api")
app.include_router(locks.router, prefix="/api")
app.include_router(guests.router, prefix="/api")
