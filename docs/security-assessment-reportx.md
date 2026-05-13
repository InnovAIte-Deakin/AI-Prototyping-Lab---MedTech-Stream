# ReportX Security Assessment (Red-Team Style)

Date: 2026-05-13
Scope: Full stack review of frontend, backend APIs, auth/session, RBAC, consent sharing, uploads, OCR/PDF processing, translation, LLM calls, logging, headers, CORS, host restrictions, and persistence behavior.
Method: Code-level assessment with reproduction steps using available API flows. Findings below are based on verified code paths and are reproducible in a local run.

Note: Full Docker Compose startup failed during verification because the frontend production build errored on `/auth/reset-password` due to a missing Suspense boundary for `useSearchParams()`. Backend-only verification proceeded as requested.

---

## Findings

### 1) PHI/report data is persisted server-side despite "no storage" claims
- Severity: High
- Affected area: Backend persistence (reports, findings, interpretations), frontend parse flow
- Exact reproduction steps:
  1. Start the backend with a database configured (default local DB via Docker Compose).
  2. Register and log in a patient using `POST /api/v1/auth/register` and `POST /api/v1/auth/login`.
  3. From the frontend parse page, upload a report or paste text and click "Explain".
  4. Observe the frontend calls `POST /api/v1/reports` with findings (see `createReportEntry` usage from the parse page).
  5. Call `GET /api/v1/reports` and verify the report remains accessible after logout/login.
- Expected behavior:
  - No server-side persistence of reports, findings, interpretations, or chat history in the MVP.
- Actual behavior:
  - Reports and findings are stored in the database (`reports`, `report_findings`) and retrievable across sessions. Interpretations can be saved to `reports.interpretation_json`. Model also includes `chat_history_json`.
- Why it matters:
  - This violates the stated no-retention policy and exposes PHI to persistence risks, backups, and insider access.
- Likely root cause:
  - Persistence and account features were implemented without aligning the product privacy posture.
- Concrete fix recommendation:
  - Disable or remove report persistence in MVP builds, or gate it behind explicit user consent and updated documentation.
  - If persistence is required, implement retention controls, encryption-at-rest, access audits, and a data-deletion workflow.

### 2) "Summary-only" consent is not enforced; all shares expose full report data
- Severity: High
- Affected area: Consent sharing and report access (`/api/v1/reports/*`)
- Exact reproduction steps:
  1. Patient logs in and creates a report (`POST /api/v1/reports`).
  2. Patient shares the report with a clinician (`POST /api/v1/reports/{report_id}/share`) using `access_level: read`.
  3. Clinician logs in and calls `GET /api/v1/reports/shared-reports`.
  4. Observe the response includes full report details and all findings.
- Expected behavior:
  - If a share is limited to "summary only" (as per requirements), the clinician should not receive full lab findings or interpretation.
- Actual behavior:
  - The API returns full report details regardless of access level; the access level is stored but never enforced.
- Why it matters:
  - Consent scope is effectively ignored, enabling overexposure of patient data.
- Likely root cause:
  - Access level is recorded but not checked in `get_accessible_report` or report serialization.
- Concrete fix recommendation:
  - Enforce access level in `get_accessible_report` and in report serialization (e.g., strip findings/interpretation for summary-only access).
  - Add explicit API support for summary-only sharing and document the behavior.
 - Verification note:
   - Runtime verification of this behavior is currently blocked by a server error in the share endpoint (see Finding 5).

### 3) Unverified clinicians can receive shared reports (identity verification not enforced)
- Severity: Medium
- Affected area: Auth + consent sharing
- Exact reproduction steps:
  1. Register a new clinician account with `POST /api/v1/auth/register` using role `clinician`.
  2. Note that the user is created with `is_verified = false` by default.
  3. Patient shares a report to this clinician by email (`POST /api/v1/reports/{report_id}/share`).
  4. Clinician logs in and can access the shared report.
- Expected behavior:
  - Sharing should be restricted to verified clinician identities.
