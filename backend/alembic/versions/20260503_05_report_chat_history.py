"""Add chat_history_json to reports table.

Revision ID: 20260503_05
Revises: 20260429_04
Create Date: 2026-05-03 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260503_05"
down_revision = "20260429_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("reports") as batch_op:
        batch_op.add_column(sa.Column("chat_history_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("reports") as batch_op:
        batch_op.drop_column("chat_history_json")
