# ReportX 

ReportX is an educational health explanations app. MVP stores no data and logs metadata only (no PHI or request bodies). This monorepo contains a Next.js frontend and a FastAPI backend with Docker Compose for local prod-like runs.

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

## Notes

- No persistence: backend writes nothing to disk; no volumes for uploads.
- Logging: backend logs method, path, status, and duration only (no bodies/files).
- Env: never commit secrets. `.env` is ignored; see `.env.example` for required variables.
 - OCR: set `ENABLE_OCR=1` (default) and optionally `TESSERACT_CONFIG` and language packs; backend tries text layer first, then falls back to OCR.

## Local tooling (optional)

- Frontend: `npm run lint`, `npm run typecheck`, `npm test` (inside `frontend/`).
- Backend: `make run`, `make test`, `ruff`, `black` (inside `backend/`).

 

# Software Requirements Specification   

## 1. Introduction  

### 1.1 Purpose  

This document specifies the functional and non-functional requirements of ReportX, a web-based tool that allows users to upload lab or pathology reports and receive plain-language explanations of the results using AI.  

### 1.2 Problem Statement  

Many patients receive lab results that are difficult to understand due to medical jargon and language barriers.  

### 1.3 Goal 

Enable patients and caregivers to understand lab/pathology results and have better conversations with their clinicians. The system converts reports into plain-language, localized explanations, highlights out-of-range values, and suggests safe, non-diagnostic questions to ask a doctor. 

### 1.4 Scope  

* ReportX provides the following key capabilities:  
* Accepts PDF or text input of medical lab reports  
* Parses and extracts structured test data from the uploaded PDF 
* Uses a large language model (LLM) to explain the test report to user 
* Maintains user safety through strong disclaimers  


### 1.5 Out of Scope (for now) 

Persistence and history, chat follow‑ups, clinician validation portal, device‑level medical classification, and regulatory approvals. 

No diagnosis, triage, or personalized medical advice. 

No user accounts or data retention in MVP. 

### 1.6 References  

* MedlinePlus.org  
* LabTestsOnline.org  
* OpenAI API Docs  

 

## 2. Overall Description  

### 2.1 Product Perspective  

ReportX is a standalone web-based application that processes medical lab reports using AI and natural language explanations. It integrates LLM APIs, parsing logic, and a simple UI to support patients and caregivers.  

### 2.2 User Classes and Characteristics  

User Type  
* Patient:  Wants to understand their report while waiting for a doctor  
* Caregiver:  Assists others in interpreting health data  
* Clinician (Optional)  

### 2.3 Core flow - process description 

* Ingestion: A lab report is provided as a PDF, image (photo/scan), or plain text. 
* Parsing: The system extracts structured fields into a table containing: test name, measured value, unit, and reference range. 
* Review & correction: The parsed table is displayed for verification; fields may be edited to correct OCR or parsing errors. 
* Explanation generation: The system produces a plain-language explanation comprising a summary, per-test notes, out-of-range flags, suggested next steps, and a safety disclaimer. 
* Localization: The explanation is rendered in a selected target language (e.g., Arabic, Vietnamese, Mandarin), preserving numerals and units and supporting right-to-left scripts where applicable. 
* Follow-up Q&A (optional): A grounded Q&A interface is provided to ask brief follow-up questions about the results. Answers are derived strictly from the parsed table and the generated explanation, include a safety reminder, and exclude diagnosis or treatment advice. 
* Output & export: Results are presented with safety banners and highlighted flags. Content can be copied or exported client-side for record-keeping or sharing. 

### 2.4 Constraints  

* No personal health data will be stored  
* Not intended for emergency interpretation or diagnosis  

### 2.5 Assumptions and Dependencies  

* OpenAI or Claude API access will be available  
* Sample reports will be semi-structured and readable  
* Users will have basic internet access and digital literacy  
 

## 3. Specific Requirements  

### 3.1 Functional Requirements  

#### FR1: Report Intake: The system shall allow users to upload a lab report PDF or paste report text.  

Acceptance Criteria 

AC1.1 Given a valid PDF ≤ 25 MB, when uploaded, then the system accepts it and moves to parsing. 

AC1.2 Given pasted text 1–100,000 chars, when submitted, then the system accepts it and moves to parsing. 

AC1.3 Given an unsupported file type or encrypted PDF, when submitted, then the system rejects it with a clear error and no data is retained. 

 

