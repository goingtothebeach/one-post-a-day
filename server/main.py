from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from alembic.config import Config
from alembic import command
from app.database import Base, engine
from app import auth, lottery, post, profile, upload
from app.scheduler import start_scheduler

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

scheduler = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    # 启动时执行
    global scheduler
    scheduler = start_scheduler()
    yield
    # 关闭时执行
    if scheduler:
        scheduler.shutdown()

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
