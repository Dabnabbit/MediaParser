"""add indexes on discarded, processing_error, final_timestamp

Revision ID: 8ad2b0baef0f
Revises: 002_image_dimensions
Create Date: 2026-02-19 01:13:58.737221

"""
from typing import Sequence, Union

from alembic import op


# revision identifiers, used by Alembic.
revision: str = '8ad2b0baef0f'
down_revision: Union[str, Sequence[str], None] = '002_image_dimensions'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Add indexes on frequently filtered File columns."""
    op.create_index('ix_files_discarded', 'files', ['discarded'], if_not_exists=True)
    op.create_index('ix_files_processing_error', 'files', ['processing_error'], if_not_exists=True)
    op.create_index('ix_files_final_timestamp', 'files', ['final_timestamp'], if_not_exists=True)


def downgrade() -> None:
    """Remove added indexes."""
    op.drop_index('ix_files_final_timestamp', 'files')
    op.drop_index('ix_files_processing_error', 'files')
    op.drop_index('ix_files_discarded', 'files')
