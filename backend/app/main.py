import logging
import os
import time
import uuid

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
        request_id_holder = {"rid": None}

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                status_code_holder["status"] = message.get("status", 0)
                # Try to read request id from headers written by RequestIDMiddleware
                headers = message.get("headers") or []
                for k, v in headers:
                    if k.decode().lower() == "x-request-id":
                        request_id_holder["rid"] = v.decode()
            await send(message)

        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            duration_ms = int((time.perf_counter() - start) * 1000)
            # If RequestIDMiddleware hasn't written yet, try to derive from scope
            if not request_id_holder["rid"]:
                for k, v in scope.get("headers", []):
                    if k.decode().lower() == "x-request-id":
                        request_id_holder["rid"] = v.decode()
            # Intentionally avoid logging headers, bodies, or files
            self.logger.info(
                {
                    "event": "http_request",
                    "method": method,
                    "path": path,
                    "status": status_code_holder["status"],
                    "duration_ms": duration_ms,
                    "request_id": request_id_holder["rid"],
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


class RequestIDMiddleware(BaseHTTPMiddleware):
    """Attach a request ID to each response and propagate incoming X-Request-ID.

    - If the client supplies X-Request-ID, echo it back.
    - Otherwise, generate a UUID4 and set X-Request-ID.
    The ID is included in logs by PHIScrubbedLoggingMiddleware.
    """

    async def dispatch(self, request, call_next):
        incoming = request.headers.get("x-request-id")
        rid = incoming or uuid.uuid4().hex
        response = await call_next(request)
        response.headers.setdefault("X-Request-ID", rid)
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
    # Request ID before logging so logs can capture the ID
    app.add_middleware(RequestIDMiddleware)
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
