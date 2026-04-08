import pytest
import httpx
from datetime import datetime, UTC
from sqlalchemy.ext.asyncio import AsyncSession
from app.db.models import Report, ReportSourceKind, ReportSharingMode, User, ConversationThread, ThreadMessage, ThreadStatus, MessageKind

@pytest.fixture
async def sample_report(db_session: AsyncSession, mock_user: User) -> Report:
    report = Report(
        subject_user_id=mock_user.id,
        created_by_user_id=mock_user.id,
        title="Test Labs",
        source_kind=ReportSourceKind.MANUAL,
        sharing_mode=ReportSharingMode.PRIVATE,
        observed_at=datetime.now(UTC),
    )
    db_session.add(report)
    await db_session.commit()
    await db_session.refresh(report)
    return report

@pytest.mark.asyncio
async def test_create_and_list_threads(
    async_client: httpx.AsyncClient, 
    sample_report: Report,
    auth_headers: dict[str, str]
):
    # 1. Create a thread
    resp = await async_client.post(
        f"/api/v1/reports/{sample_report.id}/threads",
        json={"initial_message": "What does my glucose mean?", "title": "Glucose question"},
        headers=auth_headers
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["title"] == "Glucose question"
    assert len(data["messages"]) == 1
    thread_id = data["id"]
    
    # 2. Add clinician template message
    resp = await async_client.post(
        f"/api/v1/threads/{thread_id}/messages",
        json={
            "template_payload": {
                "meaning": "Your glucose is slightly high but ok.",
                "urgency": "routine",
                "action": "Monitor diet."
            }
        },
        headers=auth_headers
    )
    assert resp.status_code == 201
    msg_data = resp.json()
    assert msg_data["kind"] == "template"
    
    # 3. Add text response
    resp = await async_client.post(
        f"/api/v1/threads/{thread_id}/messages",
        json={"body": "Thank you doctor!"},
        headers=auth_headers
    )
    assert resp.status_code == 201
    msg_data = resp.json()
    assert msg_data["kind"] == "text"
    assert msg_data["body"] == "Thank you doctor!"
    
    # 4. List threads
    resp = await async_client.get(
        f"/api/v1/reports/{sample_report.id}/threads",
        headers=auth_headers
    )
    assert resp.status_code == 200
    threads = resp.json()
    assert len(threads) == 1
    assert len(threads[0]["messages"]) == 3

@pytest.mark.asyncio
async def test_get_question_prompts(
    async_client: httpx.AsyncClient, 
    sample_report: Report,
    auth_headers: dict[str, str]
):
    resp = await async_client.get(
        f"/api/v1/reports/{sample_report.id}/question-prompts",
        headers=auth_headers
    )
    assert resp.status_code == 200
    data = resp.json()
    assert "prompts" in data
    assert isinstance(data["prompts"], list)
    assert len(data["prompts"]) >= 2
