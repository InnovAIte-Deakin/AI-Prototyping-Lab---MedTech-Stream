# Full Regression QA Log - 2026-05-14

## Abstract

Full regression QA was run from a fresh worktree on latest `origin/main`, branch `codex/full-regression-qa`. The pass covered backend tests, frontend lint/typecheck/unit tests/build, Docker production startup, health checks, production dependency audit, and a real browser clickthrough of the main patient and clinician workflows. Four real defects were found and fixed before final regression: a duplicate Alembic migration column, duplicate SQLAlchemy model field, Doctor-Ready Summary share flag not being sent, and missing clinician structured response templates on the new clinician shared-report route.

One environment limitation remains: this shell did not have `OPENAI_API_KEY` set, so AI paths were verified through the app's safe fallback behavior instead of a live OpenAI response. The browser and backend did exercise those endpoints and the fallback responses completed successfully.

## Environment

| Field | Value |
|---|---|
| Branch | `codex/full-regression-qa` |
| Worktree | `C:\Users\hanis\Desktop\ReportX-full-regression-qa` |
| Base | `origin/main` at `7e7b5d9` |
| Frontend QA URL | `http://localhost:3100` |
| Backend QA URL | `http://localhost:8100` |
| Database | Docker PostgreSQL on host port `5433` |
| Docker project | `reportx-fullqa` |
| OpenAI key | Not present in inherited shell environment; fallback AI behavior tested |

## Automated Regression

| Check | Result | Evidence |
|---|---|---|
| Backend pytest | Passed | `python -m pytest -q` - passed with 1 skipped test |
| Frontend install | Passed | `npm install --save-dev playwright`; prior `npm ci` baseline passed |
| Frontend lint | Passed | `npm run lint` |
| Frontend typecheck | Passed | `npm run typecheck` |
| Frontend Vitest | Passed | `npm test` - 39 files, 203 tests |
| Frontend production build | Passed | `npm run build` |
| Docker production build | Passed | `docker compose -p reportx-fullqa -f docker-compose.yml -f docker-compose.fullqa.yml up --build -d` |
| Backend health | Passed | `http://localhost:8100/api/v1/health` returned `{"status":"ok"}` |
| Docker startup logs | Passed | Alembic startup completed successfully after fix; PostgreSQL healthy |
| Production audit | Passed | `npm audit --omit=dev` - 0 vulnerabilities |
| Browser clickthrough | Passed | `node output/playwright/manual-clickthrough.mjs` - 13 passed, 0 failed |

## Browser Coverage

| Batch | Browser actions verified |
|---|---|
| Public navigation | Home header buttons, theme toggle, health navigation, Review My Report, protected My Reports redirect |
| Auth | Forgot password, register clinician, clinician role redirect, logout, register patient |
| Parse | Unsupported upload validation, PNG upload/remove, pasted text parse, parsed table output |
| AI explain/fallback | Explain button, fallback interpretation, translate failure handling, copy, print/download |
| History | Two saved reports, history table, search, sort toggle, pagination controls, open report |
| T12 Doctor summary | Export PDF button calls print and generated `doctor-summary-print.pdf` artifact |
| T9 patient questions | AI-suggested question prompts, free-text patient question, thread creation, follow-up reply |
| Sharing | Clinician email, full report + threads scope, include Doctor-Ready Summary, print-on-share, audit update |
| Notifications | Drawer, unread/all filters, mark all read, notifications page controls |
| Clinician view | Clinician login, shared reports dashboard, open shared report, AI Summary, Doctor Summary, Test Results, Conversation Threads |
| T9 clinician template | Structured clinician response template fields, urgency selector, submit clinical response, rendered clinician response |
| Revoke | Patient re-shares then revokes access; revoke status confirmed |

## Artifacts

| Artifact | Path |
|---|---|
| Browser result JSON | `frontend/output/playwright/manual-clickthrough/manual-clickthrough-results.json` |
| Parse + interpretation screenshot | `frontend/output/playwright/manual-clickthrough/parse-insights.png` |
| Report detail + patient thread screenshot | `frontend/output/playwright/manual-clickthrough/09-report-detail-interpretation-sidebar-chat-export-and-patient-question-thread.png` |
| Share workflow screenshot | `frontend/output/playwright/manual-clickthrough/10-share-report-from-detail-page-with-clinician-and-include-doctor-summary-print.png` |
| Clinician shared-detail screenshot | `frontend/output/playwright/manual-clickthrough/clinician-shared-detail.png` |
| Doctor summary PDF artifact | `frontend/output/playwright/manual-clickthrough/doctor-summary-print.pdf` |
| Final page screenshot | `frontend/output/playwright/manual-clickthrough/final-page.png` |

## Defect Log

| ID | Batch | Feature | Route/API | Steps to reproduce | Expected | Actual | Evidence | Severity | Status | Fix commit |
|---|---|---|---|---|---|---|---|---|---|---|
| QA-001 | Launch | QA port collision | `http://localhost:3000` | Start full app while another local app owns port 3000 | ReportX QA launches without disturbing other work | Base compose publishes default ports and conflicts with unrelated local process | `Get-NetTCPConnection -LocalPort 3000` | low | retest passed | pending |
| QA-002 | Launch | Alembic duplicate column | `alembic upgrade head` | Launch Docker against fresh PostgreSQL | Startup migrations complete once | `20260513_07` tried to add `include_doctor_summary` even though `20260427_05` already added it | Docker backend logs showed `DuplicateColumnError` | critical | retest passed | pending |
| QA-003 | Backend model | Consent share model | `ConsentShare` | Inspect merged main model | One mapped `include_doctor_summary` field | Field was declared twice in the SQLAlchemy model | `backend/app/db/models.py` | medium | retest passed | pending |
| QA-004 | T12 sharing | Doctor-Ready Summary share flag | `/reports/{id}` -> `/api/v1/reports/{id}/share` | Check Include Doctor-Ready Summary PDF and share with clinician | Share payload sends `include_doctor_summary: true` and clinician sees Doctor Summary | Checkbox only triggered local print; share payload still sent false | Browser clickthrough + added Vitest regression | high | retest passed | pending |
| QA-005 | T9 clinician response | Structured clinician template | `/clinician/shared-reports/{id}` | Clinician opens shared report with threads | Clinician can submit structured meaning/urgency/action response | New clinician route only had plain reply UI; no structured template | Browser clickthrough failed before fix | high | retest passed | pending |
| QA-006 | Browser QA script | Manual clickthrough drift | `frontend/output/playwright/manual-clickthrough.mjs` | Run clickthrough on latest main | Script matches current role redirects/routes/UI labels | Script still expected old `/parse`, `/reports/shared`, trend buttons, and old thread labels | Playwright failure screenshots | low | retest passed | pending |

## Conclusion

Final QA status: pass with one explicit environment limitation. The app now launches cleanly from Docker on isolated QA ports, migrations complete on a fresh PostgreSQL database, all automated tests pass, production build passes, production dependency audit has zero vulnerabilities, and the real browser clickthrough passes all 13 workflow batches. T9 and T12 were both manually exercised in-browser after fixes: clinician structured response templates submit successfully, and Doctor-Ready Summary PDF/share behavior is verified with screenshot and PDF artifacts.
