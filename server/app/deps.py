from fastapi import Depends, HTTPException, Header, Request
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from .database import get_db
from . import models
import os

JWT_SECRET = os.getenv("JWT_SECRET", "devsecret")
ALGO = "HS256"


def _bearer_token(request: Request, authorization: str | None) -> str | None:
    header = (
        authorization
        or request.headers.get("authorization")
        or request.headers.get("Authorization")
    )
    if not header or not header.startswith("Bearer "):
        return None
    return header.split(" ", 1)[1]


def _session_is_live(db: Session, token: str) -> bool:
    """token 对应的 session 行是否还在。

    sessions 表以前只写不读，后果是「退出登录」只清了客户端存储 ——
    那张 token 在剩余有效期内**仍然可用**，谁拿到都能继续操作，
    手机丢了也没法远程下线。现在登出会删掉这一行，所以这里必须真的查，
    JWT 签名有效不再等于「这张 token 还被允许使用」。
    """
    return (
        db.query(models.Session.id).filter(models.Session.token == token).first() is not None
    )


def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    token = _bearer_token(request, authorization)
    if token is None:
        raise HTTPException(status_code=401, detail="unauthorized: missing or bad header")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        user_id = payload.get("sub")
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"unauthorized: {str(e)}")
    if user_id is None:
        raise HTTPException(status_code=401, detail="unauthorized")
    if not _session_is_live(db, token):
        # 已登出（或被吊销）的 token。签名仍然有效，但不再被接受。
        raise HTTPException(status_code=401, detail="unauthorized: session revoked")
    user = db.query(models.User).get(int(user_id))
    if not user:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user


def get_current_user_optional(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(None),
):
    """可选认证：没登录或 token 不可用时返回 None，而不是抛 401。

    公开接口（如 /lottery/today/status、feed）用它来顺带识别「是不是本人」。
    已登出的 token 同样按未登录处理。
    """
    token = _bearer_token(request, authorization)
    if token is None:
        return None
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        user_id = payload.get("sub")
        if user_id is None:
            return None
    except JWTError:
        return None
    if not _session_is_live(db, token):
        return None
    return db.query(models.User).get(int(user_id))
