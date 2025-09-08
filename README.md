# ReportRx Monorepo

ReportRx is an educational health explanations app. MVP stores no data and logs metadata only (no PHI or request bodies). This monorepo contains a Next.js frontend and a FastAPI backend with Docker Compose for local prod-like runs.

## Quickstart

1. Copy envs and update if needed:
   - `cp .env.example .env`
2. Build and run:
   - `docker compose up --build`
3. Visit:
   - Frontend: http://localhost:3000
   - Health page: http://localhost:3000/health (calls backend)
   - Parser: http://localhost:3000/parse (PDF upload or paste text)

## Features (MVP)

- PDF/Text parsing (in-memory) → structured rows with heuristics for ranges/units and flagging.
- LLM interpretation to JSON with strict schema, one repair attempt, and robust fallback.
- Frontend flow: upload/paste → Parse → edit table → Explain → see summary, per_test, flags, next_steps, disclaimer.
- Risevest-inspired theme (colors, rounded buttons, cards, sticky tables) with accessible defaults (≥16px, focus rings, keyboard friendly).

## Environment

- FRONTEND_URL: `http://localhost:3000` (CORS origin)
- NEXT_PUBLIC_BACKEND_URL: `http://localhost:8000`
- OPENAI_API_KEY: Optional. If unset or network blocked, backend uses deterministic fallback JSON.
- ALLOWED_HOSTS: Comma-separated allowed hosts for backend (default: `localhost,127.0.0.1`; tests allow `testserver`).

## Test/Run Instructions

- Backend tests: `cd backend && make test`
- Run services: `docker compose up --build`

## Limitations

- No OCR: scanned images are not supported; PDFs must contain extractable text.
- Network restrictions: if the backend cannot reach the LLM, it falls back to a safe, deterministic JSON interpretation.
- Stateless: no DB; all parsing is ephemeral; do not upload PHI to shared environments.

## Notes

- No persistence: backend writes nothing to disk; no volumes for uploads.
- Logging: backend logs method, path, status, and duration only (no bodies/files).
- Env: never commit secrets. `.env` is ignored; see `.env.example` for required variables.

## Local tooling (optional)

- Frontend: `npm run lint`, `npm run typecheck`, `npm test` (inside `frontend/`).
- Backend: `make run`, `make test`, `ruff`, `black` (inside `backend/`).
