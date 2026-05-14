# CODEBASE_CONTEXT

> Last updated: 2026-04-27. This file reflects the **live codebase** — always prefer actual file contents over this document when there is a discrepancy. Update this file whenever a significant architectural change is made.

---

## 1) Project Overview

ReportX is a full-stack web application that helps patients and caregivers understand their medical lab reports. Users upload PDF/image files or paste report text; the backend parses the results into structured rows, generates plain-language AI interpretation, and supports sharing those reports with clinicians under strict, patient-controlled consent.

**Problem it solves:** medical lab reports are hard for patients/caregivers to understand due to jargon, ranges, flags, and language barriers.

**Intended users:** patients, caregivers, and clinicians reviewing patient-shared reports.

**Key design constraints:**
- No PHI (personal health information) is logged or stored unnecessarily.
- All AI outputs carry safety disclaimers; the system is explicitly non-diagnostic.
- The system is stateful: reports, users, sessions, and audit events are persisted in PostgreSQL.

---

## 2) Tech Stack

### Languages
- Python 3.11+ (backend: API, parser, OCR, LLM orchestration, migrations)
- TypeScript (frontend app and tests)
- JavaScript (Next.js config)
- CSS (global tokens and page styling — no Tailwind)
- Shell script (`dev` helper)
- YAML (`docker-compose.yml`, GitHub Actions)

### Backend Runtime Dependencies (`backend/pyproject.toml`)

| Package | Purpose |
|---|---|
| `fastapi >= 0.110.0` | HTTP framework |
| `uvicorn[standard] >= 0.29.0` | ASGI server |
| `python-multipart >= 0.0.9` | Multipart file upload support |
| `pydantic >= 2.7.0` | Request/response schema validation |
| `sqlalchemy >= 2.0.30` | Async ORM |
| `alembic >= 1.13.1` | Database migration management |
| `asyncpg >= 0.29.0` | Async PostgreSQL driver |
| `aiosqlite >= 0.21.0` | Async SQLite driver (tests only) |
| `PyJWT >= 2.8.0` | JWT access/refresh token generation |
| `passlib[bcrypt] >= 1.7.4` | Password hashing |
| `pymupdf >= 1.24.0` | PDF text extraction |
| `httpx >= 0.27.0` | HTTP client (used in tests and optionally in services) |
| `pytesseract >= 0.3.10` | OCR wrapper for Tesseract |
| `Pillow >= 10.0.0` | Image processing |
| `openai >= 1.40.0` | OpenAI API client |
| `email-validator >= 2.0.0` | Email address validation |
| `apscheduler >= 3.10.0` | Background job scheduler (expired share cleanup) |

**Backend dev tools:** `ruff`, `black`, `pytest`, `pytest-asyncio`

### Frontend Runtime Dependencies (`frontend/package.json`)

| Package | Purpose |
|---|---|
| `next@14.2.5` | React framework (App Router) |
| `react@18.3.1` | UI library |
| `react-dom@18.3.1` | DOM renderer |
| `chart.js@^4.5.1` | Charting library |
| `react-chartjs-2@^5.3.1` | React wrapper for Chart.js |
| `chartjs-adapter-date-fns@^3.0.0` | Date adapter for Chart.js |
| `chartjs-plugin-annotation@^3.1.0` | Chart annotation plugin |
| `date-fns@^4.1.0` | Date formatting utilities |

**Frontend dev tools:** `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/jest-dom`, `eslint`, `typescript`, `prettier`

### Platform / Infrastructure
- **PostgreSQL 16** (primary database, via Docker)
- **Docker + Docker Compose** (four-service local orchestration: postgres, backend, frontend, announce)
- **Tesseract OCR** (installed in backend Docker image)
- **Node 20** (pinned via `.nvmrc`)
- GitHub Actions workflow exists at `.github/workflows/ci.yml` but **all jobs are currently commented out** — CI is inactive.

---

## 3) Project Structure

