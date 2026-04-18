from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ConsentScope,
    ConsentShare,
    ConversationThread,
    MessageKind,
    Notification,
    NotificationKind,
    Report,
    ReportFinding,
    ThreadMessage,
    ThreadParticipant,
    User,
    UserRole,
)
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.dependencies.reports import get_accessible_report
from app.services.questions import generate_questions

router = APIRouter(tags=["threads"])


class QuestionPromptsResponse(BaseModel):
    prompts: list[str]


@router.get("/reports/{report_id}/question-prompts", response_model=QuestionPromptsResponse)
async def get_question_prompts(
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
) -> QuestionPromptsResponse:
    prompts, _ = await generate_questions(report.findings)
    return QuestionPromptsResponse(prompts=prompts)


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
    finding_id: str | None
    finding_label: str | None = None
    subject_user_id: str
    title: str | None
    status: str
    created_at: datetime
    messages: list[ThreadMessageOut] = []


class CreateThreadRequest(BaseModel):
    title: str | None = None
    initial_message: str
    finding_id: str | None = None


def _primary_role(user: User | None) -> str:
    if user is None:
        return "unknown"
    role_names = [assignment.role.name for assignment in user.role_assignments if assignment.role]
    for preferred in ("clinician", "caregiver", "patient"):
        if preferred in role_names:
            return preferred
    return role_names[0] if role_names else "unknown"


def _finding_label(finding: ReportFinding | None) -> str | None:
    if finding is None:
        return None
    value = finding.value_numeric if finding.value_numeric is not None else finding.value_text
    unit = f" {finding.unit}" if finding.unit else ""
    return f"{finding.display_name} ({value}{unit})" if value is not None else finding.display_name


async def _has_share_access(
    session: AsyncSession,
    *,
    thread: ConversationThread,
    user_id: str,
) -> bool:
    if thread.report_id is None:
        return False
    now = datetime.now(UTC)
    share = await session.scalar(
        select(ConsentShare)
        .where(
            ConsentShare.subject_user_id == thread.subject_user_id,
            ConsentShare.grantee_user_id == user_id,
            ConsentShare.revoked_at.is_(None),
            ConsentShare.expires_at > now,
            or_(
                and_(
                    ConsentShare.scope == ConsentScope.PATIENT,
                    ConsentShare.report_id.is_(None),
                ),
                and_(
                    ConsentShare.scope == ConsentScope.REPORT,
                    ConsentShare.report_id == thread.report_id,
                ),
            ),
        )
        .limit(1)
    )
    return share is not None


async def _ensure_participant(
    session: AsyncSession,
    thread: ConversationThread,
    user: User,
) -> ThreadParticipant:
    existing = await session.scalar(
        select(ThreadParticipant).where(
            ThreadParticipant.thread_id == thread.id,
            ThreadParticipant.user_id == user.id,
        )
    )
    if existing:
        return existing
    participant = ThreadParticipant(thread_id=thread.id, user_id=user.id)
    session.add(participant)
    await session.flush()
    return participant


async def _notify_other_participants(
    session: AsyncSession,
    thread: ConversationThread,
    *,
    actor_id: str,
    message_body_preview: str,
) -> None:
    stmt = (
        select(ThreadParticipant)
        .where(ThreadParticipant.thread_id == thread.id)
        .where(ThreadParticipant.user_id != actor_id)
    )
    result = await session.scalars(stmt)
    recipients = list(result.all())

    # Ensure the thread subject is always notified on incoming messages
    # they do not author — even before they have been registered as a participant.
    if thread.subject_user_id != actor_id and not any(p.user_id == thread.subject_user_id for p in recipients):
        recipients.append(ThreadParticipant(thread_id=thread.id, user_id=thread.subject_user_id))

    for participant in recipients:
        session.add(
            Notification(
                user_id=participant.user_id,
                thread_id=thread.id,
                report_id=thread.report_id,
                kind=NotificationKind.THREAD_REPLY,
                title=thread.title or "New reply on your report",
                payload={
                    "thread_id": thread.id,
                    "report_id": thread.report_id,
                    "finding_id": thread.finding_id,
                    "preview": message_body_preview[:160],
                    "actor_user_id": actor_id,
                },
            )
        )


def _serialize_message(message: ThreadMessage) -> ThreadMessageOut:
    return ThreadMessageOut(
        id=message.id,
        author_user_id=message.author_user_id,
        author_name=message.author_user.display_name if message.author_user else "Unknown",
        author_role=_primary_role(message.author_user),
        kind=message.kind.value,
        body=message.body,
        created_at=message.created_at,
    )


