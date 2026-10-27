"""create_domestic_silver_snapshots

Revision ID: a1b2c3d4e5f6
Revises: 98374ade769f
Create Date: 2026-10-26 21:18:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '98374ade769f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema to include domestic_silver_snapshots."""
    op.create_table(
        'domestic_silver_snapshots',
        sa.Column('id', sa.String(length=64), nullable=False),
        sa.Column('city', sa.String(length=100), nullable=False),
        sa.Column('date', sa.String(length=20), nullable=False),
        sa.Column('market', sa.String(length=100), server_default='Indian Market', nullable=False),
        sa.Column('currency', sa.String(length=10), server_default='INR', nullable=False),
        sa.Column('price_per_kg', sa.Float(), nullable=False),
        sa.Column('base_price_1g', sa.Float(), nullable=False),
        sa.Column('gst_amount_1g', sa.Float(), nullable=False),
        sa.Column('final_price_1g', sa.Float(), nullable=False),
        sa.Column('price_10g', sa.Float(), nullable=True),
        sa.Column('price_100g', sa.Float(), nullable=True),
        sa.Column('spot_usd_oz', sa.Float(), nullable=True),
        sa.Column('usd_inr', sa.Float(), nullable=True),
        sa.Column('import_duty_pct', sa.Float(), server_default='15.0', nullable=False),
        sa.Column('gst_rate_pct', sa.Float(), server_default='3.0', nullable=False),
        sa.Column('retail_spread_pct', sa.Float(), server_default='13.6', nullable=False),
        sa.Column('source_timestamp', sa.String(length=50), nullable=True),
        sa.Column('fetch_timestamp', sa.String(length=50), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('(CURRENT_TIMESTAMP)'), nullable=False),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index('idx_domestic_silver_city_date', 'domestic_silver_snapshots', ['city', 'date'], unique=True)
    op.create_index(op.f('ix_domestic_silver_snapshots_city'), 'domestic_silver_snapshots', ['city'], unique=False)
    op.create_index(op.f('ix_domestic_silver_snapshots_date'), 'domestic_silver_snapshots', ['date'], unique=False)


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_index(op.f('ix_domestic_silver_snapshots_date'), table_name='domestic_silver_snapshots')
    op.drop_index(op.f('ix_domestic_silver_snapshots_city'), table_name='domestic_silver_snapshots')
    op.drop_index('idx_domestic_silver_city_date', table_name='domestic_silver_snapshots')
    op.drop_table('domestic_silver_snapshots')