```text
reportx/
├── backend/
│   ├── app/
│   │   ├── main.py                  # App factory, middleware, router registration, lifespan
│   │   ├── db/
│   │   │   ├── base.py              # DeclarativeBase, UUIDPrimaryKeyMixin, TimestampMixin
│   │   │   ├── models.py            # All SQLAlchemy ORM models and enums
│   │   │   ├── session.py           # Async engine, session factory, get_db_session() dep
│   │   │   └── seed.py              # Core role seeding (patient, caregiver, clinician)
│   │   ├── dependencies/
│   │   │   ├── auth.py              # get_current_auth_context() — Bearer token validation
│   │   │   └── reports.py           # get_accessible_report() — ownership + consent check
│   │   ├── routers/
│   │   │   ├── auth.py              # POST /register /login /refresh /logout, GET /me
│   │   │   ├── health.py            # GET /health
│   │   │   ├── parse.py             # POST /parse (multipart + JSON text)
│   │   │   ├── interpret.py         # POST /interpret, POST /chat
│   │   │   ├── translate.py         # POST /translate
│   │   │   ├── reports.py           # /reports CRUD, sharing, trends
│   │   │   ├── clinician.py         # /clinician/shared-reports (dashboard + scoped view)
│   │   │   ├── threads.py           # Thread creation, listing, message posting
│   │   │   ├── notifications.py     # GET /notifications, mark-read
│   │   │   └── audit.py             # GET /audit/reports/{report_id}
│   │   └── services/
│   │       ├── auth.py              # Registration, JWT, session lifecycle
│   │       ├── reports.py           # Report CRUD, consent shares, audit events
│   │       ├── clinician.py         # Clinician dashboard + scoped report queries
│   │       ├── trends.py            # Biomarker trend direction, sparkline data
│   │       ├── llm.py               # OpenAI client (chat/responses endpoint selection, fallback)
│   │       ├── parse_pipeline.py    # File intake, PDF/image text extraction
│   │       ├── parse_llm.py         # OpenAI-powered structured lab data extraction
│   │       ├── parser.py            # Regex/heuristic parser (values, units, ranges, flags)
│   │       ├── ocr.py               # Tesseract + PyMuPDF OCR pipeline
│   │       └── questions.py         # AI-generated patient question prompts
│   ├── alembic/
│   │   ├── env.py                   # Alembic runtime config
│   │   └── versions/                # Migration files (see section 5)
│   ├── tests/
│   │   ├── conftest.py              # db_session + persistence_factory fixtures
│   │   ├── factories.py             # PersistenceFactory — model builders for tests
│   │   ├── support/consent_api.py   # ConsentApiHarness (TestClient + SQLite session)
│   │   └── test_*.py                # 27 test files (see section 6)
│   ├── pyproject.toml
│   ├── Makefile                     # run / test / lint / format helpers
│   └── Dockerfile
│
├── frontend/
│   ├── src/
│   │   ├── app/                     # Next.js App Router pages
│   │   │   ├── layout.tsx           # Root layout (AuthProvider, Header, Footer)
│   │   │   ├── page.tsx             # / — Home page (hero + feature cards)
│   │   │   ├── globals.css          # Design token CSS variables (T13 design system)
│   │   │   ├── auth/
│   │   │   │   ├── login/page.tsx
│   │   │   │   ├── register/page.tsx
│   │   │   │   └── logout/page.tsx
│   │   │   ├── parse/page.tsx       # /parse — primary upload/parse/interpret UX
│   │   │   ├── reports/
│   │   │   │   ├── page.tsx         # /reports — patient report history + sharing
│   │   │   │   └── [reportId]/page.tsx  # /reports/:id — report detail view
│   │   │   ├── clinician/
│   │   │   │   └── shared-reports/
│   │   │   │       ├── page.tsx             # Clinician dashboard (list of shared reports)
│   │   │   │       └── [reportId]/page.tsx  # Clinician scoped report view
│   │   │   ├── health/page.tsx      # /health — backend health check UI
│   │   │   └── workbench/page.tsx   # /workbench — alternative modular parse UX
│   │   │
│   │   ├── components/
│   │   │   ├── ui/                  # T13 design system primitives
│   │   │   │   ├── Badge.tsx        # Semantic status badges (optimal/high/low/attention/info)
│   │   │   │   ├── Button.tsx       # Primary/outline/ghost/accent/danger variants
│   │   │   │   ├── Card.tsx         # Surface card with optional accent bar
│   │   │   │   ├── Input.tsx        # Styled text input
│   │   │   │   ├── Modal.tsx        # Overlay dialog with Escape/click-outside dismiss
│   │   │   │   ├── Table.tsx        # Basic data table
│   │   │   │   └── TextArea.tsx     # Styled textarea
│   │   │   ├── threads/             # Conversation thread components
│   │   │   │   ├── AnchorContext.tsx
│   │   │   │   ├── ThreadPanel.tsx
│   │   │   │   ├── MessageList.tsx
│   │   │   │   ├── MessageComposer.tsx
│   │   │   │   └── ThreadLauncher.tsx
│   │   │   ├── AuditLogTimeline.tsx
│   │   │   ├── BiomarkerTrendChart.tsx
│   │   │   ├── BiomarkerTimelineChart.tsx
│   │   │   ├── Disclaimer.tsx
│   │   │   ├── DocumentViewer.tsx
│   │   │   ├── DoctorSummaryDocument.tsx
│   │   │   ├── FileQueue.tsx
│   │   │   ├── Header.tsx           # Role-aware navigation (T13 redesign)
│   │   │   ├── HealthGate.tsx
│   │   │   ├── LogsPane.tsx
│   │   │   ├── ParsedTable.tsx
│   │   │   ├── PatientQuestions.tsx
│   │   │   ├── ProtectedView.tsx    # Auth guard (redirects to /auth/login if unauthenticated)
│   │   │   ├── SharingPreferencesPanel.tsx
│   │   │   ├── Sparkline.tsx
│   │   │   ├── ThemeToggle.tsx
│   │   │   ├── ThreadView.tsx
│   │   │   └── UnparsedLines.tsx
│   │   │
│   │   ├── lib/
│   │   │   ├── auditLog.ts          # Audit event formatting and share lifecycle state
│   │   │   ├── export.ts            # Client-side export/download helpers
│   │   │   ├── health.ts            # Backend health check fetch
│   │   │   ├── reportHistory.ts     # Report CRUD helpers, fetchReportById, localStorage bridge
│   │   │   ├── reportTimeline.ts    # Biomarker timeline build/sort
│   │   │   └── reportTrends.ts      # fetchReportTrends, BiomarkerTrend type
│   │   │
│   │   ├── store/
│   │   │   ├── authStore.tsx        # AuthProvider: user, tokens, login/logout/refresh/register
│   │   │   └── parseStore.tsx       # ParseProvider: upload queue, parse state
│   │   │
│   │   ├── types/
│   │   │   └── ui.ts                # ParsedRow, ParseResult shared TS types
│   │   │
│   │   └── test/
│   │       └── setup.ts             # Vitest + Testing Library global setup
│   │
│   ├── package.json
│   ├── next.config.mjs              # Next.js config (strict mode)
│   ├── tsconfig.json                # Strict TS + @/ path alias
│   ├── vitest.config.ts             # jsdom env, @/ alias, setup file
│   └── Dockerfile
│
├── docker-compose.yml               # postgres + backend + frontend + announce
├── .env.example                     # Env var names with safe defaults (no secrets)
├── .env                             # Live secrets (git-ignored)
├── dev                              # Shell wrapper for docker compose actions
└── README.md                        # Quickstart + SRS
```

