from __future__ import annotations

from datetime import UTC, datetime, timedelta

from tests.support.consent_api import auth_headers, consent_api, login, seed_report, seed_user


def _future_expiry_iso(days: int = 7) -> str:
    return (datetime.now(UTC) + timedelta(days=days)).isoformat()


def test_notifications_list_returns_envelope_and_total_unread(consent_api) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-notif@example.com", role="patient")
        clinician = seed_user(session, email="clinician-notif@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email=patient.email)
    share_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician.email,
            "scope": "report",
            "access_level": "comment",
            "expires_at": _future_expiry_iso(),
        },
    )
    assert share_resp.status_code == 201, share_resp.text

    response = consent_api.client.get(
        "/api/v1/notifications",
        headers=auth_headers(patient_token),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert "items" in payload
    assert "total_unread" in payload
    assert payload["total_unread"] >= 1
    assert all(item["recipient_user_id"] == patient.id for item in payload["items"])


def test_notifications_patch_read_all_marks_user_rows_read(consent_api) -> None:
    with consent_api.session_factory() as session:
        patient = seed_user(session, email="patient-readall@example.com", role="patient")
        clinician = seed_user(session, email="clinician-readall@example.com", role="clinician")
        report = seed_report(session, subject_email=patient.email, created_by_email=patient.email)

    patient_token = login(consent_api, email=patient.email)
    consent_api.client.post(
        f"/api/v1/reports/{report.id}/share",
        headers=auth_headers(patient_token),
        json={
            "clinician_email": clinician.email,
            "scope": "report",
            "access_level": "comment",
            "expires_at": _future_expiry_iso(),
        },
    )

    response = consent_api.client.patch(
        "/api/v1/notifications/read-all",
        headers=auth_headers(patient_token),
    )
    assert response.status_code in (200, 204), response.text

    unread = consent_api.client.get(
        "/api/v1/notifications?unread_only=true",
        headers=auth_headers(patient_token),
    )
    assert unread.status_code == 200, unread.text
    assert unread.json()["items"] == []
