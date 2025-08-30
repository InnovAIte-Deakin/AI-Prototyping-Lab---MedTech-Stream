"""Health check routes for ReportRx backend."""

import os
from fastapi import APIRouter
from ..config import settings
from ..services.openai_service import openai_service

# PDF availability flag imported from the PDF service.
# If the service module isn't importable for any reason, treat as unavailable.
try:
    from ..services.pdf_service import PDF_AVAILABLE
except Exception:
    PDF_AVAILABLE = False

SERVICE_NAME = "ReportRx Backend"
SERVICE_VERSION = os.getenv("APP_VERSION", "1.0.0")

router = APIRouter()

@router.get("/health")
async def health_check():
    """Basic health endpoint with service metadata."""
    return {
        "status": "healthy",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
    }

@router.get("/health/live")
async def liveness_check():
    """Simple liveness probe."""
    return {"status": "alive"}

@router.get("/health/ready")
async def readiness_check():
    """
    Readiness probe:
    - OPENAI_API_KEY present
    - OpenAI model reachable (cheap 'ok' ping)
    - PDF extraction library available
    """
    openai_ok = await openai_service.ping()
    ready = bool(settings.openai_api_key) and openai_ok and bool(PDF_AVAILABLE)
    return {
        "status": "ready" if ready else "not_ready",
        "service": SERVICE_NAME,
        "version": SERVICE_VERSION,
        "checks": {
            "openai_configured": bool(settings.openai_api_key),
            "openai_reachable": openai_ok,
            "pdf_available": bool(PDF_AVAILABLE),
        },
    }
