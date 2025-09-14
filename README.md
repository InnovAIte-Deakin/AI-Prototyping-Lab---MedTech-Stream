# ReportRx Monorepo

ReportRx is an educational health explanations app. MVP stores no data and logs metadata only (no PHI or request bodies). This monorepo contains a Next.js frontend and a FastAPI backend with Docker Compose for local prod-like runs.

## Quickstart

1. Copy envs and update if needed:
   - `cp .env.example .env`
   - Edit `.env` and set `OPENAI_API_KEY=sk-...` (do not source `.env.example`)
2. Build and run:
   - `docker compose up --build`
3. Visit:
   - Frontend: http://localhost:3000
   - Health page: http://localhost:3000/health (calls backend)
   - Parser: http://localhost:3000/parse (PDF/Image upload or paste text)

## Features (MVP)

- PDF/Text/Image parsing (in-memory) → structured rows with heuristics for ranges/units and flagging.
- LLM interpretation to JSON with strict schema, one repair attempt, and robust fallback.
- Frontend flow: upload/paste → Parse → edit table → Explain → see summary, per_test, flags, next_steps, disclaimer.
- Risevest-inspired theme (colors, rounded buttons, cards, sticky tables) with accessible defaults (≥16px, focus rings, keyboard friendly).

## Environment

- FRONTEND_URL: `http://localhost:3000` (CORS origin)
- NEXT_PUBLIC_BACKEND_URL: `http://localhost:8000`
- OPENAI_API_KEY: Optional. If unset or network blocked, backend uses deterministic fallback JSON. Set it only in `.env`.
- Upload limits: up to 5 files per request, 500MB per file (subject to infra limits).
- ALLOWED_HOSTS: Comma-separated allowed hosts for backend (default: `localhost,127.0.0.1`; tests allow `testserver`).

### Env gotcha: avoiding empty keys

- Do not run with `--env-file .env.example` and do not `source` it. `.env.example` intentionally does not set `OPENAI_API_KEY` to avoid wiping your environment.
- After editing `.env`, recreate the backend so the container picks up changes: `docker compose up -d --force-recreate backend`.

## Test/Run Instructions

- Backend tests: `cp .env.example .env`
- Run services: `docker compose up --build`

## Limitations

- OCR: Scanned PDFs and images (PNG/JPEG) are supported via Tesseract OCR when available. Docker and CI include Tesseract. OCR accuracy depends on image quality.
- Network restrictions: if the backend cannot reach the LLM, it falls back to a safe, deterministic JSON interpretation.
- Stateless: no DB; all parsing is ephemeral; do not upload PHI to shared environments.

## Observability

- Request ID: every response includes `X-Request-ID` (propagates incoming value or generates one). The same ID is logged alongside method, path, status, and duration for easier correlation across services and clients.

## Testing

- Backend: fast, deterministic unit tests for parser and interpretation, plus an OCR smoke test that runs when Tesseract is available.
- Frontend: basic unit tests and an integration test that exercises the parse → interpret flow with mocked fetch.

## License

This repository is licensed under the MIT License (see `LICENSE`).

## Notes

- No persistence: backend writes nothing to disk; no volumes for uploads.
- Logging: backend logs method, path, status, and duration only (no bodies/files).
- Env: never commit secrets. `.env` is ignored; see `.env.example` for required variables.
 - OCR: set `ENABLE_OCR=1` (default) and optionally `TESSERACT_CONFIG` and language packs; backend tries text layer first, then falls back to OCR.

## Local tooling (optional)

- Frontend: `npm run lint`, `npm run typecheck`, `npm test` (inside `frontend/`).
- Backend: `make run`, `make test`, `ruff`, `black` (inside `backend/`).
