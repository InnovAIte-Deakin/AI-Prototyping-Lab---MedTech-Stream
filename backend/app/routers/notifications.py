from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Notification
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: str
    kind: str
    title: str
    thread_id: str | None
    report_id: str | None
    payload: dict[str, Any]
    read_at: datetime | None
    created_at: datetime


class UnreadCountOut(BaseModel):
    unread: int


@router.get("", response_model=list[NotificationOut])
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> list[NotificationOut]:
    limit = max(1, min(limit, 200))
    stmt = (
        select(Notification)
        .where(Notification.user_id == auth.user.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))

    result = await session.scalars(stmt)
    return [
        NotificationOut(
            id=n.id,
            kind=n.kind.value,
            title=n.title,
            thread_id=n.thread_id,
            report_id=n.report_id,
            payload=n.payload or {},
            read_at=n.read_at,
            created_at=n.created_at,
        )
        for n in result.all()
    ]


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> UnreadCountOut:
    stmt = (
        select(func.count())
        .select_from(Notification)
        .where(Notification.user_id == auth.user.id)
        .where(Notification.read_at.is_(None))
    )
    count = await session.scalar(stmt)
    return UnreadCountOut(unread=int(count or 0))


@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: str,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    result = await session.execute(
        update(Notification)
        .where(Notification.id == notification_id)
        .where(Notification.user_id == auth.user.id)
        .where(Notification.read_at.is_(None))
        .values(read_at=func.now())
    )
    if result.rowcount == 0:
        # Either does not exist, belongs to another user, or was already read.
        existing = await session.scalar(
            select(Notification).where(
                Notification.id == notification_id,
                Notification.user_id == auth.user.id,
            )
        )
        if existing is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    await session.commit()
