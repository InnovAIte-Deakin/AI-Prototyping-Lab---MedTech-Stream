# CODEBASE_CONTEXT

## 1) Project Overview
ReportX is a monorepo for an educational lab-report explanation app with a Next.js frontend and FastAPI backend. Users upload PDF/image files or paste report text, the backend parses results into structured rows, and the app generates plain-language interpretation plus optional translation. The MVP is intentionally stateless: it avoids persistent storage and uses fallback logic when LLM access is unavailable.

**Problem it solves:** medical lab reports are hard for patients/caregivers to understand due to jargon, ranges, and flags.

**Intended users:** patients, caregivers, and (optionally) clinicians reviewing patient-friendly summaries.

---

## 2) Tech Stack

### Languages
- Python (backend, parser/OCR/LLM orchestration)
- TypeScript (frontend app and tests)
- JavaScript (Next config)
- CSS (global and page styling)
- Shell script (`dev` helper)
- YAML (`docker-compose.yml`, GitHub Actions workflow file)

### Runtime / Production dependencies

**Backend (`backend/pyproject.toml`)**
- `fastapi>=0.110.0`
- `uvicorn[standard]>=0.29.0`
- `python-multipart>=0.0.9`
- `pydantic>=2.7.0`
- `pymupdf>=1.24.0`
- `httpx>=0.27.0`
- `pytesseract>=0.3.10`
- `Pillow>=10.0.0`
- `openai>=1.40.0`
- Python runtime: `>=3.11`

**Frontend (`frontend/package.json`)**
- `next@14.2.5`
- `react@18.3.1`
- `react-dom@18.3.1`

### Development-only / quality tooling

**Backend (`backend/pyproject.toml` optional `dev`)**
- `ruff>=0.4.2`
- `black>=24.4.0`
- `pytest>=8.2.0`
- `httpx>=0.27.0` (also used at runtime)

**Frontend (`frontend/package.json` devDependencies)**
- Testing: `vitest@1.6.0`, `jsdom@24.1.0`, `@testing-library/react@14.2.1`, `@testing-library/jest-dom@6.4.5`, `@testing-library/user-event@14.5.2`
- Lint/format/type: `eslint@8.57.0`, `eslint-config-next@14.2.5`, `prettier@3.3.2`, `typescript@5.4.5`
- Types: `@types/node@20.11.30`, `@types/react@18.2.66`, `@types/react-dom@18.2.22`
- Build internals: `rollup@^4.21.2`, optional `@rollup/rollup-linux-x64-gnu@4.21.2`

### Platform / infra tools
- Docker + Docker Compose (root `docker-compose.yml`, service Dockerfiles)
- Node version pin: `.nvmrc` => `20`
- Tesseract OCR installed in backend container (`backend/Dockerfile`)
- GitHub Actions workflow exists at `.github/workflows/ci.yml` but is currently commented out (not active).

---

## 3) Project Structure

### Annotated tree (top 2–3 levels)
```text
reportx/
├─ backend/                    # FastAPI API, parsing/OCR/LLM services, backend tests
│  ├─ app/
│  │  ├─ main.py               # App factory, middleware, CORS/hosts/security headers, router wiring
│  │  ├─ routers/              # HTTP endpoints: health, parse, interpret, translate
│  │  └─ services/             # Core business logic: parser heuristics, OCR extraction, LLM/translation
│  ├─ tests/                   # Pytest suite for API behavior, parser rules, OCR smoke, translation
│  ├─ pyproject.toml           # Python deps + tooling config (black/ruff/pytest)
│  ├─ Dockerfile               # Python 3.11 image, installs tesseract + runtime deps
│  └─ Makefile                 # Local helper targets (run/test/lint/format)
├─ frontend/                   # Next.js UI app, client components, store, unit/integration tests
│  ├─ src/
│  │  ├─ app/                  # App Router pages (`/`, `/parse`, `/health`, `/workbench`)
│  │  ├─ components/           # Reusable UI/domain components + `ui/` primitives
│  │  ├─ lib/                  # Frontend utilities (health check, export)
│  │  ├─ store/                # Parse context store for workbench flow
│  │  ├─ test/                 # Test setup
│  │  └─ types/                # Shared TS UI types
│  ├─ package.json             # Scripts and JS/TS dependencies
│  ├─ next.config.mjs          # Next runtime config (strict mode enabled)
│  ├─ tsconfig.json            # TypeScript and path alias config
│  └─ vitest.config.ts         # Frontend unit/integration test runner config
├─ docker-compose.yml          # Local multi-service orchestration (backend, frontend, announce)
├─ .env.example                # Env var names/defaults (no secrets)
├─ dev                         # Shell wrapper for common docker compose actions
└─ README.md                   # Quickstart + MVP behavior + embedded SRS details
```

