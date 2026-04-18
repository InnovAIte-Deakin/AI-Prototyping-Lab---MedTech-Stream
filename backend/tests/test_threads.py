from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import select

from app.db.models import Notification, Report, ReportFinding, User
from tests.factories import PersistenceFactory
from tests.support.consent_api import (
    ConsentApiHarness,
    auth_headers,
    consent_api,
    login,
    seed_user,
)


def _seed_report_with_finding(
    consent_api: ConsentApiHarness,
    *,
    patient_email: str,
    biomarker_key: str = "glucose",
    display_name: str = "Glucose",
    value_numeric: float = 112.0,
    unit: str = "mg/dL",
    flag: str = "high",
) -> tuple[Report, ReportFinding]:
    with consent_api.session_factory() as session:
        factory = PersistenceFactory(session)
        patient = session.scalar(select(User).where(User.email == patient_email))
        assert patient is not None

        report = factory.create_report(subject=patient, created_by=patient)
        finding = factory.create_finding(
            report=report,
            patient=patient,
            biomarker_key=biomarker_key,
            display_name=display_name,
            value_numeric=value_numeric,
            unit=unit,
            flag=flag,
            reference_low=70.0,
            reference_high=99.0,
        )
        session.commit()
        return report, finding


def _share_report(
    consent_api: ConsentApiHarness,
    *,
    report_id: str,
    patient_token: str,
    clinician_email: str,
    access_level: str = "comment",
) -> None:
    response = consent_api.client.post(
        f"/api/v1/reports/{report_id}/share",
        json={
            "clinician_email": clinician_email,
            "scope": "report",
            "access_level": access_level,
            "expires_at": (datetime.now(UTC) + timedelta(days=7)).isoformat(),
        },
        headers=auth_headers(patient_token),
    )
    assert response.status_code == 201, response.text


def _notifications_for_user(consent_api: ConsentApiHarness, *, email: str) -> list[Notification]:
    with consent_api.session_factory() as session:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        return list(
            session.scalars(
                select(Notification)
                .where(Notification.user_id == user.id)
                .order_by(Notification.created_at.asc())
            ).all()
        )


def test_patient_can_create_anchored_thread_and_notify_shared_clinician(
    consent_api: ConsentApiHarness,
) -> None:
    patient_email = "patient-threads@example.com"
    clinician_email = "clinician-threads@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")

    report, finding = _seed_report_with_finding(consent_api, patient_email=patient_email)
    patient_token = login(consent_api, email=patient_email)
    _share_report(
        consent_api,
        report_id=report.id,
        patient_token=patient_token,
        clinician_email=clinician_email,
    )

    response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        json={
            "title": "Glucose follow-up",
            "finding_id": finding.id,
            "initial_message": "Can you explain why this is high?",
        },
        headers=auth_headers(patient_token),
    )

    assert response.status_code == 201, response.text
    payload = response.json()
    assert payload["report_id"] == report.id
    assert payload["anchor"]["finding_id"] == finding.id
    assert payload["anchor"]["display_name"] == "Glucose"
    assert payload["anchor"]["flag"] == "high"
    assert payload["messages"][0]["author_role"] == "patient"
    assert payload["messages"][0]["body"] == "Can you explain why this is high?"

    notifications = _notifications_for_user(consent_api, email=clinician_email)
    assert len(notifications) == 1
    assert notifications[0].thread_id == payload["id"]
    assert notifications[0].report_id == report.id
    assert notifications[0].payload["sender_role"] == "patient"


def test_only_patient_can_open_report_thread(consent_api: ConsentApiHarness) -> None:
    patient_email = "patient-owner@example.com"
    clinician_email = "clinician-owner@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")

    report, finding = _seed_report_with_finding(consent_api, patient_email=patient_email)
    patient_token = login(consent_api, email=patient_email)
    _share_report(
        consent_api,
        report_id=report.id,
        patient_token=patient_token,
        clinician_email=clinician_email,
    )
    clinician_token = login(consent_api, email=clinician_email)

    response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        json={
            "title": "Clinician should not open this",
            "finding_id": finding.id,
            "initial_message": "Starting a thread as the clinician",
        },
        headers=auth_headers(clinician_token),
    )

    assert response.status_code == 403
    assert response.json()["detail"] == "Only the patient may open a report thread"


