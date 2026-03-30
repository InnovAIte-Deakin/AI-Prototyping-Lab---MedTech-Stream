from __future__ import annotations

import hashlib
import os
import re
import secrets
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import jwt
from passlib.context import CryptContext
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.db.models import AuthSession, Role, User, UserRole
from app.db.seed import seed_core_roles_async

PASSWORD_CONTEXT = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
USER_ROLE_LOAD = selectinload(User.role_assignments).selectinload(UserRole.role)
AUTH_SESSION_LOAD = selectinload(AuthSession.user).selectinload(User.role_assignments).selectinload(UserRole.role)


class AuthError(Exception):
    def __init__(self, detail: str, status_code: int) -> None:
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class AuthSettings:
    secret_key: str
    issuer: str = "reportx"
    algorithm: str = "HS256"
    access_token_ttl_minutes: int = 15
    refresh_session_ttl_days: int = 30

    @classmethod
    def from_env(cls) -> AuthSettings:
        return cls(
            secret_key=os.getenv("AUTH_SECRET_KEY", "reportx-dev-auth-secret-change-me"),
            issuer=os.getenv("AUTH_TOKEN_ISSUER", "reportx"),
            algorithm=os.getenv("AUTH_TOKEN_ALGORITHM", "HS256"),
            access_token_ttl_minutes=max(1, int(os.getenv("ACCESS_TOKEN_TTL_MINUTES", "15"))),
            refresh_session_ttl_days=max(1, int(os.getenv("REFRESH_SESSION_TTL_DAYS", "30"))),
        )


@dataclass(frozen=True)
class TokenBundle:
    access_token: str
    access_token_expires_at: datetime
    refresh_token: str
    refresh_token_expires_at: datetime


def normalize_email(email: str) -> str:
    normalized = (email or "").strip().lower()
    if not EMAIL_RE.fullmatch(normalized):
        raise AuthError("Invalid email address", 400)
    return normalized


def validate_password(password: str) -> str:
    candidate = password or ""
    if len(candidate) < 8:
        raise AuthError("Password must be at least 8 characters long", 400)
    if len(candidate.encode("utf-8")) > 72:
        raise AuthError("Password must be 72 bytes or fewer", 400)
    return candidate


def normalize_display_name(display_name: str | None, *, email: str) -> str:
    cleaned = (display_name or "").strip()
    if cleaned:
        return cleaned[:120]
    return email.split("@", 1)[0][:120]


def hash_password(password: str) -> str:
    return PASSWORD_CONTEXT.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return PASSWORD_CONTEXT.verify(password, password_hash)
    except Exception:
        return False


def role_names_for_user(user: User) -> list[str]:
    return sorted(
        assignment.role.name
        for assignment in user.role_assignments
        if assignment.role is not None
    )


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def hash_client_host(client_host: str | None) -> str | None:
    if not client_host:
        return None
    return hash_token(client_host)


def ensure_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)


def _encode_token(
    *,
    token_type: str,
    user_id: str,
    session_id: str,
    expires_at: datetime,
    settings: AuthSettings,
    extra_claims: dict[str, Any] | None = None,
) -> str:
    now = datetime.now(UTC)
    payload: dict[str, Any] = {
        "sub": user_id,
        "sid": session_id,
        "typ": token_type,
        "iss": settings.issuer,
        "iat": int(now.timestamp()),
        "exp": int(expires_at.timestamp()),
    }
    if extra_claims:
        payload.update(extra_claims)
    return jwt.encode(payload, settings.secret_key, algorithm=settings.algorithm)


def decode_token(token: str, *, expected_type: str, settings: AuthSettings) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            algorithms=[settings.algorithm],
            issuer=settings.issuer,
            options={"require": ["sub", "sid", "typ", "exp", "iss"]},
        )
    except jwt.ExpiredSignatureError as exc:
        raise AuthError("Token expired", 401) from exc
    except jwt.InvalidTokenError as exc:
        raise AuthError("Invalid token", 401) from exc

    if payload.get("typ") != expected_type:
        raise AuthError("Invalid token", 401)
    return payload


async def _load_user_by_email(session: AsyncSession, *, email: str) -> User | None:
    statement = select(User).options(USER_ROLE_LOAD).where(User.email == email)
    return await session.scalar(statement)


async def _load_auth_session(session: AsyncSession, *, session_id: str) -> AuthSession | None:
    statement = select(AuthSession).options(AUTH_SESSION_LOAD).where(AuthSession.id == session_id)
    return await session.scalar(statement)


