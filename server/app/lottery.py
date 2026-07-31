from datetime import datetime, timedelta
import os
import random
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from .database import get_db
from .deps import get_current_user, get_current_user_optional
from . import models
from .timewin import (
    DRAW_HOUR,
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
    already_posted = False

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
        # 下面两个字段专门给「首页空态该说什么」用。
        #
        # 为什么由后端算：前端若自己拿 draw_date 和「现在」比，就会重演
        # 「两个 tab 结论矛盾」和「次日 00:00-18:00 掉签」那两个坑。
        # 空态文案曾经无条件显示「每晚 18:00 抽签」——18:00 之后还这么说，
        # 用户会以为 App 坏了（真实发生过：有人因此连走两遍登录流程）。
        "phase": _phase_of(lottery, already_posted),
        # 下一次**开奖时刻**，不是轮次标识。
        # next_draw_date() 返回的是轮次 key（当天零点），直接下发会变成
        # 「2026-07-31T00:00:00」——名字叫 _at 却给了个午夜，谁用都会算错。
        # 加上 DRAW_HOUR 才是真正要开奖的那一刻。
        "next_draw_at": to_iso_shanghai(next_draw_date() + timedelta(hours=DRAW_HOUR)),
    }


def _phase_of(lottery, already_posted: bool) -> str:
    """当前活跃轮次处于哪个阶段。前端照这个选文案，不要自己推断。

    - waiting_draw  ：今晚的抽签还没到（这轮已经没戏了，但用户该看到的是「等今晚」）
    - drawing       ：开奖时刻刚过、还没开出来，大概率正在跑
    - draw_delayed  ：开奖时刻过去很久仍未开奖 —— 触发源出了问题，
                      文案要诚实地说「延迟」而不是继续说「等 18:00」
    - no_entries    ：开奖了但无人报名，今天不会有帖子
    - awaiting_post ：已开奖，等中签者发布
    - posted        ：已发布（此时首页有内容，空态不会出现）

    关于「没有 lottery 行」怎么分档：
    current_draw_date() 在 18:00 前指向**昨天**那轮，所以「无行」在一天中的任何时刻
    都意味着某个 18:00 已经过去了 —— 不能靠「是否已过开奖时刻」来区分，那样
    waiting_draw 永远不可达（穷举 24 小时验证过）。
    真正该看的是**距离下一次 18:00 还有多久**：
      刚过 18:00 十几分钟内   → 大概率正在开，说「正在抽签」
      离下一次 18:00 还很久   → 这轮确实黄了，说「延迟」（诚实，且提示可下拉刷新）
      快到下一次 18:00 了     → 用户关心的是今晚，说「今晚 18:00 亮灯」
    """
    if lottery and lottery.winner_user_id:
        return "posted" if already_posted else "awaiting_post"
    if lottery:
        # 有行但没赢家 = 那次开奖跑过、发现无人报名，插了占位行
        return "no_entries"

    now = now_shanghai()
    since_scheduled = now - (current_draw_date(now) + timedelta(hours=DRAW_HOUR))
    until_next = (next_draw_date(now) + timedelta(hours=DRAW_HOUR)) - now

    # 刚过开奖点：触发源可能正在跑（Actions 兜底也在 18:30）
    if since_scheduled <= timedelta(minutes=35):
        return "drawing"
    # 今晚快到了：用户此刻关心的是今晚，而不是已经黄掉的上一轮
    if until_next <= timedelta(hours=6):
        return "waiting_draw"
    return "draw_delayed"


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
