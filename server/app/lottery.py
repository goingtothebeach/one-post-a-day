from datetime import datetime
import os
import random
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .database import get_db
from .deps import get_current_user, get_current_user_optional
from . import models
from .timewin import (
    current_draw_date,
    draw_date_for_run,
    next_draw_date,
    now_shanghai,
    post_deadline,
    round_range,
    to_iso_shanghai,
)

router = APIRouter(prefix="/lottery", tags=["lottery"])

CRON_SECRET = os.getenv("CRON_SECRET", "")


def _round_of(db: Session, draw_date: datetime):
    start, end = round_range(draw_date)
    return (
        db.query(models.Lottery)
        .filter(models.Lottery.draw_date >= start, models.Lottery.draw_date < end)
        .first()
    )


@router.get("/today/status")
def status(db: Session = Depends(get_db), user=Depends(get_current_user_optional)):
    draw_date = current_draw_date()
    lottery = _round_of(db, draw_date)

    deadline_iso = None
    winner_info = None
    is_winner = False
    can_post = False

    if lottery and lottery.winner_user_id:
        deadline = post_deadline(lottery.draw_date)
        deadline_iso = to_iso_shanghai(deadline)
        winner = db.query(models.User).filter(models.User.id == lottery.winner_user_id).first()
        if winner:
            winner_info = {"id": winner.id, "name": winner.name, "avatar": winner.avatar}

        # 中签态由后端判定，前端不要再自己比日期（曾导致次日 00:00-18:00 「掉签」）
        is_winner = bool(user and lottery.winner_user_id == user.id)
        window_open = now_shanghai() < deadline
        already_posted = (
            db.query(models.Post)
            .filter(models.Post.publish_date == lottery.draw_date)
            .first()
            is not None
        )
        can_post = is_winner and window_open and not already_posted

    return {
        "lottery": lottery,
        "winner_deadline": deadline_iso,
        "winner": winner_info,
        "is_winner": is_winner,
        "can_post": can_post,
    }


@router.post("/join")
def join(db: Session = Depends(get_db), user=Depends(get_current_user)):
    draw_date = next_draw_date()

    # 该轮已经开奖后就不允许再报名（cron 延迟时可能出现）
    existing_round = _round_of(db, draw_date)
    if existing_round and existing_round.winner_user_id:
        raise HTTPException(status_code=400, detail="本轮已开奖，请报名下一轮")

    ticket = models.Ticket(user_id=user.id, draw_date=draw_date)
    db.add(ticket)
    try:
        db.commit()
    except IntegrityError:
        # (user_id, draw_date) 唯一约束兜底，防并发双击拿到两张票
        db.rollback()
        raise HTTPException(status_code=400, detail="already joined")
    return {"ok": True, "draw_date": to_iso_shanghai(draw_date)}


@router.get("/tickets")
def get_tickets(db: Session = Depends(get_db), user=Depends(get_current_user)):
    draw_date = next_draw_date()
    start, end = round_range(draw_date)
    tickets = (
        db.query(models.Ticket)
        .filter(models.Ticket.draw_date >= start, models.Ticket.draw_date < end)
        .all()
    )
    return {
        "tickets": [
            {
                "id": t.id,
                # 不下发 phone：报名列表是所有登录用户可见的，
                # 泄露全部参与者手机号没有必要（前端只用 name/avatar 画头像）
                "user": {
                    "id": t.user.id,
                    "name": t.user.name,
                    "avatar": t.user.avatar,
                },
            }
            for t in tickets
        ],
        "draw_date": to_iso_shanghai(draw_date),
    }


def draw_round(db: Session, draw_date: datetime) -> dict:
    """为指定轮次开奖。幂等：已开奖直接返回既有赢家，绝不重抽。

    重抽是危险的——赢家可能已经发了帖，改 winner 会让那条帖子的作者失去发帖权，
    而新赢家又会因 publish_date 已存在而发不出来。
    """
    lottery = _round_of(db, draw_date)
    if lottery and lottery.winner_user_id:
        return {
            "ok": True,
            "draw_date": to_iso_shanghai(draw_date),
            "winner_user_id": lottery.winner_user_id,
            "already_drawn": True,
        }

    start, end = round_range(draw_date)
    tickets = (
        db.query(models.Ticket)
        .filter(models.Ticket.draw_date >= start, models.Ticket.draw_date < end)
        .all()
    )

    if not tickets:
        # 没人报名不是错误：记一条 empty 轮次，避免 cron 反复重试并把 workflow 标红
        if not lottery:
            lottery = models.Lottery(draw_date=draw_date, status="empty")
            db.add(lottery)
            try:
                db.commit()
            except IntegrityError:
                db.rollback()
        return {
            "ok": True,
            "draw_date": to_iso_shanghai(draw_date),
            "winner_user_id": None,
            "reason": "no tickets",
        }

    # 按【人】抽而不是按【票】抽：即使历史上存在重复票也不放大中签概率
    user_ids = sorted({t.user_id for t in tickets})
    winner_user_id = random.choice(user_ids)

    if not lottery:
        lottery = models.Lottery(
            draw_date=draw_date, winner_user_id=winner_user_id, status="completed"
        )
        db.add(lottery)
    else:
        lottery.winner_user_id = winner_user_id
        lottery.status = "completed"

    try:
        db.commit()
    except IntegrityError:
        # 与另一个并发抽签撞上了：以已落库的那个赢家为准
        db.rollback()
        existing = _round_of(db, draw_date)
        return {
            "ok": True,
            "draw_date": to_iso_shanghai(draw_date),
            "winner_user_id": existing.winner_user_id if existing else None,
            "already_drawn": True,
        }

    return {
        "ok": True,
        "draw_date": to_iso_shanghai(draw_date),
        "winner_user_id": winner_user_id,
        "participants": len(user_ids),
    }


@router.post("/run")
def run(db: Session = Depends(get_db), x_cron_secret: str | None = Header(default=None)):
    # fail-closed：没配 CRON_SECRET 就一律拒绝，否则任何人都能裸调重抽赢家
    if not CRON_SECRET:
        raise HTTPException(status_code=503, detail="CRON_SECRET not configured")
    if x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    return draw_round(db, draw_date_for_run())
