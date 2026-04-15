# Consent Sharing Stabilization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix consent-sharing correctness and reliability issues by aligning audit scoping, audit taxonomy, API contract, and failing tests.

**Architecture:** Keep the existing backend module boundaries (`app/services/reports.py`, `app/dependencies/reports.py`, `app/routers/reports.py`) and add a reusable consent integration test harness for deterministic API tests. Implement behavior fixes in service layer first, then align tests and endpoint expectations to the canonical route. Preserve current domain model and avoid unrelated refactors.

**Tech Stack:** Python 3.11+, FastAPI, SQLAlchemy (async + sync test setup), pytest, TestClient, SQLite

---

## Scope Check

This is a single subsystem plan (consent sharing + audit behavior stabilization). No decomposition is required.

## File Structure (Lock Before Coding)

### Create
- `backend/tests/__init__.py`
  - Ensure local `tests` package resolves before third-party `tests` modules.
- `backend/tests/support/__init__.py`
  - Mark support package for shared fixtures/helpers.
- `backend/tests/support/consent_api.py`
  - Reusable TestClient + DB harness and seed/login helpers for consent-related API tests.
- `backend/tests/test_harness_imports.py`
  - Regression test for local test package import resolution.

### Modify
- `backend/tests/conftest.py`
  - Add deterministic test import path handling.
- `backend/app/services/reports.py`
  - Fix report-scoped audit retrieval query.
  - Normalize cleanup audit `resource_type`.
- `backend/tests/test_clinician_endpoints.py`
  - Convert to harness-driven tests and canonical endpoint path.
- `backend/tests/test_audit_log_retrieval.py`
  - Convert to harness-driven tests and add report-scope leak-prevention assertion.
- `backend/tests/test_verified_clinician.py`
  - Replace fixture mismatch with harness-based integration tests.
- `backend/tests/test_audit_sharing.py`
  - Replace fixture mismatch with harness-based integration tests.
- `backend/tests/test_expiry_enforcement.py`
  - Replace fixture mismatch with harness-based integration tests.
- `backend/tests/test_expired_share_cleanup.py`
  - Replace invalid schema references (`AuditEvent.share_id`) and fixture misuse.

### Keep Unchanged
- `backend/app/routers/reports.py`
  - Keep canonical endpoint route under reports router (`/api/v1/reports/shared-reports`).

---

### Task 1: Stabilize Local Test Imports

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_harness_imports.py`
- Modify: `backend/tests/conftest.py`
- Test: `backend/tests/test_harness_imports.py`

- [ ] **Step 1: Write the failing test**

```python
# backend/tests/test_harness_imports.py
from importlib import import_module


def test_local_tests_package_imports_factories_module() -> None:
    module = import_module("tests.factories")
    assert hasattr(module, "PersistenceFactory")
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest -q backend/tests/test_harness_imports.py`
Expected: FAIL with `ModuleNotFoundError: No module named 'tests.factories'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/tests/__init__.py
"""Local test package marker for stable imports."""
```

```python
# backend/tests/conftest.py (top section)
from __future__ import annotations

import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
TESTS_ROOT = Path(__file__).resolve().parent

for path in (str(BACKEND_ROOT), str(TESTS_ROOT.parent)):
    if path not in sys.path:
        sys.path.insert(0, path)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest -q backend/tests/test_harness_imports.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/__init__.py backend/tests/conftest.py backend/tests/test_harness_imports.py
git commit -m "test: stabilize local tests package imports"
```

---

### Task 2: Build Consent API Integration Harness

**Files:**
- Create: `backend/tests/support/__init__.py`
- Create: `backend/tests/support/consent_api.py`
- Test: `backend/tests/test_clinician_endpoints.py`

- [ ] **Step 1: Write the failing test that depends on the new harness**

```python
# backend/tests/test_clinician_endpoints.py (new top-level smoke test)
from tests.support.consent_api import consent_api


def test_harness_fixture_is_available(consent_api) -> None:
    assert consent_api.client is not None
    assert consent_api.session_factory is not None
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest -q backend/tests/test_clinician_endpoints.py::test_harness_fixture_is_available`
Expected: FAIL with `ModuleNotFoundError: No module named 'tests.support.consent_api'`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/tests/support/__init__.py
"""Shared test harness utilities for consent-sharing integration tests."""
```

