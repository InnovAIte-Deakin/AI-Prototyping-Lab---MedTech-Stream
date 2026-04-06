# Backend Architecture Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Refactor the report domain into a cleaner service-oriented backend structure while preserving route behavior, fixing share-state edge cases, and expanding regression coverage with TDD.

**Architecture:** Keep FastAPI routers thin and move report creation, sharing, revocation, and sharing-mode synchronization into a dedicated report service module. Use API-level regression tests to pin current contracts and edge-case expectations before refactoring internals, then keep the full backend suite green after each cleanup step.

**Tech Stack:** FastAPI, SQLAlchemy async sessions, Pydantic, pytest, TestClient, SQLite test harness

---

### Task 1: Pin Report API Behavior Before Refactor

**Files:**
- Modify: `backend/tests/test_auth_api.py`
- Modify: `backend/tests/factories.py` (only if test data helpers need a small extension)
- Reference: `backend/app/routers/reports.py`

**Step 1: Write the failing tests**

Add focused tests for:

- creating a report with findings persists expected report data
- revoking the last active share resets sharing mode to `private`
- patient-scoped share behavior is handled correctly by the revoke path

Example shape:

```python
def test_revoking_patient_scoped_share_removes_access(auth_api: AuthApiHarness):
    ...
    revoke = auth_api.client.post(
        f"/api/v1/reports/{report_id}/share/revoke",
        headers=auth_headers(owner_login["access_token"]),
        json={"clinician_email": "clinician@example.com"},
    )
    assert revoke.status_code == 204
```

**Step 2: Run the targeted tests to verify failure**

Run:

```bash
pytest backend/tests/test_auth_api.py -k "share or revoke or create_report"
```

Expected:

- at least one new test fails for the intended report-domain behavior

**Step 3: Keep the failing assertions narrow**

Adjust tests until they fail only for missing/incorrect report behavior, not due to fixture/setup mistakes.

**Step 4: Re-run the targeted tests**

Run:

```bash
pytest backend/tests/test_auth_api.py -k "share or revoke or create_report"
```

Expected:

- clean, intentional red state

### Task 2: Extract Report Domain Logic Into A Service Module

**Files:**
- Create: `backend/app/services/reports.py`
- Modify: `backend/app/routers/reports.py`
- Modify: `backend/app/services/__init__.py` (only if needed)
- Test: `backend/tests/test_auth_api.py`

**Step 1: Write the service-facing behavior through existing API tests**

Do not add production code yet. Use the failing tests from Task 1 as the contract.

**Step 2: Implement the minimal service module**

Create service functions for:

- `list_reports_for_user`
- `create_report_for_user`
- `share_report_with_user`
- `revoke_report_share`
- `sync_report_sharing_mode`

Keep signatures explicit and return ORM entities rather than HTTP objects.

**Step 3: Refactor the router to call the service**

`backend/app/routers/reports.py` should retain:

- Pydantic request/response models
- endpoint decorators
- dependency injection
- response shaping

Move multi-step state changes and share lookups into the service.

**Step 4: Run the targeted tests**

Run:

```bash
pytest backend/tests/test_auth_api.py -k "share or revoke or create_report"
```

Expected:

- targeted report API tests pass

**Step 5: Commit**

```bash
git add backend/app/services/reports.py backend/app/routers/reports.py backend/tests/test_auth_api.py
git commit -m "refactor: extract report domain service"
```

### Task 3: Tighten Internal Consistency And Regression Coverage

**Files:**
- Modify: `backend/app/routers/reports.py`
- Modify: `backend/app/dependencies/reports.py` (only if a small access-rule cleanup is needed)
- Modify: `backend/tests/test_auth_api.py`
- Reference: `backend/app/main.py`

**Step 1: Write one more failing test for the remaining edge case**

If revocation or report creation still depends on duplicated logic, add one more test that proves the final inconsistency.

**Step 2: Implement the minimal cleanup**

Clean up:

- duplicated owner checks
- duplicated share lookup conditions
- report sharing mode transitions
- any router-level state logic left behind after Task 2

Avoid broad rewrites outside the report domain.

**Step 3: Run the focused tests**

Run:

```bash
pytest backend/tests/test_auth_api.py -k "share or revoke or create_report"
```

Expected:

- focused report tests pass

**Step 4: Run the full backend suite**

Run:

```bash
pytest backend/tests
```

Expected:

- backend suite passes with zero new failures

**Step 5: Commit**

```bash
git add backend/app/routers/reports.py backend/app/dependencies/reports.py backend/tests/test_auth_api.py
git commit -m "test: harden report domain regression coverage"
```

### Task 4: Final Architecture Readback

**Files:**
- Modify: `docs/plans/2026-04-04-backend-architecture-cleanup-design.md` (only if reality diverges)
- Review: `backend/app/services/reports.py`
- Review: `backend/app/routers/reports.py`

**Step 1: Re-read the final structure**

Confirm:

- router is transport-focused
- report rules live in one service module
- revocation/create/share flows are test-backed

**Step 2: Run final verification**

Run:

```bash
pytest backend/tests
```

Expected:

- green backend verification

**Step 3: Summarize remaining gaps**

Document only real follow-up items, such as:

- startup migration coupling in app lifespan
- parse endpoint still mixing transport and OCR orchestration

Do not expand scope further in this pass.
