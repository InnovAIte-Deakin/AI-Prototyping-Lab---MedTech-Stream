from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.db.models import Report, ReportFinding
from app.dependencies.reports import get_accessible_report

router = APIRouter(prefix="/reports", tags=["reports"])


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
