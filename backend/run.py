#!/usr/bin/env python3
"""
Tiny launcher for the backend. Loads .env, honors HOST/PORT/DEBUG,
and starts uvicorn pointing at app.main:app.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path

from dotenv import load_dotenv
import uvicorn


def main() -> None:
    # Ensure CWD is the backend dir so .env and imports resolve
    backend_dir = Path(__file__).resolve().parent
    os.chdir(backend_dir)

    # Load .env if present (real secrets live here, not in .env.example)
    load_dotenv(backend_dir / ".env", override=False)

    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    debug = str(os.getenv("DEBUG", "false")).lower() == "true"

    # reload only in debug; uvicorn disallows reload with workers>1
    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=debug,
        log_level="info",
    )


if __name__ == "__main__":
    # Make Ctrl+C behave
    try:
        main()
    except KeyboardInterrupt:
        sys.exit(130)
