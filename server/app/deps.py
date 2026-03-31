from fastapi import Depends, HTTPException, Header, Request
from jose import jwt, JWTError
from sqlalchemy.orm import Session
from .database import get_db
from . import models
import os

JWT_SECRET = os.getenv("JWT_SECRET", "devsecret")
ALGO = "HS256"

def get_current_user(request: Request, db: Session = Depends(get_db), authorization: str | None = Header(None)):
    auth_header = authorization or request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header:
        raise HTTPException(status_code=401, detail="unauthorized: missing header")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail=f"unauthorized: bad header {auth_header}")
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        user_id = payload.get("sub")
    except JWTError as e:
        raise HTTPException(status_code=401, detail=f"unauthorized: {str(e)}")
    user = db.query(models.User).get(int(user_id)) if user_id is not None else None
    if not user:
        raise HTTPException(status_code=401, detail="unauthorized")
    return user

def get_current_user_optional(request: Request, db: Session = Depends(get_db), authorization: str | None = Header(None)):
    """可选的用户认证，未登录返回None而不是抛出异常"""
    auth_header = authorization or request.headers.get("authorization") or request.headers.get("Authorization")
    if not auth_header:
        return None
    if not auth_header.startswith("Bearer "):
        return None
    token = auth_header.split(" ", 1)[1]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGO])
        user_id = payload.get("sub")
        if user_id is None:
            return None
        user = db.query(models.User).get(int(user_id))
        return user
    except JWTError:
        return None

