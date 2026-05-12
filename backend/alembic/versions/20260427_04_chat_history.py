"""Add chat_history_json to reports table.

Revision ID: 20260427_04
Revises: 20260423_03
Create Date: 2026-04-27 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260427_04"
down_revision = "20260423_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    conn = op.get_bind()
    exists = conn.execute(
        sa.text(
            "SELECT 1 FROM information_schema.columns "
            "WHERE table_name='reports' AND column_name='chat_history_json'"
        )
    ).fetchone()
    if not exists:
        with op.batch_alter_table("reports") as batch_op:
            batch_op.add_column(sa.Column("chat_history_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("reports") as batch_op:
        batch_op.drop_column("chat_history_json")
