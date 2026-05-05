"""Add resource fields to notifications.

Revision ID: 20260429_04
Revises: 20260423_03
Create Date: 2026-04-29 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260429_04"
down_revision = "20260423_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.add_column(sa.Column("resource_type", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("resource_id", sa.String(length=36), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("notifications") as batch_op:
        batch_op.drop_column("resource_id")
        batch_op.drop_column("resource_type")