### Non-obvious naming conventions
- Frontend package name is `reportrx-frontend` (double `r`), while the product is `ReportX`.
- Backend import namespace is `app.*` from within `backend/app/`.
- Two frontend parse experiences coexist: `/parse` (primary end-user flow) and `/workbench` (modular/testing alternative). They share the same backend but are separate UI implementations.
- `*_legacy.tsx` files in `components/ui/` are deprecated originals kept for reference during the T13 design-system migration; they are not imported anywhere active.

---

## 4) Architecture Overview

### How parts connect

```text
[Browser / User]
      |
      v
[Next.js Frontend — App Router pages & components]
      |
      | HTTP (fetch / NEXT_PUBLIC_BACKEND_URL)
      v
[FastAPI API — /api/v1/*]
      |
      ├──> [Auth service]  ──> [PostgreSQL via asyncpg]
      ├──> [Reports service] ──> [PostgreSQL]
      ├──> [Parser service (regex + heuristics)]
      ├──> [OCR service (PyMuPDF + Tesseract)]
      ├──> [LLM service]
      |         |
      |         v
      |    [OpenAI API]
      └──> [APScheduler] — background expired-share cleanup
```

### Data persistence layer

The application uses **PostgreSQL 16** as its primary data store, accessed via **SQLAlchemy 2.x async ORM** with **asyncpg** as the driver. All schema changes are managed through **Alembic** migrations that run automatically at application startup (via the `app_lifespan` context manager in `main.py`).

