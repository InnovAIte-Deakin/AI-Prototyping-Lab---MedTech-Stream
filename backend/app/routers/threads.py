from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ConversationThread, Notification, Report, ReportFinding, ThreadMessage
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.dependencies.reports import get_accessible_report
from app.services.questions import generate_questions
from app.services.threads import (
    ThreadMessageCreateInput,
    ThreadServiceError,
    add_thread_message,
    create_report_thread,
    get_thread_for_user,
    list_notifications_for_user,
    list_threads_for_report,
    user_role_label,
)

router = APIRouter(tags=["threads"])


def _raise_thread_http_error(exc: ThreadServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


class QuestionPromptsResponse(BaseModel):
    prompts: list[str]


@router.get("/reports/{report_id}/question-prompts", response_model=QuestionPromptsResponse)
async def get_question_prompts(
    report: Report = Depends(get_accessible_report),
) -> QuestionPromptsResponse:
    prompts, _ = await generate_questions(report.findings)
    return QuestionPromptsResponse(prompts=prompts)


class ThreadAnchorOut(BaseModel):
    finding_id: str
    display_name: str
    biomarker_key: str
    flag: str
    position: int


class ThreadMessageOut(BaseModel):
    id: str
    author_user_id: str
    author_name: str
    author_role: str
    kind: str
    body: str
    created_at: datetime


class ConversationThreadOut(BaseModel):
    id: str
    report_id: str | None
    subject_user_id: str
    title: str | None
    status: str
    created_at: datetime
    anchor: ThreadAnchorOut | None = None
    messages: list[ThreadMessageOut] = []


class CreateThreadRequest(BaseModel):
    title: str | None = None
    finding_id: str
    initial_message: str


class AddMessageRequest(BaseModel):
    body: str | None = None
    template_payload: dict[str, Any] | None = None


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    thread_id: str | None
    report_id: str | None
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime


def _anchor_out(finding: ReportFinding | None) -> ThreadAnchorOut | None:
    if finding is None:
        return None
    return ThreadAnchorOut(
        finding_id=finding.id,
        display_name=finding.display_name,
        biomarker_key=finding.biomarker_key,
        flag=finding.flag.value,
        position=finding.position,
    )


def _message_out(message: ThreadMessage) -> ThreadMessageOut:
    author = message.author_user
    assert author is not None
    return ThreadMessageOut(
        id=message.id,
        author_user_id=message.author_user_id,
        author_name=author.display_name,
        author_role=user_role_label(author),
        kind=message.kind.value,
        body=message.body,
        created_at=message.created_at,
    )


def _thread_out(thread: ConversationThread) -> ConversationThreadOut:
    messages = sorted(thread.messages, key=lambda item: item.created_at)
    return ConversationThreadOut(
        id=thread.id,
        report_id=thread.report_id,
        subject_user_id=thread.subject_user_id,
        title=thread.title,
        status=thread.status.value,
        created_at=thread.created_at,
        anchor=_anchor_out(thread.anchor_finding),
        messages=[_message_out(message) for message in messages],
    )


def _notification_out(notification: Notification) -> NotificationOut:
    return NotificationOut(
        id=notification.id,
        kind=notification.kind.value,
        title=notification.title,
        thread_id=notification.thread_id,
        report_id=notification.report_id,
        payload=notification.payload,
        read_at=notification.read_at,
        created_at=notification.created_at,
    )


@router.get("/reports/{report_id}/threads", response_model=list[ConversationThreadOut])
async def list_report_threads(
    report: Report = Depends(get_accessible_report),
    session: AsyncSession = Depends(get_db_session),
) -> list[ConversationThreadOut]:
    threads = await list_threads_for_report(session, report_id=report.id)
    return [_thread_out(thread) for thread in threads]


@router.post("/reports/{report_id}/threads", response_model=ConversationThreadOut, status_code=status.HTTP_201_CREATED)
async def create_thread(
    payload: CreateThreadRequest,
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ConversationThreadOut:
    try:
        thread = await create_report_thread(
            session,
            report=report,
            actor=auth.user,
            title=payload.title,
            initial_message=payload.initial_message,
            finding_id=payload.finding_id,
        )
    except ThreadServiceError as exc:
        _raise_thread_http_error(exc)

    return _thread_out(thread)


@router.get("/threads/{thread_id}", response_model=ConversationThreadOut)
async def get_thread(
    thread_id: str,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ConversationThreadOut:
    try:
        thread = await get_thread_for_user(session, thread_id=thread_id, user=auth.user)
    except ThreadServiceError as exc:
        _raise_thread_http_error(exc)
    return _thread_out(thread)


@router.post("/threads/{thread_id}/messages", response_model=ThreadMessageOut, status_code=status.HTTP_201_CREATED)
async def add_message(
    thread_id: str,
    payload: AddMessageRequest,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadMessageOut:
    try:
        message = await add_thread_message(
            session,
            thread_id=thread_id,
            message_input=ThreadMessageCreateInput(
                author=auth.user,
                body=payload.body,
                template_payload=payload.template_payload,
            ),
        )
    except ThreadServiceError as exc:
        _raise_thread_http_error(exc)

    return _message_out(message)


@router.get("/notifications", response_model=list[NotificationOut])
async def list_notifications(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> list[NotificationOut]:
    notifications = await list_notifications_for_user(session, user_id=auth.user.id)
    return [_notification_out(notification) for notification in notifications]
