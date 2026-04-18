from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

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
    ThreadStatus,
    User,
    UserRole,
)
from app.services.auth import role_names_for_user

ROLE_LOAD = selectinload(User.role_assignments).selectinload(UserRole.role)
THREAD_LOAD = (
    selectinload(ConversationThread.messages)
    .selectinload(ThreadMessage.author_user)
    .selectinload(User.role_assignments)
    .selectinload(UserRole.role)
)


class ThreadServiceError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class ThreadMessageCreateInput:
    author: User
    body: str | None = None
    template_payload: dict[str, Any] | None = None


def user_role_label(user: User) -> str:
    role_names = set(role_names_for_user(user))
    if "patient" in role_names:
        return "patient"
    if "clinician" in role_names:
        return "clinician"
    if "caregiver" in role_names:
        return "caregiver"
    return "user"


async def _load_finding_for_report(
    session: AsyncSession,
    *,
    report_id: str,
    finding_id: str,
) -> ReportFinding:
    finding = await session.scalar(
        select(ReportFinding).where(
            ReportFinding.id == finding_id,
            ReportFinding.report_id == report_id,
        )
    )
    if finding is None:
        raise ThreadServiceError("Finding not found for report", 404)
    return finding


async def _load_thread(session: AsyncSession, *, thread_id: str) -> ConversationThread:
    thread = await session.scalar(
        select(ConversationThread)
        .where(ConversationThread.id == thread_id)
        .options(
            selectinload(ConversationThread.anchor_finding),
            selectinload(ConversationThread.report),
            THREAD_LOAD,
        )
    )
    if thread is None:
        raise ThreadServiceError("Thread not found", 404)
    return thread


async def _has_active_report_share(
    session: AsyncSession,
    *,
    report: Report,
    user_id: str,
) -> bool:
    now = datetime.now(UTC)
    share = await session.scalar(
        select(ConsentShare.id).where(
            ConsentShare.subject_user_id == report.subject_user_id,
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
                    ConsentShare.report_id == report.id,
                ),
            ),
        )
    )
    return share is not None


async def _ensure_thread_access(
    session: AsyncSession,
    *,
    thread: ConversationThread,
    user: User,
) -> None:
    if thread.subject_user_id == user.id:
        return
    if thread.report is None:
        raise ThreadServiceError("Forbidden", 403)
    if await _has_active_report_share(session, report=thread.report, user_id=user.id):
        return
    raise ThreadServiceError("Forbidden", 403)


async def _list_active_clinician_recipients(
    session: AsyncSession,
    *,
    report: Report,
) -> list[User]:
    now = datetime.now(UTC)
    recipients = (
        await session.scalars(
            select(User)
            .join(ConsentShare, ConsentShare.grantee_user_id == User.id)
            .options(ROLE_LOAD)
            .where(
                ConsentShare.subject_user_id == report.subject_user_id,
                ConsentShare.revoked_at.is_(None),
                ConsentShare.expires_at > now,
                or_(
                    and_(
                        ConsentShare.scope == ConsentScope.PATIENT,
                        ConsentShare.report_id.is_(None),
                    ),
                    and_(
                        ConsentShare.scope == ConsentScope.REPORT,
                        ConsentShare.report_id == report.id,
                    ),
                ),
            )
        )
    ).all()

    unique_recipients: dict[str, User] = {}
    for recipient in recipients:
        if "clinician" in role_names_for_user(recipient):
            unique_recipients[recipient.id] = recipient
    return list(unique_recipients.values())


async def _ensure_participant(
    session: AsyncSession,
    *,
    thread_id: str,
    user_id: str,
) -> None:
    participant = await session.scalar(
        select(ThreadParticipant).where(
            ThreadParticipant.thread_id == thread_id,
            ThreadParticipant.user_id == user_id,
        )
    )
    if participant is None:
        session.add(ThreadParticipant(thread_id=thread_id, user_id=user_id))


async def _create_notification(
    session: AsyncSession,
    *,
    recipient: User,
    thread: ConversationThread,
    message: ThreadMessage,
    sender: User,
) -> None:
    session.add(
        Notification(
            user_id=recipient.id,
            thread_id=thread.id,
            report_id=thread.report_id,
            kind=NotificationKind.THREAD_REPLY,
            title=f"New message in {thread.title or 'report thread'}",
            payload={
                "thread_id": thread.id,
                "report_id": thread.report_id,
                "message_id": message.id,
                "sender_user_id": sender.id,
                "sender_role": user_role_label(sender),
            },
        )
    )