In **tests**, an in-memory **SQLite** database (via `aiosqlite`) is used with `StaticPool` so each test run starts from a clean state. The `TestClient` from Starlette is used instead of `httpx.AsyncClient` in most test harnesses.

### External services
- **OpenAI API** — LLM interpretation, translation, and structured lab data extraction. Configurable base URL for alternative endpoints. Falls back to deterministic responses if unavailable.
- **Tesseract OCR** — binary installed in the Docker image; optional locally. Controlled by `ENABLE_OCR` env var.
- **PostgreSQL** — primary database; runs as a Docker service locally.

---

## 5) Database Schema

### Alembic Migrations (in order)

| Revision | Description |
|---|---|
| `20260326_01` | Foundation: creates all 14 tables (roles, users, user_roles, auth_sessions, reports, report_findings, biomarker_observations, consent_shares, conversation_threads, thread_participants, thread_messages, clinician_response_templates, notifications, audit_events) |
| `20260418_02` | Adds `finding_id` and `title` columns to `conversation_threads` (finding-level thread anchor) |
| `20260423_03` | Adds `interpretation_json` column to `reports` |
| `20260427_04` | Adds `chat_history_json` column to `reports` |
| `20260427_05` | Adds `view_scope` and `include_doctor_summary` to `consent_shares` (clinician scoped access) |

### Core Models (`backend/app/db/models.py`)

| Model | Key Fields | Relationships |
|---|---|---|
| **Role** | name, description | → UserRole (many), → User (m2m via user_roles) |
| **User** | email, display_name, password_hash, preferred_language, is_active, is_verified | → roles (m2m), → auth_sessions, → reports, → consent_shares, → threads, → notifications |
| **UserRole** | user_id, role_id, assigned_at | → User, → Role |
| **AuthSession** | refresh_token_hash, session_family, expires_at, revoked_at | → User |
| **Report** | subject_user_id, title, source_kind, sharing_mode, observed_at, interpretation_json, chat_history_json | → findings, → consent_shares, → threads |
| **ReportFinding** | report_id, biomarker_key, display_name, value_numeric, value_text, unit, flag, reference_range_text, position | → Report, → BiomarkerObservation |
| **BiomarkerObservation** | patient_user_id, report_id, finding_id, biomarker_key, observed_at, value_numeric, flag | → ReportFinding |
| **ConsentShare** | subject_user_id, grantee_user_id, report_id, scope, access_level, view_scope, include_doctor_summary, expires_at, revoked_at | → Report, → User (3 FK roles) |
| **ConversationThread** | subject_user_id, report_id, finding_id, title, status, closed_at | → Report, → ReportFinding, → participants, → messages |
| **ThreadParticipant** | thread_id, user_id, joined_at | → ConversationThread, → User |
| **ThreadMessage** | thread_id, author_user_id, template_id, kind, body | → ConversationThread, → User |
| **ClinicianResponseTemplate** | author_user_id, title, slug, payload, is_active, version | → ThreadMessage |
| **Notification** | user_id, thread_id, report_id, kind, title, payload, read_at | → User, → ConversationThread, → Report |
| **AuditEvent** | actor_user_id, subject_user_id, resource_type, resource_id, action, context (JSON), occurred_at | → User (actor + subject) |

### Enums

| Enum | Values |
|---|---|
| `ReportSourceKind` | pdf, text, image, manual |
| `ReportSharingMode` | private, shared |
| `FindingFlag` | low, high, normal, abnormal, unknown |
| `ConsentScope` | report, patient |
| `ConsentAccessLevel` | read, comment, manage |
| `ShareViewScope` | summary_only, full_report, full_report_with_threads |
| `ThreadStatus` | open, closed |
| `MessageKind` | text, template, system |
| `NotificationKind` | thread_reply, share_granted, report_ready, system |

