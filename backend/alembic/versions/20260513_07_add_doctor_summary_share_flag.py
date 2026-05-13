"""Add doctor summary flag to consent shares.

Revision ID: 20260513_07
Revises: 20260513_06
Create Date: 2026-05-13
"""

from __future__ import annotations

import sqlalchemy as sa

from alembic import op

revision = "20260513_07"
down_revision = "20260513_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("consent_shares") as batch_op:
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
