import random
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from apscheduler.schedulers.background import BackgroundScheduler
from sqlalchemy.orm import Session
from .database import SessionLocal
from . import models

SHANGHAI = ZoneInfo('Asia/Shanghai')

def now_shanghai():
    return datetime.now(SHANGHAI)

def today_range():
    now = now_shanghai()
    start = datetime(now.year, now.month, now.day)
    end = start + timedelta(days=1)
    return start, end

def run_daily_lottery():
    """每天18:00运行抽奖"""
    db: Session = SessionLocal()
    try:
        start, end = today_range()
        tickets = db.query(models.Ticket).filter(
            models.Ticket.draw_date >= start, 
            models.Ticket.draw_date < end
        ).all()
        
        if not tickets:
            print(f"[{datetime.now()}] No tickets for lottery today")
            return
        
        winner_ticket = random.choice(tickets)
        lottery = db.query(models.Lottery).filter(
            models.Lottery.draw_date >= start, 
            models.Lottery.draw_date < end
        ).first()
        
        if not lottery:
            lottery = models.Lottery(
                draw_date=start, 
                winner_user_id=winner_ticket.user_id, 
                status="completed"
            )
            db.add(lottery)
        else:
            lottery.winner_user_id = winner_ticket.user_id
            lottery.status = "completed"
        
        db.commit()
        print(f"[{datetime.now()}] Lottery completed. Winner: User {winner_ticket.user_id}")
    except Exception as e:
        print(f"[{datetime.now()}] Lottery error: {str(e)}")
        db.rollback()
    finally:
        db.close()

def start_scheduler():
    """启动定时任务调度器"""
    scheduler = BackgroundScheduler(timezone='Asia/Shanghai')
    
    # 每天18:00执行抽奖
    scheduler.add_job(
        run_daily_lottery,
        trigger='cron',
        hour=18,
        minute=0,
        id='daily_lottery',
        replace_existing=True
    )
    
    scheduler.start()
    print(f"[{datetime.now()}] Scheduler started. Daily lottery at 18:00")
    return scheduler
