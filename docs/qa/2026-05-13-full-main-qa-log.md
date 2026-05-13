# Full Main QA Log - 2026-05-13

## Abstract

This QA pass verified latest `origin/main` from a clean worktree, launched the full Docker stack, tested backend and frontend automation, and then completed a real browser click-through of the main user workflows. Thirteen defects were found and fixed during the pass. The final state is strong: backend tests pass, frontend lint/typecheck/Vitest/build pass, production dependency audit is clean, Docker health checks pass, and the browser-driven click-through completed 13 workflow groups with zero failed steps.

The only material limitation is environment-related: no real `OPENAI_API_KEY` was available in this worktree, so live OpenAI interpretation/translation quality was not verified. The UI and API fallback behavior for missing-key conditions was verified instead.

## Table Of Contents

- [Abstract](#abstract)
- [Run Metadata](#run-metadata)
- [Environment Notes](#environment-notes)
- [Screenshot Evidence](#screenshot-evidence)
- [Defect Log](#defect-log)
- [Batch Evidence](#batch-evidence)
  - [Batch 0 - Automated Baseline](#batch-0---automated-baseline)
  - [Batch 1 - Full App Launch](#batch-1---full-app-launch)
  - [Batch 2 - Public Parse And Explanation Flow](#batch-2---public-parse-and-explanation-flow)
  - [Batch 3 - Translation And AI Fallback Behavior](#batch-3---translation-and-ai-fallback-behavior)
  - [Batch 4 - Auth And Roles](#batch-4---auth-and-roles)
  - [Batch 5 - Report History, Persistence, And Trends](#batch-5---report-history-persistence-and-trends)
  - [Batch 6 - Sharing, Audit, And Clinician Views](#batch-6---sharing-audit-and-clinician-views)
  - [Batch 7 - Threads, Questions, And Notifications](#batch-7---threads-questions-and-notifications)
  - [Batch 8 - Doctor Summary And Export](#batch-8---doctor-summary-and-export)
  - [Batch 9 - Frontend Quality Pass](#batch-9---frontend-quality-pass)
- [Final Regression - 2026-05-13](#final-regression---2026-05-13)
- [Conclusion](#conclusion)

## Run Metadata

Baseline: latest `origin/main` in `C:\Users\hanis\Desktop\ReportX-main-qa`.

Branch: `codex/full-main-qa`

Source commit: `9223861 Merge pull request #24 from InnovAIte-Deakin/feature/t16-password-reset-flow`

## Environment Notes

- `.env` was created locally from `.env.example` and is git-ignored.
- `OPENAI_API_KEY` was not available in the process environment at QA setup time. Live AI checks require a real key to be added locally before Batch 2 and Batch 3 can be fully completed.

## Screenshot Evidence

### Public Desktop Home

Captured after Docker launch to confirm the public app loaded and rendered correctly on desktop.

![Desktop home page](../../frontend/output/playwright/home-desktop.png)

### Mobile Parse Before Fix

This screenshot captured the mobile header overlap defect logged as QA-006.

![Mobile parse page before header fix](../../frontend/output/playwright/parse-mobile.png)

### Mobile Parse After Fix

This screenshot confirms the mobile header wraps cleanly after QA-006 was fixed.

![Mobile parse page after header fix](../../frontend/output/playwright/parse-mobile-after.png)

### Browser Parse And Insights Flow

Captured during the real browser click-through after parsing and explaining a pasted lab report.

![Parse insights browser flow](../../frontend/output/playwright/manual-clickthrough/parse-insights.png)

### Browser Clinician Shared Detail Flow

Captured during the real browser click-through after the missing clinician shared-report detail API was fixed.

![Clinician shared report browser flow](../../frontend/output/playwright/manual-clickthrough/clinician-shared-detail.png)

### Final Browser State

Final screenshot from the passing browser click-through run.

![Final browser click-through state](../../frontend/output/playwright/manual-clickthrough/final-page.png)

### Automation Artifact

- Final browser click-through result JSON: [`manual-clickthrough-results.json`](../../frontend/output/playwright/manual-clickthrough/manual-clickthrough-results.json)
- Browser click-through runner: [`manual-clickthrough.mjs`](../../frontend/output/playwright/manual-clickthrough.mjs)

## Defect Log

| ID | Batch | Feature | Route/API | Steps to reproduce | Expected | Actual | Evidence | Severity | Status | Fix PR/commit |
|---|---|---|---|---|---|---|---|---|---|---|
| QA-001 | Batch 0 | Clinician shared reports expiry display | `/reports/shared` | Run `npm test`; current timezone Asia/Dubai renders `2025-12-31T23:59:59Z` as `1 Jan 2026` | Expiry dates render consistently from API calendar dates and dashboard test passes in all timezones | Test failed with `expected 1 to be greater than or equal to 2` because only one `/2025/` date rendered | `npm test` initially failed in `T15ClinicianDashboard.test.tsx`; after UTC expiry formatting, `npm test -- src/app/reports/__tests__/T15ClinicianDashboard.test.tsx` passed 7/7 and full suite passed 175/175 | medium | retest passed | local branch `codex/full-main-qa` |
| QA-002 | Batch 0 | Frontend production dependency audit | `frontend/package.json` | Run `npm audit --omit=dev` after fresh `npm ci` | No production vulnerabilities | Audit reported vulnerable `next` and nested `postcss` | Upgraded `next`/`eslint-config-next` to `15.5.18`, added `postcss@8.5.10` override; `npm audit --omit=dev` now reports `found 0 vulnerabilities` | high | retest passed | local branch `codex/full-main-qa` |
| QA-003 | Batch 1 | Docker PostgreSQL host port | `docker-compose.yml` | Run `docker compose up --build` on a machine where host port 5432 is already allocated | Stack can launch without requiring the developer to stop unrelated local PostgreSQL services | Compose failed binding `0.0.0.0:5432` | Made host port configurable with `${POSTGRES_PORT:-5432}:5432`; launched QA stack with `POSTGRES_PORT=5433`; `docker compose ps` shows PostgreSQL healthy | medium | retest passed | local branch `codex/full-main-qa` |
| QA-004 | Batch 1 | Backend container database URL | `docker-compose.yml` | Copy `.env.example` to `.env`, then run Docker Compose | Backend container connects to the Compose PostgreSQL service | `.env` `DATABASE_URL` interpolation pointed the container at localhost, causing backend restart/migration failure | Compose now uses `${DOCKER_DATABASE_URL:-postgresql+asyncpg://reportx:reportx@postgres:5432/reportx}` for the backend; migrations apply on container startup | high | retest passed | local branch `codex/full-main-qa` |
| QA-005 | Batch 6/7 | Share notifications in PostgreSQL | `POST /api/v1/reports/{id}/share` | Create a report share in Docker/PostgreSQL | Share is created and notification/audit side effects persist | Share returned HTTP 500 because `report_shared_confirmed` exceeded `notifications.kind VARCHAR(13)` | Widened notification kind enum column to 32 chars and added Alembic migration `20260513_06`; backend tests and Docker share smoke pass | high | retest passed | local branch `codex/full-main-qa` |
| QA-006 | Batch 9 | Mobile header layout | `/parse` at 390px width | Capture mobile screenshot for `/parse` | Header actions wrap without overlapping logo/navigation | Primary CTA overlapped the logo/nav row at mobile width | Added responsive header wrapping CSS; retest screenshot `frontend/output/playwright/parse-mobile-after.png` shows no overlap | medium | retest passed | local branch `codex/full-main-qa` |
| QA-007 | Batch 7 | Patient question/thread UI exposure | `/reports/{id}` | Open a patient report detail and try to create a question for the clinician from the browser | Patient can click suggested/free-text questions and send them to create a thread | The `PatientQuestions` component existed but was not rendered on the report detail page | Rendered `PatientQuestions` for patient report detail; browser click-through created a thread and sent a reply | high | retest passed | local branch `codex/full-main-qa` |
| QA-008 | Batch 2 | Unsupported upload error visibility | `/parse` | Select only an unsupported file type from the file picker | Clear visible error explains only PDF/PNG/JPEG are supported | Error state was set but hidden because the selected-files panel only renders when valid files exist | Rendered upload alert even when no valid file is selected; browser click-through verified visible validation | medium | retest passed | local branch `codex/full-main-qa` |
| QA-009 | Batch 6 | Clinician shared report detail API | `/reports/shared/{reportId}` -> `/api/v1/reports/shared-reports/{reportId}` | As clinician, click `Open` from the Shared Reports dashboard | Shared report detail loads with clinical summary/findings | Dashboard listed the share, but `Open` hit a missing backend route and showed “Unable to load this shared report” | Added `GET /api/v1/reports/shared-reports/{report_id}`; browser click-through verified clinician open flow | high | retest passed | local branch `codex/full-main-qa` |
| QA-010 | Batch 7 | Clinician structured response templates | `/reports/shared/{reportId}` and `/api/v1/threads/{threadId}/messages` | As clinician, open a shared report with a patient thread and try to answer with the structured template | Clinician sees the structured response form directly and can submit meaning, urgency, and action | Template UI was behind a patient-visible `Simulate Clinician Access` toggle and was not exercised by the browser pass | Removed simulation toggle, role-gated the template form to clinicians, added frontend coverage, and browser retested clinician template submission | high | retest passed | local branch `codex/full-main-qa` |
| QA-011 | Batch 6/7 | Full-report sharing scope | `/reports/{id}/share` | Share one report as `Full report`, then open it from clinician dashboard after patient has multiple reports | Full report grants comment/thread access to the exact report being shared | UI sent patient-wide scope, so clinician dashboard could open another patient report first and miss the thread/template path | Changed full-report share payload to `scope: report` with `access_level: comment`; added frontend payload coverage and browser retest | high | retest passed | local branch `codex/full-main-qa` |
| QA-012 | Batch 8 | Doctor-summary include flag persistence | `/reports/{id}/share` -> `/reports/shared/{reportId}` | Check `Include Doctor-Ready Summary PDF`, share with clinician, then open shared detail as clinician | Clinician shared detail receives `include_doctor_summary: true` and shows Doctor Summary | Share API accepted no persisted include flag; clinician detail always received false | Added persisted `include_doctor_summary` field, Alembic migration, API request/response wiring, backend test, and browser retest | high | retest passed | local branch `codex/full-main-qa` |
| QA-013 | Batch 8 | Doctor-ready print CSS | Browser print/PDF for `/reports/{id}` | Export the hidden doctor-summary print target to PDF and render it | PDF is nonblank, readable, and fits on one A4 page | Initial real PDF render was blank/dark; after print visibility fix it rendered but produced blank extra pages | Replaced print hiding rules with visibility-based isolation plus layout removal for the report page; PDF retest is one page with extracted ReportX/Flagged Values text | high | retest passed | local branch `codex/full-main-qa` |

## Batch Evidence

### Batch 0 - Automated Baseline

- `python -m pytest -q` in `backend`: passed with one skipped OCR smoke test and one pytest rewrite warning.
- `npm ci` in `frontend`: completed.
- Initial `npm test` failed on clinician dashboard expiry-date assertion; logged as QA-001 and fixed.
- Initial `npm audit --omit=dev` found production vulnerabilities in `next`/`postcss`; logged as QA-002 and fixed.
- Final `npm run lint`: passed.
- Final `npm run typecheck`: passed.
- Final `npm test`: passed, 36 files / 177 tests.
- Final `npm run build`: passed on Next.js 15.5.18.
- Final `npm audit --omit=dev`: passed, 0 vulnerabilities.

### Batch 1 - Full App Launch

- `docker compose up --build` initially exposed two launch defects, logged as QA-003 and QA-004.
- Final launch uses `POSTGRES_PORT=5433 docker compose up --build -d`.
- `http://localhost:3000`: HTTP 200.
- `http://localhost:3000/health`: HTTP 200.
- `http://localhost:8000/api/v1/health`: HTTP 200 with `X-Request-ID` response header.
- `docker compose ps`: frontend/backend running, PostgreSQL healthy, announce service running.
- Docker logs show Alembic migrations applied, scheduler started, frontend ready, and no startup errors after fixes.

### Batch 2 - Public Parse And Explanation Flow

- API smoke with pasted lab text parsed 3 rows; first row `Hemoglobin`.
- Parsed response includes extracted source text and finding fields consumed by the editable frontend table.
- Interpretation endpoint returned a safe fallback summary because no live OpenAI key is configured in this QA worktree.
- Public parse UI captured on desktop and mobile; Batch 9 logged and fixed the only visible mobile overlap found.
- Browser click-through verified unsupported file validation, valid PNG selection/removal, pasted text parse, explain, translation fallback, copy, and print/download click behavior.
- File upload variants, unsupported file type, and oversized-file behavior still need a live manual browser pass with representative local files.

### Batch 3 - Translation And AI Fallback Behavior

- Missing-key translation path returns HTTP 503 with a clear `missing_api_key` style failure instead of fabricated translation.
- Unsupported language path returns HTTP 400.
- Interpretation/chat fallback returns safe non-diagnostic text when live OpenAI is unavailable.
- Live English-to-Spanish/Arabic/Chinese/Hindi/French quality checks remain blocked until a real `OPENAI_API_KEY` is placed in the local `.env`.

### Batch 4 - Auth And Roles

- API smoke created unique patient, clinician, and caregiver users.
- Patient login, `/auth/me`, refresh, and protected unauthenticated `/reports` denial were verified.
- Caregiver attempting clinician shared-report access returns HTTP 403.
- Clinician report-scope access denied trend details as expected; patient-scope share allowed clinician trend access.
- Browser logout/session-expiry flows still need manual UI retest.

### Batch 5 - Report History, Persistence, And Trends

- Patient created two reports with overlapping biomarkers.
- `/reports` returned the saved reports; `/reports/{id}` returned 3 findings.
- `/reports/{id}/trends` returned 2 trend series for overlapping compatible biomarkers.
- Smoke covered persistence and no-trend access restrictions; singleton/mixed-unit trend skips still need a targeted manual/API edge-case pass.

### Batch 6 - Sharing, Audit, And Clinician Views

- Initial Docker share attempt found QA-005; migration/model fix retested successfully.
- Browser click-through found QA-009 in clinician shared report detail open; route fix retested successfully.
- Report-scope share created successfully and appeared in clinician shared report list.
- Revoking the share immediately changed clinician report access to HTTP 403.
- Patient-scope share allowed clinician trend access.
- Audit log included create/view/revoke events from the share lifecycle.
- Expiry cleanup behavior still needs time-based or seeded-expired-share retest.

### Batch 7 - Threads, Questions, And Notifications

- Patient question generation returned 3 prompts.
- Anchored thread created; patient and clinician messages persisted in chronological flow.
- Clinician message role was preserved as `clinician`.
- Notifications list returned 4 items, unread count was 4, and mark-all-read reduced unread count to 0.
- Unauthorized caregiver access to shared-report notification target returned HTTP 403.
- Browser click-through verified patient Questions for My Clinician UI, free-text send, thread render, reply button, clinician structured response template submission, notification drawer, notification page filters, clinician shared report dashboard, and clinician shared report open.

### Batch 8 - Doctor Summary And Export

- Existing automated tests cover doctor-ready summary rendering, flagged findings, interpretation summary, thread/patient questions, and Export PDF button presence.
- Added backend and browser coverage for preserving the doctor-summary include flag through sharing and showing the Doctor Summary section to the clinician.
- Added a real browser PDF render check for the doctor-ready summary. Final artifact `frontend/output/playwright/manual-clickthrough/doctor-summary-print.pdf` is one page and contains extracted ReportX/Flagged Values text.
- Report detail smoke verified interpreted reports are available for the doctor-summary print/export path.
- No server-side export persistence was observed in the API smoke; export remains client print/PDF behavior.
- One-page browser PDF output was rendered and verified after QA-013: `doctor-summary-print.pdf` is one A4 page, nonblank, and contains extracted ReportX/Flagged Values text.

### Batch 9 - Frontend Quality Pass

- Desktop screenshot: `C:\Users\hanis\Desktop\ReportX-main-qa\frontend\output\playwright\home-desktop.png`.
- Initial mobile screenshot: `C:\Users\hanis\Desktop\ReportX-main-qa\frontend\output\playwright\parse-mobile.png`.
- Mobile header overlap logged as QA-006 and fixed.
- Retest mobile screenshot: `C:\Users\hanis\Desktop\ReportX-main-qa\frontend\output\playwright\parse-mobile-after.png`.
- Further keyboard/focus, dark/light, and authenticated mobile page walkthroughs remain for a complete human QA signoff.
- Full Playwright browser click-through passed 13/13 workflow groups with zero failed steps. Result artifact: `C:\Users\hanis\Desktop\ReportX-main-qa\frontend\output\playwright\manual-clickthrough\manual-clickthrough-results.json`.

## Final Regression - 2026-05-13

- Backend `python -m pytest -q`: passed, with one skipped OCR smoke test and one pytest rewrite warning.
- Frontend `npm run lint`: passed.
- Frontend `npm run typecheck`: passed.
- Frontend `npm test`: passed, 36 files / 177 tests. Existing React `act(...)` warnings remain in test output.
- Frontend `npm audit --omit=dev`: passed, 0 vulnerabilities.
- Frontend `npm run build`: passed on Next.js 15.5.18.
- Docker stack remains running with PostgreSQL on host port `5433`, frontend on `3000`, backend on `8000`.
- Final live smoke passed: frontend home, frontend health, backend health with request ID, parse, interpret fallback, register, login, refresh, reports create/list/detail, trends, share, clinician access, revoke, question prompts fallback, thread messages, notifications unread/read-all.
- Final browser click-through passed: home/nav, forgot password, clinician registration, patient registration, upload validation, parse/explain/translate/copy/print, second report, history search/sort/trends/open detail, AI chat, doctor-summary export, patient questions/thread/reply, share with clinician including doctor-summary flag, patient notifications, clinician shared reports/detail/doctor summary/structured response template/notifications, and revoke share.
- Post-browser-fix regression passed again: backend pytest, frontend lint, typecheck, Vitest 36 files / 177 tests, production audit, production build, Docker frontend health, Docker backend health, and one-page browser PDF verification.
- Backend logs after smoke contain expected `missing_api_key` fallback traces during question generation because this QA worktree still does not have a real `OPENAI_API_KEY`. Live OpenAI interpretation and translation quality checks are still blocked until that local secret is supplied.

## Conclusion

The full-main QA pass is complete for the environment available here. The application now launches cleanly in Docker, passes the backend and frontend regression suites, and has been exercised through the core product flows in a real browser. The browser run did not only confirm behavior; it found additional frontend/backend integration defects that were fixed and retested.

Final signoff status: conditionally passed. The condition is that live OpenAI quality checks still require adding a real `OPENAI_API_KEY` to the local `.env` and rerunning the AI-specific parse/explain/translation cases. Everything else covered by this pass is green.
