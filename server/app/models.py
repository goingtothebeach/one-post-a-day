from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .database import Base

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    phone = Column(String(20), unique=True, index=True, nullable=False)
    name = Column(String(50))
    avatar = Column(String(500))
    created_at = Column(DateTime, server_default=func.now())

    tickets = relationship("Ticket", back_populates="user")
    posts = relationship("Post", back_populates="author")

class Session(Base):
    __tablename__ = "sessions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    token = Column(String(255), unique=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")

class Ticket(Base):
    __tablename__ = "tickets"
    # 一人一轮只能有一张票。没有这个约束时 /join 的「先查后插」在并发下
    # （双击、两台设备、客户端重试）会让同一个人拿到多张票；
    # 若抽签按票随机，中签概率就被放大了。
    __table_args__ = (UniqueConstraint('user_id', 'draw_date', name='uq_ticket_user_draw'),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    draw_date = Column(DateTime, index=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User", back_populates="tickets")

class Lottery(Base):
    __tablename__ = "lotteries"
    id = Column(Integer, primary_key=True, index=True)
    draw_date = Column(DateTime, unique=True, nullable=False)
    winner_user_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String(20), default="pending")
    created_at = Column(DateTime, server_default=func.now())

    winner = relationship("User")

class Post(Base):
    __tablename__ = "posts"
    id = Column(Integer, primary_key=True, index=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    content = Column(String(2000), nullable=False)
    media_url = Column(String(500))
    media_width = Column(Integer)
    media_height = Column(Integer)
    # 「每天只有一个人能发帖」这条核心规则需要数据库兜底：
    # 仅靠应用层「先查有没有再插」在并发/连点下会插进两帖。
    publish_date = Column(DateTime, index=True, nullable=False, unique=True)
    created_at = Column(DateTime, server_default=func.now())

    author = relationship("User", back_populates="posts")
    likes = relationship("PostLike", back_populates="post", cascade="all, delete-orphan")
    favorites = relationship("PostFavorite", back_populates="post", cascade="all, delete-orphan")
    images = relationship("PostImage", back_populates="post", cascade="all, delete-orphan")

class PostImage(Base):
    __tablename__ = "post_images"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    url = Column(String(500), nullable=False)
    width = Column(Integer)
    height = Column(Integer)
    sort = Column(Integer, default=0)

    post = relationship("Post", back_populates="images")

class PostLike(Base):
    __tablename__ = "post_likes"
    __table_args__ = (UniqueConstraint('user_id', 'post_id', name='uq_post_like_user_post'),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    post = relationship("Post", back_populates="likes")

class PostFavorite(Base):
    __tablename__ = "post_favorites"
    __table_args__ = (UniqueConstraint('user_id', 'post_id', name='uq_post_fav_user_post'),)

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    post_id = Column(Integer, ForeignKey("posts.id"), nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    user = relationship("User")
    post = relationship("Post", back_populates="favorites")