```python
# backend/tests/support/consent_api.py
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Report, User
from app.main import create_app
from app.services.auth import hash_password
from tests.factories import PersistenceFactory


@dataclass
class ConsentApiHarness:
    client: TestClient
    session_factory: sessionmaker


@pytest.fixture()
def consent_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ConsentApiHarness:
    db_path = tmp_path / "consent-api.sqlite3"
    sync_database_url = f"sqlite:///{db_path.resolve().as_posix()}"
    async_database_url = f"sqlite+aiosqlite:///{db_path.resolve().as_posix()}"

    monkeypatch.setenv("DATABASE_URL", async_database_url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "reportx-test-auth-secret-key-with-32-bytes")

    engine = create_engine(sync_database_url, future=True)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    app = create_app()
    with TestClient(app) as client:
        yield ConsentApiHarness(client=client, session_factory=session_factory)

    engine.dispose()


def seed_user(session: Session, *, email: str, role: str, password: str = "Password123!", display_name: str | None = None) -> User:
    factory = PersistenceFactory(session)
    user = factory.create_user(
        email=email,
        display_name=display_name or email.split("@")[0],
        password_hash=hash_password(password),
        roles=[role],
    )
    session.commit()
    return user


def login(consent_api: ConsentApiHarness, *, email: str, password: str = "Password123!") -> str:
    response = consent_api.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def seed_report(session: Session, *, subject_email: str, created_by_email: str) -> Report:
    factory = PersistenceFactory(session)
    subject = session.scalar(select(User).where(User.email == subject_email))
    created_by = session.scalar(select(User).where(User.email == created_by_email))
    assert subject is not None
    assert created_by is not None
    report = factory.create_report(subject=subject, created_by=created_by)
    session.commit()
    return report


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest -q backend/tests/test_clinician_endpoints.py::test_harness_fixture_is_available`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/support/__init__.py backend/tests/support/consent_api.py backend/tests/test_clinician_endpoints.py
git commit -m "test: add reusable consent API integration harness"
```

---

### Task 3: Fix Report-Scoped Audit Retrieval

**Files:**
- Modify: `backend/app/services/reports.py`
- Modify: `backend/tests/test_audit_log_retrieval.py`
- Test: `backend/tests/test_audit_log_retrieval.py`

- [ ] **Step 1: Write the failing test for cross-report leak prevention**

```python
# backend/tests/test_audit_log_retrieval.py (add test)
def test_audit_log_excludes_events_from_other_reports(consent_api):
    from tests.support.consent_api import auth_headers, login, seed_report, seed_user

    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient@example.com", role="patient")
        clinician = seed_user(session, email="clinician@example.com", role="clinician")
        report_a = seed_report(session, subject_email=patient.email, created_by_email=patient.email)
        report_b = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

        session.execute(
            """
            INSERT INTO consent_shares (id, subject_user_id, grantee_user_id, granted_by_user_id, report_id, scope, access_level, expires_at, created_at, updated_at)
            VALUES (:id, :subject_user_id, :grantee_user_id, :granted_by_user_id, :report_id, 'report', 'read', datetime('now', '+7 day'), datetime('now'), datetime('now'))
            """,
            {
                "id": "00000000-0000-0000-0000-000000000101",
                "subject_user_id": patient.id,
                "grantee_user_id": clinician.id,
                "granted_by_user_id": patient.id,
                "report_id": report_b.id,
            },
        )
        session.execute(
            """
            INSERT INTO audit_events (id, actor_user_id, subject_user_id, resource_type, resource_id, action, context, occurred_at)
            VALUES (:id, :actor_user_id, :subject_user_id, 'consent_share', :resource_id, 'created', '{}', datetime('now'))
            """,
            {
                "id": "00000000-0000-0000-0000-000000000201",
                "actor_user_id": patient.id,
                "subject_user_id": clinician.id,
                "resource_id": "00000000-0000-0000-0000-000000000101",
            },
        )
        session.commit()

    patient_token = login(consent_api, email="patient@example.com")
    response = consent_api.client.get(
        f"/api/v1/audit/reports/{report_a.id}",
        headers=auth_headers(patient_token),
    )

    assert response.status_code == 200
    assert response.json() == []
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py::test_audit_log_excludes_events_from_other_reports`
Expected: FAIL because unrelated report event is currently returned

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/reports.py (imports)
from sqlalchemy import and_, or_, select
```