FR2: Parsing: The system shall extract the test names, values, units, and reference ranges.  

Acceptance Criteria 

AC2.1 Output schema (ParsedRow): { test_name, value, unit, ref_range, flag } 

AC2.2 Given a known sample report, when parsed, then each detected test appears as a ParsedRow with fields typed and schema-validated. 

AC2.3 Given values outside reference ranges, when parsed, then flags reflect low or high. 

AC2.4 Given missing ranges/units in a test row, when parsed, then the system sets ref_range or unit to null and flag to unknown (no fabricated values). 

AC2.5 Given that there are some text included in the report without any parse output { test_name, value, unit, ref_range, flag }, Output them as is under Unparsed line section 

 

FR3: Interpretation: The system shall send parsed results to an LLM and receive interpretation.  

Acceptance Criteria 

AC3.1 The AI reply always includes: a short summary, per-test notes, any flags, suggested next steps, and a disclaimer. 

AC3.2 If the AI is unavailable, a simple “fallback” explanation is shown so users still get something helpful. 

AC3.3 If the AI answer is incomplete, the system fixes small gaps or falls back to the simple version. 

 

 

FR4: Translation: The system shall all the user to access the same explanation in different languages.  

Acceptance Criteria 

AC4.1 A language switch on the results screen offers English + at least two other languages. 

AC4.2 Switching language updates the whole explanation (summary, per-test notes, flags, next steps, disclaimer) without re-uploading the report. 

AC4.3 Numbers and units do not change when switching language. 

AC4.4 Right-to-left languages display correctly, and the disclaimer is translated. 

 

FR5: Suggestions: The system shall present follow-up suggestions and educational context.  

Acceptance Criteria 

AC5.1 At least three plain-language next steps are shown. 

AC5.2 At least three “questions to ask your doctor” are shown. 

 

FR6: Disclaimer: The system shall include clear disclaimers that outputs are not diagnostic.  

 

FR7: Follow-Up Q&A: The system should allow users to ask follow-up questions about the result in context.  

Acceptance Criteria 

AC7.1 Answers stick to the current report and explanation (no guessing, no outside claims). 

AC7.2 If a question asks for a diagnosis, prescription, or urgent triage, the app declines and points to safer next steps. 

AC7.3 Answers use the current language setting and keep numbers and units as they are. 

 

3.2 Non-Functional Requirements  

NFR1: The UI shall be optimized for accessibility and older users.  
NFR2: The system shall not store any user-submitted data.  
NFR3: Interpretation shall complete within 5 seconds per input.  
NFR4: The system shall maintain 99% uptime during project phase.  
NFR5: The app architecture shall allow scaling for multiple users.  

   

 

5. Technical Requirements  

5.1 Technology Stack  

Layer  

Technology/Tool  

Frontend  

Next.js   

Backend  

Python (FastAPI or Flask)  

AI Model API  

OpenAI GPT-5 

Parsing/OCR  

PyMuPDF  

  

  

 

 

 

5.2 Programming Languages  

Language  

Purpose  

Python  

Parsing, API calls, AI logic, app backend  

JavaScript/TypeScript (optional)  

For advanced UI (Next.js)  

5.3 AI Model Usage  

Model  

Description  

GPT-4 or Claude  

Generates safe, contextual interpretations of lab values and summaries  

  

5.4 AI Code Assistant Tools  

Tool  

Purpose  

Bolt  

Assist in coding, testing, and debugging backend logic  

CodeX  

Assist in Debugging  

Lovable  

Suggest accessible and clean UI components and layouts?? - Yet to explore  

 

6. Roadmap 

Phase 

Key outcomes / deliverables 

Status 

Foundations 

Finalise scope, disclaimers; approve SRS. 

Completed 

MVP: Understand My Results 

Upload/paste; parse key fields; plain-language English explanation; flags; next steps; clear disclaimers; simple UI with copy/export. 

Completed 

Multi-language explanations 

Language switch (English + at least 5 other languages);  

RTL support (Pending) 

Completed 

 

Follow-up Q&A (grounded chat) 

Short questions about results; answers grounded in current parse + explanation; safety guardrails 

Not Started 

Patient-friendly polish 

Accessibility upgrades (contrast, larger text, keyboard support); plain language/layout tweaks; 1-page “doctor summary.” 

Not Started 

Quality & readiness 

Performance and resilience testing (incl. AI fallback); privacy review (no PHI storage); basic usage/error analytics (no content). 

Not Started 

 
