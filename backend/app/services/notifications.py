from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import ConsentShare, Notification, NotificationKind


async def count_unread_notifications(session: AsyncSession, user_id: str) -> int:
    count = await session.scalar(
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == user_id)
        .where(Notification.read_at.is_(None))
    )
    return int(count or 0)


async def list_notifications(
    session: AsyncSession,
    user_id: str,
    *,
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Notification], int]:
    stmt = (
        select(Notification)
        .where(Notification.user_id == user_id)
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))

    notifications = (await session.scalars(stmt)).all()
    total_unread = await count_unread_notifications(session, user_id)
    return notifications, total_unread


async def mark_notification_read(
    session: AsyncSession,
    user_id: str,
    notification_id: str,
) -> bool:
    result = await session.execute(
        update(Notification)
        .where(Notification.id == notification_id)
        .where(Notification.user_id == user_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    if result.rowcount == 0:
        existing = await session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == user_id,
            )
        )
        if existing is None:
            return False

    await session.commit()
    return True


async def mark_all_notifications_read(session: AsyncSession, user_id: str) -> int:
    result = await session.execute(
        update(Notification)
        .where(Notification.user_id == user_id)
        .where(Notification.read_at.is_(None))
        .values(read_at=datetime.now(UTC))
    )
    await session.commit()
    return int(result.rowcount or 0)


async def emit_notification(
    session: AsyncSession,
    *,
    recipient_user_id: str,
    kind: NotificationKind,
    message: str,
    resource_type: str,
    resource_id: str,
    report_id: str | None = None,
    thread_id: str | None = None,
    payload: dict | None = None,
) -> Notification | None:
    existing = await session.scalar(
        select(Notification).where(
            Notification.user_id == recipient_user_id,
            Notification.kind == kind,
            Notification.resource_type == resource_type,
            Notification.resource_id == resource_id,
        )
    )
    if existing is not None:
        return None

    notification = Notification(
        user_id=recipient_user_id,
        kind=kind,
        title=message,
        payload=payload or {},
        resource_type=resource_type,
        resource_id=resource_id,
        report_id=report_id,
        thread_id=thread_id,
    )
    session.add(notification)
    await session.flush()
    return notification


async def emit_share_expiry_warnings(
    session: AsyncSession,
    *,
    warning_days: int = 2,
) -> int:
    now = datetime.now(UTC)
    warn_before = now + timedelta(days=warning_days)
    shares = await session.scalars(
        select(ConsentShare).where(
            ConsentShare.revoked_at.is_(None),
            ConsentShare.expires_at > now,
            ConsentShare.expires_at <= warn_before,
        )
    )

    warned = 0
    for share in shares.all():
        if share.report_id is None:
            resource_type = "patient"
            resource_id = share.subject_user_id
        else:
            resource_type = "report"
            resource_id = share.report_id

        created = await emit_notification(
            session,
            recipient_user_id=share.grantee_user_id,
            kind=NotificationKind.SHARE_EXPIRY_WARNING,
            message="A shared report is expiring soon.",
            resource_type=resource_type,
            resource_id=resource_id,
            report_id=share.report_id,
        )
        if created is not None:
            warned += 1

    await session.commit()
    return warned
