"""add avatar to users

Revision ID: a1b2c3d4e5f6
Revises: 741c3de4a7ff
Create Date: 2026-04-01

"""
from alembic import op
import sqlalchemy as sa

revision = 'a1b2c3d4e5f6'
down_revision = '741c3de4a7ff'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('users', sa.Column('avatar', sa.String(500), nullable=True))


def downgrade():
    op.drop_column('users', 'avatar')
