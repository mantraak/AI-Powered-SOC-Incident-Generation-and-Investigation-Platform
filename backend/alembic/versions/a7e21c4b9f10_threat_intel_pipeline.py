"""Automated threat-intelligence pipeline: runs, candidates, scenario provenance.

Purely additive:

* creates ``threat_feed_runs`` and ``threat_candidates``;
* adds nullable/defaulted provenance columns to ``scenarios``.

No existing column is altered or dropped and no data is removed, so the
downgrade simply reverses those additions.

Revision ID: a7e21c4b9f10
Revises: 555c775f53ac
Create Date: 2026-08-08

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision: str = 'a7e21c4b9f10'
down_revision: Union[str, Sequence[str], None] = '555c775f53ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# create_type=False: the types are created once, explicitly, in upgrade(); letting
# create_table() create them again fails with "type already exists" on PostgreSQL.
run_status = postgresql.ENUM(
    'running', 'completed', 'partial', 'failed',
    name='threatfeedrunstatus', create_type=False,
)
candidate_status = postgresql.ENUM(
    'identified', 'selected', 'generating', 'lab_created', 'failed', 'duplicate',
    name='threatcandidatestatus', create_type=False,
)


def upgrade() -> None:
    bind = op.get_bind()
    run_status.create(bind, checkfirst=True)
    candidate_status.create(bind, checkfirst=True)

    op.create_table(
        'threat_feed_runs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', run_status, nullable=False, server_default='running'),
        sa.Column('trigger', sa.String(), nullable=False, server_default='scheduled'),
        sa.Column('articles_processed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('unique_threats_identified', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('threats_selected', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('labs_created', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('labs_failed', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('errors', sa.JSON(), nullable=True),
        sa.Column('triggered_by', sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(['triggered_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_threat_feed_runs_id'), 'threat_feed_runs', ['id'], unique=False)

    op.create_table(
        'threat_candidates',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('fingerprint', sa.String(length=64), nullable=False),
        sa.Column('run_id', sa.Integer(), nullable=True),
        sa.Column('last_seen_run_id', sa.Integer(), nullable=True),
        sa.Column('title', sa.String(), nullable=False),
        sa.Column('summary', sa.Text(), nullable=True),
        sa.Column('category', sa.String(), nullable=True),
        sa.Column('severity', sa.String(), nullable=True),
        sa.Column('active_exploitation', sa.Boolean(), nullable=False, server_default=sa.text('false')),
        sa.Column('threat_score', sa.Float(), nullable=False, server_default='0'),
        sa.Column('score_breakdown', sa.JSON(), nullable=True),
        sa.Column('rank', sa.Integer(), nullable=True),
        sa.Column('cve_ids', sa.JSON(), nullable=True),
        sa.Column('malware_names', sa.JSON(), nullable=True),
        sa.Column('threat_actors', sa.JSON(), nullable=True),
        sa.Column('affected_products', sa.JSON(), nullable=True),
        sa.Column('iocs', sa.JSON(), nullable=True),
        sa.Column('mitre_techniques', sa.JSON(), nullable=True),
        sa.Column('source_url', sa.String(), nullable=True),
        sa.Column('source_title', sa.String(), nullable=True),
        sa.Column('sources', sa.JSON(), nullable=True),
        sa.Column('article_ids', sa.JSON(), nullable=True),
        sa.Column('article_count', sa.Integer(), nullable=False, server_default='1'),
        sa.Column('article_text', sa.Text(), nullable=True),
        sa.Column('published_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('status', candidate_status, nullable=False, server_default='identified'),
        sa.Column('scenario_id', sa.Integer(), nullable=True),
        sa.Column('error', sa.Text(), nullable=True),
        sa.Column('first_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('last_seen_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['run_id'], ['threat_feed_runs.id'], ),
        sa.ForeignKeyConstraint(['last_seen_run_id'], ['threat_feed_runs.id'], ),
        sa.ForeignKeyConstraint(['scenario_id'], ['scenarios.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_threat_candidates_id'), 'threat_candidates', ['id'], unique=False)
    op.create_index(
        op.f('ix_threat_candidates_fingerprint'), 'threat_candidates', ['fingerprint'], unique=True
    )
    op.create_index(op.f('ix_threat_candidates_run_id'), 'threat_candidates', ['run_id'], unique=False)

    # Scenario provenance for automatically generated labs.
    op.add_column('scenarios', sa.Column(
        'auto_generated', sa.Boolean(), nullable=False, server_default=sa.text('false')
    ))
    op.add_column('scenarios', sa.Column('threat_score', sa.Float(), nullable=True))
    op.add_column('scenarios', sa.Column('threat_rank', sa.Integer(), nullable=True))
    op.add_column('scenarios', sa.Column('threat_category', sa.String(), nullable=True))
    op.add_column('scenarios', sa.Column('threat_severity', sa.String(), nullable=True))
    op.add_column('scenarios', sa.Column(
        'active_exploitation', sa.Boolean(), nullable=False, server_default=sa.text('false')
    ))
    op.add_column('scenarios', sa.Column('threat_fingerprint', sa.String(length=64), nullable=True))
    op.add_column('scenarios', sa.Column('threat_feed_run_id', sa.Integer(), nullable=True))
    op.add_column('scenarios', sa.Column('auto_generated_at', sa.DateTime(timezone=True), nullable=True))
    op.create_index(
        op.f('ix_scenarios_threat_fingerprint'), 'scenarios', ['threat_fingerprint'], unique=False
    )
    op.create_foreign_key(
        'fk_scenarios_threat_feed_run_id', 'scenarios', 'threat_feed_runs',
        ['threat_feed_run_id'], ['id'],
    )


def downgrade() -> None:
    op.drop_constraint('fk_scenarios_threat_feed_run_id', 'scenarios', type_='foreignkey')
    op.drop_index(op.f('ix_scenarios_threat_fingerprint'), table_name='scenarios')
    for column in (
        'auto_generated_at', 'threat_feed_run_id', 'threat_fingerprint', 'active_exploitation',
        'threat_severity', 'threat_category', 'threat_rank', 'threat_score', 'auto_generated',
    ):
        op.drop_column('scenarios', column)

    op.drop_index(op.f('ix_threat_candidates_run_id'), table_name='threat_candidates')
    op.drop_index(op.f('ix_threat_candidates_fingerprint'), table_name='threat_candidates')
    op.drop_index(op.f('ix_threat_candidates_id'), table_name='threat_candidates')
    op.drop_table('threat_candidates')

    op.drop_index(op.f('ix_threat_feed_runs_id'), table_name='threat_feed_runs')
    op.drop_table('threat_feed_runs')

    bind = op.get_bind()
    candidate_status.drop(bind, checkfirst=True)
    run_status.drop(bind, checkfirst=True)