def _validate_active_session(auth_session: AuthSession | None, *, expected_user_id: str) -> AuthSession:
    now = datetime.now(UTC)
    if auth_session is None or auth_session.user is None:
        raise AuthError("Invalid session", 401)
    if auth_session.user_id != expected_user_id:
        raise AuthError("Invalid session", 401)
    if auth_session.revoked_at is not None:
        raise AuthError("Session revoked", 401)
    if ensure_utc(auth_session.expires_at) <= now:
        raise AuthError("Session expired", 401)
    if not auth_session.user.is_active:
        raise AuthError("Account inactive", 403)
    return auth_session


def _build_token_bundle(
    *,
    user: User,
    auth_session: AuthSession,
    settings: AuthSettings,
) -> TokenBundle:
    now = datetime.now(UTC)
    access_expires_at = now + timedelta(minutes=settings.access_token_ttl_minutes)
    refresh_expires_at = now + timedelta(days=settings.refresh_session_ttl_days)
    refresh_token = _encode_token(
        token_type="refresh",
        user_id=user.id,
        session_id=auth_session.id,
        expires_at=refresh_expires_at,
        settings=settings,
        extra_claims={"jti": secrets.token_urlsafe(12)},
    )
    access_token = _encode_token(
        token_type="access",
        user_id=user.id,
        session_id=auth_session.id,
        expires_at=access_expires_at,
        settings=settings,
        extra_claims={"jti": secrets.token_urlsafe(12)},
    )
    auth_session.refresh_token_hash = hash_token(refresh_token)
    auth_session.expires_at = refresh_expires_at
    auth_session.last_used_at = now
    return TokenBundle(
        access_token=access_token,
        access_token_expires_at=access_expires_at,
        refresh_token=refresh_token,
        refresh_token_expires_at=refresh_expires_at,
    )


async def register_account(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    role_name: str,
    display_name: str | None,
) -> User:
    normalized_email = normalize_email(email)
    validate_password(password)
    cleaned_display_name = normalize_display_name(display_name, email=normalized_email)

    await seed_core_roles_async(session)
    existing = await _load_user_by_email(session, email=normalized_email)
    if existing is not None:
        raise AuthError("Email already registered", 409)

    role = await session.scalar(select(Role).where(Role.name == role_name))
    if role is None:
        raise AuthError("Unsupported role", 400)

    user = User(
        email=normalized_email,
        display_name=cleaned_display_name,
        password_hash=hash_password(password),
    )
    user.assign_role(role)
    session.add(user)
    await session.commit()
    persisted = await _load_user_by_email(session, email=normalized_email)
    assert persisted is not None
    return persisted


async def login_account(
    session: AsyncSession,
    *,
    email: str,
    password: str,
    user_agent: str | None,
    client_host: str | None,
) -> tuple[User, TokenBundle]:
    normalized_email = normalize_email(email)
    user = await _load_user_by_email(session, email=normalized_email)
    if user is None or not verify_password(password, user.password_hash):
        raise AuthError("Invalid email or password", 401)
    if not user.is_active:
        raise AuthError("Account inactive", 403)

    settings = AuthSettings.from_env()
    auth_session = AuthSession(
        user=user,
        refresh_token_hash="",
        user_agent=(user_agent or "")[:255] or None,
        ip_address_hash=hash_client_host(client_host),
        expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_session_ttl_days),
    )
    session.add(auth_session)
    await session.flush()
    token_bundle = _build_token_bundle(user=user, auth_session=auth_session, settings=settings)
    await session.commit()
    return user, token_bundle


async def refresh_account_session(
    session: AsyncSession,
    *,
    refresh_token: str,
) -> tuple[User, TokenBundle]:
    settings = AuthSettings.from_env()
    payload = decode_token(refresh_token, expected_type="refresh", settings=settings)
    auth_session = await _load_auth_session(session, session_id=str(payload["sid"]))
    auth_session = _validate_active_session(auth_session, expected_user_id=str(payload["sub"]))

    presented_hash = hash_token(refresh_token)
    if not secrets.compare_digest(auth_session.refresh_token_hash, presented_hash):
        raise AuthError("Invalid refresh token", 401)

    token_bundle = _build_token_bundle(user=auth_session.user, auth_session=auth_session, settings=settings)
    await session.commit()
    return auth_session.user, token_bundle


async def revoke_session(session: AsyncSession, *, auth_session: AuthSession) -> None:
    if auth_session.revoked_at is None:
        auth_session.revoked_at = datetime.now(UTC)
        await session.commit()


async def load_authenticated_session(
    session: AsyncSession,
    *,
    access_token: str,
) -> AuthSession:
    settings = AuthSettings.from_env()
    payload = decode_token(access_token, expected_type="access", settings=settings)
    auth_session = await _load_auth_session(session, session_id=str(payload["sid"]))
    return _validate_active_session(auth_session, expected_user_id=str(payload["sub"]))
