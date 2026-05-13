"""Widen notification kind enum storage.

Revision ID: 20260513_06
Revises: 20260502_04
Create Date: 2026-05-13
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260513_06"
down_revision = "20260502_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.alter_column(
            "kind",
            existing_type=sa.String(length=13),
            type_=sa.String(length=32),
            existing_nullable=False,
        )


def downgrade() -> None:
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.alter_column(
            "kind",
            existing_type=sa.String(length=32),
            type_=sa.String(length=13),
            existing_nullable=False,
        )