---

## 6) API Surface (`/api/v1/*`)

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | /health | None | Service health check |
| POST | /auth/register | None | Create user account (role: patient/caregiver/clinician) |
| POST | /auth/login | None | Authenticate, return access + refresh tokens |
| POST | /auth/refresh | None | Rotate tokens using refresh token |
| POST | /auth/logout | Bearer | Revoke current session |
| GET | /auth/me | Bearer | Current user profile + roles |
| POST | /parse | None | Extract lab rows from PDF/image/text |
| POST | /interpret | None | LLM plain-language interpretation of rows |
| POST | /chat | None | Follow-up Q&A grounded in a report |
| POST | /translate | None | Translate interpretation text |
| GET | /reports | Bearer | List patient's own reports |
| POST | /reports | Bearer | Create a new report |
| GET | /reports/{id} | Bearer | Get report (owner or valid consent share) |
| PATCH | /reports/{id}/interpretation | Bearer (owner) | Save AI interpretation to report |
| GET | /reports/{id}/trends | Bearer | Biomarker trends for report's patient |
| POST | /reports/{id}/share | Bearer (patient/caregiver) | Share report with a clinician |
| POST | /reports/{id}/share/revoke | Bearer (patient/caregiver) | Revoke an active share |
| GET | /reports/shared-reports | Bearer (clinician) | Legacy: list all actively shared reports |
| GET | /clinician/shared-reports | Bearer (clinician) | Dashboard: list shared reports with scope metadata |
| GET | /clinician/shared-reports/{id} | Bearer (clinician) | Scoped report view (scope enforced server-side) |
| GET | /reports/{id}/question-prompts | Bearer | AI-generated patient question prompts |
| GET | /reports/{id}/threads | Bearer | List conversation threads on a report |
| POST | /reports/{id}/threads | Bearer | Create a new thread |
| POST | /reports/{id}/threads/{tid}/messages | Bearer | Post a message to a thread |
| GET | /notifications | Bearer | List user notifications |
| GET | /notifications/unread-count | Bearer | Unread notification count |
| POST | /notifications/{id}/read | Bearer | Mark notification as read |
| GET | /audit/reports/{id} | Bearer (owner only) | Audit log for a report's share events |

**Authorization rules enforced at the endpoint level:**
- Clinicians may **not** create or revoke shares (`POST /reports/{id}/share` and `/revoke` return 403 for clinician-only roles).
- Clinicians may **not** access audit logs (`GET /audit/reports/{id}` returns 403 for clinician-only roles).
- All `/clinician/*` endpoints require the `clinician` role; non-clinicians receive 403.
- `get_accessible_report()` dependency re-validates consent on every request (no frontend-state trust).

---

## 7) Key Files and Their Roles

| File | Role | Risk if changed carelessly |
|---|---|---|
| `backend/app/main.py` | App factory, middleware stack (CORS, security headers, request ID, PHI-scrubbed logging, trusted hosts), router registration, Alembic startup, APScheduler | CORS failures, host blocking, missing security headers, broken scheduler |
| `backend/app/db/models.py` | All ORM models, enums, relationships | Schema drift, broken migrations, constraint violations |
| `backend/app/db/session.py` | Async engine, session factory, `get_db_session()` dependency | All DB operations break if session lifecycle changes |
| `backend/app/dependencies/auth.py` | `get_current_auth_context()` — validates JWT Bearer token, returns AuthContext | Authentication bypass if weakened |
| `backend/app/dependencies/reports.py` | `get_accessible_report()` — ownership + active consent share validation | Access control bypass; unauthorized data access |
| `backend/app/routers/reports.py` | Report CRUD, share creation/revocation, trends, legacy clinician list | Share logic, scope enforcement |
| `backend/app/routers/clinician.py` | Clinician dashboard + scoped report view (T17) | Scope enforcement, clinician data isolation |
| `backend/app/routers/audit.py` | Audit log endpoint (patient-only) | Audit trail integrity |
| `backend/app/services/reports.py` | Share creation/revocation, audit event emission, expired share cleanup, `sync_subject_report_sharing_modes` | Consent and audit correctness |
| `backend/app/services/clinician.py` | Clinician-specific queries; re-validates share on every request | Scope leak if active-share validation is skipped |
| `backend/app/services/llm.py` | OpenAI client, response/chat endpoint selection, fallback generation | Fallback guarantee; error semantics |
| `backend/app/services/parser.py` | Regex/heuristic parser for test rows | Silent regression across report formats if regexes are changed |
| `backend/alembic/versions/` | Migration chain; each file is append-only | Breaking the chain causes startup failure |
| `frontend/src/store/authStore.tsx` | Auth context: user, tokens, login/logout/refresh/register | Auth state shared by every protected page |
| `frontend/src/components/ProtectedView.tsx` | Redirects unauthenticated users to `/auth/login` | Removing breaks access control on all protected pages |
| `frontend/src/app/globals.css` | T13 design token CSS variables (colours, spacing, radii, typography) | Visual consistency across all components |
| `frontend/src/app/parse/page.tsx` | Primary user journey: upload → parse → interpret → translate | API contract drift breaks end-to-end flow |

