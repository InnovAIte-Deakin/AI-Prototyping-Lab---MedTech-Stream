from __future__ import annotations

from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from .models import Role

CORE_ROLE_NAMES = ("patient", "caregiver", "clinician")


def _role_query(role_names: Iterable[str]):
    return select(Role).where(Role.name.in_(tuple(role_names))).order_by(Role.name)


def seed_core_roles(session: Session) -> list[Role]:
    existing = {role.name for role in session.scalars(_role_query(CORE_ROLE_NAMES)).all()}
    for role_name in CORE_ROLE_NAMES:
        if role_name not in existing:
            session.add(Role(name=role_name))
    session.flush()
    return list(session.scalars(_role_query(CORE_ROLE_NAMES)).all())


async def seed_core_roles_async(session: AsyncSession) -> list[Role]:
    result = await session.scalars(_role_query(CORE_ROLE_NAMES))
    existing = {role.name for role in result.all()}
    for role_name in CORE_ROLE_NAMES:
        if role_name not in existing:
            session.add(Role(name=role_name))
    await session.flush()
    result = await session.scalars(_role_query(CORE_ROLE_NAMES))
    return list(result.all())
