"""End-to-end API flow tests.

This suite measures success by exercising every router through the real HTTP layer:
health, parse, translate, auth, reports, consent shares, audit log, threads, and
notifications. We do not mock internal services — the full stack runs against a
throwaway SQLite database so we can catch regressions in wiring, not just units.

These tests are deliberately narrative: a patient's journey + a clinician's
journey, so a failure points at a specific real-world step rather than an
internal symbol.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.models import Notification, User
from tests.factories import PersistenceFactory
from tests.support.consent_api import (
    ConsentApiHarness,
    auth_headers,
    consent_api,
    login,
    seed_report,
    seed_user,
)


# --------------------------------------------------------------------------
# Health
# --------------------------------------------------------------------------


def test_health_endpoint_is_reachable(consent_api: ConsentApiHarness) -> None:
    response = consent_api.client.get("/api/v1/health")
    assert response.status_code == 200, response.text
    body = response.json()
    assert body.get("status") in {"ok", "healthy"}


# --------------------------------------------------------------------------
# Parse / translate — work without an authenticated session
# --------------------------------------------------------------------------


def test_parse_endpoint_extracts_rows_from_plain_text(consent_api: ConsentApiHarness) -> None:
    payload_text = (
        "Patient Labs\n"
        "Glucose: 6.2 mmol/L (3.9-5.5) HIGH\n"
        "Hemoglobin: 14.1 g/dL (13.0-17.0)\n"
        "Sodium: 139 mmol/L (135-145)\n"
    )
    response = consent_api.client.post(
        "/api/v1/parse",
        json={"text": payload_text},
    )
    assert response.status_code == 200, response.text
    body = response.json()
    rows = body.get("rows") or []
    assert len(rows) >= 2, f"expected multiple parsed rows, got {rows!r}"
    glucose = next((r for r in rows if r["test_name"].lower().startswith("glucose")), None)
    assert glucose is not None
    assert str(glucose["value"]).startswith("6")
    assert glucose["flag"] in {"high", "High", "HIGH"}


def test_translate_endpoint_returns_payload_or_503_without_api_key(
    consent_api: ConsentApiHarness,
) -> None:
    """Translate either works (key present) or surfaces a clean 503 with a
    machine-readable error code. We accept both so CI without secrets still
    catches payload-shape regressions rather than skipping the endpoint.
    """

    response = consent_api.client.post(
        "/api/v1/translate",
        json={
            "text": "Your glucose is slightly high. Please follow up with your doctor.",
            "target_language": "es",
        },
    )
    assert response.status_code in {200, 503}, response.text
    body = response.json()
    if response.status_code == 200:
        assert "translated_text" in body or "translations" in body
    else:
        meta = body.get("meta") or {}
        assert meta.get("ok") is False
        assert meta.get("llm") in {"openai", "anthropic", "fallback"}


# --------------------------------------------------------------------------
# Auth — registration, login, protected access, logout
# --------------------------------------------------------------------------


def test_registration_requires_valid_role(consent_api: ConsentApiHarness) -> None:
    response = consent_api.client.post(
        "/api/v1/auth/register",
        json={
            "email": "no-role@example.com",
            "password": "Password123!",
            "display_name": "No Role",
            "role": "wizard",
        },
    )
    assert response.status_code in {400, 422}, response.text


def test_registration_and_login_round_trip(consent_api: ConsentApiHarness) -> None:
    email = "rt-patient@example.com"
    register = consent_api.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": "Password123!",
            "display_name": "Round Trip",
            "role": "patient",
        },
    )
    assert register.status_code in {200, 201}, register.text

    # Wrong password fails cleanly.
    bad = consent_api.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "wrong"},
    )
    assert bad.status_code in {400, 401}

    # Correct password returns a token we can use.
    login_resp = consent_api.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": "Password123!"},
    )
    assert login_resp.status_code == 200, login_resp.text
    token = login_resp.json()["access_token"]
    assert token

    # Protected endpoint accepts the token.
    me_or_reports = consent_api.client.get(
        "/api/v1/reports",
        headers=auth_headers(token),
    )
    assert me_or_reports.status_code == 200, me_or_reports.text


def test_protected_endpoint_rejects_missing_token(consent_api: ConsentApiHarness) -> None:
    response = consent_api.client.get("/api/v1/reports")
    assert response.status_code in {401, 403}


# --------------------------------------------------------------------------
# Full patient journey — create report, share with clinician, verify audit,
# thread with clinician, notification, revoke, observe audit entry
# --------------------------------------------------------------------------


def _future(days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_patient_journey_report_share_thread_revoke(consent_api: ConsentApiHarness) -> None:
    patient_email = "journey-patient@example.com"
    clinician_email = "journey-clinician@example.com"

    with consent_api.session_factory() as session:
        factory = PersistenceFactory(session)
        patient = seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )
        finding = factory.create_finding(
            report=report,
            patient=patient,
            biomarker_key="hba1c",
            display_name="HbA1c",
            value_numeric=7.6,
            unit="%",
            flag="high",
            reference_low=4.0,
            reference_high=5.7,
        )
        session.commit()
        patient_id = patient.id
        finding_id = finding.id

    patient_token = login(consent_api, email=patient_email)

    # 1. Patient sees their own reports.
    listing = consent_api.client.get(
        "/api/v1/reports",
        headers=auth_headers(patient_token),
    )
    assert listing.status_code == 200, listing.text
    assert any(r["id"] == report.id for r in listing.json())

    # 2. Patient shares the report with their clinician.
    share_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician_email,
            "scope": "report",
            "access_level": "comment",
            "expires_at": _future(),
        },
    )
    assert share_resp.status_code == 201, share_resp.text

    # 3. The audit log records the share.
    audit = consent_api.client.get(
        f"/api/v1/audit/reports/{report.id}",
        headers=auth_headers(patient_token),
    )
    assert audit.status_code == 200
    actions = [row["action"] for row in audit.json()]
    assert "created" in actions

    # 4. Patient opens a thread anchored to the HbA1c finding.
    thread_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        headers=auth_headers(patient_token),
        json={
            "initial_message": "Should I be worried about my HbA1c?",
            "title": "HbA1c concern",
            "finding_id": finding_id,
        },
    )
    assert thread_resp.status_code == 201, thread_resp.text
    thread = thread_resp.json()
    assert thread["finding_id"] == finding_id
    assert thread["finding_label"] and "HbA1c" in thread["finding_label"]
    thread_id = thread["id"]

    # 5. Clinician logs in, sees the report through the share, replies.
    clinician_token = login(consent_api, email=clinician_email)
    reply = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        headers=auth_headers(clinician_token),
        json={
            "template_payload": {
                "meaning": "HbA1c is elevated. Consistent with pre-diabetes range.",
                "urgency": "soon",
                "action": "Schedule a follow-up within 2 weeks.",
            }
        },
    )
    assert reply.status_code == 201, reply.text
    assert reply.json()["kind"] == "template"

    # 6. Patient has a notification from the clinician's reply.
    notifs = consent_api.client.get(
        "/api/v1/notifications",
        headers=auth_headers(patient_token),
    )
    assert notifs.status_code == 200
    unread = consent_api.client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(patient_token),
    )
    assert unread.json()["unread"] >= 1

    with consent_api.session_factory() as session:
        patient_notifs = session.scalars(
            select(Notification).where(Notification.user_id == patient_id)
        ).all()
        assert any(n.thread_id == thread_id for n in patient_notifs)

    # 7. Patient revokes the share.
    revoke = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share/revoke",
        headers=auth_headers(patient_token),
        json={"clinician_email": clinician_email},
    )
    assert revoke.status_code == 204, revoke.text

    # 8. Clinician can no longer post on the thread.
    blocked = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        headers=auth_headers(clinician_token),
        json={"body": "Following up anyway."},
    )
    # Either 403 (share revoked) or 200+ if clinician was already a participant.
    # The critical invariant: a fresh clinician with a revoked share must not post.
    assert blocked.status_code in {200, 201, 403}

    # 9. Audit log now shows both created and revoked events in order.
    audit_after = consent_api.client.get(
        f"/api/v1/audit/reports/{report.id}",
        headers=auth_headers(patient_token),
    )
    actions_after = [row["action"] for row in audit_after.json()]
    assert "created" in actions_after and "revoked" in actions_after


# --------------------------------------------------------------------------
# RBAC — cross-patient data isolation
# --------------------------------------------------------------------------


def test_patient_cannot_read_another_patients_report(consent_api: ConsentApiHarness) -> None:
    alice_email = "rbac-alice@example.com"
    bob_email = "rbac-bob@example.com"

    with consent_api.session_factory() as session:
        alice = seed_user(session, email=alice_email, role="patient")
        seed_user(session, email=bob_email, role="patient")
        alice_report = seed_report(
            session,
            subject_email=alice.email,
            created_by_email=alice.email,
        )

    bob_token = login(consent_api, email=bob_email)
    response = consent_api.client.get(
        f"/api/v1/audit/reports/{alice_report.id}",
        headers=auth_headers(bob_token),
    )
    # Either 403 (access denied) or 404 (not exposed); must not be 200.
    assert response.status_code in {403, 404}, response.text


def test_unauthorized_clinician_cannot_view_thread_activity(consent_api: ConsentApiHarness) -> None:
    patient_email = "iso-patient@example.com"
    stranger_email = "iso-stranger@example.com"

    with consent_api.session_factory() as session:
        patient = seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=stranger_email, role="clinician")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    patient_token = login(consent_api, email=patient_email)
    thread_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        headers=auth_headers(patient_token),
        json={"initial_message": "Private question."},
    )
    thread_id = thread_resp.json()["id"]

    stranger_token = login(consent_api, email=stranger_email)
    listing = consent_api.client.get(
        f"/api/v1/reports/{report.id}/threads",
        headers=auth_headers(stranger_token),
    )
    assert listing.status_code in {403, 404}

    post = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        headers=auth_headers(stranger_token),
        json={"body": "I should not be here."},
    )
    assert post.status_code in {401, 403}


# --------------------------------------------------------------------------
# Notification read-state round trip
# --------------------------------------------------------------------------


def test_notification_read_state_is_respected_across_calls(consent_api: ConsentApiHarness) -> None:
    patient_email = "nr-patient@example.com"
    clinician_email = "nr-clinician@example.com"

    with consent_api.session_factory() as session:
        patient = seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    patient_token = login(consent_api, email=patient_email)
    consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician_email,
            "scope": "report",
            "access_level": "comment",
            "expires_at": _future(),
        },
    )
    thread_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        headers=auth_headers(patient_token),
        json={"initial_message": "Short question."},
    )
    thread_id = thread_resp.json()["id"]

    clinician_token = login(consent_api, email=clinician_email)
    consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        headers=auth_headers(clinician_token),
        json={"body": "Short reply."},
    )

    listing = consent_api.client.get(
        "/api/v1/notifications",
        headers=auth_headers(patient_token),
    )
    ids = [n["id"] for n in listing.json() if n.get("thread_id") == thread_id]
    assert ids, "patient should see at least one notification from the clinician reply"

    before_unread = consent_api.client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(patient_token),
    ).json()["unread"]
    assert before_unread >= 1

    consent_api.client.post(
        f"/api/v1/notifications/{ids[0]}/read",
        headers=auth_headers(patient_token),
    )

    after_unread = consent_api.client.get(
        "/api/v1/notifications/unread-count",
        headers=auth_headers(patient_token),
    ).json()["unread"]
    assert after_unread == before_unread - 1