---

## 8) Coding Conventions

### Naming
- **Backend files/modules:** `snake_case` (`parse.py`, `test_parser_text.py`)
- **Python functions/variables:** `snake_case` (`interpret_rows`, `get_accessible_report`)
- **Pydantic + SQLAlchemy models:** `PascalCase` (`ReportOut`, `ConsentShare`)
- **Frontend pages/components:** `PascalCase` component names, lowercase route folders (`parse`, `reports`, `clinician`)
- **UI primitives:** simple wrapper components in `components/ui/` (`Button`, `Badge`, `Card`, `Modal`, `Input`, `TextArea`, `Table`)
- **TS path alias:** `@/` maps to `frontend/src/`

### Folder patterns
- Backend: `routers/` (HTTP layer, request/response shaping) → `services/` (business logic) → `db/` (ORM models + session).
- Frontend: `src/app/` (pages), `src/components/` (reusable UI), `src/lib/` (utilities, fetch helpers), `src/store/` (React context state).
- Tests live next to their domain: `backend/tests/`, `frontend/src/**/__tests__/`.

### Design system (T13)
- **No 1px solid borders** for sectioning — use background colour shifts (tonal layering) instead.
- **Surfaces:** `--surface` → `--surface-container` → `--surface-container-low` for depth hierarchy.
- **Shadows:** large blur, low opacity, tinted with `--on-surface` (ambient style).
- **CTAs:** gradient primary buttons (`linear-gradient(135deg, #004ac6, #2563eb)`).
- **Corners:** `--radius-lg` (16px) or `--radius-full` (pill) for interactive elements.
- **No pure black** — text uses `--on-surface: #191b23`.

### Repeated patterns
- Backend deterministic fallback when OpenAI is unavailable.
- Middleware-based cross-cutting concerns (request ID, scrubbed logging, security headers).
- Frontend uses `NEXT_PUBLIC_BACKEND_URL` env var with `http://localhost:8000` as default.
- All protected pages are wrapped in `<ProtectedView>` which checks auth state and redirects.
- Consent share validation is always re-run server-side on every request; frontend state is never trusted for access decisions.

---

## 9) Environment Variables

### Backend (`os.getenv`)

