# ReportRx
## Overview
ReportRx is a full‑stack application that helps users upload medical lab reports, parse them into structured data, and generate plain‑language interpretations with clear disclaimers.

## Frontend (React + TypeScript)
# Entry & Framework
* index.html bootstraps the React app via src/main.tsx, which mounts <App /> into the DOM.
* Vite is used for development and build; configuration lives in vite.config.ts.

# Core Application Flow
* src/App.tsx orchestrates a four‑step workflow:
** Upload (UploadStep) – drag‑and‑drop PDF or text, validated client‑side.
** Parse Data (ParsedDataStep) – calls backend /parse endpoint and highlights “normal”, “high”, “low”, or “critical” values.
** AI Analysis (InterpretationStep) – sends parsed data to /interpret-report for OpenAI‑powered explanations.
** Follow‑up (FollowUpStep) – offers download, suggested doctor questions, and final disclaimers.

# Shared UI Components
* Header (branding + “Educational tool” banner),
* ProgressBar (step indicator),
* Disclaimer (compact/full variants emphasize the medical disclaimer).

# API Layer
* src/services/api.ts provides apiService, a thin wrapper around fetch, handling file uploads, text submissions, report parsing, and interpretation requests.

# Styling & Tooling
* Tailwind CSS (index.css, tailwind.config.js) for utility‑first styling.
* Icons from lucide-react.
* ESLint and TypeScript configurations enforce code quality.

## Backend (Python FastAPI)
# Application Setup
* backend/app/main.py constructs the FastAPI app, configures CORS, sets up logging and global exception handlers, and registers routers for health checks, interpretation, file upload, and parsing.

# Configuration & Models
* config.py loads environment variables (OpenAI API key, server settings, CORS).
* models.py defines Pydantic models for lab tests and responses.

# Routes
* routes/health.py – simple health and readiness checks.
* routes/interpret.py – validates requests, assembles prompts, and appends a medical disclaimer to AI output.
* routes/upload.py – supports PDF or text upload, invokes PDF/text parsers, and exposes a /parse endpoint for structured data extraction.

# Services
* openai_service.py – constructs prompts and calls OpenAI’s Chat Completions API (default model `gpt-5`, configurable via `OPENAI_MODEL`).
* parser_service.py – regex-based extraction of common lab tests.
* pdf_service.py – uses PyMuPDF (if installed) to pull text from PDFs, with a mock fallback.

# Execution
* run.py is a lightweight entry point for local development using Uvicorn.

## Key Concepts for New Contributors
# 1. Data Contracts
Understand how LabTest, InterpretReportRequest, and related models map between frontend and backend.

# 2. Workflow States
Each React step manages its own local state but transitions via callbacks; follow the prop chain in App.tsx.

# 3. Error Handling & Disclaimers
Both layers emphasize validation and user safety (e.g., file size checks, detailed error responses, medical disclaimer banners and final text).

# 4. Prompt Engineering
openai_service.py shows how prompts are built from structured lab data—useful for anyone enhancing AI behavior.

## Suggested Next Steps for Learning
# Backend
* Read FastAPI docs on routing, dependencies, and async patterns.
* Explore Pydantic validators in models.py.
* Review regex techniques in parser_service.py to extend support for additional lab tests.

# Frontend
* Learn Tailwind’s utility classes to customize UI quickly.
* Familiarize yourself with React hooks used for side effects (e.g., useEffect in ParsedDataStep and InterpretationStep).
* Examine apiService for patterns around fetch and error handling.

# Dev Environment
* Set up .env with OpenAI credentials (see backend/README.md). Optionally set `OPENAI_MODEL` (defaults to `gpt-5`). Run the backend with `python run.py` and the frontend with `npm run dev`.

# Testing & Validation
* Consider adding unit tests (pytest for backend, Vitest/Jest for frontend) and end‑to‑end tests with Playwright or Cypress to ensure the workflow works end‑to‑end.

By starting with these areas—component flow, API contracts, services, and configuration—you’ll gain a solid grounding in how ReportRx is structured and how to extend it confidently.



## Quick Start Scripts

- macOS/Linux:
  - `bash scripts/setup-and-run.sh --openai-key YOUR_OPENAI_KEY --model gpt-4o`
  - Flags:
    - `--no-run` to only install deps (don’t start servers)
    - `--backend-port <port>` and `--frontend-port <port>` to override ports

- Windows (PowerShell):
  - `./scripts/setup-and-run.ps1 -OpenAIKey YOUR_OPENAI_KEY -Model gpt-4o`
  - Switches/params:
    - `-NoRun` to only install deps
    - `-BackendPort <port>` and `-FrontendPort <port>` to override ports

Outputs
- Backend health: `http://localhost:8000/api/v1/health` (or your chosen port)
- Frontend app: `http://localhost:5173` (or your chosen port)
- PID files: `backend/backend.pid`, `frontend.pid`
- Logs: `backend/backend_server.log`, `frontend_server.log`

Notes
- A valid OpenAI API key is required for the interpretation endpoint. The scripts will set a placeholder if no key is provided.
- Default model is `gpt-4o` (override as needed). The older default `gpt-5` in some docs may not be available to all accounts.

