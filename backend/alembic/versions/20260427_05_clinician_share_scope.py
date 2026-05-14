"""Add view_scope and include_doctor_summary to consent_shares.

Revision ID: 20260427_05
Revises: 20260427_04
Create Date: 2026-04-27 00:00:00
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260427_05"
down_revision = "20260427_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("consent_shares") as batch_op:
        batch_op.add_column(
            sa.Column(
                "view_scope",
                sa.String(length=40),
                nullable=False,
                server_default="summary_only",
            )
        )
        batch_op.add_column(
            sa.Column(
                "include_doctor_summary",
                sa.Boolean(),
                nullable=False,
                server_default=sa.false(),
            )
        )


def downgrade() -> None:
    with op.batch_alter_table("consent_shares") as batch_op:
        batch_op.drop_column("include_doctor_summary")
        batch_op.drop_column("view_scope")