```python
# backend/app/services/reports.py (inside get_report_audit_log)
share_ids = select(ConsentShare.id).where(
    ConsentShare.subject_user_id == owner_user_id,
    or_(
        and_(
            ConsentShare.scope == ConsentScope.REPORT,
            ConsentShare.report_id == report_id,
        ),
        and_(
            ConsentShare.scope == ConsentScope.PATIENT,
            ConsentShare.report_id.is_(None),
        ),
    ),
)

query = select(AuditEvent).where(
    AuditEvent.resource_type == "consent_share",
    AuditEvent.resource_id.in_(share_ids),
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py::test_audit_log_excludes_events_from_other_reports`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/reports.py backend/tests/test_audit_log_retrieval.py
git commit -m "fix(reports): scope audit log events to target report"
```

---

### Task 4: Normalize Expired Cleanup Audit Taxonomy

**Files:**
- Modify: `backend/app/services/reports.py`
- Modify: `backend/tests/test_expired_share_cleanup.py`
- Test: `backend/tests/test_expired_share_cleanup.py`

- [ ] **Step 1: Write the failing test for cleanup taxonomy**

```python
# backend/tests/test_expired_share_cleanup.py (add test)
def test_cleanup_writes_consent_share_resource_type(consent_api):
    import asyncio
    from datetime import UTC, datetime, timedelta
    from sqlalchemy import select

    from app.db.models import AuditEvent, ConsentShare, User
    from app.services.reports import cleanup_expired_shares
    from tests.support.consent_api import seed_report, seed_user

    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient@example.com", role="patient")
        clinician = seed_user(session, email="clinician@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)
        share = ConsentShare(
            subject_user_id=patient.id,
            grantee_user_id=clinician.id,
            granted_by_user_id=patient.id,
            report_id=report.id,
            expires_at=datetime.now(UTC) - timedelta(hours=1),
        )
        session.add(share)
        session.commit()

    async def _run_cleanup() -> None:
        async with consent_api.client.app.state.database.session() as async_session:
            await cleanup_expired_shares(async_session)

    asyncio.run(_run_cleanup())

    with consent_api.session_factory() as session:
        event = session.scalar(
            select(AuditEvent)
            .where(AuditEvent.resource_id == share.id)
            .where(AuditEvent.action == "expired")
        )
        assert event is not None
        assert event.resource_type == "consent_share"
```

- [ ] **Step 2: Run test to verify it fails**

Run: `python -m pytest -q backend/tests/test_expired_share_cleanup.py::test_cleanup_writes_consent_share_resource_type`
Expected: FAIL because `resource_type` is currently `share`

- [ ] **Step 3: Write minimal implementation**

```python
# backend/app/services/reports.py (inside cleanup_expired_shares -> _create_audit_event call)
await _create_audit_event(
    session,
    actor_user_id=None,
    subject_user_id=share.subject_user_id,
    resource_type="consent_share",
    resource_id=share.id,
    action="expired",
    context=context,
)
```

- [ ] **Step 4: Run test to verify it passes**

Run: `python -m pytest -q backend/tests/test_expired_share_cleanup.py::test_cleanup_writes_consent_share_resource_type`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/app/services/reports.py backend/tests/test_expired_share_cleanup.py
git commit -m "fix(reports): use consent_share taxonomy for cleanup expiry audits"
```

---

### Task 5: Align Clinician Shared-Reports Contract and Tests

**Files:**
- Modify: `backend/tests/test_clinician_endpoints.py`
- Test: `backend/tests/test_clinician_endpoints.py`

- [ ] **Step 1: Write/update failing test to canonical route**

```python
# backend/tests/test_clinician_endpoints.py (replace endpoint usage)
response = consent_api.client.get(
    "/api/v1/reports/shared-reports",
    headers=auth_headers(clinician_token),
)
assert response.status_code == 200
```

- [ ] **Step 2: Run test to verify current file fails for old route assumptions**

Run: `python -m pytest -q backend/tests/test_clinician_endpoints.py -k shared_reports`
Expected: FAIL before file conversion because tests still target `/api/v1/clinician/shared-reports`

- [ ] **Step 3: Write minimal implementation (convert file to harness-driven sync integration tests)**

```python
# backend/tests/test_clinician_endpoints.py (core pattern)
from tests.support.consent_api import auth_headers, consent_api, login, seed_report, seed_user


def test_clinician_can_list_only_active_shared_reports(consent_api):
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient@example.com", role="patient")
        clinician = seed_user(session, email="clinician@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email="patient@example.com")
    create_share = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": "clinician@example.com",
            "scope": "report",
            "access_level": "read",
            "expires_at": "2099-01-01T00:00:00Z",
        },
    )
    assert create_share.status_code == 201, create_share.text

    clinician_token = login(consent_api, email="clinician@example.com")
    response = consent_api.client.get(
        "/api/v1/reports/shared-reports",
        headers=auth_headers(clinician_token),
    )

    assert response.status_code == 200
    payload = response.json()
    assert len(payload) == 1
    assert payload[0]["report_id"] == report.id
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `python -m pytest -q backend/tests/test_clinician_endpoints.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_clinician_endpoints.py
git commit -m "test(reports): align clinician shared reports tests to canonical endpoint"
```

---

### Task 6: Rewrite Audit Log Retrieval Tests to Valid Harness + Scope Assertions

**Files:**
- Modify: `backend/tests/test_audit_log_retrieval.py`
- Test: `backend/tests/test_audit_log_retrieval.py`

- [ ] **Step 1: Write failing test for action filter + owner restriction + scope**

```python
# backend/tests/test_audit_log_retrieval.py (core assertions)
assert response.status_code == 200
assert all(row["action"] == "revoked" for row in response.json())
```

```python
# backend/tests/test_audit_log_retrieval.py (non-owner assertion)
assert forbidden.status_code == 403
```

```python
# backend/tests/test_audit_log_retrieval.py (scope assertion)
assert unrelated_events == []
```

- [ ] **Step 2: Run tests to verify failures before full conversion**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py`
Expected: FAIL due to async fixture mismatch and invalid setup assumptions

- [ ] **Step 3: Write minimal implementation (replace file with harness-driven integration tests)**

```python
# backend/tests/test_audit_log_retrieval.py (example test body)
from tests.support.consent_api import auth_headers, login, seed_report, seed_user


def test_patient_can_filter_audit_log_by_action(consent_api):
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient@example.com", role="patient")
        clinician = seed_user(session, email="clinician@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email="patient@example.com")
    share_response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": "clinician@example.com",
            "scope": "report",
            "access_level": "read",
            "expires_at": "2099-01-01T00:00:00Z",
        },
    )
    assert share_response.status_code == 201

    revoke_response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share/revoke",
        headers=auth_headers(patient_token),
        json={"clinician_email": "clinician@example.com"},
    )
    assert revoke_response.status_code == 204

    filtered = consent_api.client.get(
        f"/api/v1/audit/reports/{report.id}?action=revoked",
        headers=auth_headers(patient_token),
    )
    assert filtered.status_code == 200
    rows = filtered.json()
    assert len(rows) >= 1
    assert all(row["action"] == "revoked" for row in rows)
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest -q backend/tests/test_audit_log_retrieval.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_audit_log_retrieval.py
git commit -m "test(audit): rewrite audit retrieval coverage with consent harness"
```

---

### Task 7: Replace Remaining Broken Consent Tests With Valid Integration Coverage

**Files:**
- Modify: `backend/tests/test_verified_clinician.py`
- Modify: `backend/tests/test_audit_sharing.py`
- Modify: `backend/tests/test_expiry_enforcement.py`
- Modify: `backend/tests/test_expired_share_cleanup.py`
- Test: these four files

- [ ] **Step 1: Write failing test targets for each behavior group**

```python
# verified clinician
assert share_response.status_code == 400
assert "clinician" in share_response.text.lower()
```

```python
# share/revoke audit
assert any(event["action"] == "created" for event in audit_rows)
assert any(event["action"] == "revoked" for event in audit_rows)
```

```python
# expiry enforcement
assert denied.status_code == 403
assert "expired" in denied.text.lower()
```

```python
# cleanup schema
assert event.resource_id == expired_share.id
assert event.resource_type == "consent_share"
```

- [ ] **Step 2: Run tests to verify current failures**

Run: `python -m pytest -q backend/tests/test_verified_clinician.py backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_expired_share_cleanup.py`
Expected: FAIL due to async/sync mismatch, invalid factory args, and invalid `AuditEvent.share_id` usage

- [ ] **Step 3: Write minimal implementation (replace with harness-valid tests)**

```python
# backend/tests/test_verified_clinician.py (core test)
from tests.support.consent_api import auth_headers, login, seed_report, seed_user


def test_share_with_non_clinician_role_is_rejected(consent_api):
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient@example.com", role="patient")
        seed_user(session, email="other_patient@example.com", role="patient")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    token = login(consent_api, email="patient@example.com")
    response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(token),
        json={
            "clinician_email": "other_patient@example.com",
            "scope": "report",
            "access_level": "read",
            "expires_at": "2099-01-01T00:00:00Z",
        },
    )
    assert response.status_code == 400
```

```python
# backend/tests/test_expired_share_cleanup.py (replace invalid field usage)
from sqlalchemy import select
from app.db.models import AuditEvent


event = session.scalar(
    select(AuditEvent)
    .where(AuditEvent.resource_type == "consent_share")
    .where(AuditEvent.resource_id == expired_share.id)
    .where(AuditEvent.action == "expired")
)
assert event is not None
```

- [ ] **Step 4: Run tests to verify pass**

Run: `python -m pytest -q backend/tests/test_verified_clinician.py backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_expired_share_cleanup.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/tests/test_verified_clinician.py backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_expired_share_cleanup.py
git commit -m "test(consent): replace broken async fixture tests with valid integration coverage"
```

---

### Task 8: Full Verification and Plan-Doc Sync

**Files:**
- Modify: `docs/superpowers/specs/2026-04-09-consent-sharing-stabilization-design.md` (only if behavior wording changed)
- Test: targeted and relevant backend suites

- [ ] **Step 1: Write a failing verification target list in PR notes**

```text
Expected green suites:
- backend/tests/test_harness_imports.py
- backend/tests/test_verified_clinician.py
- backend/tests/test_audit_sharing.py
- backend/tests/test_expiry_enforcement.py
- backend/tests/test_clinician_endpoints.py
- backend/tests/test_audit_log_retrieval.py
- backend/tests/test_expired_share_cleanup.py
```

- [ ] **Step 2: Run all targeted tests**

Run:
`python -m pytest -q backend/tests/test_harness_imports.py backend/tests/test_verified_clinician.py backend/tests/test_audit_sharing.py backend/tests/test_expiry_enforcement.py backend/tests/test_clinician_endpoints.py backend/tests/test_audit_log_retrieval.py backend/tests/test_expired_share_cleanup.py`

Expected: PASS

- [ ] **Step 3: Run a broader regression sweep for auth/report paths**

Run:
`python -m pytest -q backend/tests/test_auth_api.py backend/tests/test_clinician_endpoints.py backend/tests/test_audit_log_retrieval.py`

Expected: PASS

- [ ] **Step 4: Update design doc if any plan-to-implementation contract changed**

```markdown
# docs/superpowers/specs/2026-04-09-consent-sharing-stabilization-design.md
- Keep canonical clinician path at /api/v1/reports/shared-reports.
- Confirm test harness now uses shared consent_api fixture.
```

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/specs/2026-04-09-consent-sharing-stabilization-design.md
git commit -m "docs: sync stabilization spec with implemented test harness details"
```

---

## Self-Review

### 1) Spec Coverage Check
- Audit scoping fix: Task 3
- Cleanup taxonomy fix: Task 4
- Endpoint contract alignment: Task 5
- Test harness and failing test stabilization: Tasks 1, 2, 6, 7
- Verification criteria: Task 8

No spec gap found.

### 2) Placeholder Scan
- Verified: no `TODO`, `TBD`, `implement later`, or "similar to Task N" shortcuts.

### 3) Type/Signature Consistency Check
- Canonical route used consistently: `/api/v1/reports/shared-reports`
- Audit schema uses `resource_type/resource_id/action` consistently.
- Shared harness type name is consistent: `ConsentApiHarness`.

No naming mismatch found.
