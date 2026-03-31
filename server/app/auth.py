from datetime import datetime, timedelta
import os
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

ALIYUN_ACCESS_KEY_ID = os.getenv("ALIYUN_ACCESS_KEY_ID", "")
ALIYUN_ACCESS_KEY_SECRET = os.getenv("ALIYUN_ACCESS_KEY_SECRET", "")
ALIYUN_SMS_SCHEME = os.getenv("ALIYUN_SMS_SCHEME", "")
ALIYUN_SMS_SIGN_NAME = os.getenv("ALIYUN_SMS_SIGN_NAME", "")
ALIYUN_SMS_TEMPLATE_CODE = os.getenv("ALIYUN_SMS_TEMPLATE_CODE", "")

# 频率限制存储: {phone: sent_at}
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


def send_sms_verify_code(phone: str) -> bool:
    import json
    from alibabacloud_dypnsapi20170525 import models as dypns_models
    client = _make_dypns_client()
    req = dypns_models.SendSmsVerifyCodeRequest(
        phone_number=phone,
        country_code="86",
        sign_name=ALIYUN_SMS_SIGN_NAME,
        template_code=ALIYUN_SMS_TEMPLATE_CODE,
        template_param=json.dumps({"code": "000000", "min": "5"}),
        scheme_name=ALIYUN_SMS_SCHEME or None,
    )
    resp = client.send_sms_verify_code(req)
    if not resp.body.success:
        raise Exception(f"code={resp.body.code} message={resp.body.message}")
    return True


def check_sms_verify_code(phone: str, code: str) -> bool:
    from alibabacloud_dypnsapi20170525 import models as dypns_models
    client = _make_dypns_client()
    req = dypns_models.CheckSmsVerifyCodeRequest(
        phone_number=phone,
        verify_code=code,
    )
    resp = client.check_sms_verify_code(req)
    return resp.body.model.verify_result == "PASS"


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
            raise HTTPException(
                status_code=429,
                detail=f"请等待 {remaining} 秒后再重试"
            )

    if FAKE_OTP:
        RATE_LIMIT[phone] = now
        return {"ok": True, "code": "123456", "expires_in": 300}

    try:
        ok = send_sms_verify_code(phone)
        if not ok:
            raise HTTPException(status_code=500, detail="短信发送失败，请稍后重试")
        RATE_LIMIT[phone] = now
        return {"ok": True, "expires_in": 300}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"短信发送失败：{str(e)}")


@router.post("/verify-otp", response_model=schemas.AuthResponse)
def verify_otp(payload: VerifyPayload, db: Session = Depends(get_db)):
    phone = payload.phone
    code = payload.code

    if FAKE_OTP:
        if code != "123456":
            raise HTTPException(status_code=400, detail="验证码错误")
    else:
        try:
            passed = check_sms_verify_code(phone, code)
            if not passed:
                raise HTTPException(status_code=400, detail="验证码错误或已过期")
        except HTTPException:
            raise
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"验证失败：{str(e)}")

    user = db.query(models.User).filter(models.User.phone == phone).first()
    if not user:
        user = models.User(phone=phone, name=payload.name)
        db.add(user)
        db.commit()
        db.refresh(user)

    expires = datetime.now() + timedelta(days=7)
    token = jwt.encode({"sub": str(user.id), "exp": expires}, JWT_SECRET, algorithm=ALGO)

    session = models.Session(user_id=user.id, token=token, expires_at=expires)
    db.add(session)
    db.commit()

    return {"token": token, "user": user}
