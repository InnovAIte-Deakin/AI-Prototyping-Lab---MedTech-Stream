from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, select
from sqlalchemy.orm import Session, sessionmaker

from app.db.models import Report, User
from app.main import create_app
from app.services.auth import hash_password
from tests.factories import PersistenceFactory


@dataclass
class ConsentApiHarness:
    client: TestClient
    session_factory: sessionmaker


@pytest.fixture()
def consent_api(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> ConsentApiHarness:
    db_path = tmp_path / "consent-api.sqlite3"
    sync_database_url = f"sqlite:///{db_path.resolve().as_posix()}"
    async_database_url = f"sqlite+aiosqlite:///{db_path.resolve().as_posix()}"

    monkeypatch.setenv("DATABASE_URL", async_database_url)
    monkeypatch.setenv("AUTH_SECRET_KEY", "reportx-test-auth-secret-key-with-32-bytes")

    engine = create_engine(sync_database_url, future=True)
    session_factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    app = create_app()
    with TestClient(app) as client:
        yield ConsentApiHarness(client=client, session_factory=session_factory)

    engine.dispose()


def seed_user(
    session: Session,
    *,
    email: str,
    role: str,
    password: str = "Password123!",
    display_name: str | None = None,
) -> User:
    factory = PersistenceFactory(session)
    user = factory.create_user(
        email=email,
        display_name=display_name or email.split("@")[0],
        password_hash=hash_password(password),
        roles=[role],
    )
    session.commit()
    return user


def login(consent_api: ConsentApiHarness, *, email: str, password: str = "Password123!") -> str:
    response = consent_api.client.post(
        "/api/v1/auth/login",
        json={"email": email, "password": password},
    )
    assert response.status_code == 200, response.text
    return response.json()["access_token"]


def seed_report(session: Session, *, subject_email: str, created_by_email: str) -> Report:
    factory = PersistenceFactory(session)
    subject = session.scalar(select(User).where(User.email == subject_email))
    created_by = session.scalar(select(User).where(User.email == created_by_email))
    assert subject is not None
    assert created_by is not None
    report = factory.create_report(subject=subject, created_by=created_by)
    session.commit()
    return report


def auth_headers(access_token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {access_token}"}
