"""Core thread endpoints — create, post messages, list, question prompts."""

from __future__ import annotations

from tests.support.consent_api import (
    ConsentApiHarness,
    auth_headers,
    consent_api,
    login,
    seed_report,
    seed_user,
)


def test_create_and_list_threads(consent_api: ConsentApiHarness) -> None:
    patient_email = "threads-core-patient@example.com"
    with consent_api.session_factory() as session:
        patient = seed_user(session, email=patient_email, role="patient")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    token = login(consent_api, email=patient_email)
    headers = auth_headers(token)

    create_resp = consent_api.client.post(
        f"/api/v1/reports/{report.id}/threads",
        headers=headers,
        json={"initial_message": "What does my glucose mean?", "title": "Glucose question"},
    )
    assert create_resp.status_code == 201, create_resp.text
    thread_id = create_resp.json()["id"]
    assert create_resp.json()["title"] == "Glucose question"
    assert len(create_resp.json()["messages"]) == 1

    template_resp = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        headers=headers,
        json={
            "template_payload": {
                "meaning": "Your glucose is slightly high but ok.",
                "urgency": "routine",
                "action": "Monitor diet.",
            }
        },
    )
    assert template_resp.status_code == 201, template_resp.text
    assert template_resp.json()["kind"] == "template"

    text_resp = consent_api.client.post(
        f"/api/v1/threads/{thread_id}/messages",
        headers=headers,
        json={"body": "Thank you doctor!"},
    )
    assert text_resp.status_code == 201, text_resp.text
    assert text_resp.json()["kind"] == "text"
    assert text_resp.json()["body"] == "Thank you doctor!"

    listing = consent_api.client.get(
        f"/api/v1/reports/{report.id}/threads",
        headers=headers,
    )
    assert listing.status_code == 200, listing.text
    threads = listing.json()
    assert len(threads) == 1
    assert len(threads[0]["messages"]) == 3


def test_get_question_prompts(consent_api: ConsentApiHarness) -> None:
    patient_email = "prompts-patient@example.com"
    with consent_api.session_factory() as session:
        patient = seed_user(session, email=patient_email, role="patient")
        report = seed_report(
            session,
            subject_email=patient.email,
            created_by_email=patient.email,
        )

    token = login(consent_api, email=patient_email)
    resp = consent_api.client.get(
        f"/api/v1/reports/{report.id}/question-prompts",
        headers=auth_headers(token),
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert "prompts" in body
    assert isinstance(body["prompts"], list)
    assert len(body["prompts"]) >= 2
