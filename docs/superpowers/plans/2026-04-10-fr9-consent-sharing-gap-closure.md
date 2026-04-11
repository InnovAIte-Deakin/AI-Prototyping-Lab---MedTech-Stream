# FR9 Consent Sharing Gap-Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining FR9 backend gaps by adding view audit events, completing patient-scope clinician listing behavior, and making startup migrations interpreter-consistent.

**Architecture:** Keep current backend boundaries and add minimal targeted logic: report access dependency writes view audit records, reports service expands patient-scope listing into concrete report rows, and app startup migration invocation uses the active interpreter. Use existing consent integration harness for TDD-first API tests and keep audit taxonomy consistent (`consent_share`).

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy async ORM, pytest, Starlette TestClient, Alembic

---

## Scope Check

This plan is a single subsystem closure for FR9 backend behavior and tests. No decomposition is required.

## File Structure

### Create
- `backend/tests/test_view_audit.py`
  - Integration tests for report-view audit behavior.
- `backend/tests/test_startup_migrations.py`
  - Unit tests for startup migration command construction and subprocess invocation.

### Modify
- `backend/app/dependencies/reports.py`
  - Add view-event write on successful non-owner report access via active share.
- `backend/app/services/reports.py`
  - Expand patient-scope shares into report rows for clinician listing and dedupe by report.
- `backend/app/main.py`
  - Invoke alembic via active interpreter (`sys.executable -m alembic`).
- `backend/tests/test_clinician_endpoints.py`
  - Add patient-scope listing coverage and overlap-dedupe assertions.

---

### Task 1: Add Failing Tests for View Audit Events

**Files:**
- Create: `backend/tests/test_view_audit.py`
- Test: `backend/tests/test_view_audit.py`

- [ ] **Step 1: Write the failing tests**

```python
# backend/tests/test_view_audit.py
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.models import AuditEvent
from tests.support.consent_api import (
    ConsentApiHarness,
    auth_headers,
    consent_api,
    login,
    seed_report,
    seed_user,
)


def _future_expiry_iso(days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_non_owner_report_access_creates_view_audit_event(consent_api: ConsentApiHarness) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-view@example.com", role="patient")
        clinician = seed_user(session, email="clinician-view@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email="patient-view@example.com")
    share = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": "clinician-view@example.com",
            "scope": "report",
            "access_level": "read",
            "expires_at": _future_expiry_iso(),
        },
    )
    assert share.status_code == 201, share.text
    share_id = share.json()["id"]

    clinician_token = login(consent_api, email="clinician-view@example.com")
    read = consent_api.client.get(
        f"/api/v1/reports/{report.id}",
        headers=auth_headers(clinician_token),
    )
    assert read.status_code == 200, read.text

    with consent_api.session_factory() as session:
        event = session.scalar(
            select(AuditEvent)
            .where(AuditEvent.resource_type == "consent_share")
            .where(AuditEvent.resource_id == share_id)
            .where(AuditEvent.action == "view")
        )

    assert event is not None
    assert event.actor_user_id is not None
    assert event.subject_user_id is not None


def test_owner_report_access_does_not_create_view_audit_event(consent_api: ConsentApiHarness) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-owner-view@example.com", role="patient")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email="patient-owner-view@example.com")
    read = consent_api.client.get(
        f"/api/v1/reports/{report.id}",
        headers=auth_headers(patient_token),
    )
    assert read.status_code == 200, read.text

    with consent_api.session_factory() as session:
        count = session.scalar(
            select(AuditEvent)
            .where(AuditEvent.resource_type == "consent_share")
            .where(AuditEvent.action == "view")
            .where((AuditEvent.context["report_id"]).as_string() == report.id)
            .with_only_columns(select(AuditEvent).where(AuditEvent.resource_type == "consent_share").where(AuditEvent.action == "view").where((AuditEvent.context["report_id"]).as_string() == report.id).subquery().c.id)
        )

    assert count is None
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `python -m pytest -q backend/tests/test_view_audit.py`
Expected: FAIL because no `view` audit event is currently emitted.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_view_audit.py
git commit -m "test(audit): add failing coverage for report view events"
```

