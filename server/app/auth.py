from datetime import datetime, timedelta, timezone
import hmac
import json
import os
import random
import re
import secrets
from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session
from jose import jwt, JWTError
from pydantic import BaseModel, validator
from .database import get_db
from .deps import get_current_user
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

# 验证码存储: {phone: {code, expires, attempts}}
OTP_STORE: dict[str, dict] = {}
RATE_LIMIT: dict[str, datetime] = {}

# 单个验证码最多允许猜几次。6 位数字码在 5 分钟有效期内若不限次数，
# 可被暴力枚举从而登录任意手机号。
MAX_OTP_ATTEMPTS = 5

# 登录态有效期。前端存在 localStorage（web）里，本身不会自己消失，
# 到期与否完全由这里的 exp 决定。
TOKEN_TTL = timedelta(days=7)

# 剩余不足这个时长就在下次请求时换一张新 token（滑动续期）。
# 没有它的话，天天用的人也会在第 8 天被强制重新登录、还要再收一次短信
# （短信是花钱的）。阈值取一半 TTL：既不会太频繁地签发，
# 又保证任何 3 天内回来过一次的人永远不掉线。
TOKEN_RENEW_WHEN_LEFT = timedelta(days=3)


def issue_token(db: Session, user_id: int, replaces: str | None = None) -> str:
    """签发 token 并落一条 session 记录。登录和续期都走这里，避免两处逻辑漂移。

    exp 必须用 **aware 的 UTC** 时间：python-jose 会把 naive datetime 当成 UTC 处理，
    而服务器本地时区是 UTC+8，所以传 `datetime.now() + 7天` 实际会存成
    「7 天 8 小时后」——token 比预期多活 8 小时，且任何拿本地时间去比 exp 的地方
    都会偏 8 小时。这个偏差原来一直存在（只是没人算过剩余时间所以没暴露）。

    必须带 jti（随机串）：payload 只有 sub 和 exp 的话，同一用户在同一秒内
    签发两次会得到**完全相同的 token 字符串**，撞 sessions.token 的唯一约束 → 500。
    续期时「删旧行 + 插新行」如果落在同一秒就必然触发。exp 只精确到秒，
    所以光靠时间戳去重是不够的。

    replaces：续期时传入旧 token，一并删掉它对应的 session 行。
    否则每次续期都留一条永不清理的记录，而且旧 token 会一直有效到自然过期
    （吊销就形同虚设）。
    """
    expires_utc = datetime.now(timezone.utc) + TOKEN_TTL
    token = jwt.encode(
        {"sub": str(user_id), "exp": expires_utc, "jti": secrets.token_urlsafe(8)},
        JWT_SECRET,
        algorithm=ALGO,
    )
    if replaces:
        db.query(models.Session).filter(models.Session.token == replaces).delete()
    # sessions.expires_at 存 naive 本地时间，与库里其他时间列保持一致
    db.add(
        models.Session(
            user_id=user_id,
            token=token,
            expires_at=expires_utc.astimezone().replace(tzinfo=None),
        )
    )
    db.commit()
    return token


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
        "attempts": 0,
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

    if not hmac.compare_digest(code, stored["code"]):
        # 猜错累计到上限就作废该验证码，必须重新获取，阻断暴力枚举
        stored["attempts"] = stored.get("attempts", 0) + 1
        if stored["attempts"] >= MAX_OTP_ATTEMPTS:
            del OTP_STORE[phone]
            raise HTTPException(status_code=429, detail="验证码错误次数过多，请重新获取")
        raise HTTPException(status_code=400, detail="验证码错误")

    del OTP_STORE[phone]

    user = db.query(models.User).filter(models.User.phone == phone).first()
    if not user:
        user = models.User(phone=phone, name=payload.name or generate_nickname())
        db.add(user)
        db.commit()
        db.refresh(user)

    token = issue_token(db, user.id)

    return {"token": token, "user": user}


@router.post("/refresh")
def refresh(
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
    authorization: str | None = Header(None),
):
    """滑动续期：拿一张仍然有效的 token 换一张新的。

    只有「快过期了」才真的换。否则前端每次启动都调一次，sessions 表会堆出
    无数条记录，而且 token 频繁变动本身也没好处。没到阈值就返回 renewed=false，
    前端保持现有 token 不动。

    安全边界：依赖 get_current_user，也就是**已过期的 token 到不了这里**
    （它会先 401）。所以这不是「永不过期」——超过 7 天没回来的人
    仍然必须重新走短信登录。
    """
    remaining_days = None
    raw_token = (authorization or "").removeprefix("Bearer ").strip() or None
    try:
        if raw_token is None:
            raise ValueError("no bearer token")
        # 这张 token 的签名和过期已由 get_current_user 校验过，这里只是取 exp。
        # exp 是 unix 时间戳，必须按 UTC 解读再和 UTC 现在比 —— 用本地时间比会偏 8 小时。
        exp = jwt.decode(raw_token, JWT_SECRET, algorithms=[ALGO]).get("exp")
        if exp is not None:
            left = datetime.fromtimestamp(exp, timezone.utc) - datetime.now(timezone.utc)
            remaining_days = round(left.total_seconds() / 86400, 2)
            if left > TOKEN_RENEW_WHEN_LEFT:
                return {"renewed": False, "token": None, "remaining_days": remaining_days}
    except (IndexError, JWTError, ValueError, OSError):
        # 解不出 exp 就按「该续期」处理：宁可多发一张，也不要让人莫名掉线
        pass

    return {
        "renewed": True,
        "token": issue_token(db, user.id, replaces=raw_token),
        "remaining_days": remaining_days,
    }


@router.post("/logout")
def logout(
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    """真正吊销当前这张 token。

    以前没有这个端点：前端「退出登录」只清掉本地存储，那张 token 在剩余
    有效期内仍然可用 —— 等于退不掉。现在删掉 sessions 里对应的行，
    get_current_user 就会拒绝它。

    刻意**不**依赖 get_current_user：token 已经过期或已被吊销时，
    登出也应该返回成功（幂等），不该让用户卡在「登不出去」的状态。
    """
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token:
        db.query(models.Session).filter(models.Session.token == token).delete()
        db.commit()
    return {"ok": True}
