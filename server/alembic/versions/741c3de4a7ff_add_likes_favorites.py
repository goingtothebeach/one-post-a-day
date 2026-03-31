"""add likes favorites

Revision ID: 741c3de4a7ff
Revises: 
Create Date: 2026-01-30 17:58:45.179606

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '741c3de4a7ff'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'post_likes',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_unique_constraint('uq_post_like_user_post', 'post_likes', ['user_id', 'post_id'])

    op.create_table(
        'post_favorites',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id'), nullable=False),
        sa.Column('created_at', sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_unique_constraint('uq_post_fav_user_post', 'post_favorites', ['user_id', 'post_id'])

    op.add_column('posts', sa.Column('media_width', sa.Integer(), nullable=True))
    op.add_column('posts', sa.Column('media_height', sa.Integer(), nullable=True))

    op.create_table(
        'post_images',
        sa.Column('id', sa.Integer(), primary_key=True, index=True),
        sa.Column('post_id', sa.Integer(), sa.ForeignKey('posts.id'), nullable=False),
        sa.Column('url', sa.String(500), nullable=False),
        sa.Column('width', sa.Integer(), nullable=True),
        sa.Column('height', sa.Integer(), nullable=True),
        sa.Column('sort', sa.Integer(), nullable=True, server_default='0'),
    )


def downgrade() -> None:
    op.drop_table('post_images')
    op.drop_column('posts', 'media_height')
    op.drop_column('posts', 'media_width')
    op.drop_constraint('uq_post_fav_user_post', 'post_favorites', type_='unique')
    op.drop_table('post_favorites')
    op.drop_constraint('uq_post_like_user_post', 'post_likes', type_='unique')
    op.drop_table('post_likes')