---

### Task 2: Implement View Audit Event on Shared Access

**Files:**
- Modify: `backend/app/dependencies/reports.py`
- Modify: `backend/tests/test_view_audit.py`
- Test: `backend/tests/test_view_audit.py`

- [ ] **Step 1: Write minimal implementation**

```python
# backend/app/dependencies/reports.py (inside get_accessible_report)
if share is not None:
    audit = AuditEvent(
        actor_user_id=auth.user.id,
        subject_user_id=auth.user.id,
        resource_type="consent_share",
        resource_id=share.id,
        action="view",
        context={
            "report_id": report.id,
            "scope": share.scope.value,
            "access_level": share.access_level.value,
        },
        occurred_at=now,
    )
    session.add(audit)
    await session.commit()
    return report
```

- [ ] **Step 2: Simplify owner-no-view assertion to robust query**

```python
# backend/tests/test_view_audit.py (owner test section)
with consent_api.session_factory() as session:
    rows = session.scalars(
        select(AuditEvent)
        .where(AuditEvent.resource_type == "consent_share")
        .where(AuditEvent.action == "view")
    ).all()

assert all((row.context or {}).get("report_id") != report.id for row in rows)
```

- [ ] **Step 3: Run tests to verify pass**

Run: `python -m pytest -q backend/tests/test_view_audit.py`
Expected: PASS.

- [ ] **Step 4: Run targeted regression checks**

Run: `python -m pytest -q backend/tests/test_expiry_enforcement.py backend/tests/test_audit_log_retrieval.py`
Expected: PASS.

- [ ] **Step 5: Commit implementation**

```bash
git add backend/app/dependencies/reports.py backend/tests/test_view_audit.py
git commit -m "feat(audit): emit view events for shared report access"
```

---

### Task 3: Add Failing Tests for Patient-Scope Listing Expansion

**Files:**
- Modify: `backend/tests/test_clinician_endpoints.py`
- Test: `backend/tests/test_clinician_endpoints.py`

- [ ] **Step 1: Write failing tests**

