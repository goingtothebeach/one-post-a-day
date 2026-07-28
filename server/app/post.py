from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, joinedload
from .database import get_db
from .deps import get_current_user, get_current_user_optional
from . import models, schemas
from .timewin import current_draw_date, now_shanghai, post_deadline

router = APIRouter(prefix="/post", tags=["post"])

TITLE_MAX = 100
CONTENT_MAX = 2000


def get_post_window():
    """返回 (draw_date, deadline)：当前活跃轮次及其发帖截止时间（次日 18:00）。"""
    draw_date = current_draw_date()
    return draw_date, post_deadline(draw_date)

@router.get("/feed")
def feed(
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user_optional),
):
    """获取 Feed 流，包含点赞/收藏统计信息（可选登录）。

    计数与「我是否赞过」都用批量查询一次取回，避免每帖 4 条 SQL 的 N+1。
    """
    limit = max(1, min(limit, 100))
    offset = max(0, offset)

    posts = (
        db.query(models.Post)
        .options(joinedload(models.Post.author))
        .order_by(models.Post.publish_date.desc())
        .limit(limit)
        .offset(offset)
        .all()
    )
    if not posts:
        return {"posts": []}

    post_ids = [p.id for p in posts]

    likes_counts = dict(
        db.query(models.PostLike.post_id, func.count(models.PostLike.id))
        .filter(models.PostLike.post_id.in_(post_ids))
        .group_by(models.PostLike.post_id)
        .all()
    )
    favorites_counts = dict(
        db.query(models.PostFavorite.post_id, func.count(models.PostFavorite.id))
        .filter(models.PostFavorite.post_id.in_(post_ids))
        .group_by(models.PostFavorite.post_id)
        .all()
    )

    liked_ids: set[int] = set()
    favorited_ids: set[int] = set()
    if user:
        liked_ids = {
            pid
            for (pid,) in db.query(models.PostLike.post_id).filter(
                models.PostLike.post_id.in_(post_ids),
                models.PostLike.user_id == user.id,
            )
        }
        favorited_ids = {
            pid
            for (pid,) in db.query(models.PostFavorite.post_id).filter(
                models.PostFavorite.post_id.in_(post_ids),
                models.PostFavorite.user_id == user.id,
            )
        }

    images_by_post: dict[int, list] = {}
    for img in (
        db.query(models.PostImage)
        .filter(models.PostImage.post_id.in_(post_ids))
        .order_by(models.PostImage.post_id, models.PostImage.sort)
    ):
        images_by_post.setdefault(img.post_id, []).append(img)

    result = []
    for post in posts:
        result.append(
            {
                "id": post.id,
                "author_id": post.author_id,
                # 不下发 phone：feed 是【公开】接口（未登录也能读），
                # 泄露作者手机号毫无必要，前端只用 name/avatar 展示
                "author": {
                    "id": post.author.id,
                    "name": post.author.name,
                    "avatar": post.author.avatar,
                },
                "title": post.title,
                "content": post.content,
                "media_url": post.media_url,
                "media_width": post.media_width,
                "media_height": post.media_height,
                "publish_date": post.publish_date,
                "created_at": post.created_at,
                "likes_count": likes_counts.get(post.id, 0),
                "favorites_count": favorites_counts.get(post.id, 0),
                "is_liked": post.id in liked_ids,
                "is_favorited": post.id in favorited_ids,
                "images": [
                    {
                        "url": img.url,
                        "width": img.width,
                        "height": img.height,
                        "sort": img.sort,
                    }
                    for img in images_by_post.get(post.id, [])
                ],
            }
        )

    return {"posts": result}

