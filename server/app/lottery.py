from datetime import datetime, timedelta, date
import os
import random
from zoneinfo import ZoneInfo
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .deps import get_current_user
from . import models

router = APIRouter(prefix="/lottery", tags=["lottery"])

CRON_SECRET = os.getenv("CRON_SECRET", "")
SHANGHAI = ZoneInfo('Asia/Shanghai')

def now_shanghai():
    return datetime.now(SHANGHAI).replace(tzinfo=None)

def today_range():
    now = now_shanghai()
    start = datetime(now.year, now.month, now.day)
    end = start + timedelta(days=1)
    return start, end

def current_draw_range():
    """
    返回当前活跃抽签轮次的 (start, end)
    18:00 前 → 昨天的抽签（发帖窗口仍在）
    18:00 后 → 今天的抽签
    """
    now = now_shanghai()
    today = datetime(now.year, now.month, now.day)
    if now.hour < 18:
        start = today - timedelta(days=1)
    else:
        start = today
    end = start + timedelta(days=1)
    return start, end


    """
    返回下一轮抽签对应的 (start, end)
    18:00 前 → 今天的抽签
    18:00 后 → 明天的抽签
    """
    now = now_shanghai()
    today = datetime(now.year, now.month, now.day)
    if now.hour < 18:
        start = today
    else:
        start = today + timedelta(days=1)
    end = start + timedelta(days=1)
    return start, end

@router.get("/today/status")
def status(db: Session = Depends(get_db)):
    start, end = current_draw_range()
    lottery = db.query(models.Lottery).filter(models.Lottery.draw_date >= start, models.Lottery.draw_date < end).first()
    if lottery and lottery.winner_user_id:
        deadline = lottery.draw_date + timedelta(days=1, hours=18)
        deadline_iso = deadline.isoformat()
    else:
        deadline_iso = None
    return {"lottery": lottery, "winner_deadline": deadline_iso}

@router.post("/join")
def join(db: Session = Depends(get_db), user=Depends(get_current_user)):
    import traceback
    try:
        start, end = next_draw_range()
        existing = db.query(models.Ticket).filter(
            models.Ticket.user_id == user.id,
            models.Ticket.draw_date >= start,
            models.Ticket.draw_date < end
        ).first()
        if existing:
            raise HTTPException(status_code=400, detail="already joined")
        ticket = models.Ticket(user_id=user.id, draw_date=start)
        db.add(ticket)
        db.commit()
        return {"ok": True, "draw_date": start.isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[JOIN ERROR] {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/tickets")
def get_tickets(db: Session = Depends(get_db)):
    start, end = next_draw_range()
    tickets = db.query(models.Ticket).filter(models.Ticket.draw_date >= start, models.Ticket.draw_date < end).all()
    return {
        "tickets": [{"id": t.id, "user": {"id": t.user.id, "phone": t.user.phone, "name": t.user.name, "avatar": t.user.avatar}} for t in tickets],
        "draw_date": start.isoformat(),
    }

@router.post("/run")
def run(db: Session = Depends(get_db), x_cron_secret: str | None = Header(default=None)):
    if CRON_SECRET and x_cron_secret != CRON_SECRET:
        raise HTTPException(status_code=403, detail="forbidden")
    start, end = today_range()
    tickets = db.query(models.Ticket).filter(models.Ticket.draw_date >= start, models.Ticket.draw_date < end).all()
    if not tickets:
        raise HTTPException(status_code=400, detail="no tickets")
    winner_ticket = random.choice(tickets)
    lottery = db.query(models.Lottery).filter(models.Lottery.draw_date >= start, models.Lottery.draw_date < end).first()
    if not lottery:
        lottery = models.Lottery(draw_date=start, winner_user_id=winner_ticket.user_id, status="completed")
        db.add(lottery)
    else:
        lottery.winner_user_id = winner_ticket.user_id
        lottery.status = "completed"
    db.commit()
    return {"winner_user_id": winner_ticket.user_id}
