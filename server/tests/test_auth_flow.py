"""端到端验证 token 生命周期。用独立 sqlite 库，不碰生产。"""
import os, tempfile
db_path = tempfile.mktemp(suffix='.db')
os.environ['DATABASE_URL'] = f'sqlite:///{db_path}'
os.environ['JWT_SECRET'] = 'test-secret-not-prod'
os.environ['DEV_FAKE_OTP'] = '1'   # 让 request-otp 直接回验证码，不发真短信

from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from jose import jwt
from app.database import Base, engine, SessionLocal
from app import models
import app.auth as auth
from fastapi import FastAPI
from app.auth import router as auth_router
from app.profile import router as profile_router

Base.metadata.create_all(bind=engine)
app = FastAPI()
app.include_router(auth_router)
app.include_router(profile_router)
c = TestClient(app)

def sessions_count():
    db = SessionLocal()
    try: return db.query(models.Session).count()
    finally: db.close()

PHONE = '13800138000'
ok = lambda b: '✓' if b else '✗ FAIL'

# ---- 1. 登录 ----
r = c.post('/auth/request-otp', json={'phone': PHONE})
code = r.json().get('code')
r = c.post('/auth/verify-otp', json={'phone': PHONE, 'code': code})
tok = r.json()['token']
print(f"1. 登录            {ok(r.status_code==200 and tok)}  sessions={sessions_count()}")

H = lambda t: {'Authorization': f'Bearer {t}'}

# ---- 2. token 可用 ----
r = c.get('/profile/content', headers=H(tok))
print(f"2. token 可访问     {ok(r.status_code==200)}  (HTTP {r.status_code})")

# ---- 3. 新 token 不该续期（剩 7 天 > 阈值 3 天）----
r = c.post('/auth/refresh', headers=H(tok))
d = r.json()
print(f"3. 新token不续期    {ok(d['renewed'] is False)}  remaining={d['remaining_days']} 天, sessions={sessions_count()}")

# ---- 4. 快过期的 token 应该续期，且旧行被替换 ----
old_exp = datetime.now(timezone.utc) + timedelta(days=1)
near = jwt.encode({'sub':'1','exp':old_exp}, auth.JWT_SECRET, algorithm=auth.ALGO)
db = SessionLocal()
db.add(models.Session(user_id=1, token=near, expires_at=datetime.now()+timedelta(days=1)))
db.commit(); db.close()
before = sessions_count()
r = c.post('/auth/refresh', headers=H(near))
d = r.json()
new_tok = d.get('token')
print(f"4. 快过期→续期      {ok(d['renewed'] is True and new_tok)}  remaining={d['remaining_days']} 天")
print(f"   旧行被删(数量不变) {ok(sessions_count()==before)}  {before}→{sessions_count()}")
r_old = c.get('/profile/content', headers=H(near))
print(f"   旧token立即失效   {ok(r_old.status_code==401)}  (HTTP {r_old.status_code})")
r_new = c.get('/profile/content', headers=H(new_tok))
print(f"   新token可用       {ok(r_new.status_code==200)}  (HTTP {r_new.status_code})")

# ---- 5. 登出吊销 ----
r = c.post('/auth/logout', headers=H(tok))
print(f"5. 登出返回 ok      {ok(r.status_code==200)}  sessions={sessions_count()}")
r = c.get('/profile/content', headers=H(tok))
print(f"   登出后token失效   {ok(r.status_code==401)}  (HTTP {r.status_code}) ← 这是本次的核心修复")

# ---- 6. 登出幂等 ----
r = c.post('/auth/logout', headers=H(tok))
print(f"6. 重复登出幂等      {ok(r.status_code==200)}")

# ---- 7. 伪造/无 session 的合法签名 token 应被拒 ----
forged = jwt.encode({'sub':'1','exp':datetime.now(timezone.utc)+timedelta(days=7)}, auth.JWT_SECRET, algorithm=auth.ALGO)
r = c.get('/profile/content', headers=H(forged))
print(f"7. 无session的token  {ok(r.status_code==401)}  (HTTP {r.status_code}) ← 签名有效但未授权")

# ---- 8. 过期 token 不能靠 refresh 复活 ----
dead = jwt.encode({'sub':'1','exp':datetime.now(timezone.utc)-timedelta(seconds=10)}, auth.JWT_SECRET, algorithm=auth.ALGO)
db = SessionLocal(); db.add(models.Session(user_id=1, token=dead, expires_at=datetime.now())); db.commit(); db.close()
r = c.post('/auth/refresh', headers=H(dead))
print(f"8. 过期token不能续期 {ok(r.status_code==401)}  (HTTP {r.status_code}) ← 否则等于永不过期")

# ---- 9. exp 精确是 7 天（不是 7天8小时）----
exp = jwt.decode(new_tok, auth.JWT_SECRET, algorithms=[auth.ALGO])['exp']
left = datetime.fromtimestamp(exp, timezone.utc) - datetime.now(timezone.utc)
print(f"9. 有效期精确 7 天   {ok(timedelta(days=6,hours=23) < left <= timedelta(days=7))}  实际 {left}")

os.unlink(db_path)