@router.post("")
def create_post(payload: schemas.PostCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    title = (payload.title or "").strip()
    content = (payload.content or "").strip()
    if not title or not content:
        raise HTTPException(status_code=400, detail="missing fields")
    # DB 列宽是 title(200)/content(2000)，不校验会直接抛 DataError 变成 500
    if len(title) > TITLE_MAX:
        raise HTTPException(status_code=400, detail=f"标题最多 {TITLE_MAX} 个字符")
    if len(content) > CONTENT_MAX:
        raise HTTPException(status_code=400, detail=f"内容最多 {CONTENT_MAX} 个字符")

    draw_date, deadline = get_post_window()
    now = now_shanghai()
    # 注意：由于 draw_date 本身随 18:00 翻转，deadline 恒为 draw_date+42h，
    # 这个判断在当前时间模型下永不触发（属防御性冗余）。真正拦住过期发帖的是
    # 下面的「本轮赢家是不是你」——过了 18:00 轮次就换了，上一轮赢家自然不再匹配。
    if now >= deadline:
        raise HTTPException(status_code=403, detail="post deadline passed")
    lottery = db.query(models.Lottery).filter(models.Lottery.draw_date == draw_date).first()
    if not lottery or lottery.winner_user_id != user.id:
        raise HTTPException(status_code=403, detail="not winner")
    existing = db.query(models.Post).filter(models.Post.publish_date == draw_date).first()
    if existing:
        raise HTTPException(status_code=400, detail="post already exists")

    post = models.Post(
        author_id=user.id,
        title=title,
        content=content,
        media_url=payload.mediaUrl,
        media_width=payload.mediaWidth,
        media_height=payload.mediaHeight,
        publish_date=draw_date,
    )
    db.add(post)
    try:
        db.flush()
    except IntegrityError:
        # publish_date 唯一约束兜底：并发/连点时另一个请求已抢先写入
        db.rollback()
        raise HTTPException(status_code=400, detail="post already exists")

    if payload.images:
        for idx, img in enumerate(payload.images[:6]):
            db.add(
                models.PostImage(
                    post_id=post.id,
                    url=img.url,
                    width=img.width,
                    height=img.height,
                    sort=img.sort if img.sort is not None else idx,
                )
            )

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=400, detail="post already exists")
    db.refresh(post)
    return {"post": post}

@router.delete("/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="not found")
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    # 删除权限跟发帖窗口对齐，而不是比「自然日」：
    # 帖子的 publish_date 存的是 draw_date，晚上 19:00 发的帖第二天早上仍在窗口内，
    # 用自然日比较会让作者在自己还能改的时段里删不掉。
    draw_date, deadline = get_post_window()
    if post.publish_date != draw_date or now_shanghai() >= deadline:
        raise HTTPException(status_code=400, detail="超出可删除时间（仅本轮发帖窗口内可删）")
    db.query(models.PostImage).filter(models.PostImage.post_id == post_id).delete()
    db.query(models.PostLike).filter(models.PostLike.post_id == post_id).delete()
    db.query(models.PostFavorite).filter(models.PostFavorite.post_id == post_id).delete()
    db.delete(post)
    db.commit()
    return {"ok": True}

def _toggle(db: Session, model, post_id: int, user_id: int, field: str) -> dict:
    """点赞/收藏的开关。

    并发两次点击时，两个请求可能都查不到已有记录、都去插入，
    第二个会撞 (user_id, post_id) 唯一约束。捕获后视作「已经是开启状态」，
    返回 200 而不是把 IntegrityError 漏成 500。
    """
    existing = (
        db.query(model)
        .filter(model.post_id == post_id, model.user_id == user_id)
        .first()
    )
    if existing:
        db.delete(existing)
        db.commit()
        return {"ok": True, field: False}

    db.add(model(post_id=post_id, user_id=user_id))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
    return {"ok": True, field: True}


@router.post("/{post_id}/like")
def like_post(post_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    return _toggle(db, models.PostLike, post_id, user.id, "liked")


@router.post("/{post_id}/favorite")
def favorite_post(post_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    return _toggle(db, models.PostFavorite, post_id, user.id, "favorited")
