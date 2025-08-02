"""Health check routes for ReportRx backend."""

from fastapi import APIRouter

from ..config import settings

router = APIRouter()


@router.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "service": "ReportRx Backend",
        "version": "1.0.0"
    }


@router.get("/health/ready")
async def readiness_check():
    """Readiness check endpoint."""
    # In production, you might check database connections, external services, etc.
    return {
        "status": "ready",
        "checks": {
            "openai_configured": bool(settings.openai_api_key),
        },
    }
