"""Add image_width and image_height columns to files table

Revision ID: 002_image_dimensions
Revises: 001_phase6_perceptual_fields
Create Date: 2026-02-05

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '002_image_dimensions'
down_revision = '001_phase6_perceptual_fields'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add image dimension columns for caching ExifTool results."""
    op.add_column('files', sa.Column('image_width', sa.Integer(), nullable=True))
    op.add_column('files', sa.Column('image_height', sa.Integer(), nullable=True))


def downgrade() -> None:
    """Remove image dimension columns."""
    op.drop_column('files', 'image_height')
    op.drop_column('files', 'image_width')
