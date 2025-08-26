#!/usr/bin/env bash
set -euo pipefail

# Simple cross-platform setup helper for macOS/Linux.
# - Creates Python venv and installs backend deps
# - Writes/updates backend .env
# - Installs frontend deps
# - Optionally starts both dev servers in the background

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

OPENAI_KEY=""
OPENAI_MODEL="gpt-4o"
RUN_SERVERS=1
BACKEND_PORT=8000
FRONTEND_PORT=5173

usage() {
  echo "Usage: $0 [--openai-key <key>] [--model <name>] [--no-run] [--backend-port <port>] [--frontend-port <port>]" >&2
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --openai-key)
      OPENAI_KEY="${2:-}"; shift 2;;
    --model)
      OPENAI_MODEL="${2:-}"; shift 2;;
    --no-run)
      RUN_SERVERS=0; shift;;
    --backend-port)
      BACKEND_PORT="${2:-}"; shift 2;;
    --frontend-port)
      FRONTEND_PORT="${2:-}"; shift 2;;
    -h|--help)
      usage; exit 0;;
    *)
      echo "Unknown arg: $1" >&2; usage; exit 1;;
  esac
done

echo "==> Backend: creating virtual environment"
python3 -m venv "$BACKEND_DIR/venv" || python -m venv "$BACKEND_DIR/venv"

VENV_PY="$BACKEND_DIR/venv/bin/python"
VENV_PIP="$BACKEND_DIR/venv/bin/pip"

echo "==> Backend: upgrading pip tooling"
"$VENV_PY" -m pip install --upgrade pip setuptools wheel

echo "==> Backend: installing requirements"
"$VENV_PIP" install -r "$BACKEND_DIR/requirements.txt"

echo "==> Backend: preparing .env"
if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  cp "$BACKEND_DIR/.env.example" "$BACKEND_DIR/.env"
fi

# Safely update OPENAI_* entries without relying on sed -i differences
TMP_ENV="$(mktemp)"
grep -v -E '^(OPENAI_API_KEY|OPENAI_MODEL)=' "$BACKEND_DIR/.env" > "$TMP_ENV" || true

if [[ -n "$OPENAI_KEY" ]]; then
  echo "OPENAI_API_KEY=$OPENAI_KEY" >> "$TMP_ENV"
else
  # Keep existing value if present, otherwise add placeholder
  if ! grep -q '^OPENAI_API_KEY=' "$BACKEND_DIR/.env"; then
    echo "OPENAI_API_KEY=dev-placeholder" >> "$TMP_ENV"
  else
    grep '^OPENAI_API_KEY=' "$BACKEND_DIR/.env" >> "$TMP_ENV" || true
  fi
fi

echo "OPENAI_MODEL=$OPENAI_MODEL" >> "$TMP_ENV"
mv "$TMP_ENV" "$BACKEND_DIR/.env"

if [[ "$RUN_SERVERS" -eq 1 ]]; then
  echo "==> Backend: starting dev server (port $BACKEND_PORT)"
  HOST=0.0.0.0 PORT="$BACKEND_PORT" nohup "$VENV_PY" "$BACKEND_DIR/run.py" \
    > "$BACKEND_DIR/backend_server.log" 2>&1 & echo $! > "$BACKEND_DIR/backend.pid"
  sleep 2 || true
fi

echo "==> Frontend: installing npm dependencies"
cd "$ROOT_DIR"
if command -v npm >/dev/null 2>&1; then
  (npm ci || npm install)
else
  echo "npm is not installed. Install Node.js 18+ (recommend 20+)." >&2
  exit 1
fi

if [[ "$RUN_SERVERS" -eq 1 ]]; then
  echo "==> Frontend: starting Vite dev server (port $FRONTEND_PORT)"
  nohup npm run dev -- --strictPort --port "$FRONTEND_PORT" \
    > "$ROOT_DIR/frontend_server.log" 2>&1 & echo $! > "$ROOT_DIR/frontend.pid"
  sleep 2 || true
fi

echo "==> Done"
echo "- Backend health: http://localhost:$BACKEND_PORT/api/v1/health"
echo "- Frontend:       http://localhost:$FRONTEND_PORT"
if [[ "$RUN_SERVERS" -eq 1 ]]; then
  echo "- Backend PID file: $BACKEND_DIR/backend.pid"
  echo "- Frontend PID file: $ROOT_DIR/frontend.pid"
  echo "- Backend logs: $BACKEND_DIR/backend_server.log"
  echo "- Frontend logs: $ROOT_DIR/frontend_server.log"
fi

