import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded

from app.api.router import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging
from app.core.middleware import RequestSizeLimitMiddleware
from app.core.rate_limit import limiter
from app.db.session import engine
from app.services.scheduler import start_scheduler, stop_scheduler

settings = get_settings()
configure_logging()
logger = logging.getLogger("taskflow.api")


@asynccontextmanager
async def lifespan(_: FastAPI):
    start_scheduler()
    yield
    stop_scheduler()
    engine.dispose()


app = FastAPI(
    title="TaskFlow API",
    version="1.0.0",
    description="User-scoped task, productivity, and notification API.",
    docs_url="/docs" if settings.app_env.lower() != "production" else None,
    redoc_url="/redoc" if settings.app_env.lower() != "production" else None,
    openapi_url="/openapi.json",
    debug=False,
    lifespan=lifespan,
)
app.state.limiter = limiter


@app.exception_handler(HTTPException)
async def http_error_handler(_: Request, error: HTTPException):
    message = error.detail if isinstance(error.detail, str) else "Request could not be completed"
    return JSONResponse(
        status_code=error.status_code,
        headers=error.headers,
        content={"error": {"code": f"http_{error.status_code}", "message": message}},
    )


@app.exception_handler(RateLimitExceeded)
async def rate_limit_error_handler(_: Request, __: RateLimitExceeded):
    return JSONResponse(
        status_code=429,
        content={"error": {"code": "rate_limited", "message": "Rate limit exceeded"}},
    )


app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-CSRF-Token"],
)
app.add_middleware(RequestSizeLimitMiddleware, max_bytes=settings.request_max_bytes)


@app.middleware("http")
async def platform_security(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if settings.app_env.lower() == "production":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, error: RequestValidationError):
    details = [
        {"loc": item.get("loc"), "msg": item.get("msg"), "type": item.get("type")}
        for item in error.errors()
    ]
    return JSONResponse(
        status_code=422,
        content={
            "error": {
                "code": "validation_error",
                "message": "Request validation failed",
                "details": details,
            }
        },
    )


@app.exception_handler(Exception)
async def internal_error_handler(request: Request, error: Exception):
    logger.error(
        "request_failed method=%s path=%s error_type=%s",
        request.method,
        request.url.path,
        type(error).__name__,
    )
    return JSONResponse(
        status_code=500,
        content={"error": {"code": "internal_error", "message": "An internal error occurred"}},
    )


@app.get("/health", tags=["platform"], summary="Liveness check")
def health():
    return {"status": "ok"}


@app.get("/ready", tags=["platform"], summary="Readiness check")
def ready():
    from sqlalchemy import text

    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    return {"status": "ready", "database": "ok"}


app.include_router(api_router, prefix="/api/v1")
