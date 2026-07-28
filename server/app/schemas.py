from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field

class UserOut(BaseModel):
    id: int
    phone: str
    name: Optional[str]
    avatar: Optional[str]

    class Config:
        from_attributes = True

class AuthResponse(BaseModel):
    token: str
    user: UserOut

class PostImageIn(BaseModel):
    url: str
    width: Optional[int]
    height: Optional[int]
    sort: Optional[int]

class PostCreate(BaseModel):
    # 长度上限与 DB 列宽（title 200 / content 2000）对齐，避免超长直接 500
    title: str = Field(min_length=1, max_length=100)
    content: str = Field(min_length=1, max_length=2000)
    mediaUrl: Optional[str] = None
    mediaWidth: Optional[int] = None
    mediaHeight: Optional[int] = None
    images: Optional[List[PostImageIn]] = None

class PostImageOut(BaseModel):
    url: str
    width: Optional[int]
    height: Optional[int]
    sort: Optional[int]

class PostOut(BaseModel):
    id: int
    title: str
    content: str
    media_url: Optional[str]
    media_width: Optional[int]
    media_height: Optional[int]
    publish_date: datetime
    author: UserOut
    images: List[PostImageOut] = []

    class Config:
        from_attributes = True

class LotteryStatus(BaseModel):
    draw_date: datetime
    winner_user_id: Optional[int]
    status: str

    class Config:
        from_attributes = True

class PostStat(BaseModel):
    id: int
    title: str
    media_url: Optional[str]
    publish_date: datetime
    likes_count: int
    favorites_count: int
    is_liked: bool
    is_favorited: bool
    images: List[PostImageOut] = []

class ProfileContentResponse(BaseModel):
    likes: List[PostStat]
    favorites: List[PostStat]