| Variable | Default | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+asyncpg://reportx:reportx@localhost:5432/reportx` | Async DB connection string |
| `FRONTEND_URL` | `http://localhost:3000` | CORS allowed origin |
| `ALLOWED_HOSTS` | `localhost,127.0.0.1` | TrustedHostMiddleware whitelist |
| `AUTH_SECRET_KEY` | `reportx-dev-auth-secret-change-me` | JWT signing secret — **must be changed in production** |
| `AUTH_TOKEN_ALGORITHM` | `HS256` | JWT algorithm |
| `AUTH_TOKEN_ISSUER` | `reportx` | JWT issuer claim |
| `ACCESS_TOKEN_TTL_MINUTES` | `15` | Access token lifetime |
| `REFRESH_SESSION_TTL_DAYS` | `30` | Refresh token lifetime |
| `OPENAI_API_KEY` | *(none)* | OpenAI API key — if unset, fallback interpretation is used |
| `OPENAI_MODEL` | `gpt-5` | OpenAI model name |
| `OPENAI_BASE_URL` / `OPENAI_API_BASE` | `https://api.openai.com/v1` | API base URL (configurable for proxies) |
| `OPENAI_TEMPERATURE` | `0.6` | Sampling temperature |
| `OPENAI_REASONING_EFFORT` | `high` | Reasoning effort level |
| `OPENAI_MAX_OUTPUT_TOKENS` | `1600` | Max output tokens |
| `OPENAI_TIMEOUT_S` | `15` | Request timeout in seconds |
| `OPENAI_USE_RESPONSES` | `0` | Use Responses API instead of Chat |
| `ENABLE_OCR` | `1` | Enable Tesseract OCR |
| `TESSERACT_CONFIG` | *(none)* | Custom Tesseract config flags |
| `CLEANUP_INTERVAL_MINUTES` | `5` | How often expired shares are revoked by background job |
| `ALEMBIC_STARTUP_TIMEOUT_SECONDS` | `60` | Max wait for migrations on startup |
| `SQLALCHEMY_ECHO` | `0` | Set to `1` to log all SQL queries (debugging only) |

### Frontend (`process.env`)

| Variable | Default | Purpose |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` | `http://localhost:8000` | Backend base URL for all API calls |

---

## 10) Backend Tests (`backend/tests/`)

| File | What it tests |
|---|---|
| `test_auth_api.py` | Register, login, token refresh, logout, `/me` endpoint |
| `test_parse_api.py` | POST /parse with text and file payloads |
| `test_parse_pipeline.py` | File collection and text extraction pipeline |
| `test_parse_llm.py` | OpenAI-powered lab row extraction and repair |
| `test_parser_text.py` | Heuristic parser: numeric ranges, units, reference ranges |
| `test_parser_pdf.py` | PDF text extraction via PyMuPDF |
| `test_parser_more.py` | Edge cases: B12 names, parenthetical ranges |
| `test_ocr_smoke.py` | OCR smoke test (skipped when Tesseract unavailable) |
| `test_health.py` | GET /health endpoint |
| `test_interpret.py` | POST /interpret and POST /chat endpoints |
| `test_translate.py` | POST /translate endpoint |
| `test_report_create_api.py` | Report creation, observed_at persistence |
| `test_trends_api.py` | Biomarker trend computation and sparkline data |
| `test_clinician_endpoints.py` | Clinician shared-reports discovery (legacy /reports/shared-reports) |
| `test_clinician_report_view.py` | Clinician scoped report view (T17 /clinician endpoints) |
| `test_threads.py` | Thread creation, listing, message posting |
| `test_threads_anchor_notifications.py` | Finding-level thread anchors, notifications, access control |
| `test_audit_log_retrieval.py` | Patient audit log endpoint |
| `test_audit_sharing.py` | Audit events created on share/revoke operations |
| `test_view_audit.py` | Comprehensive audit log view testing |
| `test_expiry_enforcement.py` | Expired share access denial and audit event creation |
| `test_expired_share_cleanup.py` | Background cleanup of expired consent shares |
| `test_verified_clinician.py` | Clinician role validation when creating shares |
| `test_persistence_models.py` | ORM model persistence and relationship integrity |
| `test_database_bootstrap.py` | App creates DatabaseManager on startup |
| `test_startup_migrations.py` | Alembic migrations run successfully at startup |
| `test_harness_imports.py` | Test harness import sanity check |

**Running tests:**
```bash
# From backend/
make test
# or directly:
python -m pytest tests/ --ignore=tests/test_ocr_smoke.py
```

---

## 11) Current State