```python
# backend/tests/test_clinician_endpoints.py (add tests)
def test_patient_scope_share_lists_all_patient_reports(consent_api: ConsentApiHarness) -> None:
    patient_email = "patient-scope-list@example.com"
    clinician_email = "clinician-scope-list@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")
        report_a = seed_report(session, subject_email=patient_email, created_by_email=patient_email)
        report_b = seed_report(session, subject_email=patient_email, created_by_email=patient_email)

    patient_token = login(consent_api, email=patient_email)
    share = consent_api.client.post(
        f"/api/v1/reports/{report_a.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician_email,
            "scope": "patient",
            "access_level": "read",
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
    )
    assert share.status_code == 201, share.text

    clinician_token = login(consent_api, email=clinician_email)
    response = consent_api.client.get(
        "/api/v1/reports/shared-reports",
        headers=auth_headers(clinician_token),
    )
    assert response.status_code == 200, response.text

    ids = {item["report"]["id"] for item in response.json()}
    assert ids == {report_a.id, report_b.id}


def test_overlap_patient_and_report_scope_is_deduped_by_report(consent_api: ConsentApiHarness) -> None:
    patient_email = "patient-overlap@example.com"
    clinician_email = "clinician-overlap@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")
        report = seed_report(session, subject_email=patient_email, created_by_email=patient_email)

    patient_token = login(consent_api, email=patient_email)
    for scope in ("patient", "report"):
        r = consent_api.client.post(
            f"/api/v1/reports/{report.id}/share",
            headers=auth_headers(patient_token),
            json={
                "clinician_email": clinician_email,
                "scope": scope,
                "access_level": "read",
                "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
            },
        )
        assert r.status_code == 201, r.text

    clinician_token = login(consent_api, email=clinician_email)
    response = consent_api.client.get(
        "/api/v1/reports/shared-reports",
        headers=auth_headers(clinician_token),
    )
    assert response.status_code == 200, response.text

    ids = [item["report"]["id"] for item in response.json()]
    assert ids.count(report.id) == 1
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest -q backend/tests/test_clinician_endpoints.py -k "patient_scope_share_lists_all_patient_reports or overlap_patient_and_report_scope_is_deduped_by_report"`
Expected: FAIL because patient-scope rows are currently skipped.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_clinician_endpoints.py
git commit -m "test(reports): add failing patient-scope shared listing coverage"
```

---

### Task 4: Implement Patient-Scope Expansion and Dedupe in Listing Service

**Files:**
- Modify: `backend/app/services/reports.py`
- Modify: `backend/tests/test_clinician_endpoints.py`
- Test: `backend/tests/test_clinician_endpoints.py`

- [ ] **Step 1: Implement expansion and dedupe logic**

```python
# backend/app/services/reports.py (replace get_clinician_shared_reports body)
async def get_clinician_shared_reports(
    session: AsyncSession,
    *,
    clinician_user_id: str,
) -> list[ClinicianSharedReportItem]:
    now = datetime.now(UTC)

    share_rows = await session.execute(
        select(ConsentShare, User)
        .join(User, ConsentShare.subject_user_id == User.id)
        .where(
            ConsentShare.grantee_user_id == clinician_user_id,
            ConsentShare.revoked_at.is_(None),
            ConsentShare.expires_at > now,
        )
        .order_by(ConsentShare.created_at.desc())
    )

    by_report: dict[str, ClinicianSharedReportItem] = {}

    for share, patient in share_rows.unique():
        if share.scope == ConsentScope.REPORT and share.report_id is not None:
            report = await session.scalar(
                select(Report)
                .where(Report.id == share.report_id)
                .options(selectinload(Report.findings))
            )
            if report is None:
                continue
            by_report[report.id] = ClinicianSharedReportItem(
                share_id=share.id,
                report_id=report.id,
                report=report,
                patient=patient,
                scope=share.scope.value,
                access_level=share.access_level.value,
                shared_at=share.created_at,
                expires_at=share.expires_at,
            )
            continue

        if share.scope == ConsentScope.PATIENT and share.report_id is None:
            reports = (
                await session.scalars(
                    select(Report)
                    .where(Report.subject_user_id == share.subject_user_id)
                    .options(selectinload(Report.findings))
                )
            ).all()
            for report in reports:
                if report.id in by_report:
                    continue
                by_report[report.id] = ClinicianSharedReportItem(
                    share_id=share.id,
                    report_id=report.id,
                    report=report,
                    patient=patient,
                    scope=share.scope.value,
                    access_level=share.access_level.value,
                    shared_at=share.created_at,
                    expires_at=share.expires_at,
                )

    return sorted(by_report.values(), key=lambda item: item.shared_at, reverse=True)
```

- [ ] **Step 2: Run focused listing tests**

Run: `python -m pytest -q backend/tests/test_clinician_endpoints.py`
Expected: PASS.

- [ ] **Step 3: Run impacted audit/list regression**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py backend/tests/test_verified_clinician.py`
Expected: PASS.

- [ ] **Step 4: Commit implementation**

```bash
git add backend/app/services/reports.py backend/tests/test_clinician_endpoints.py
git commit -m "feat(reports): include patient-scope shares in clinician listing"
```

---

### Task 5: Add Failing Tests for Startup Migration Invocation Robustness

**Files:**
- Create: `backend/tests/test_startup_migrations.py`
- Test: `backend/tests/test_startup_migrations.py`

- [ ] **Step 1: Write failing unit tests**

```python
# backend/tests/test_startup_migrations.py
from __future__ import annotations

import sys
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app import main as main_mod


@pytest.mark.asyncio
async def test_run_alembic_migrations_uses_active_interpreter(monkeypatch: pytest.MonkeyPatch) -> None:
    fake_process = SimpleNamespace(
        communicate=AsyncMock(return_value=(b"ok", b"")),
        returncode=0,
    )

    called_args = {}

    async def fake_exec(*args, **kwargs):
        called_args["args"] = args
        called_args["kwargs"] = kwargs
        return fake_process

    monkeypatch.setattr(main_mod.asyncio, "create_subprocess_exec", fake_exec)

    await main_mod._run_alembic_migrations(".", timeout=60)

    assert called_args["args"][0] == sys.executable
    assert called_args["args"][1:4] == ("-m", "alembic", "upgrade")
```

