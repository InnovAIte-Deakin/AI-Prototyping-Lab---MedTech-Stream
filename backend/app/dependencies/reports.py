from __future__ import annotations

from datetime import UTC, datetime

from fastapi import Depends, HTTPException, status
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import ConsentScope, ConsentShare, Report
from app.db.session import get_db_session

from .auth import AuthContext, get_current_auth_context


async def get_accessible_report(
    report_id: str,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> Report:
    report = await session.scalar(
        select(Report)
        .options(selectinload(Report.findings))
        .where(Report.id == report_id)
    )
    if report is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Report not found")

    if report.subject_user_id == auth.user.id:
        return report

    now = datetime.now(UTC)
    share_id = await session.scalar(
        select(ConsentShare.id)
        .where(
            ConsentShare.subject_user_id == report.subject_user_id,
            ConsentShare.grantee_user_id == auth.user.id,
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
        .limit(1)
    )
    if share_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    return report
