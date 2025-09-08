import logging
import os
import time

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import Response

from .routers.health import router as health_router
from .routers.interpret import router as interpret_router
from .routers.parse import router as parse_router


def get_frontend_origin() -> str:
    return os.getenv("FRONTEND_URL", "http://localhost:3000").rstrip("/")


class PHIScrubbedLoggingMiddleware:
    def __init__(self, app: FastAPI) -> None:
        self.app = app
        # Configure basic structured-ish logging
        logging.basicConfig(level=logging.INFO, format="%(message)s")
        self.logger = logging.getLogger("reportrx.backend")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        method = scope.get("method")
        path = scope.get("path")
        start = time.perf_counter()
        status_code_holder = {"status": None}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code_holder["status"] = message.get("status", 0)
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            # Intentionally avoid logging headers, bodies, or files
            self.logger.info(
                {
                    "event": "http_request",
                    "method": method,
                    "path": path,
                    "status": status_code_holder["status"],
                    "duration_ms": duration_ms,
                }
            )


def get_allowed_hosts() -> list[str]:
    raw = os.getenv("ALLOWED_HOSTS", "localhost,127.0.0.1").strip()
    hosts = [h.strip() for h in raw.split(",") if h.strip()]
    # Allow Starlette TestClient default host
    if "testserver" not in hosts:
        hosts.append("testserver")
    return hosts


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        response = await call_next(request)
        # Conservative default security headers; keep PHI out of logs separately
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "no-referrer")
        response.headers.setdefault("Permissions-Policy", "interest-cohort=()")
        return response


def create_app() -> FastAPI:
    app = FastAPI(title="ReportRx API", version="0.1.0")

    # CORS: only allow the configured frontend origin
    frontend_origin = get_frontend_origin()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[frontend_origin],
        allow_credentials=False,
        allow_methods=["GET", "POST", "OPTIONS"],
        allow_headers=["*"],
        max_age=600,
    )

    # PHI-scrubbed logging middleware
    app.add_middleware(PHIScrubbedLoggingMiddleware)

    # Security hardening
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=get_allowed_hosts())
    app.add_middleware(SecurityHeadersMiddleware)

    # Routers
    app.include_router(health_router, prefix="/api/v1")
    app.include_router(parse_router, prefix="/api/v1")
    app.include_router(interpret_router, prefix="/api/v1")

    @app.get("/", include_in_schema=False)
    async def root(_: Request) -> Response:
        return Response(status_code=204)

    return app


app = create_app()
