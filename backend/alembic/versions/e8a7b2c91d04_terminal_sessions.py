"""terminal settings and player terminal sessions

Revision ID: e8a7b2c91d04
Revises: d47a1b9c2f30
Create Date: 2026-07-15 10:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'e8a7b2c91d04'
down_revision: Union[str, Sequence[str], None] = 'd47a1b9c2f30'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'terminal_settings',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('enabled', sa.Boolean(), nullable=False),
        sa.Column('image', sa.String(), nullable=False),
        sa.Column('default_minutes', sa.Integer(), nullable=False),
        sa.Column('extension_minutes', sa.Integer(), nullable=False),
        sa.Column('max_extensions', sa.Integer(), nullable=False),
        sa.Column('command_timeout_seconds', sa.Integer(), nullable=False),
        sa.Column('network_enabled', sa.Boolean(), nullable=False),
        sa.Column('memory_limit', sa.String(), nullable=False),
        sa.Column('cpu_quota', sa.Integer(), nullable=False),
        sa.Column('updated_by', sa.Integer(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['updated_by'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_terminal_settings_id'), 'terminal_settings', ['id'], unique=False)

    op.create_table(
        'terminal_sessions',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('player_id', sa.Integer(), nullable=False),
        sa.Column('lab_id', sa.Integer(), nullable=True),
        sa.Column('container_id', sa.String(), nullable=True),
        sa.Column('container_name', sa.String(), nullable=True),
        sa.Column('image', sa.String(), nullable=False),
        sa.Column('status', sa.String(), nullable=False),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('extensions_used', sa.Integer(), nullable=False),
        sa.Column('last_command', sa.Text(), nullable=True),
        sa.Column('last_error', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['lab_id'], ['player_labs.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['player_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_terminal_sessions_id'), 'terminal_sessions', ['id'], unique=False)
    op.create_index(op.f('ix_terminal_sessions_player_id'), 'terminal_sessions', ['player_id'], unique=False)
    op.create_index(op.f('ix_terminal_sessions_lab_id'), 'terminal_sessions', ['lab_id'], unique=False)
    op.create_index(op.f('ix_terminal_sessions_container_name'), 'terminal_sessions', ['container_name'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_terminal_sessions_container_name'), table_name='terminal_sessions')
    op.drop_index(op.f('ix_terminal_sessions_lab_id'), table_name='terminal_sessions')
    op.drop_index(op.f('ix_terminal_sessions_player_id'), table_name='terminal_sessions')
    op.drop_index(op.f('ix_terminal_sessions_id'), table_name='terminal_sessions')
    op.drop_table('terminal_sessions')
    op.drop_index(op.f('ix_terminal_settings_id'), table_name='terminal_settings')
    op.drop_table('terminal_settings')