- [ ] **Step 2: Run tests to verify failure**

Run: `python -m pytest -q backend/tests/test_startup_migrations.py`
Expected: FAIL because current command starts with plain `alembic`.

- [ ] **Step 3: Commit failing tests**

```bash
git add backend/tests/test_startup_migrations.py
git commit -m "test(startup): add failing migration invocation interpreter checks"
```

---

### Task 6: Implement Interpreter-Based Migration Invocation

**Files:**
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_startup_migrations.py`
- Test: `backend/tests/test_startup_migrations.py`

- [ ] **Step 1: Implement startup command change**

```python
# backend/app/main.py (imports)
import sys
```

```python
# backend/app/main.py (_run_alembic_migrations)
process = await asyncio.create_subprocess_exec(
    sys.executable,
    "-m",
    "alembic",
    "upgrade",
    "head",
    cwd=project_root,
    stdout=asyncio.subprocess.PIPE,
    stderr=asyncio.subprocess.PIPE,
)
```

- [ ] **Step 2: Run migration invocation tests**

Run: `python -m pytest -q backend/tests/test_startup_migrations.py`
Expected: PASS.

- [ ] **Step 3: Run end-to-end FR9 regression subset**

Run: `python -m pytest -q backend/tests/test_view_audit.py backend/tests/test_verified_clinician.py backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_clinician_endpoints.py backend/tests/test_audit_log_retrieval.py backend/tests/test_expired_share_cleanup.py`
Expected: PASS.

- [ ] **Step 4: Commit implementation**

```bash
git add backend/app/main.py backend/tests/test_startup_migrations.py
git commit -m "fix(startup): run alembic with active interpreter"
```

---

### Task 7: Final FR9 Verification

**Files:**
- Modify: `docs/superpowers/specs/2026-04-10-fr9-consent-sharing-gap-closure-design.md` (only if behavior changed)
- Test: FR9 suites

- [ ] **Step 1: Run full FR9 backend verification**

Run:
`python -m pytest -q backend/tests/test_view_audit.py backend/tests/test_verified_clinician.py backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_clinician_endpoints.py backend/tests/test_audit_log_retrieval.py backend/tests/test_expired_share_cleanup.py backend/tests/test_startup_migrations.py`

Expected: PASS.

- [ ] **Step 2: Run broader auth/report regression**

Run:
`python -m pytest -q backend/tests/test_auth_api.py backend/tests/test_clinician_endpoints.py backend/tests/test_audit_log_retrieval.py`

Expected: PASS (skips acceptable where already expected by suite).

- [ ] **Step 3: Sync spec only if contract changed**

```markdown
# docs/superpowers/specs/2026-04-10-fr9-consent-sharing-gap-closure-design.md
- Confirmed `view` event semantics are non-owner report access only.
- Confirmed patient-scope listing expansion and dedupe precedence.
- Confirmed startup alembic invocation uses active interpreter.
```

- [ ] **Step 4: Commit spec sync if edited**

```bash
git add docs/superpowers/specs/2026-04-10-fr9-consent-sharing-gap-closure-design.md
git commit -m "docs: sync FR9 gap-closure spec with implementation details"
```

---

## Self-Review

### 1) Spec Coverage
- View audit event gap: Tasks 1-2
- Patient-scope clinician listing gap: Tasks 3-4
- Migration invocation reliability gap: Tasks 5-6
- FR9 verification and DoD proof: Task 7

No coverage gap found.

### 2) Placeholder Scan
- No placeholders (`TBD`, `TODO`, or undefined implementation steps) found.

### 3) Type/Signature Consistency
- Uses existing consent harness (`ConsentApiHarness`, `seed_user`, `seed_report`, `login`, `auth_headers`) consistently.
- Keeps audit taxonomy as `resource_type = consent_share` across all new tests and implementation.
- Keeps endpoint path consistent: `/api/v1/reports/shared-reports`.
