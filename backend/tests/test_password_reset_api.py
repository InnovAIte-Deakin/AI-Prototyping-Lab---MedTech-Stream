from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import sessionmaker

from app.db.models import AuthSession, PasswordResetToken, User
from app.main import create_app
from app.services.auth import ensure_utc, hash_token, verify_password


@dataclass
class PasswordResetApiHarness:
    client: TestClient
    session_factory: sessionmaker


@pytest.fixture()
def password_reset_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> PasswordResetApiHarness:
    db_path = tmp_path / "password-reset-api.sqlite3"
    sync_database_url = f"sqlite:///{db_path.resolve().as_posix()}"
    async_database_url = f"sqlite+aiosqlite:///{db_path.resolve().as_posix()}"

    monkeypatch.setenv("DATABASE_URL", async_database_url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "reportx-test-auth-secret-key-with-32-bytes")
    monkeypatch.setenv("ACCESS_TOKEN_TTL_MINUTES", "15")
    monkeypatch.setenv("REFRESH_SESSION_TTL_DAYS", "30")
    monkeypatch.setenv("FRONTEND_BASE_URL", "http://localhost:3000")
    monkeypatch.setenv("PASSWORD_RESET_TEST_OUTBOX", "1")

    engine = create_engine(sync_database_url, future=True)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    app = create_app()
    with TestClient(app) as client:
        yield PasswordResetApiHarness(client=client, session_factory=session_factory)

    engine.dispose()


def register_user(
    harness: PasswordResetApiHarness,
    *,
    email: str = "reset.user@example.com",
    password: str = "Password123!",
    role: str = "patient",
    display_name: str = "Reset User",
) -> dict:
    response = harness.client.post(
        "/api/v1/auth/register",
        json={
            "email": email,
            "password": password,
            "role": role,
            "display_name": display_name,
        },
    )
    assert response.status_code == 201, response.text
    return response.json()


def login_user(
    harness: PasswordResetApiHarness,
    *,
    email: str = "reset.user@example.com",
    password: str = "Password123!",
) -> dict:
    response = harness.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()


def get_user(session_factory: sessionmaker, *, email: str) -> User:
    with session_factory() as session:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        return user


def get_reset_token(session_factory: sessionmaker, *, email: str) -> PasswordResetToken:
    with session_factory() as session:
        user = session.scalar(select(User).where(User.email == email))
        assert user is not None
        token = session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        )
        assert token is not None
        return token


def get_last_dispatched_reset_token(harness: PasswordResetApiHarness) -> str:
    outbox = getattr(harness.client.app.state, "password_reset_outbox", [])
    assert outbox
    raw_token = outbox[-1]["token"]
    assert raw_token
    return raw_token


def test_forgot_password_generates_and_stores_hashed_token_for_registered_email(
    password_reset_api: PasswordResetApiHarness,
):
    register_user(password_reset_api, email="reset.user@example.com")

    response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.user@example.com"},
    )

    assert response.status_code == 200
    body = response.json()
    assert (
        body["message"]
        == "If an account exists for that email, a password reset link has been sent."
    )

    with password_reset_api.session_factory() as session:
        user = session.scalar(select(User).where(User.email == "reset.user@example.com"))
        assert user is not None

        tokens = session.scalars(
            select(PasswordResetToken).where(PasswordResetToken.user_id == user.id)
        ).all()

        assert len(tokens) == 1
        reset_token = tokens[0]
        assert reset_token.token_hash
        assert reset_token.token_hash != body["message"]
        assert ensure_utc(reset_token.expires_at) > datetime.now(UTC)
        assert reset_token.consumed_at is None


def test_forgot_password_unknown_email_returns_same_response_and_creates_no_token(
    password_reset_api: PasswordResetApiHarness,
):
    register_user(password_reset_api, email="known.user@example.com")

    known_response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "known.user@example.com"},
    )
    unknown_response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "unknown.user@example.com"},
    )

    assert known_response.status_code == 200
    assert unknown_response.status_code == 200
    assert unknown_response.json() == known_response.json()

    with password_reset_api.session_factory() as session:
        unknown_user = session.scalar(select(User).where(User.email == "unknown.user@example.com"))
        assert unknown_user is None

        all_tokens = session.scalars(select(PasswordResetToken)).all()
        assert len(all_tokens) == 1


