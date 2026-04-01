from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .deps import get_current_user, get_current_user_optional
from . import models, schemas

router = APIRouter(prefix="/post", tags=["post"])

def today_start():
    now = datetime.now()
    return datetime(year=now.year, month=now.month, day=now.day)

def get_post_window():
    """
    返回 (draw_date, deadline)
    draw_date: 本次抽签对应的日期零点
    deadline: 允许发帖的截止时间（次日 18:00，即下一轮抽签开始前）
    规则：18:00 前看昨天的抽签；18:00 后看今天的抽签
    """
    now = datetime.now()
    today = datetime(now.year, now.month, now.day)
    if now.hour < 18:
        draw_date = today - timedelta(days=1)
    else:
        draw_date = today
    deadline = draw_date + timedelta(days=1, hours=18)
    return draw_date, deadline

@router.get("/feed")
def feed(db: Session = Depends(get_db), user=Depends(get_current_user_optional)):
    """获取Feed流，包含点赞/收藏统计信息（可选登录）"""
    posts = db.query(models.Post).order_by(models.Post.publish_date.desc()).all()
    
    result = []
    for post in posts:
        # 统计点赞数
        likes_count = db.query(models.PostLike).filter(models.PostLike.post_id == post.id).count()
        # 统计收藏数
        favorites_count = db.query(models.PostFavorite).filter(models.PostFavorite.post_id == post.id).count()
        
        # 检查当前用户是否点赞/收藏
        is_liked = False
        is_favorited = False
        if user:
            is_liked = db.query(models.PostLike).filter(
                models.PostLike.post_id == post.id,
                models.PostLike.user_id == user.id
            ).first() is not None
            
            is_favorited = db.query(models.PostFavorite).filter(
                models.PostFavorite.post_id == post.id,
                models.PostFavorite.user_id == user.id
            ).first() is not None
        
        # 获取图片列表
        images = db.query(models.PostImage).filter(
            models.PostImage.post_id == post.id
        ).order_by(models.PostImage.sort).all()
        
        # 构建返回数据
        post_data = {
            "id": post.id,
            "author_id": post.author_id,
            "title": post.title,
            "content": post.content,
            "media_url": post.media_url,
            "media_width": post.media_width,
            "media_height": post.media_height,
            "publish_date": post.publish_date,
            "created_at": post.created_at,
            "likes_count": likes_count,
            "favorites_count": favorites_count,
            "is_liked": is_liked,
            "is_favorited": is_favorited,
            "images": [
                {
                    "url": img.url,
                    "width": img.width,
                    "height": img.height,
                    "sort": img.sort
                }
                for img in images
            ]
        }
        result.append(post_data)
    
    return {"posts": result}

@router.post("")
def create_post(payload: schemas.PostCreate, db: Session = Depends(get_db), user=Depends(get_current_user)):
    if not payload.title or not payload.content:
        raise HTTPException(status_code=400, detail="missing fields")

    draw_date, deadline = get_post_window()
    now = datetime.now()
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
        title=payload.title,
        content=payload.content,
        media_url=payload.mediaUrl,
        media_width=payload.mediaWidth,
        media_height=payload.mediaHeight,
        publish_date=draw_date,
    )
    db.add(post)
    db.flush()

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

    db.commit()
    db.refresh(post)
    return {"post": post}

@router.delete("/{post_id}")
def delete_post(post_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="not found")
    if post.author_id != user.id:
        raise HTTPException(status_code=403, detail="forbidden")
    today = today_start()
    if post.publish_date and post.publish_date.date() != today.date():
        raise HTTPException(status_code=400, detail="only today post can delete")
    db.query(models.PostImage).filter(models.PostImage.post_id == post_id).delete()
    db.delete(post)
    db.commit()
    return {"ok": True}

@router.post("/{post_id}/like")
def like_post(post_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    
    existing = db.query(models.PostLike).filter(
        models.PostLike.post_id == post_id,
        models.PostLike.user_id == user.id
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
        return {"ok": True, "liked": False}
    else:
        like = models.PostLike(post_id=post_id, user_id=user.id)
        db.add(like)
        db.commit()
        return {"ok": True, "liked": True}

@router.post("/{post_id}/favorite")
def favorite_post(post_id: int, db: Session = Depends(get_db), user=Depends(get_current_user)):
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    
    existing = db.query(models.PostFavorite).filter(
        models.PostFavorite.post_id == post_id,
        models.PostFavorite.user_id == user.id
    ).first()
    
    if existing:
        db.delete(existing)
        db.commit()
        return {"ok": True, "favorited": False}
    else:
        favorite = models.PostFavorite(post_id=post_id, user_id=user.id)
        db.add(favorite)
        db.commit()
        return {"ok": True, "favorited": True}