### Fully implemented and tested
- PostgreSQL-backed persistence (users, reports, findings, shares, threads, notifications, audit events)
- JWT authentication (register, login, refresh, logout, role assignment)
- Role-based access: patient, caregiver, clinician
- Parse pipeline: PDF, image, and text input → structured lab rows with flags
- OCR support via Tesseract (when available)
- LLM interpretation with deterministic fallback when OpenAI is unavailable
- Translation endpoint (English + supported languages)
- Report history (authenticated patient can list and view own reports)
- Consent-driven sharing: patients share reports with clinicians with expiry and scope control
- Share revocation (immediate) and expiry (background job every 5 min by default)
- Audit trail: all share, view, and revocation events are recorded
- Biomarker trend analysis with sparkline data
- Conversation threads anchored to reports or specific findings
- In-app notifications for thread replies and share grants
- Clinician dashboard (T17): lists all actively shared reports with scope metadata
- Clinician scoped report view (T17): server-side scope enforcement (summary_only / full_report / full_report_with_threads)
- Doctor-Ready Summary (FR13 partial): `DoctorSummaryDocument` component generates a printable one-page summary; export is client-side only (window.print)
- T13 design system: unified CSS tokens, updated component library, role-aware navigation

### In progress / partially implemented
- `/workbench` — alternative modular parse UX; present but separate from primary `/parse` flow. Some features may be inconsistent with `/parse`.
- RTL language support for translations — translation endpoint works; RTL CSS layout is noted as pending in the roadmap.
- Follow-up Q&A (`/chat` endpoint) — backend endpoint exists; not prominently surfaced in the primary UX as a distinct feature flow.
- CI (`github/workflows/ci.yml`) — file exists but all jobs are commented out; CI is currently inactive.

### Known issues / caution areas
- **`CODEBASE_CONTEXT.md` was previously outdated** — it described the system as stateless with no database. The system now has a full persistence layer. Always verify assumptions against live code.
- **Parser is regex-dense and heuristic-heavy** — changes to `services/parser.py` require careful regression testing against varied report formats. Small edits can silently degrade extraction accuracy.
- **File-size limit inconsistency** — backend parse endpoint allows 500 MB per file; `FileQueue` component enforces 10 MB; `/parse` UI text says 500 MB. This should be reconciled.
- **`dev` script health-check URL** — the `dev` helper script checks `http://localhost:8000/health`, but the actual backend route is `/api/v1/health`. Verify before relying on it.
- **OpenAI fallback may mask failures** — if the API key is set but the API is unreachable, the fallback response is returned without an obvious error to the user. Inspect the `meta` field in interpret responses to detect this.
- **`AUTH_SECRET_KEY` default is insecure** — the default value must be overridden in any non-test environment.
- **Legacy `*_legacy.tsx` components** — these deprecated files are retained in `components/ui/` for reference only. Do not import them in new code.
- **Pre-existing frontend test failures** — `DoctorSummary.test.tsx`, `ThreadsFlow.test.tsx`, and several `T14ReportDetail.test.tsx` tests have pre-existing failures unrelated to recent changes (import/transform errors and mock setup issues).

---

## 12) Local Development

### Docker Compose (recommended)
```bash
cp .env.example .env          # then edit .env with your OPENAI_API_KEY and AUTH_SECRET_KEY
docker compose up --build
```
- Frontend: http://localhost:3000
- Backend: http://localhost:8000
- API health: http://localhost:8000/api/v1/health

### Without Docker

**Backend:**
```bash
cd backend
pip install -e ".[dev]"
# Requires a running PostgreSQL instance with DATABASE_URL set
make run
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

### Running tests

```bash
# Backend (from backend/)
make test
# or: python -m pytest tests/ --ignore=tests/test_ocr_smoke.py

# Frontend (from frontend/)
npm test
# or: npx vitest run
```

### Key environment variables to set locally
At minimum, set in `.env`:
- `OPENAI_API_KEY` — if you want real LLM responses (fallback works without it)
- `AUTH_SECRET_KEY` — any long random string (the default is insecure)
- `DATABASE_URL` — if running without Docker Compose

---

## Quick Orientation for AI Tools
- **Backend entry point:** `backend/app/main.py`
- **Primary user journey (frontend):** `frontend/src/app/parse/page.tsx`
- **Auth context:** `frontend/src/store/authStore.tsx` + `backend/app/dependencies/auth.py`
- **Access control:** `backend/app/dependencies/reports.py` (`get_accessible_report`) + inline role checks in routers
- **Database models:** `backend/app/db/models.py`
- **Migrations:** `backend/alembic/versions/` — always append, never modify existing files
- **Design tokens:** `frontend/src/app/globals.css`
- **If uncertain about expected behavior, check the tests first.**