def test_reset_password_succeeds_with_valid_unexpired_unused_token(
    password_reset_api: PasswordResetApiHarness,
):
    register_user(password_reset_api, email="reset.success@example.com", password="OldPassword123!")

    forgot_response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.success@example.com"},
    )
    assert forgot_response.status_code == 200

    # Test mode exposes the raw token only through the captured dispatch payload, not logs.
    raw_token = get_last_dispatched_reset_token(password_reset_api)

    response = password_reset_api.client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "NewPassword123!",
        },
    )

    assert response.status_code == 200
    assert response.json()["message"] == "Password has been reset successfully."

    with password_reset_api.session_factory() as session:
        user = session.scalar(select(User).where(User.email == "reset.success@example.com"))
        assert user is not None
        assert verify_password("NewPassword123!", user.password_hash)
        assert not verify_password("OldPassword123!", user.password_hash)

        reset_token = session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw_token))
        )
        assert reset_token is not None
        assert reset_token.consumed_at is not None


def test_reset_password_rejects_expired_token(password_reset_api: PasswordResetApiHarness):
    register_user(password_reset_api, email="reset.expired@example.com")

    forgot_response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.expired@example.com"},
    )
    assert forgot_response.status_code == 200
    raw_token = get_last_dispatched_reset_token(password_reset_api)

    with password_reset_api.session_factory() as session:
        reset_token = session.scalar(
            select(PasswordResetToken).where(PasswordResetToken.token_hash == hash_token(raw_token))
        )
        assert reset_token is not None
        reset_token.expires_at = datetime.now(UTC) - timedelta(minutes=1)
        session.commit()

    response = password_reset_api.client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "NewPassword123!",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Password reset token expired"


def test_reset_password_rejects_already_used_token(password_reset_api: PasswordResetApiHarness):
    register_user(password_reset_api, email="reset.used@example.com")

    forgot_response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.used@example.com"},
    )
    assert forgot_response.status_code == 200
    raw_token = get_last_dispatched_reset_token(password_reset_api)

    first_response = password_reset_api.client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "NewPassword123!",
        },
    )
    assert first_response.status_code == 200

    second_response = password_reset_api.client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "AnotherPassword123!",
        },
    )

    assert second_response.status_code == 400
    assert second_response.json()["detail"] == "Password reset token has already been used"


def test_reset_password_invalidates_active_sessions(password_reset_api: PasswordResetApiHarness):
    register_user(
        password_reset_api, email="reset.sessions@example.com", password="OldPassword123!"
    )
    first_login = login_user(
        password_reset_api, email="reset.sessions@example.com", password="OldPassword123!"
    )
    second_login = login_user(
        password_reset_api, email="reset.sessions@example.com", password="OldPassword123!"
    )

    forgot_response = password_reset_api.client.post(
        "/api/v1/auth/forgot-password",
        json={"email": "reset.sessions@example.com"},
    )
    assert forgot_response.status_code == 200
    raw_token = get_last_dispatched_reset_token(password_reset_api)

    reset_response = password_reset_api.client.post(
        "/api/v1/auth/reset-password",
        json={
            "token": raw_token,
            "new_password": "NewPassword123!",
        },
    )
    assert reset_response.status_code == 200

    with password_reset_api.session_factory() as session:
        user = session.scalar(select(User).where(User.email == "reset.sessions@example.com"))
        assert user is not None
        sessions = session.scalars(select(AuthSession).where(AuthSession.user_id == user.id)).all()
        assert len(sessions) == 2
        assert all(auth_session.revoked_at is not None for auth_session in sessions)

    old_session_response = password_reset_api.client.get(
        "/api/v1/auth/me",
        headers={"Authorization": f"Bearer {first_login['access_token']}"},
    )
    assert old_session_response.status_code == 401

    old_refresh_response = password_reset_api.client.post(
        "/api/v1/auth/refresh",
        json={"refresh_token": second_login["refresh_token"]},
    )
    assert old_refresh_response.status_code == 401