### Non-obvious naming conventions to note
- Frontend package name is `reportrx-frontend` (double `r`), while product naming elsewhere is `ReportX`/`reportrx`.
- There are two frontend parse experiences:
  - `src/app/parse/page.tsx` (single-page end-user flow), and
  - `src/app/workbench/page.tsx` + `store/parseStore.tsx` (modular “workbench” flow).
- Backend import namespace is `app.*` from `backend/app`.

---

## 4) Architecture Overview

### How parts connect
1. Browser loads Next.js frontend pages.
2. Frontend calls backend HTTP endpoints under `/api/v1/*` (`/health`, `/parse`, `/interpret`, `/translate`).
3. Backend parse endpoint extracts text from PDF/image (PyMuPDF + optional Tesseract OCR) or from pasted JSON text.
4. Backend parser converts text lines to structured lab rows with flags/confidence.
5. Backend interpretation uses OpenAI (Responses or Chat endpoint) when configured; otherwise deterministic fallback is returned.
6. Backend can translate summary text via the same LLM service.

### External dependencies/services
- OpenAI API (via `openai` SDK; configurable `OPENAI_BASE_URL`/`OPENAI_API_BASE`, model defaults to `gpt-5`).
- Tesseract OCR binary (local system package in Docker image).
- No database integration is present in code.

### Diagram
```text
[Browser/User]
      |
      v
[Next.js Frontend (pages/components)]
      |
      v
[FastAPI API (/api/v1)]
      |
      +--> [Parser service (regex + heuristics)]
      +--> [OCR service (PyMuPDF + Tesseract)]
      +--> [LLM service]
                |
                v
           [OpenAI API]
```

---

## 5) Key Files and Their Roles

- `backend/app/main.py`
  - **What:** creates the FastAPI app, middleware stack, CORS/host restrictions, security headers, request ID propagation, and router registration.
  - **Why it matters:** all API behavior and cross-cutting concerns are centralized here.
  - **Risk if changed carelessly:** CORS failures, host blocking, missing request IDs/log correlation, or reduced security headers.

- `backend/app/routers/parse.py`
  - **What:** multipart/JSON intake, file limits/type checks, text extraction, parser invocation, response shaping.
  - **Why it matters:** core ingestion path for report data.
  - **Risk:** broken uploads, unsafe payload handling, incorrect response schema used by frontend.

- `backend/app/services/parser.py`
  - **What:** main heuristic parser (regex-heavy) for test/value/unit/range/flag extraction and confidence scoring.
  - **Why it matters:** determines structured quality for all downstream interpretation.
  - **Risk:** small regex edits can silently degrade extraction accuracy across many report formats.

- `backend/app/services/ocr.py`
  - **What:** PDF/image text extraction strategy with optional OCR and fallback logic.
  - **Why it matters:** scanned documents depend on this for usable text.
  - **Risk:** OCR gating/heuristic changes can reduce coverage or increase runtime cost.

- `backend/app/services/llm.py`
  - **What:** interpretation and translation orchestration, endpoint selection (Responses vs Chat), fallback generation, metadata/error handling.
  - **Why it matters:** controls user-facing explanation quality and resilience when API/network is unavailable.
  - **Risk:** can break fallback guarantees, translation behavior, or error semantics expected by clients/tests.

- `frontend/src/app/parse/page.tsx`
  - **What:** primary UX flow (upload/paste -> parse -> explain -> translation selection).
  - **Why it matters:** main user journey is implemented here.
  - **Risk:** API contract drift or state handling regressions break the end-to-end user flow.

- `frontend/src/app/workbench/page.tsx` + `frontend/src/store/parseStore.tsx`
  - **What:** alternate modular workbench UI with queue/viewer/table/logs components.
  - **Why it matters:** provides a more composable architecture likely intended for expansion.
  - **Risk:** divergence from `/parse` behavior creates inconsistent product behavior.

- `docker-compose.yml`
  - **What:** local orchestration for backend/frontend and environment propagation.
  - **Why it matters:** default integration runtime for contributors.
  - **Risk:** env mismatch, wrong ports, or startup commands can break local onboarding.

- `backend/tests/*` and `frontend/src/app/parse/__tests__/ParseFlow.test.tsx`
  - **What:** tests for parser/API behavior and core frontend parse+interpret flow.
  - **Why it matters:** best executable definition of expected behavior.
  - **Risk:** unmaintained tests can allow regressions or false confidence.

---

## 6) Coding Conventions

### Naming conventions observed
- **Backend files/modules:** snake_case (`parse.py`, `test_parser_text.py`).
- **Python functions/variables:** snake_case (`interpret_rows`, `extract_text_from_pdf_bytes`).
- **Pydantic models/classes:** PascalCase (`ParsedRowIn`, `InterpretationOut`).
- **Frontend components/pages:** PascalCase component names, route folder names in lowercase (`parse`, `health`, `workbench`).
- **UI primitives:** simple wrapper components in `components/ui` (`Button`, `Input`, `Table`, `TextArea`).
- **TS aliases:** `@/` path alias to `frontend/src`.