- Actual behavior:
  - The share flow only checks for the clinician role; `is_verified` is never enforced.
- Why it matters:
  - Patients can unknowingly share reports with unverified accounts, undermining consent assurance.
- Likely root cause:
  - Missing verification guard in `share_report_with_user` and lack of verification gating in auth workflows.
- Concrete fix recommendation:
  - Enforce `is_verified` in the sharing path and clinician access checks.
  - Provide an explicit verification flow before enabling clinician role privileges.
 - Verification note:
   - Runtime verification of this behavior is currently blocked by a server error in the share endpoint (see Finding 5).

### 4) Parse endpoint allows memory exhaustion via large JSON/text payloads
- Severity: Medium
- Affected area: `/api/v1/parse` JSON ingestion
- Exact reproduction steps:
  1. Send a large JSON body to `POST /api/v1/parse` with `{ "text": "<very large payload>" }`.
  2. Observe the server attempts to parse the entire body in memory with no hard size cap for JSON payloads.
- Expected behavior:
  - Enforce strict input size limits for both multipart uploads and JSON text input.
- Actual behavior:
  - File uploads are capped after read, but JSON text has no size limit and is parsed into memory.
- Why it matters:
  - Allows trivial memory exhaustion/DoS against the backend.
- Likely root cause:
  - Input limits are implemented for files but not for JSON text payloads.
- Concrete fix recommendation:
  - Enforce a maximum text length (e.g., 100,000 chars per requirements) and reject larger payloads before parsing.
  - Configure server request body size limits at the ASGI server/proxy layer.

### 5) Consent sharing endpoint crashes due to notification schema mismatch
- Severity: Medium
- Affected area: Consent sharing (`/api/v1/reports/{report_id}/share`), notifications persistence
- Exact reproduction steps:
  1. Register patient and clinician accounts.
  2. Create a report as the patient (`POST /api/v1/reports`).
  3. Attempt to share the report (`POST /api/v1/reports/{report_id}/share`).
- Expected behavior:
  - Share is created and a 201 response is returned.
- Actual behavior:
  - The endpoint returns 500 and logs show `StringDataRightTruncationError: value too long for type character varying(13)` while inserting a notification record.
- Why it matters:
  - Consent sharing is unavailable, preventing patients from sharing and blocking audit/notification flows.
- Likely root cause:
  - Database schema for notifications has a too-short `kind` column or enum width mismatch relative to `NotificationKind` values such as `report_shared_confirmed`.
- Concrete fix recommendation:
  - Align the `notifications.kind` column length/enum with current `NotificationKind` values (migrate schema and re-run migrations).
  - Add regression tests for share creation that assert notifications persist.

---

## Controls Checked and Observations
- Auth/session uses bearer JWTs with DB-backed sessions and revocation checks.
- CORS is restricted to a single configured origin; credentials are not allowed.
- Host restriction is enabled via TrustedHost middleware.
- Logging middleware avoids request bodies and PHI.
- No frontend usage of `dangerouslySetInnerHTML` was found in source.

---

## Verification Runs (Backend Only)
- Backend started with `docker compose up -d postgres backend`.
- Health check succeeded: `GET /api/v1/health` -> `ok`.
- Patient report persistence confirmed: `GET /api/v1/reports` returned 1 report after creation (report ID `5f9b29fc-d1fa-4f42-8169-e719149b62d4`).
- Share attempt failed with 500 (see Finding 5); therefore shared-report access checks could not be validated at runtime.
- Short summary: backend persistence is confirmed; sharing is blocked by a 500 error in the share endpoint.

---

## Verdict
Partially safe.

Top 3 residual risks:
1. Server-side persistence of PHI despite "no storage" claims.
2. Consent limitations not enforced (summary-only exposure not implemented).
3. Identity verification gap for clinician recipients of shared data.

---

## Reverification Evidence (2026-05-13)

