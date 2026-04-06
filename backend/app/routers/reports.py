from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.db.models import (
    ConsentAccessLevel,
    ConsentScope,
    Report,
    ReportFinding,
    ReportSourceKind,
)
from app.db.session import get_db_session
from app.dependencies.auth import AuthContext, get_current_auth_context
from app.dependencies.reports import get_accessible_report
from app.services.reports import (
    ReportFindingCreateInput,
    ReportServiceError,
    create_report_for_user,
    list_reports_for_user,
    revoke_report_share,
    share_report_with_user,
)

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
    findings: list[ReportCreateFinding] = Field(default_factory=list)


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


def _raise_report_http_error(exc: ReportServiceError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.detail)


@router.get("", response_model=list[ReportOut])
async def list_reports(
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> list[ReportOut]:
    rows = await list_reports_for_user(session, subject_user_id=auth.user.id)
    return [_report_out(report) for report in rows]


@router.post("", response_model=ReportCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_report(
    payload: ReportCreateRequest,
    auth: AuthContext = Depends(get_current_auth_context),
    session: AsyncSession = Depends(get_db_session),
) -> ReportCreateResponse:
    report = await create_report_for_user(
        session,
        subject_user_id=auth.user.id,
        created_by_user_id=auth.user.id,
        title=payload.title,
        source_kind=payload.source_kind,
        findings=[
            ReportFindingCreateInput(
                test_name=finding.test_name,
                value_numeric=finding.value_numeric,
                value_text=finding.value_text,
                unit=finding.unit,
                reference_range=finding.reference_range,
                flag=finding.flag,
                confidence=finding.confidence,
            )
            for finding in payload.findings
        ],
    )

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
    try:
        result = await share_report_with_user(
            session,
            report=report,
            owner_user_id=auth.user.id,
            clinician_email=str(payload.clinician_email),
            scope=payload.scope,
            access_level=payload.access_level,
            expires_at=payload.expires_at,
        )
    except ReportServiceError as exc:
        _raise_report_http_error(exc)

    return ReportShareResponse(
        id=result.share.id,
        clinician_email=result.grantee.email,
        scope=result.share.scope.value,
        access_level=result.share.access_level.value,
        expires_at=result.share.expires_at,
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
    try:
        await revoke_report_share(
            session,
            report=report,
            owner_user_id=auth.user.id,
            clinician_email=str(payload.clinician_email),
        )
    except ReportServiceError as exc:
        _raise_report_http_error(exc)


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