### Folder organization patterns
- Backend follows a clear `routers/` (HTTP layer) -> `services/` (logic layer) split.
- Frontend uses Next App Router pages under `src/app`, reusable view pieces under `src/components`, and shared state under `src/store`.
- Tests live next to domain area (`backend/tests`, `frontend/.../__tests__`, `frontend/src/test/setup.ts`).

### Repeated implementation patterns
- Backend returns deterministic fallback interpretations when LLM is unavailable.
- Middleware-based cross-cutting concerns (request ID, scrubbed logging, security headers).
- Frontend uses environment-driven backend base URL (`NEXT_PUBLIC_BACKEND_URL`) with local default.
- Stateless design: parse/interpret responses returned directly, no DB persistence layer.

### Notes on consistency
- Two parse UI implementations coexist (`/parse` and `/workbench`) with partially overlapping responsibility.
- Styling uses large global CSS files and CSS variables; no Tailwind config is present.

---

## 7) Environment and Configuration

### Environment variables (names only)
From `.env.example` and runtime code:
- `FRONTEND_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `OPENAI_BASE_URL`
- `OPENAI_API_BASE`
- `ALLOWED_HOSTS`
- `ENABLE_OCR`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_TIMEOUT_S`
- `OPENAI_USE_RESPONSES`
- (optional, referenced in OCR service): `TESSERACT_CONFIG`
- (optional, referenced in LLM service): `OPENAI_TEMPERATURE`

### Config files and what they control
- `docker-compose.yml`: service wiring, env passthrough, ports, startup commands.
- `backend/pyproject.toml`: Python deps + tool configs (`black`, `ruff`, `pytest`).
- `backend/Makefile`: local backend run/test/lint/format commands.
- `backend/Dockerfile`: backend runtime image and system deps (Tesseract).
- `frontend/package.json`: frontend scripts/deps.
- `frontend/next.config.mjs`: Next runtime settings.
- `frontend/tsconfig.json`: TS strictness/path aliases.
- `frontend/vitest.config.ts`: test environment and aliases.
- `.editorconfig`: whitespace/newline/indent conventions.
- `.nvmrc`: expected Node version.

### Local setup steps (minimal)
1. Copy `.env.example` to `.env` and set local values (notably `OPENAI_API_KEY` if LLM calls are desired).
2. Start via Docker Compose: `docker compose up --build` (or helper script `./dev up`).
3. Open frontend at `http://localhost:3000`; backend health is `http://localhost:8000/api/v1/health`.
4. Optional local (non-Docker):
   - Backend: Python 3.11+, install deps, run `make run`.
   - Frontend: Node 20, install deps, run `npm run dev`.

---

## 8) Current State

### Fully working (based on code + tests)
- Backend health endpoint (`/api/v1/health`).
- Parse pipeline for text and PDF with structured row output and flags.
- OCR smoke path for images when Tesseract is available.
- Interpret endpoint with deterministic fallback when OpenAI is unavailable.
- Translate endpoint with supported language validation and service-unavailable behavior.
- Frontend `/parse` end-to-end parse -> interpret -> translated summary selection (covered by `ParseFlow.test.tsx`).

### In progress / partially implemented
- `/workbench` appears as an alternative parse UX architecture with modular components; it is present but separate from the primary `/parse` flow.
- GitHub Actions CI file exists but all jobs are commented out, so CI is currently inactive.
- README/SRS mentions optional follow-up Q&A and broader capabilities, but no dedicated Q&A API/router is present in backend code.

### Known issues / caution areas
- Parser is regex-dense and heuristic-heavy; changes require careful regression testing against varied report formats.
- File-size expectations differ by surface:
  - backend parse endpoint allows up to 500MB per file,
  - `FileQueue` component enforces 10MB per file,
  - `/parse` UI text says 500MB.
  This is inconsistent and should be treated as an implementation gap.
- `dev` helper script checks `http://localhost:8000/health`, while backend routes are mounted under `/api/v1/health`; verify this script path before relying on it.
- OpenAI behavior is environment-dependent (key, model, endpoint flags); fallback may mask upstream API failures unless `meta` is inspected.

---

## Quick Orientation for AI Tools
- Primary backend entry: `backend/app/main.py`.
- Primary end-user frontend flow: `frontend/src/app/parse/page.tsx`.
- API contracts are defined by backend routers and consumed directly by frontend fetch calls.
- If uncertain about expected behavior, check tests first (`backend/tests/*`, `frontend/src/app/parse/__tests__/ParseFlow.test.tsx`).
