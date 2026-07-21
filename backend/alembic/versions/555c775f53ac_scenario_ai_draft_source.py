"""AI-to-Draft-Lab: source provenance fields on scenarios

Adds the columns needed so a Scenario ("Lab") can be created directly from
an AI Generator / Threat Feed article and tracked through the existing
draft -> generating -> ready -> published lifecycle. No existing column is
modified or removed.

Revision ID: 555c775f53ac
Revises: d47a1b9c2f30
Create Date: 2026-07-14 12:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '555c775f53ac'
down_revision: Union[str, Sequence[str], None] = 'd47a1b9c2f30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column('scenarios', sa.Column('created_from_ai', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('scenarios', sa.Column('source_url', sa.String(), nullable=True))
    op.add_column('scenarios', sa.Column('source_title', sa.String(), nullable=True))
    op.add_column('scenarios', sa.Column('source_article', sa.Text(), nullable=True))
    op.add_column('scenarios', sa.Column('ai_prompt', sa.Text(), nullable=True))
    op.add_column('scenarios', sa.Column('draft_version', sa.Integer(), nullable=False, server_default=sa.text('1')))
    op.add_column('scenarios', sa.Column('approved_by', sa.Integer(), nullable=True))
    op.add_column('scenarios', sa.Column('approved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('scenarios', sa.Column('published_at', sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        'fk_scenarios_approved_by_users', 'scenarios', 'users', ['approved_by'], ['id']
    )
    op.create_index(op.f('ix_scenarios_source_url'), 'scenarios', ['source_url'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_scenarios_source_url'), table_name='scenarios')
    op.drop_constraint('fk_scenarios_approved_by_users', 'scenarios', type_='foreignkey')
    op.drop_column('scenarios', 'published_at')
    op.drop_column('scenarios', 'approved_at')
    op.drop_column('scenarios', 'approved_by')
    op.drop_column('scenarios', 'draft_version')
    op.drop_column('scenarios', 'ai_prompt')
    op.drop_column('scenarios', 'source_article')
    op.drop_column('scenarios', 'source_title')
    op.drop_column('scenarios', 'source_url')
    op.drop_column('scenarios', 'created_from_ai')