async def _notification_recipients_for_message(
    session: AsyncSession,
    *,
    thread: ConversationThread,
    sender: User,
) -> list[User]:
    if thread.report is None:
        return []
    if sender.id == thread.subject_user_id:
        return await _list_active_clinician_recipients(session, report=thread.report)
    patient = await session.scalar(
        select(User).where(User.id == thread.subject_user_id).options(ROLE_LOAD)
    )
    return [] if patient is None else [patient]


async def create_report_thread(
    session: AsyncSession,
    *,
    report: Report,
    actor: User,
    title: str | None,
    initial_message: str,
    finding_id: str,
) -> ConversationThread:
    if report.subject_user_id != actor.id:
        raise ThreadServiceError("Only the patient may open a report thread", 403)

    finding = await _load_finding_for_report(session, report_id=report.id, finding_id=finding_id)
    thread = ConversationThread(
        subject_user_id=report.subject_user_id,
        created_by_user_id=actor.id,
        report_id=report.id,
        anchor_finding_id=finding.id,
        title=title or finding.display_name,
    )
    session.add(thread)
    await session.flush()

    await _ensure_participant(session, thread_id=thread.id, user_id=actor.id)
    for clinician in await _list_active_clinician_recipients(session, report=report):
        await _ensure_participant(session, thread_id=thread.id, user_id=clinician.id)

    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=actor.id,
        kind=MessageKind.TEXT,
        body=initial_message,
    )
    session.add(message)
    await session.flush()

    refreshed_thread = await _load_thread(session, thread_id=thread.id)
    recipients = await _notification_recipients_for_message(
        session,
        thread=refreshed_thread,
        sender=actor,
    )
    for recipient in recipients:
        if recipient.id != actor.id:
            await _create_notification(
                session,
                recipient=recipient,
                thread=refreshed_thread,
                message=message,
                sender=actor,
            )

    await session.commit()
    return await _load_thread(session, thread_id=thread.id)


async def get_thread_for_user(
    session: AsyncSession,
    *,
    thread_id: str,
    user: User,
) -> ConversationThread:
    thread = await _load_thread(session, thread_id=thread_id)
    await _ensure_thread_access(session, thread=thread, user=user)
    return thread


async def list_threads_for_report(
    session: AsyncSession,
    *,
    report_id: str,
) -> list[ConversationThread]:
    threads = (
        await session.scalars(
            select(ConversationThread)
            .where(ConversationThread.report_id == report_id)
            .order_by(ConversationThread.created_at.desc())
            .options(
                selectinload(ConversationThread.anchor_finding),
                THREAD_LOAD,
            )
        )
    ).all()
    return list(threads)


async def add_thread_message(
    session: AsyncSession,
    *,
    thread_id: str,
    message_input: ThreadMessageCreateInput,
) -> ThreadMessage:
    thread = await _load_thread(session, thread_id=thread_id)
    await _ensure_thread_access(session, thread=thread, user=message_input.author)

    if thread.status != ThreadStatus.OPEN:
        raise ThreadServiceError("Thread is closed", 409)

    if message_input.template_payload:
        kind = MessageKind.TEMPLATE
        body = json.dumps(message_input.template_payload)
    elif message_input.body:
        kind = MessageKind.TEXT
        body = message_input.body
    else:
        raise ThreadServiceError("Must provide body or template_payload", 400)

    message = ThreadMessage(
        thread_id=thread.id,
        author_user_id=message_input.author.id,
        kind=kind,
        body=body,
    )
    session.add(message)
    await session.flush()
    await _ensure_participant(session, thread_id=thread.id, user_id=message_input.author.id)

    recipients = await _notification_recipients_for_message(
        session,
        thread=thread,
        sender=message_input.author,
    )
    for recipient in recipients:
        if recipient.id != message_input.author.id:
            await _create_notification(
                session,
                recipient=recipient,
                thread=thread,
                message=message,
                sender=message_input.author,
            )

    await session.commit()
    persisted = await session.scalar(
        select(ThreadMessage)
        .where(ThreadMessage.id == message.id)
        .options(
            selectinload(ThreadMessage.author_user)
            .selectinload(User.role_assignments)
            .selectinload(UserRole.role)
        )
    )
    assert persisted is not None
    return persisted


async def list_notifications_for_user(
    session: AsyncSession,
    *,
    user_id: str,
) -> list[Notification]:
    notifications = (
        await session.scalars(
            select(Notification)
            .where(Notification.user_id == user_id)
            .order_by(Notification.created_at.desc())
        )
    ).all()
    return list(notifications)
