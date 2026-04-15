"""Integration tests for clinician-role validation on report sharing."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tests.support.consent_api import (
    ConsentApiHarness,
    auth_headers,
    consent_api,
    login,
    seed_report,
    seed_user,
)


def _future_expiry_iso(*, days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_share_with_non_clinician_role_is_rejected(consent_api: ConsentApiHarness) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient@example.com", role="patient")
        seed_user(session, email="other_patient@example.com", role="patient")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    patient_token = login(consent_api, email=patient.email)
    share_response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": "other_patient@example.com",
            "scope": "report",
            "access_level": "read",
            "expires_at": _future_expiry_iso(),
        },
    )

    assert share_response.status_code == 400
    assert "clinician" in share_response.text.lower()


def test_share_with_clinician_role_succeeds(consent_api: ConsentApiHarness) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-share-ok@example.com", role="patient")
        clinician = seed_user(session, email="clinician-share-ok@example.com", role="clinician")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    patient_token = login(consent_api, email=patient.email)
    share_response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician.email,
            "scope": "report",
            "access_level": "read",
            "expires_at": _future_expiry_iso(),
        },
    )

    assert share_response.status_code == 201, share_response.text
    payload = share_response.json()
    assert payload["clinician_email"] == clinician.email
    assert payload["scope"] == "report"
    assert payload["access_level"] == "read"
