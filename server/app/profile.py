from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from .database import get_db
from .deps import get_current_user
from . import models, schemas

router = APIRouter(prefix="/profile", tags=["profile"])

@router.get("/tickets")
def tickets(db: Session = Depends(get_db), user=Depends(get_current_user)):
    tks = db.query(models.Ticket).filter(models.Ticket.user_id == user.id).order_by(models.Ticket.draw_date.desc()).all()
    lotteries = db.query(models.Lottery).filter(models.Lottery.draw_date.in_([t.draw_date for t in tks])).all()
    res = []
    for t in tks:
        lot = next((l for l in lotteries if l.draw_date == t.draw_date), None)
        res.append({"id": t.id, "draw_date": t.draw_date, "winner_user_id": lot.winner_user_id if lot else None})
    return {"tickets": res}

@router.post("")
def update_profile(payload: dict, db: Session = Depends(get_db), user=Depends(get_current_user)):
    name = payload.get("name")
    avatar = payload.get("avatar")
    if name is not None:
        user.name = name
    if avatar is not None:
        user.avatar = avatar
    db.commit()
    db.refresh(user)
    return {"user": {"id": user.id, "phone": user.phone, "name": user.name, "avatar": user.avatar}}

@router.get("/content", response_model=schemas.ProfileContentResponse)
def profile_content(db: Session = Depends(get_db), user=Depends(get_current_user)):
    likes = (
        db.query(models.Post, func.count(models.PostLike.id).label("likes_count"), func.count(models.PostFavorite.id).label("favorites_count"))
        .join(models.PostLike, models.PostLike.post_id == models.Post.id)
        .outerjoin(models.PostFavorite, models.PostFavorite.post_id == models.Post.id)
        .filter(models.PostLike.user_id == user.id)
        .group_by(models.Post.id)
        .order_by(models.Post.publish_date.desc())
        .all()
    )

    favorites = (
        db.query(models.Post, func.count(models.PostLike.id).label("likes_count"), func.count(models.PostFavorite.id).label("favorites_count"))
        .join(models.PostFavorite, models.PostFavorite.post_id == models.Post.id)
        .outerjoin(models.PostLike, models.PostLike.post_id == models.Post.id)
        .filter(models.PostFavorite.user_id == user.id)
        .group_by(models.Post.id)
        .order_by(models.Post.publish_date.desc())
        .all()
    )

    def map_post(row):
        post = row[0]
        likes_count = row[1]
        favorites_count = row[2]
        is_liked = db.query(models.PostLike).filter(models.PostLike.post_id == post.id, models.PostLike.user_id == user.id).first() is not None
        is_favorited = db.query(models.PostFavorite).filter(models.PostFavorite.post_id == post.id, models.PostFavorite.user_id == user.id).first() is not None
        images = db.query(models.PostImage).filter(models.PostImage.post_id == post.id).order_by(models.PostImage.sort).all()
        return {
            "id": post.id,
            "title": post.title,
            "media_url": post.media_url,
            "publish_date": post.publish_date,
            "likes_count": likes_count,
            "favorites_count": favorites_count,
            "is_liked": is_liked,
            "is_favorited": is_favorited,
            "images": [{"url": img.url, "width": img.width, "height": img.height, "sort": img.sort} for img in images],
        }

    return {
        "likes": [map_post(row) for row in likes],
        "favorites": [map_post(row) for row in favorites],
    }
