from datetime import datetime, timedelta, date
import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from .database import get_db
from .deps import get_current_user
from . import models

router = APIRouter(prefix="/lottery", tags=["lottery"])

def today_range():
    today = date.today()
    start = datetime(today.year, today.month, today.day)
    end = start + timedelta(days=1)
    return start, end

@router.get("/today/status")
def status(db: Session = Depends(get_db)):
    start, end = today_range()
    lottery = db.query(models.Lottery).filter(models.Lottery.draw_date >= start, models.Lottery.draw_date < end).first()
    return {"lottery": lottery}

@router.post("/join")
def join(db: Session = Depends(get_db), user=Depends(get_current_user)):
    start, end = today_range()
    existing = db.query(models.Ticket).filter(models.Ticket.user_id == user.id, models.Ticket.draw_date >= start, models.Ticket.draw_date < end).first()
    if existing:
        raise HTTPException(status_code=400, detail="already joined")
    ticket = models.Ticket(user_id=user.id, draw_date=start)
    db.add(ticket)
    db.commit()
    return {"ok": True}

@router.get("/tickets")
def get_tickets(db: Session = Depends(get_db)):
    start, end = today_range()
    tickets = db.query(models.Ticket).filter(models.Ticket.draw_date >= start, models.Ticket.draw_date < end).all()
    return {"tickets": [{"id": t.id, "user": {"id": t.user.id, "phone": t.user.phone, "name": t.user.name, "avatar": t.user.avatar}} for t in tickets]}

@router.post("/run")
def run(db: Session = Depends(get_db)):
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