def _serialize_thread(thread: ConversationThread) -> ConversationThreadOut:
    messages = sorted(thread.messages, key=lambda m: m.created_at)
    return ConversationThreadOut(
        id=thread.id,
        report_id=thread.report_id,
        finding_id=thread.finding_id,
        finding_label=_finding_label(thread.finding),
        subject_user_id=thread.subject_user_id,
        title=thread.title,
        status=thread.status.value,
        created_at=thread.created_at,
        messages=[_serialize_message(m) for m in messages],
    )


@router.get("/reports/{report_id}/threads", response_model=list[ConversationThreadOut])
async def list_report_threads(
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> list[ConversationThreadOut]:
    stmt = (
        select(ConversationThread)
        .where(ConversationThread.report_id == report.id)
        .order_by(ConversationThread.created_at.desc())
        .options(
            selectinload(ConversationThread.messages)
            .selectinload(ThreadMessage.author_user)
            .selectinload(User.role_assignments)
            .selectinload(UserRole.role),
            selectinload(ConversationThread.finding),
        )
    )
    result = await session.scalars(stmt)
    return [_serialize_thread(thread) for thread in result.all()]


@router.post(
    "/reports/{report_id}/threads",
    response_model=ConversationThreadOut,
    status_code=status.HTTP_201_CREATED,
)
async def create_thread(
    payload: CreateThreadRequest,
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ConversationThreadOut:
    finding: ReportFinding | None = None
    if payload.finding_id:
        finding = await session.scalar(
            select(ReportFinding).where(
                ReportFinding.id == payload.finding_id,
                ReportFinding.report_id == report.id,
            )
        )
        if finding is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Finding does not belong to this report.",
            )

    thread = ConversationThread(
        subject_user_id=report.subject_user_id,
        created_by_user_id=auth.user.id,
        report_id=report.id,
        finding_id=finding.id if finding else None,
        title=payload.title or "Questions for Clinician",
    )
    session.add(thread)
    await session.flush()

    session.add(ThreadParticipant(thread_id=thread.id, user_id=auth.user.id))
    if thread.subject_user_id != auth.user.id:
        session.add(ThreadParticipant(thread_id=thread.id, user_id=thread.subject_user_id))
    await session.flush()

    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=auth.user.id,
        kind=MessageKind.TEXT,
        body=payload.initial_message,
    )
    session.add(message)
    await session.flush()

    await _notify_other_participants(
        session,
        thread,
        actor_id=auth.user.id,
        message_body_preview=payload.initial_message,
    )

    await session.commit()

    # Reload with all relationships needed for serialization.
    stmt = (
        select(ConversationThread)
        .where(ConversationThread.id == thread.id)
        .options(
            selectinload(ConversationThread.messages)
            .selectinload(ThreadMessage.author_user)
            .selectinload(User.role_assignments)
            .selectinload(UserRole.role),
            selectinload(ConversationThread.finding),
        )
    )
    loaded = await session.scalar(stmt)
    assert loaded is not None
    return _serialize_thread(loaded)


class AddMessageRequest(BaseModel):
    body: str | None = None
    template_payload: dict[str, Any] | None = None


@router.post(
    "/threads/{thread_id}/messages",
    response_model=ThreadMessageOut,
    status_code=status.HTTP_201_CREATED,
)
async def add_message(
    thread_id: str,
    payload: AddMessageRequest,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ThreadMessageOut:
    thread = await session.scalar(
        select(ConversationThread)
        .where(ConversationThread.id == thread_id)
        .options(selectinload(ConversationThread.participants))
    )
    if not thread:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Thread not found")

    is_participant = any(p.user_id == auth.user.id for p in thread.participants)
    is_subject = thread.subject_user_id == auth.user.id
    if not is_participant and not is_subject:
        if not await _has_share_access(session, thread=thread, user_id=auth.user.id):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have access to this thread.",
            )

    if payload.template_payload:
        kind = MessageKind.TEMPLATE
        body = json.dumps(payload.template_payload)
    elif payload.body:
        kind = MessageKind.TEXT
        body = payload.body
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Must provide body or template_payload",
        )

    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=auth.user.id,
        kind=kind,
        body=body,
    )
    session.add(message)

    await _ensure_participant(session, thread, auth.user)
    await _notify_other_participants(
        session,
        thread,
        actor_id=auth.user.id,
        message_body_preview=body,
    )

    await session.commit()

    # Reload with the author's roles so response includes author_role correctly.
    loaded_msg = await session.scalar(
        select(ThreadMessage)
        .where(ThreadMessage.id == message.id)
        .options(selectinload(ThreadMessage.author_user).selectinload(User.role_assignments))
    )
    assert loaded_msg is not None
    return _serialize_message(loaded_msg)