### Evidence for Finding 1: PHI/report data persisted server-side
- Report persistence model fields exist in DB schema:
  - `backend/app/db/models.py` (`Report.interpretation_json`, `Report.chat_history_json`).
- Report creation endpoint writes persisted reports:
  - `backend/app/routers/reports.py` (`@router.post("")` -> `create_report_for_user(...)`).
- Report listing endpoint returns persisted records:
  - `backend/app/routers/reports.py` (`@router.get("")` -> `list_reports_for_user(...)`).

### Evidence for Finding 2: access level not enforced for data minimization
- Share access level is recorded but no redaction/summary projection is applied:
  - `backend/app/services/reports.py` (`share_report_with_user(...)` stores `access_level`).
  - `backend/app/services/reports.py` (`get_clinician_shared_reports(...)` loads full `Report` + findings).
  - `backend/app/routers/reports.py` (`list_clinician_shared_reports(...)` serializes full `ReportOut` via `_report_out`).
- Report access dependency authorizes by share presence/scope/expiry only:
  - `backend/app/dependencies/reports.py` (`get_accessible_report(...)`), no branch for reduced payload by `access_level`.

### Evidence for Finding 3: unverified clinicians allowed as recipients
- Sharing checks role only, not identity verification status:
  - `backend/app/services/reports.py` (`clinician_roles` check, no `grantee.is_verified` check).
- User model includes verification flag, confirming a missing enforcement point:
  - `backend/app/db/models.py` (`User.is_verified`).

### Evidence for Finding 4: unbounded JSON text parse ingestion
- Parse endpoint accepts JSON body directly and extracts `text` with no max length guard:
  - `backend/app/routers/parse.py` (`payload = await request.json()` and `text_content = str(payload.get("text") or "")`).
- Existing `content-length` handling is only used for upload processing path:
  - `backend/app/routers/parse.py` (`content_length` + upload branch), no equivalent hard cap for JSON `text`.

### Evidence for Finding 5: notification schema mismatch remains plausible
- Initial migration defines `notification_kind` enum with legacy values only:
  - `backend/alembic/versions/20260326_01_persistence_foundation.py` (`thread_reply`, `share_granted`, `report_ready`, `system`).
- Runtime model/service use newer kinds during sharing flow:
  - `backend/app/db/models.py` (`NotificationKind.REPORT_SHARED_CONFIRMED`, `NotificationKind.NEW_REPORT_SHARED`, etc.).
  - `backend/app/services/reports.py` (emits `REPORT_SHARED_CONFIRMED` and `NEW_REPORT_SHARED` in `share_report_with_user`).
- No migration found in `backend/alembic/versions/` that expands/recreates the `notification_kind` enum to match current values.

### New Finding A: self-registration can create clinician accounts (privilege escalation risk)
- Public registration input accepts clinician role:
  - `backend/app/routers/auth.py` (`RegisterRequest.role: Literal["patient", "caregiver", "clinician"]`).
- Registration endpoint passes requested role directly:
  - `backend/app/routers/auth.py` (`register_endpoint(...)` -> `register_account(..., role_name=payload.role, ...)`).
- Account service assigns requested role without approval/verification gate:
  - `backend/app/services/auth.py` (`register_account(...)` -> `select(Role).where(Role.name == role_name)` + `user.assign_role(role)`).

### New Finding B: JWT secret has insecure hardcoded fallback
- Auth settings load a default shared secret when environment variable is absent:
  - `backend/app/services/auth.py` (`AuthSettings.from_env()` -> `os.getenv("AUTH_SECRET_KEY", "reportx-dev-auth-secret-change-me")`).
- This creates token forgery risk if production-like environments start without explicit secret configuration.

### Verification constraints during re-check
- Runtime test execution in this environment was blocked by missing backend dependency:
  - `ModuleNotFoundError: No module named 'fastapi'` when invoking pytest.
- Git metadata queries were blocked in sandbox by ownership safe-directory restrictions, so reverification was performed via direct source inspection.
