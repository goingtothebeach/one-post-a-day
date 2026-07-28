import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from alembic.config import Config
from alembic import command
from app.database import Base, engine
from app import auth, lottery, post, profile, upload

load_dotenv()

Base.metadata.create_all(bind=engine)

def run_migrations():
    import os
    from sqlalchemy import text
    ini = os.path.join(os.path.dirname(__file__), "alembic.ini")
    alembic_cfg = Config(ini)
    alembic_cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "alembic"))

    with engine.connect() as conn:
        try:
            result = conn.execute(text("SELECT version_num FROM alembic_version LIMIT 1"))
            current = result.scalar()
        except Exception:
            current = None

        if not current:
            conn.execute(text("CREATE TABLE IF NOT EXISTS alembic_version (version_num VARCHAR(32) NOT NULL, PRIMARY KEY (version_num))"))
            conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('741c3de4a7ff')"))
            conn.commit()

    command.upgrade(alembic_cfg, "head")

try:
    run_migrations()
except Exception as e:
    print(f"Migration warning: {e}")

# 抽签只由 GitHub Actions 的 cron 调 POST /lottery/run 触发
# （见 .github/workflows/daily-lottery.yml）。
# 这里【不能】再起 APScheduler：它会在 18:00 独立跑第二次抽签，两次抽出不同赢家、
# 后一次覆写 winner_user_id，导致先中签并已发帖的人失去发帖权。
# 多实例部署时 APScheduler 还会每个进程各跑一次，问题更严重。
app = FastAPI()

# 前端是纯 token 鉴权（Authorization header），不依赖 cookie。
# allow_origins=["*"] 与 allow_credentials=True 同时用是非法组合，浏览器会拒绝，
# 且会放开带凭证的跨站请求，所以这里显式关掉 credentials。
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv(
        "CORS_ORIGINS",
        "https://onedayapost.fun,http://localhost:8081,http://localhost:19006",
    ).split(",")
    if o.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(lottery.router)
app.include_router(post.router)
app.include_router(profile.router)
app.include_router(upload.router)

@app.get("/health")
def health():
    return {"ok": True}
