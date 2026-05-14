"""Keep doctor summary share flag migration chain-compatible.

Revision ID: 20260513_07
Revises: 20260503_08
Create Date: 2026-05-13
"""

from __future__ import annotations

revision = "20260513_07"
down_revision = "20260503_08"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The column was already introduced in revision 20260427_05, which is
    # included in this branch through the 20260503_06/07 merge revisions.
    # Leave this revision as a chain marker so databases that have already
    # stamped it keep a valid migration history without trying to add the
    # same column twice on fresh installs.
    pass


def downgrade() -> None:
    pass
