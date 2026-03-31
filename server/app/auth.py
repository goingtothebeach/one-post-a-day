from datetime import datetime, timedelta
import os
import random
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from jose import jwt
from pydantic import BaseModel, validator
from .database import get_db
from . import models, schemas

router = APIRouter(prefix="/auth", tags=["auth"])
JWT_SECRET = os.getenv("JWT_SECRET", "devsecret")
ALGO = "HS256"
FAKE_OTP = os.getenv("DEV_FAKE_OTP", "0") == "1"

# 验证码存储: {phone: {"code": str, "expires": datetime, "sent_at": datetime}}
OTP_STORE: dict[str, dict] = {}

class RequestOtpPayload(BaseModel):
  phone: str
  
  @validator('phone')
  def validate_phone(cls, v):
    # 验证中国大陆手机号格式
    if not re.match(r'^1[3-9]\d{9}$', v):
      raise ValueError('Invalid phone number format')
    return v

class VerifyPayload(BaseModel):
  phone: str
  code: str
  name: str | None = None
  
  @validator('phone')
  def validate_phone(cls, v):
    if not re.match(r'^1[3-9]\d{9}$', v):
      raise ValueError('Invalid phone number format')
    return v
  
  @validator('code')
  def validate_code(cls, v):
    if not re.match(r'^\d{6}$', v):
      raise ValueError('Code must be 6 digits')
    return v

@router.post("/request-otp")
def request_otp(payload: RequestOtpPayload):
  phone = payload.phone
  now = datetime.now()
  
  # 检查频率限制 (60秒内只能发送一次)
  if phone in OTP_STORE:
    last_sent = OTP_STORE[phone].get('sent_at')
    if last_sent and (now - last_sent).total_seconds() < 60:
      remaining = 60 - int((now - last_sent).total_seconds())
      raise HTTPException(
        status_code=429, 
        detail=f"Please wait {remaining} seconds before resending"
      )
  
  # 生成验证码
  code = "123456" if FAKE_OTP else f"{random.randint(0, 999999):06d}"
  
  # 存储验证码和过期时间 (5分钟)
  OTP_STORE[phone] = {
    "code": code,
    "expires": now + timedelta(minutes=5),
    "sent_at": now,
  }
  
  # TODO: 在生产环境中，这里应该调用短信服务发送验证码
  # 例如: send_sms(phone, code)
  
  return {
    "ok": True, 
    "code": code if FAKE_OTP else None,
    "expires_in": 300  # 5分钟
  }

@router.post("/verify-otp", response_model=schemas.AuthResponse)
def verify_otp(payload: VerifyPayload, db: Session = Depends(get_db)):
  phone = payload.phone
  code = payload.code
  now = datetime.now()
  
  # 开发模式：万能验证码
  if FAKE_OTP and code == "123456":
    pass
  else:
    # 检查验证码是否存在
    if phone not in OTP_STORE:
      raise HTTPException(status_code=400, detail="验证码未发送或已过期")
    
    stored = OTP_STORE[phone]
    
    # 检查是否过期
    if now > stored['expires']:
      del OTP_STORE[phone]
      raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")
    
    # 检查验证码是否匹配
    if code != stored['code']:
      raise HTTPException(status_code=400, detail="验证码错误")
    
    # 验证成功，删除验证码
    del OTP_STORE[phone]
  
  # 查找或创建用户
  user = db.query(models.User).filter(models.User.phone == phone).first()
  if not user:
    user = models.User(phone=phone, name=payload.name)
    db.add(user)
    db.commit()
    db.refresh(user)
  
  # 生成JWT token (有效期7天)
  expires = datetime.now() + timedelta(days=7)
  token = jwt.encode({"sub": str(user.id), "exp": expires}, JWT_SECRET, algorithm=ALGO)
  
  # 保存session
  session = models.Session(user_id=user.id, token=token, expires_at=expires)
  db.add(session)
  db.commit()
  
  return {"token": token, "user": user}

