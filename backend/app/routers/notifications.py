from __future__ import annotations

from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import Notification
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.services.notifications import (
    count_unread_notifications,
)
from app.services.notifications import (
    list_notifications as list_notifications_service,
)
from app.services.notifications import (
    mark_all_notifications_read as mark_all_notifications_read_service,
)
from app.services.notifications import (
    mark_notification_read as mark_notification_read_service,
)

router = APIRouter(prefix="/notifications", tags=["notifications"])


class NotificationOut(BaseModel):
    id: str
    recipient_user_id: str
    type: str
    message: str
    read: bool
    resource_type: str
    resource_id: str
    thread_id: str | None = None
    report_id: str | None = None
    kind: str | None = None
    title: str | None = None
    payload: dict[str, Any] | None = None
    read_at: datetime | None = None
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationOut]
    total_unread: int
    limit: int
    offset: int


class UnreadCountOut(BaseModel):
    unread: int


@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    unread_only: bool = False,
    limit: int = 50,
    offset: int = 0,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> NotificationListResponse:
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    notifications, total_unread = await list_notifications_service(
        session,
        auth.user.id,
        unread_only=unread_only,
        limit=limit,
        offset=offset,
    )
    return NotificationListResponse(
        items=[_serialize_notification(notification) for notification in notifications],
        total_unread=total_unread,
        limit=limit,
        offset=offset,
    )


@router.get("/unread-count", response_model=UnreadCountOut)
async def unread_count(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> UnreadCountOut:
    count = await count_unread_notifications(session, auth.user.id)
    return UnreadCountOut(unread=count)


@router.patch("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
@router.post("/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
async def mark_notification_read(
    notification_id: str,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    exists = await mark_notification_read_service(session, auth.user.id, notification_id)
    if not exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")


@router.patch("/read-all", status_code=status.HTTP_204_NO_CONTENT)
async def mark_all_notifications_read_endpoint(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    await mark_all_notifications_read_service(session, auth.user.id)


def _serialize_notification(notification: Notification) -> NotificationOut:
    resource_type = notification.resource_type
    resource_id = notification.resource_id
    if not resource_type:
        if notification.thread_id:
            resource_type = "thread"
        elif notification.report_id:
            resource_type = "report"
        else:
            resource_type = "system"
    if not resource_id:
        resource_id = notification.thread_id or notification.report_id or notification.id

    return NotificationOut(
        id=notification.id,
        recipient_user_id=notification.user_id,
        type=notification.kind.value,
        message=notification.title,
        read=notification.read_at is not None,
        created_at=notification.created_at,
        resource_type=resource_type,
        resource_id=resource_id,
        thread_id=notification.thread_id,
        report_id=notification.report_id,
        kind=notification.kind.value,
        title=notification.title,
        payload=notification.payload or {},
        read_at=notification.read_at,
    )
