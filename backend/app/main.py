"""
Main FastAPI application for ReportRx backend.
"""

from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from typing import List, Union

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException

from .config import settings
from .routes.health import router as health_router
from .routes.interpret import router as interpret_router
from .routes.upload import router as upload_router

# Configure logging
logging.basicConfig(
    level=logging.INFO if not settings.debug else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager."""
    logger.info("Starting ReportRx backend...")
    logger.info("Debug mode: %s", settings.debug)
    logger.info("OpenAI model: %s", settings.openai_model)
    try:
        yield
    finally:
        logger.info("Shutting down ReportRx backend...")


# Create FastAPI application
app = FastAPI(
    title="ReportRx Backend",
    description="Backend API for ReportRx - Lab Report Interpretation Application",
    version=settings.app_version,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    lifespan=lifespan,
)

# Configure CORS
# settings.cors_origins() returns a list in our config; support string/list defensively.
origins: Union[str, List[str]]
origins = (
    settings.cors_origins()  # method in our config
    if callable(getattr(settings, "cors_origins", None))
    else getattr(settings, "cors_origins", [])
)
if isinstance(origins, str):
    origins = [o.strip() for o in origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins or ["http://localhost:3000", "http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global exception handlers
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    """Handle HTTP exceptions."""
    logger.error("HTTP error %s: %s", exc.status_code, exc.detail)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "status": "error", "status_code": exc.status_code},
    )


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    """Handle request validation errors."""
    logger.error("Validation error: %s", exc.errors())
    return JSONResponse(
        status_code=422,
        content={"error": "Invalid request data", "status": "error", "details": exc.errors()},
    )


@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    """Handle general exceptions."""
    logger.error("Unexpected error: %s", str(exc), exc_info=True)
    return JSONResponse(
        status_code=500,
        content={
            "error": "Internal server error",
            "status": "error",
            "details": str(exc) if settings.debug else "An unexpected error occurred",
        },
    )


# Include routers (versioned API)
app.include_router(health_router, prefix="/api/v1", tags=["Health"])
app.include_router(interpret_router, prefix="/api/v1", tags=["Interpretation"])
app.include_router(upload_router, prefix="/api/v1", tags=["Upload"])


# Root endpoint
@app.get("/")
async def root():
    """Root endpoint with basic API information."""
    return {
        "service": "ReportRx Backend",
        "version": settings.app_version,
        "description": "Lab Report Interpretation API",
        "docs_url": "/docs" if settings.debug else "Documentation disabled in production",
        "health_check": "/api/v1/health",
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.host,
        port=settings.port,
        reload=settings.debug,
        log_level="info",
    )
