from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, select
from .database import get_db
from .deps import get_current_user
from . import models, schemas

router = APIRouter(prefix="/profile", tags=["profile"])


@router.get("/tickets")
def tickets(db: Session = Depends(get_db), user=Depends(get_current_user)):
    tks = (
        db.query(models.Ticket)
        .filter(models.Ticket.user_id == user.id)
        .order_by(models.Ticket.draw_date.desc())
        .all()
    )
    draw_dates = [t.draw_date for t in tks]
    lotteries = (
        db.query(models.Lottery).filter(models.Lottery.draw_date.in_(draw_dates)).all()
        if draw_dates
        else []
    )
    by_date = {l.draw_date: l for l in lotteries}
    res = []
    for t in tks:
        lot = by_date.get(t.draw_date)
        res.append(
            {
                "id": t.id,
                "draw_date": t.draw_date,
                "winner_user_id": lot.winner_user_id if lot else None,
                "won": bool(lot and lot.winner_user_id == user.id),
            }
        )
    return {"tickets": res}


@router.post("")
def update_profile(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    name = payload.get("name")
    avatar = payload.get("avatar")
    if name is not None:
        name = str(name).strip()
        if not name:
            raise HTTPException(status_code=400, detail="昵称不能为空")
        if len(name) > 50:
            raise HTTPException(status_code=400, detail="昵称最多 50 个字符")
        user.name = name
    if avatar is not None:
        if len(str(avatar)) > 500:
            raise HTTPException(status_code=400, detail="头像地址过长")
        user.avatar = avatar
    db.commit()
    db.refresh(user)
    return {"user": {"id": user.id, "phone": user.phone, "name": user.name, "avatar": user.avatar}}


@router.get("/content", response_model=schemas.ProfileContentResponse)
def profile_content(db: Session = Depends(get_db), user=Depends(get_current_user)):
    """当前用户点赞过 / 收藏过的帖子，各带全站点赞收藏数。

    计数必须用相关子查询，不能 JOIN post_likes + outerjoin post_favorites 再 count()：
    那样两张表会产生行乘积（3 赞 × 2 藏 = 6 行），count(likes.id) 和 count(favorites.id)
    都返回 6，再叠加 where 过滤后两个数会一起塌成收藏数，赞数完全失真。
    """
    likes_count_sq = (
        select(func.count(models.PostLike.id))
        .where(models.PostLike.post_id == models.Post.id)
        .correlate(models.Post)
        .scalar_subquery()
    )
    favorites_count_sq = (
        select(func.count(models.PostFavorite.id))
        .where(models.PostFavorite.post_id == models.Post.id)
        .correlate(models.Post)
        .scalar_subquery()
    )

    def query_for(link_model):
        return (
            db.query(
                models.Post,
                likes_count_sq.label("likes_count"),
                favorites_count_sq.label("favorites_count"),
            )
            .join(link_model, link_model.post_id == models.Post.id)
            .filter(link_model.user_id == user.id)
            .order_by(models.Post.publish_date.desc())
            .all()
        )

    liked_rows = query_for(models.PostLike)
    favorited_rows = query_for(models.PostFavorite)

    # 一次性取出当前用户的点赞/收藏集合与图片，避免每帖再各查三次（原来是 N+1）
    post_ids = {row[0].id for row in liked_rows} | {row[0].id for row in favorited_rows}
    liked_ids: set[int] = set()
    favorited_ids: set[int] = set()
    images_by_post: dict[int, list] = {}
    if post_ids:
        liked_ids = {
            pid
            for (pid,) in db.query(models.PostLike.post_id).filter(
                models.PostLike.user_id == user.id,
                models.PostLike.post_id.in_(post_ids),
            )
        }
        favorited_ids = {
            pid
            for (pid,) in db.query(models.PostFavorite.post_id).filter(
                models.PostFavorite.user_id == user.id,
                models.PostFavorite.post_id.in_(post_ids),
            )
        }
        for img in (
            db.query(models.PostImage)
            .filter(models.PostImage.post_id.in_(post_ids))
            .order_by(models.PostImage.post_id, models.PostImage.sort)
        ):
            images_by_post.setdefault(img.post_id, []).append(img)

    def map_post(row):
        post, likes_count, favorites_count = row[0], row[1], row[2]
        return {
            "id": post.id,
            "title": post.title,
            "media_url": post.media_url,
            "publish_date": post.publish_date,
            "likes_count": likes_count or 0,
            "favorites_count": favorites_count or 0,
            "is_liked": post.id in liked_ids,
            "is_favorited": post.id in favorited_ids,
            "images": [
                {"url": img.url, "width": img.width, "height": img.height, "sort": img.sort}
                for img in images_by_post.get(post.id, [])
            ],
        }

    return {
        "likes": [map_post(row) for row in liked_rows],
        "favorites": [map_post(row) for row in favorited_rows],
    }
