# FR9 Consent Sharing Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix report-audit cross-report leakage and tighten default expiry cleanup cadence while preserving existing FR9 contracts.

**Architecture:** Apply minimal, localized changes: add failing tests for report-scoped audit isolation, update audit retrieval filters in the reports service to enforce report relevance, and reduce the scheduler default interval with env override unchanged. Keep role-based clinician validation and existing API payloads/messages unchanged.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async ORM, pytest, Starlette TestClient

---

## Scope Check

This work is a single backend subsystem fix and does not require decomposition.

## File Structure

### Modify
- `backend/tests/test_audit_log_retrieval.py`
  - Add failing case for patient-scope share view events leaking into another report's audit endpoint.
- `backend/app/services/reports.py`
  - Enforce event-level report relevance in `get_report_audit_log`.
- `backend/tests/test_startup_migrations.py`
  - Add scheduler default interval assertion for 5-minute default.
- `backend/app/main.py`
  - Change default `CLEANUP_INTERVAL_MINUTES` from 60 to 5.

---

### Task 1: Add Failing Audit Isolation Test

**Files:**
- Modify: `backend/tests/test_audit_log_retrieval.py`
- Test: `backend/tests/test_audit_log_retrieval.py::test_patient_scope_view_events_do_not_leak_across_reports`

- [ ] **Step 1: Write failing test**

```python
def test_patient_scope_view_events_do_not_leak_across_reports(consent_api: ConsentApiHarness) -> None:
    patient_email = "patient-view-leak@example.com"
    clinician_email = "clinician-view-leak@example.com"

    with consent_api.session_factory() as session:
        patient = seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")
        report_a = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )
        report_b = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    patient_token = login(consent_api, email=patient_email)
    share = consent_api.client.post(
        f"/api/v1/reports/{report_a.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician_email,
            "scope": "patient",
            "access_level": "read",
            "expires_at": _future_expiry_iso(),
        },
    )
    assert share.status_code == 201, share.text

    clinician_token = login(consent_api, email=clinician_email)
    access_other_report = consent_api.client.get(
        f"/api/v1/reports/{report_b.id}",
        headers=auth_headers(clinician_token),
    )
    assert access_other_report.status_code == 200, access_other_report.text

    response = _get_audit_log(
        consent_api,
        patient_token=patient_token,
        report_id=report_a.id,
    )
    assert response.status_code == 200, response.text

    leaked_rows = [
        row
        for row in response.json()
        if row["action"] == "view" and row["context"].get("report_id") == report_b.id
    ]
    assert leaked_rows == []
```

- [ ] **Step 2: Run test to verify failure**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py -k patient_scope_view_events_do_not_leak_across_reports`
Expected: FAIL due leaked view event on wrong report endpoint.

- [ ] **Step 3: Commit failing test**

```bash
git add backend/tests/test_audit_log_retrieval.py
git commit -m "test(audit): add failing patient-scope view isolation coverage"
```

---

### Task 2: Implement Report-Relevance Filtering in Audit Retrieval

**Files:**
- Modify: `backend/app/services/reports.py`
- Test: `backend/tests/test_audit_log_retrieval.py::test_patient_scope_view_events_do_not_leak_across_reports`

- [ ] **Step 1: Implement minimal filter update**

```python
# backend/app/services/reports.py (inside get_report_audit_log)
from sqlalchemy import and_, or_, select

report_id_in_context = (AuditEvent.context["report_id"]).as_string()

query = select(AuditEvent).where(
    AuditEvent.resource_type == "consent_share",
    AuditEvent.resource_id.in_(share_ids),
    or_(
        report_id_in_context.is_(None),
        report_id_in_context == report_id,
    ),
)
```

- [ ] **Step 2: Run targeted audit retrieval tests**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py`
Expected: PASS.

- [ ] **Step 3: Commit implementation**

```bash
git add backend/app/services/reports.py backend/tests/test_audit_log_retrieval.py
git commit -m "fix(audit): scope report audit events to requested report"
```

---

### Task 3: Add Failing Test for Cleanup Default Cadence

**Files:**
- Modify: `backend/tests/test_startup_migrations.py`
- Test: `backend/tests/test_startup_migrations.py::test_app_lifespan_defaults_cleanup_interval_to_five_minutes`

- [ ] **Step 1: Write failing test**

```python
@pytest.mark.asyncio
async def test_app_lifespan_defaults_cleanup_interval_to_five_minutes(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, int] = {}

    class FakeScheduler:
        def add_job(self, _func, _trigger, *, minutes: int, **_kwargs):
            captured["minutes"] = minutes

        def start(self):
            return None

        def shutdown(self):
            return None

    monkeypatch.delenv("CLEANUP_INTERVAL_MINUTES", raising=False)
    monkeypatch.setattr(main_mod, "AsyncIOScheduler", lambda: FakeScheduler())
    monkeypatch.setattr(main_mod, "_run_alembic_migrations", pytest.AsyncMock(return_value=None))

    app = main_mod.create_app()
    async with main_mod.app_lifespan(app):
        pass

    assert captured["minutes"] == 5
```

- [ ] **Step 2: Run test to verify failure**

Run: `python -m pytest -q backend/tests/test_startup_migrations.py -k defaults_cleanup_interval_to_five_minutes`
Expected: FAIL with current default 60.

- [ ] **Step 3: Commit failing test**

```bash
git add backend/tests/test_startup_migrations.py
git commit -m "test(startup): add failing cleanup interval default coverage"
```

---

### Task 4: Implement Cleanup Default Interval Change

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_startup_migrations.py`
- Test: `backend/tests/test_startup_migrations.py`

- [ ] **Step 1: Update default cleanup interval**

```python
# backend/app/main.py
cleanup_interval = int(os.getenv('CLEANUP_INTERVAL_MINUTES', '5'))
```

- [ ] **Step 2: Run startup tests**

Run: `python -m pytest -q backend/tests/test_startup_migrations.py`
Expected: PASS.

- [ ] **Step 3: Commit implementation**

```bash
git add backend/app/main.py backend/tests/test_startup_migrations.py
git commit -m "fix(startup): set cleanup scheduler default to five minutes"
```

---

### Task 5: Regression Verification

**Files:**
- Test: `backend/tests/test_audit_sharing.py`
- Test: `backend/tests/test_expiry_enforcement.py`
- Test: `backend/tests/test_expired_share_cleanup.py`
- Test: `backend/tests/test_startup_migrations.py`
- Test: `backend/tests/test_audit_log_retrieval.py`

- [ ] **Step 1: Run full targeted regression set**

Run: `python -m pytest -q backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_expired_share_cleanup.py backend/tests/test_startup_migrations.py backend/tests/test_audit_log_retrieval.py`
Expected: PASS.

- [ ] **Step 2: Commit if any regression test stabilization edits were required**

```bash
git add <any-updated-test-files>
git commit -m "test: stabilize FR9 review-fix regression coverage"
```

(If no edits were required after regression run, skip this commit.)

---

## Self-Review

### 1) Spec coverage
- Report audit isolation fixed: Tasks 1-2
- Cleanup default cadence tightened: Tasks 3-4
- Regression validation retained: Task 5
- Role-only clinician decision preserved: no `is_verified` change in tasks

No coverage gaps found.

### 2) Placeholder scan
- No placeholder markers (`TBD`, `TODO`, `implement later`) in tasks.

### 3) Type/signature consistency
- Uses existing `get_report_audit_log` function and existing startup lifespan wiring.
- Uses existing test harness modules and naming conventions.
