from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime

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


class ReportServiceError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class ReportFindingCreateInput:
    test_name: str
    value_numeric: float | None = None
    value_text: str | None = None
    unit: str | None = None
    reference_range: str | None = None
    flag: str | None = None
    confidence: float | None = None


@dataclass(frozen=True)
class ReportShareResult:
    share: ConsentShare
    grantee: User


async def list_reports_for_user(session: AsyncSession, *, subject_user_id: str) -> list[Report]:
    reports = await session.execute(
        select(Report)
        .where(Report.subject_user_id == subject_user_id)
        .order_by(Report.created_at.desc())
        .options(selectinload(Report.findings))
    )
    return reports.scalars().all()


async def create_report_for_user(
    session: AsyncSession,
    *,
    subject_user_id: str,
    created_by_user_id: str,
    title: str | None,
    source_kind: ReportSourceKind,
    findings: list[ReportFindingCreateInput],
) -> Report:
    report = Report(
        subject_user_id=subject_user_id,
        created_by_user_id=created_by_user_id,
        title=title,
        source_kind=source_kind,
        sharing_mode=ReportSharingMode.PRIVATE,
        observed_at=datetime.now(UTC),
    )
    session.add(report)
    await session.flush()

    for idx, finding in enumerate(findings, start=1):
        session.add(
            ReportFinding(
                report_id=report.id,
                biomarker_key=finding.test_name,
                display_name=finding.test_name,
                value_numeric=finding.value_numeric,
                value_text=finding.value_text,
                unit=finding.unit,
                flag=finding.flag or "unknown",
                reference_range_text=finding.reference_range,
                position=idx,
            )
        )

    await session.commit()

    persisted = await session.scalar(
        select(Report)
        .where(Report.id == report.id)
        .options(selectinload(Report.findings))
    )
    assert persisted is not None
    return persisted


def _active_share_statement(*, subject_user_id: str):
    return select(ConsentShare).where(
        ConsentShare.subject_user_id == subject_user_id,
        ConsentShare.revoked_at.is_(None),
        ConsentShare.expires_at > datetime.now(UTC),
    )


async def sync_subject_report_sharing_modes(session: AsyncSession, *, subject_user_id: str) -> None:
    active_shares = (
        await session.scalars(
            _active_share_statement(subject_user_id=subject_user_id)
        )
    ).all()
    reports = (
        await session.scalars(
            select(Report).where(Report.subject_user_id == subject_user_id)
        )
    ).all()

    has_patient_scope = any(
        share.scope == ConsentScope.PATIENT and share.report_id is None
        for share in active_shares
    )
    report_scope_ids = {
        share.report_id
        for share in active_shares
        if share.scope == ConsentScope.REPORT and share.report_id is not None
    }

    for report in reports:
        target_mode = (
            ReportSharingMode.SHARED
            if has_patient_scope or report.id in report_scope_ids
            else ReportSharingMode.PRIVATE
        )
        if report.sharing_mode != target_mode:
            report.sharing_mode = target_mode
            session.add(report)


def _require_report_owner(*, report: Report, owner_user_id: str, action: str) -> None:
    if report.subject_user_id != owner_user_id:
        raise ReportServiceError(f"Only report owner may {action}", 403)


async def _load_grantee(session: AsyncSession, *, clinician_email: str) -> User:
    grantee = await session.scalar(select(User).where(User.email == clinician_email))
    if grantee is None:
        raise ReportServiceError("Clinician user not found", 404)
    return grantee


async def share_report_with_user(
    session: AsyncSession,
    *,
    report: Report,
    owner_user_id: str,
    clinician_email: str,
    scope: ConsentScope,
    access_level: ConsentAccessLevel,
    expires_at: datetime,
) -> ReportShareResult:
    _require_report_owner(report=report, owner_user_id=owner_user_id, action="grant sharing")

    if expires_at <= datetime.now(UTC):
        raise ReportServiceError("expires_at must be in the future", 400)

    grantee = await _load_grantee(session, clinician_email=clinician_email)
    if grantee.id == owner_user_id:
        raise ReportServiceError("Cannot share with yourself", 400)

    target_report_id = report.id if scope == ConsentScope.REPORT else None
    existing_share = await session.scalar(
        select(ConsentShare).where(
            ConsentShare.subject_user_id == report.subject_user_id,
            ConsentShare.grantee_user_id == grantee.id,
            ConsentShare.report_id == target_report_id,
            ConsentShare.scope == scope,
        )
    )

    if existing_share is None:
        share = ConsentShare(
            subject_user_id=report.subject_user_id,
            grantee_user_id=grantee.id,
            granted_by_user_id=owner_user_id,
            report_id=target_report_id,
            scope=scope,
            access_level=access_level,
            expires_at=expires_at,
        )
        session.add(share)
    else:
        existing_share.access_level = access_level
        existing_share.expires_at = expires_at
        existing_share.revoked_at = None
        share = existing_share

    await session.flush()
    await sync_subject_report_sharing_modes(session, subject_user_id=report.subject_user_id)
    await session.commit()
    await session.refresh(share)
    return ReportShareResult(share=share, grantee=grantee)


async def revoke_report_share(
    session: AsyncSession,
    *,
    report: Report,
    owner_user_id: str,
    clinician_email: str,
) -> None:
    _require_report_owner(report=report, owner_user_id=owner_user_id, action="revoke sharing")
    grantee = await _load_grantee(session, clinician_email=clinician_email)

    share = await session.scalar(
        select(ConsentShare).where(
            ConsentShare.subject_user_id == report.subject_user_id,
            ConsentShare.grantee_user_id == grantee.id,
            ConsentShare.report_id == report.id,
            ConsentShare.scope == ConsentScope.REPORT,
            ConsentShare.revoked_at.is_(None),
        )
    )

    if share is None:
        share = await session.scalar(
            select(ConsentShare).where(
                ConsentShare.subject_user_id == report.subject_user_id,
                ConsentShare.grantee_user_id == grantee.id,
                ConsentShare.report_id.is_(None),
                ConsentShare.scope == ConsentScope.PATIENT,
                ConsentShare.revoked_at.is_(None),
            )
        )

    if share is None:
        raise ReportServiceError("No active share found", 404)

    share.revoked_at = datetime.now(UTC)
    await session.flush()
    await sync_subject_report_sharing_modes(session, subject_user_id=report.subject_user_id)
    await session.commit()
