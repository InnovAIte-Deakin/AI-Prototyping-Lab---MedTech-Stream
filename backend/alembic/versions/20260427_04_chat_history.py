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
    inspector = sa.inspect(conn)
    column_names = {column["name"] for column in inspector.get_columns("reports")}
    if "chat_history_json" not in column_names:
        with op.batch_alter_table("reports") as batch_op:
            batch_op.add_column(sa.Column("chat_history_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("reports") as batch_op:
        batch_op.drop_column("chat_history_json")
