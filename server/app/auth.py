from datetime import datetime, timedelta
import json
import os
import random
import re
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from jose import jwt
from pydantic import BaseModel, validator
from .database import get_db
from . import models, schemas
from .nicknames import generate_nickname

router = APIRouter(prefix="/auth", tags=["auth"])
JWT_SECRET = os.getenv("JWT_SECRET", "devsecret")
ALGO = "HS256"
FAKE_OTP = os.getenv("DEV_FAKE_OTP", "0") == "1"

ALIYUN_ACCESS_KEY_ID = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
ALIYUN_ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")
ALIYUN_SMS_SIGN_NAME = os.getenv("ALIYUN_SMS_SIGN_NAME", "")
ALIYUN_SMS_TEMPLATE_CODE = os.getenv("ALIYUN_SMS_TEMPLATE_CODE", "")
ALIYUN_SMS_SCHEME = os.getenv("ALIYUN_SMS_SCHEME", "")

# 验证码存储: {phone: {code, expires, sent_at}}
OTP_STORE: dict[str, dict] = {}
RATE_LIMIT: dict[str, datetime] = {}


def _make_dypns_client():
    from alibabacloud_dypnsapi20170525.client import Client
    from alibabacloud_tea_openapi import models as open_api_models
    config = open_api_models.Config(
        access_key_id=ALIYUN_ACCESS_KEY_ID,
        access_key_secret=ALIYUN_ACCESS_KEY_SECRET,
        endpoint="dypnsapi.aliyuncs.com",
    )
    return Client(config)


def send_sms(phone: str, code: str) -> bool:
    from alibabacloud_dypnsapi20170525 import models as dypns_models
    client = _make_dypns_client()
    req = dypns_models.SendSmsVerifyCodeRequest(
        phone_number=phone,
        country_code="86",
        sign_name=ALIYUN_SMS_SIGN_NAME,
        template_code=ALIYUN_SMS_TEMPLATE_CODE,
        template_param=json.dumps({"code": code, "min": "5"}),
        scheme_name=ALIYUN_SMS_SCHEME or None,
    )
    resp = client.send_sms_verify_code(req)
    if not resp.body.success:
        raise Exception(f"code={resp.body.code} message={resp.body.message}")
    return True


class RequestOtpPayload(BaseModel):
    phone: str

    @validator('phone')
    def validate_phone(cls, v):
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
        if not re.match(r'^\d{4,6}$', v):
            raise ValueError('Code must be 4-6 digits')
        return v


@router.post("/request-otp")
def request_otp(payload: RequestOtpPayload):
    phone = payload.phone
    now = datetime.now()

    if phone in RATE_LIMIT:
        elapsed = (now - RATE_LIMIT[phone]).total_seconds()
        if elapsed < 60:
            remaining = 60 - int(elapsed)
            raise HTTPException(status_code=429, detail=f"请等待 {remaining} 秒后再重试")

    code = "123456" if FAKE_OTP else f"{random.randint(0, 999999):06d}"

    if not FAKE_OTP:
        try:
            send_sms(phone, code)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"短信发送失败：{str(e)}")

    OTP_STORE[phone] = {
        "code": code,
        "expires": now + timedelta(minutes=5),
    }
    RATE_LIMIT[phone] = now

    return {"ok": True, "code": code if FAKE_OTP else None, "expires_in": 300}


@router.post("/verify-otp", response_model=schemas.AuthResponse)
def verify_otp(payload: VerifyPayload, db: Session = Depends(get_db)):
    phone = payload.phone
    code = payload.code
    now = datetime.now()

    if phone not in OTP_STORE:
        raise HTTPException(status_code=400, detail="验证码未发送或已过期")

    stored = OTP_STORE[phone]
    if now > stored["expires"]:
        del OTP_STORE[phone]
        raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")

    if code != stored["code"]:
        raise HTTPException(status_code=400, detail="验证码错误")

    del OTP_STORE[phone]

    user = db.query(models.User).filter(models.User.phone == phone).first()
    if not user:
        user = models.User(phone=phone, name=payload.name or generate_nickname())
        db.add(user)
        db.commit()
        db.refresh(user)

    expires = datetime.now() + timedelta(days=7)
    token = jwt.encode({"sub": str(user.id), "exp": expires}, JWT_SECRET, algorithm=ALGO)

    session = models.Session(user_id=user.id, token=token, expires_at=expires)
    db.add(session)
    db.commit()

    return {"token": token, "user": user}