def test_unauthorized_clinician_cannot_view_or_post_thread(consent_api: ConsentApiHarness) -> None:
    patient_email = "patient-private-thread@example.com"
    authorized_clinician_email = "clinician-linked@example.com"
    unauthorized_clinician_email = "clinician-unlinked@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=authorized_clinician_email, role="clinician")
        seed_user(session, email=unauthorized_clinician_email, role="clinician")

    report, finding = _seed_report_with_finding(consent_api, patient_email=patient_email)
    patient_token = login(consent_api, email=patient_email)
    _share_report(
        consent_api,
        report_id=report.id,
        patient_token=patient_token,
        clinician_email=authorized_clinician_email,
    )

    create_response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        json={
            "title": "Hematology question",
            "finding_id": finding.id,
            "initial_message": "Is this urgent?",
        },
        headers=auth_headers(patient_token),
    )
    assert create_response.status_code == 201, create_response.text
    thread_id = create_response.json()["id"]

    unauthorized_token = login(consent_api, email=unauthorized_clinician_email)

    view_response = consent_api.client.get(
        f"/api/v1/threads/{thread_id}",
        headers=auth_headers(unauthorized_token),
    )
    assert view_response.status_code == 403
    assert view_response.json()["detail"] == "Forbidden"

    post_response = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        json={"body": "I should not be able to post here."},
        headers=auth_headers(unauthorized_token),
    )
    assert post_response.status_code == 403
    assert post_response.json()["detail"] == "Forbidden"


def test_thread_history_is_chronological_with_role_labels_and_notifications(
    consent_api: ConsentApiHarness,
) -> None:
    patient_email = "patient-history@example.com"
    clinician_email = "clinician-history@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")
        seed_user(session, email=clinician_email, role="clinician")

    report, finding = _seed_report_with_finding(consent_api, patient_email=patient_email)
    patient_token = login(consent_api, email=patient_email)
    _share_report(
        consent_api,
        report_id=report.id,
        patient_token=patient_token,
        clinician_email=clinician_email,
    )
    clinician_token = login(consent_api, email=clinician_email)

    create_response = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        json={
            "title": "Discuss glucose trend",
            "finding_id": finding.id,
            "initial_message": "What should I ask at my appointment?",
        },
        headers=auth_headers(patient_token),
    )
    assert create_response.status_code == 201, create_response.text
    thread_id = create_response.json()["id"]

    clinician_reply = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        json={"body": "Ask whether fasting status affected the result."},
        headers=auth_headers(clinician_token),
    )
    assert clinician_reply.status_code == 201, clinician_reply.text
    assert clinician_reply.json()["author_role"] == "clinician"

    patient_reply = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        json={"body": "Thanks, I will ask that."},
        headers=auth_headers(patient_token),
    )
    assert patient_reply.status_code == 201, patient_reply.text
    assert patient_reply.json()["author_role"] == "patient"

    thread_response = consent_api.client.get(
        f"/api/v1/threads/{thread_id}",
        headers=auth_headers(clinician_token),
    )
    assert thread_response.status_code == 200, thread_response.text
    thread_payload = thread_response.json()
    assert [message["body"] for message in thread_payload["messages"]] == [
        "What should I ask at my appointment?",
        "Ask whether fasting status affected the result.",
        "Thanks, I will ask that.",
    ]
    assert [message["author_role"] for message in thread_payload["messages"]] == [
        "patient",
        "clinician",
        "patient",
    ]

    patient_notifications = _notifications_for_user(consent_api, email=patient_email)
    clinician_notifications = _notifications_for_user(consent_api, email=clinician_email)
    assert len(patient_notifications) == 1
    assert len(clinician_notifications) == 2
    assert patient_notifications[0].payload["sender_role"] == "clinician"
    assert clinician_notifications[0].payload["sender_role"] == "patient"
    assert clinician_notifications[1].payload["sender_role"] == "patient"

    notifications_response = consent_api.client.get(
        "/api/v1/notifications",
        headers=auth_headers(clinician_token),
    )
    assert notifications_response.status_code == 200, notifications_response.text
    notifications_payload = notifications_response.json()
    assert [item["payload"]["sender_role"] for item in notifications_payload] == [
        "patient",
        "patient",
    ]


def test_get_question_prompts(consent_api: ConsentApiHarness) -> None:
    patient_email = "patient-prompts@example.com"

    with consent_api.session_factory() as session:
        seed_user(session, email=patient_email, role="patient")

    report, _finding = _seed_report_with_finding(consent_api, patient_email=patient_email)
    patient_token = login(consent_api, email=patient_email)

    response = consent_api.client.get(
        f"/api/v1/reports/{report.id}/question-prompts",
        headers=auth_headers(patient_token),
    )

    assert response.status_code == 200
    data = response.json()
    assert "prompts" in data
    assert isinstance(data["prompts"], list)
    assert len(data["prompts"]) >= 2
