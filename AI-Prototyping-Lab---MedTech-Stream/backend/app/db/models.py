from __future__ import annotations

from datetime import datetime
from enum import Enum, StrEnum
from typing import Any
from uuid import uuid4

from sqlalchemy import (
    JSON,
    Boolean,
    CheckConstraint,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy import (
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .base import Base, TimestampMixin, UUIDPrimaryKeyMixin, utcnow


def enum_values(enum_cls: type[Enum]) -> list[str]:
    return [str(item.value) for item in enum_cls]


def enum_column(enum_cls: type[Enum], *, name: str) -> SAEnum:
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        validate_strings=True,
        values_callable=enum_values,
    )


class ReportSourceKind(StrEnum):
    PDF = "pdf"
    TEXT = "text"
    IMAGE = "image"
    MANUAL = "manual"


class ReportSharingMode(StrEnum):
    PRIVATE = "private"
    SHARED = "shared"


class FindingFlag(StrEnum):
    LOW = "low"
    HIGH = "high"
    NORMAL = "normal"
    ABNORMAL = "abnormal"
    UNKNOWN = "unknown"


class ConsentScope(StrEnum):
    REPORT = "report"
    PATIENT = "patient"


class ConsentAccessLevel(StrEnum):
    READ = "read"
    COMMENT = "comment"
    MANAGE = "manage"


class ThreadStatus(StrEnum):
    OPEN = "open"
    CLOSED = "closed"


class MessageKind(StrEnum):
    TEXT = "text"
    TEMPLATE = "template"
    SYSTEM = "system"


class NotificationKind(StrEnum):
    THREAD_REPLY = "thread_reply"
    SHARE_GRANTED = "share_granted"
    REPORT_READY = "report_ready"
    SYSTEM = "system"


class Role(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "roles"

    name: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(String(255), nullable=True)

    user_assignments: Mapped[list[UserRole]] = relationship(
        back_populates="role",
        cascade="all, delete-orphan",
    )
    users: Mapped[list[User]] = relationship(
        secondary="user_roles",
        back_populates="roles",
        primaryjoin="Role.id == UserRole.role_id",
        secondaryjoin="User.id == UserRole.user_id",
        viewonly=True,
    )


class User(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), nullable=False, unique=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    preferred_language: Mapped[str] = mapped_column(String(16), nullable=False, default="en")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    is_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    role_assignments: Mapped[list[UserRole]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
        foreign_keys="UserRole.user_id",
    )
    roles: Mapped[list[Role]] = relationship(
        secondary="user_roles",
        back_populates="users",
        primaryjoin="User.id == UserRole.user_id",
        secondaryjoin="Role.id == UserRole.role_id",
        viewonly=True,
    )
    auth_sessions: Mapped[list[AuthSession]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    subject_reports: Mapped[list[Report]] = relationship(
        back_populates="subject_user",
        foreign_keys="Report.subject_user_id",
    )
    created_reports: Mapped[list[Report]] = relationship(
        back_populates="created_by_user",
        foreign_keys="Report.created_by_user_id",
    )
    granted_shares: Mapped[list[ConsentShare]] = relationship(
        back_populates="subject_user",
        foreign_keys="ConsentShare.subject_user_id",
    )
    received_shares: Mapped[list[ConsentShare]] = relationship(
        back_populates="grantee_user",
        foreign_keys="ConsentShare.grantee_user_id",
    )
    issued_shares: Mapped[list[ConsentShare]] = relationship(
        back_populates="granted_by_user",
        foreign_keys="ConsentShare.granted_by_user_id",
    )
    subject_threads: Mapped[list[ConversationThread]] = relationship(
        back_populates="subject_user",
        foreign_keys="ConversationThread.subject_user_id",
    )
    created_threads: Mapped[list[ConversationThread]] = relationship(
        back_populates="created_by_user",
        foreign_keys="ConversationThread.created_by_user_id",
    )
    thread_participations: Mapped[list[ThreadParticipant]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    thread_messages: Mapped[list[ThreadMessage]] = relationship(
        back_populates="author_user",
        foreign_keys="ThreadMessage.author_user_id",
    )
    notifications: Mapped[list[Notification]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    clinician_templates: Mapped[list[ClinicianResponseTemplate]] = relationship(
        back_populates="author_user",
        foreign_keys="ClinicianResponseTemplate.author_user_id",
    )
    biomarker_observations: Mapped[list[BiomarkerObservation]] = relationship(
        back_populates="patient_user",
        foreign_keys="BiomarkerObservation.patient_user_id",
    )
    actor_audit_events: Mapped[list[AuditEvent]] = relationship(
        back_populates="actor_user",
        foreign_keys="AuditEvent.actor_user_id",
    )
    subject_audit_events: Mapped[list[AuditEvent]] = relationship(
        back_populates="subject_user",
        foreign_keys="AuditEvent.subject_user_id",
    )

    def assign_role(self, role: Role) -> UserRole:
        existing = next((assignment for assignment in self.role_assignments if assignment.role == role), None)
        if existing is not None:
            return existing
        assignment = UserRole(role=role)
        self.role_assignments.append(assignment)
        return assignment


class UserRole(Base):
    __tablename__ = "user_roles"
    __table_args__ = (UniqueConstraint("user_id", "role_id"),)

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    role_id: Mapped[str] = mapped_column(ForeignKey("roles.id", ondelete="CASCADE"), primary_key=True)
    assigned_by_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    assigned_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[User] = relationship(
        back_populates="role_assignments",
        foreign_keys=[user_id],
    )
    role: Mapped[Role] = relationship(back_populates="user_assignments")
    assigned_by_user: Mapped[User | None] = relationship(foreign_keys=[assigned_by_user_id])


class AuthSession(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "auth_sessions"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    refresh_token_hash: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    session_family: Mapped[str] = mapped_column(String(36), nullable=False, default=lambda: str(uuid4()))
    device_label: Mapped[str | None] = mapped_column(String(120), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="auth_sessions")


class Report(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "reports"

    subject_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    source_kind: Mapped[ReportSourceKind] = mapped_column(
        enum_column(ReportSourceKind, name="report_source_kind"),
        nullable=False,
        default=ReportSourceKind.PDF,
    )
    sharing_mode: Mapped[ReportSharingMode] = mapped_column(
        enum_column(ReportSharingMode, name="report_sharing_mode"),
        nullable=False,
        default=ReportSharingMode.PRIVATE,
    )
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subject_user: Mapped[User] = relationship(
        back_populates="subject_reports",
        foreign_keys=[subject_user_id],
    )
    created_by_user: Mapped[User] = relationship(
        back_populates="created_reports",
        foreign_keys=[created_by_user_id],
    )
    findings: Mapped[list[ReportFinding]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
    )
    consent_shares: Mapped[list[ConsentShare]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
    )
    threads: Mapped[list[ConversationThread]] = relationship(
        back_populates="report",
        cascade="all, delete-orphan",
    )
    notifications: Mapped[list[Notification]] = relationship(back_populates="report")
    biomarker_observations: Mapped[list[BiomarkerObservation]] = relationship(back_populates="report")


class ReportFinding(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "report_findings"
    __table_args__ = (
        CheckConstraint(
            "value_numeric IS NOT NULL OR value_text IS NOT NULL",
            name="finding_has_value",
        ),
    )

    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    biomarker_key: Mapped[str] = mapped_column(String(120), nullable=False)
    display_name: Mapped[str] = mapped_column(String(255), nullable=False)
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    comparator: Mapped[str | None] = mapped_column(String(8), nullable=True)
    flag: Mapped[FindingFlag] = mapped_column(
        enum_column(FindingFlag, name="finding_flag"),
        nullable=False,
        default=FindingFlag.UNKNOWN,
    )
    reference_low: Mapped[float | None] = mapped_column(Float, nullable=True)
    reference_high: Mapped[float | None] = mapped_column(Float, nullable=True)
    reference_range_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    report: Mapped[Report] = relationship(back_populates="findings")
    biomarker_observation: Mapped[BiomarkerObservation] = relationship(
        back_populates="finding",
        cascade="all, delete-orphan",
        uselist=False,
    )


class BiomarkerObservation(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "biomarker_observations"
    __table_args__ = (UniqueConstraint("finding_id"),)

    patient_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    report_id: Mapped[str] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), nullable=False)
    finding_id: Mapped[str] = mapped_column(ForeignKey("report_findings.id", ondelete="CASCADE"), nullable=False)
    biomarker_key: Mapped[str] = mapped_column(String(120), nullable=False)
    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    value_numeric: Mapped[float | None] = mapped_column(Float, nullable=True)
    value_text: Mapped[str | None] = mapped_column(String(255), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(64), nullable=True)
    flag: Mapped[FindingFlag] = mapped_column(
        enum_column(FindingFlag, name="observation_flag"),
        nullable=False,
        default=FindingFlag.UNKNOWN,
    )
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    patient_user: Mapped[User] = relationship(
        back_populates="biomarker_observations",
        foreign_keys=[patient_user_id],
    )
    report: Mapped[Report] = relationship(back_populates="biomarker_observations")
    finding: Mapped[ReportFinding] = relationship(back_populates="biomarker_observation")


class ConsentShare(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "consent_shares"
    __table_args__ = (
        UniqueConstraint("subject_user_id", "grantee_user_id", "report_id", "scope"),
        CheckConstraint("subject_user_id <> grantee_user_id", name="share_not_self_grant"),
        CheckConstraint(
            "((scope = 'report' AND report_id IS NOT NULL) OR (scope = 'patient' AND report_id IS NULL))",
            name="share_scope_matches_report",
        ),
    )

    subject_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    grantee_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    granted_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), nullable=True)
    scope: Mapped[ConsentScope] = mapped_column(
        enum_column(ConsentScope, name="consent_scope"),
        nullable=False,
        default=ConsentScope.REPORT,
    )
    access_level: Mapped[ConsentAccessLevel] = mapped_column(
        enum_column(ConsentAccessLevel, name="consent_access_level"),
        nullable=False,
        default=ConsentAccessLevel.READ,
    )
    purpose: Mapped[str | None] = mapped_column(String(255), nullable=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subject_user: Mapped[User] = relationship(
        back_populates="granted_shares",
        foreign_keys=[subject_user_id],
    )
    grantee_user: Mapped[User] = relationship(
        back_populates="received_shares",
        foreign_keys=[grantee_user_id],
    )
    granted_by_user: Mapped[User] = relationship(
        back_populates="issued_shares",
        foreign_keys=[granted_by_user_id],
    )
    report: Mapped[Report | None] = relationship(back_populates="consent_shares")


class ConversationThread(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "conversation_threads"

    subject_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    created_by_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id", ondelete="SET NULL"), nullable=True)
    title: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[ThreadStatus] = mapped_column(
        enum_column(ThreadStatus, name="thread_status"),
        nullable=False,
        default=ThreadStatus.OPEN,
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    subject_user: Mapped[User] = relationship(
        back_populates="subject_threads",
        foreign_keys=[subject_user_id],
    )
    created_by_user: Mapped[User] = relationship(
        back_populates="created_threads",
        foreign_keys=[created_by_user_id],
    )
    report: Mapped[Report | None] = relationship(back_populates="threads")
    participants: Mapped[list[ThreadParticipant]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
    )
    messages: Mapped[list[ThreadMessage]] = relationship(
        back_populates="thread",
        cascade="all, delete-orphan",
    )
    notifications: Mapped[list[Notification]] = relationship(back_populates="thread")


class ThreadParticipant(Base):
    __tablename__ = "thread_participants"
    __table_args__ = (UniqueConstraint("thread_id", "user_id"),)

    thread_id: Mapped[str] = mapped_column(
        ForeignKey("conversation_threads.id", ondelete="CASCADE"),
        primary_key=True,
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    thread: Mapped[ConversationThread] = relationship(back_populates="participants")
    user: Mapped[User] = relationship(back_populates="thread_participations")


class ClinicianResponseTemplate(UUIDPrimaryKeyMixin, TimestampMixin, Base):
    __tablename__ = "clinician_response_templates"

    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    author_user: Mapped[User] = relationship(
        back_populates="clinician_templates",
        foreign_keys=[author_user_id],
    )
    messages: Mapped[list[ThreadMessage]] = relationship(back_populates="template")


class ThreadMessage(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "thread_messages"

    thread_id: Mapped[str] = mapped_column(
        ForeignKey("conversation_threads.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    template_id: Mapped[str | None] = mapped_column(
        ForeignKey("clinician_response_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    kind: Mapped[MessageKind] = mapped_column(
        enum_column(MessageKind, name="message_kind"),
        nullable=False,
        default=MessageKind.TEXT,
    )
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    thread: Mapped[ConversationThread] = relationship(back_populates="messages")
    author_user: Mapped[User] = relationship(
        back_populates="thread_messages",
        foreign_keys=[author_user_id],
    )
    template: Mapped[ClinicianResponseTemplate | None] = relationship(back_populates="messages")


class Notification(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "notifications"

    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    thread_id: Mapped[str | None] = mapped_column(
        ForeignKey("conversation_threads.id", ondelete="CASCADE"),
        nullable=True,
    )
    report_id: Mapped[str | None] = mapped_column(ForeignKey("reports.id", ondelete="CASCADE"), nullable=True)
    kind: Mapped[NotificationKind] = mapped_column(
        enum_column(NotificationKind, name="notification_kind"),
        nullable=False,
        default=NotificationKind.SYSTEM,
    )
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    user: Mapped[User] = relationship(back_populates="notifications")
    thread: Mapped[ConversationThread | None] = relationship(back_populates="notifications")
    report: Mapped[Report | None] = relationship(back_populates="notifications")


class AuditEvent(UUIDPrimaryKeyMixin, Base):
    __tablename__ = "audit_events"

    actor_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    subject_user_id: Mapped[str | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"),
        nullable=True,
    )
    resource_type: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str] = mapped_column(String(36), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    context: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)

    actor_user: Mapped[User | None] = relationship(
        back_populates="actor_audit_events",
        foreign_keys=[actor_user_id],
    )
    subject_user: Mapped[User | None] = relationship(
        back_populates="subject_audit_events",
        foreign_keys=[subject_user_id],
    )
