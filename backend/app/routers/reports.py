from __future__ import annotations

from datetime import datetime, UTC

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import (
    ConsentAccessLevel,
    ConsentScope,
    ConsentShare,
    Report,
    ReportFinding,
    ReportSharingMode,
    ReportSourceKind,
    User,
)
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.dependencies.reports import get_accessible_report

router = APIRouter(prefix="/reports", tags=["reports"])


class ReportShareRequest(BaseModel):
    clinician_email: EmailStr
    scope: ConsentScope = ConsentScope.REPORT
    access_level: ConsentAccessLevel = ConsentAccessLevel.READ
    expires_at: datetime


class ReportCreateFinding(BaseModel):
    test_name: str
    value_numeric: float | None = None
    value_text: str | None = None
    unit: str | None = None
    reference_range: str | None = None
    flag: str | None = None
    confidence: float | None = None


class ReportCreateRequest(BaseModel):
    title: str | None = None
    source_kind: ReportSourceKind = ReportSourceKind.MANUAL
    findings: list[ReportCreateFinding] = []


class ReportCreateResponse(BaseModel):
    id: str
    title: str | None
    source_kind: str
    sharing_mode: str
    observed_at: datetime


class ReportFindingOut(BaseModel):
    id: str
    biomarker_key: str
    display_name: str
    value_numeric: float | None
    value_text: str | None
    unit: str | None
    flag: str
    reference_range_text: str | None


class ReportOut(BaseModel):
    id: str
    subject_user_id: str
    created_by_user_id: str
    title: str | None
    source_kind: str
    sharing_mode: str
    observed_at: datetime
    findings: list[ReportFindingOut]


class ReportDetailResponse(BaseModel):
    report: ReportOut


@router.get("", response_model=list[ReportOut])
async def list_reports(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> list[Report]:
    reports = await session.execute(
        select(Report)
        .where(Report.subject_user_id == auth.user.id)
        .order_by(Report.created_at.desc())
        .options(selectinload(Report.findings))
    )
    rows = reports.scalars().all()
    return [_report_out(report) for report in rows]


@router.post("", response_model=ReportCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreateRequest,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ReportCreateResponse:
    report = Report(
        subject_user_id=auth.user.id,
        created_by_user_id=auth.user.id,
        title=payload.title,
        source_kind=payload.source_kind,
        sharing_mode=ReportSharingMode.PRIVATE,
        observed_at=datetime.now(UTC),
    )
    session.add(report)
    await session.flush()

    for idx, finding in enumerate(payload.findings, start=1):
        entity = ReportFinding(
            report_id=report.id,
            biomarker_key=finding.test_name,
            display_name=finding.test_name,
            value_numeric=finding.value_numeric,
            value_text=finding.value_text,
            unit=finding.unit,
            flag=finding.flag or 'unknown',
            reference_range_text=finding.reference_range,
            position=idx,
        )
        session.add(entity)

    await session.commit()
    await session.refresh(report)

    return ReportCreateResponse(
        id=report.id,
        title=report.title,
        source_kind=report.source_kind.value,
        sharing_mode=report.sharing_mode.value,
        observed_at=report.observed_at,
    )


class ReportShareResponse(BaseModel):
    id: str
    clinician_email: str
    scope: str
    access_level: str
    expires_at: datetime


@router.post("/{report_id}/share", response_model=ReportShareResponse, status_code=status.HTTP_201_CREATED)
async def share_report(
    payload: ReportShareRequest,
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ReportShareResponse:
    if report.subject_user_id != auth.user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only report owner may grant sharing")

    if payload.expires_at <= datetime.now(UTC):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="expires_at must be in the future")

    grantee = await session.scalar(select(User).where(User.email == payload.clinician_email))
    if grantee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinician user not found")

    if grantee.id == auth.user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot share with yourself")

    existing_share = await session.scalar(
        select(ConsentShare)
        .where(
            ConsentShare.subject_user_id == report.subject_user_id,
            ConsentShare.grantee_user_id == grantee.id,
            ConsentShare.report_id == (report.id if payload.scope == ConsentScope.REPORT else None),
            ConsentShare.scope == payload.scope,
        )
    )

    if existing_share is not None:
        existing_share.access_level = payload.access_level
        existing_share.expires_at = payload.expires_at
        existing_share.revoked_at = None
        share = existing_share
    else:
        share = ConsentShare(
            subject_user_id=report.subject_user_id,
            grantee_user_id=grantee.id,
            granted_by_user_id=auth.user.id,
            report_id=(report.id if payload.scope == ConsentScope.REPORT else None),
            scope=payload.scope,
            access_level=payload.access_level,
            expires_at=payload.expires_at,
        )
        session.add(share)

    report.sharing_mode = ReportSharingMode.SHARED
    session.add(report)

    await session.commit()
    await session.refresh(share)

    return ReportShareResponse(
        id=share.id,
        clinician_email=grantee.email,
        scope=share.scope.value,
        access_level=share.access_level.value,
        expires_at=share.expires_at,
    )


class ReportRevokeRequest(BaseModel):
    clinician_email: EmailStr


@router.post("/{report_id}/share/revoke", status_code=status.HTTP_204_NO_CONTENT)
async def revoke_share(
    payload: ReportRevokeRequest,
    report: Report = Depends(get_accessible_report),
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> None:
    if report.subject_user_id != auth.user.id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only report owner may revoke sharing")

    grantee = await session.scalar(select(User).where(User.email == payload.clinician_email))
    if grantee is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Clinician user not found")

    share = await session.scalar(
        select(ConsentShare)
        .where(
            ConsentShare.subject_user_id == report.subject_user_id,
            ConsentShare.grantee_user_id == grantee.id,
            ConsentShare.report_id == report.id,
            ConsentShare.revoked_at.is_(None),
        )
    )

    if share is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="No active share found")

    share.revoked_at = datetime.now(UTC)
    await session.commit()


def _finding_out(finding: ReportFinding) -> ReportFindingOut:
    return ReportFindingOut(
        id=finding.id,
        biomarker_key=finding.biomarker_key,
        display_name=finding.display_name,
        value_numeric=finding.value_numeric,
        value_text=finding.value_text,
        unit=finding.unit,
        flag=finding.flag.value,
        reference_range_text=finding.reference_range_text,
    )


def _report_out(report: Report) -> ReportOut:
    findings = sorted(report.findings, key=lambda item: (item.position, item.display_name.lower()))
    return ReportOut(
        id=report.id,
        subject_user_id=report.subject_user_id,
        created_by_user_id=report.created_by_user_id,
        title=report.title,
        source_kind=report.source_kind.value,
        sharing_mode=report.sharing_mode.value,
        observed_at=report.observed_at,
        findings=[_finding_out(finding) for finding in findings],
    )


@router.get("/{report_id}", response_model=ReportDetailResponse)
async def get_report_endpoint(report: Report = Depends(get_accessible_report)) -> ReportDetailResponse:
    return ReportDetailResponse(report=_report_out(report))
