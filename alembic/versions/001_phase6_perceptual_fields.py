"""Phase 6: Rename duplicate_group_id to exact_group_id and add perceptual fields

Revision ID: 001_phase6_perceptual_fields
Revises:
Create Date: 2026-02-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001_phase6_perceptual_fields'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Upgrade database schema for two-tier duplicate detection.

    Uses direct SQL for SQLite column rename and additions.
    """
    # For SQLite, ALTER TABLE ... RENAME COLUMN is supported directly
    # Rename duplicate_group_id -> exact_group_id
    op.execute("ALTER TABLE files RENAME COLUMN duplicate_group_id TO exact_group_id")

    # Add new columns
    op.add_column('files', sa.Column('exact_group_confidence', sa.String(10), nullable=True))
    op.add_column('files', sa.Column('similar_group_id', sa.String(64), nullable=True))
    op.add_column('files', sa.Column('similar_group_confidence', sa.String(10), nullable=True))
    op.add_column('files', sa.Column('similar_group_type', sa.String(20), nullable=True))

    # Create index on similar_group_id
    op.create_index('ix_files_similar_group_id', 'files', ['similar_group_id'], unique=False)


def downgrade() -> None:
    """Downgrade database schema to pre-Phase-6 state."""
    # Drop index
    op.drop_index('ix_files_similar_group_id', table_name='files')

    # Drop new columns
    op.drop_column('files', 'similar_group_type')
    op.drop_column('files', 'similar_group_confidence')
    op.drop_column('files', 'similar_group_id')
    op.drop_column('files', 'exact_group_confidence')

    # Rename exact_group_id back to duplicate_group_id
    op.execute("ALTER TABLE files RENAME COLUMN exact_group_id TO duplicate_group_id")
