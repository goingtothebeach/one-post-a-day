"""enforce one ticket per user per round and one post per day

Revision ID: b7e2f4c81a03
Revises: a1b2c3d4e5f6
Create Date: 2026-07-28

背景：
- tickets 之前没有 (user_id, draw_date) 唯一约束，/join 的「先查后插」在并发下
  会让同一个人拿到多张票，若按票抽奖则中签概率被放大。
- posts.publish_date 之前只有普通索引，「一天一帖」全靠应用层查询，连点可插两帖。

注意：加约束前必须先清理历史重复数据，否则 ALTER 会失败。
去重一律「保留 id 最小的那条」。

SQL 写法说明：先用 SELECT 把要删的 id 取到 Python 里，再按 id 删除。
这样既避开 MySQL「不能在子查询里 select 正在 delete 的表」的限制，
也不依赖 MySQL 专有的多表 DELETE 语法，本地 SQLite 同样能跑。
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b7e2f4c81a03'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _dup_ids(conn, table: str, key_cols: Sequence[str]) -> list[int]:
    """找出按 key_cols 重复的行里除 id 最小者之外的所有 id。"""
    on = " AND ".join(f"keep.{c} = t.{c}" for c in key_cols)
    rows = conn.execute(
        sa.text(f"SELECT t.id FROM {table} t JOIN {table} keep ON {on} AND keep.id < t.id")
    )
    return sorted({row[0] for row in rows})


def _delete_by_ids(conn, table: str, column: str, ids: Sequence[int]) -> None:
    if not ids:
        return
    conn.execute(
        sa.text(f"DELETE FROM {table} WHERE {column} IN :ids").bindparams(
            sa.bindparam('ids', expanding=True)
        ),
        {'ids': list(ids)},
    )


def upgrade() -> None:
    conn = op.get_bind()

    # 1) 同一个人同一轮的重复票
    _delete_by_ids(conn, 'tickets', 'id', _dup_ids(conn, 'tickets', ['user_id', 'draw_date']))

    # 2) 同一天的重复帖子：先清掉将被删帖子的图片/点赞/收藏，再删帖子本身
    dup_posts = _dup_ids(conn, 'posts', ['publish_date'])
    for child in ('post_images', 'post_likes', 'post_favorites'):
        _delete_by_ids(conn, child, 'post_id', dup_posts)
    _delete_by_ids(conn, 'posts', 'id', dup_posts)

    # 3) 加唯一约束。batch_alter_table 让 SQLite 也能加（它不支持 ALTER ADD CONSTRAINT）
    with op.batch_alter_table('tickets') as batch:
        batch.create_unique_constraint('uq_ticket_user_draw', ['user_id', 'draw_date'])
    with op.batch_alter_table('posts') as batch:
        batch.create_unique_constraint('uq_post_publish_date', ['publish_date'])


def downgrade() -> None:
    with op.batch_alter_table('posts') as batch:
        batch.drop_constraint('uq_post_publish_date', type_='unique')
    with op.batch_alter_table('tickets') as batch:
        batch.drop_constraint('uq_ticket_user_draw', type_='unique')
