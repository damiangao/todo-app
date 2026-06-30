"""FastAPI 入口"""
import logging
import time

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .db import Base, engine
from .routers import auth_router, todos_router

logger = logging.getLogger("todoapp")
logging.basicConfig(level=logging.INFO)


def wait_for_db(max_attempts: int = 30, delay: float = 1.0) -> None:
    """启动时等 db 就绪,避免 race condition"""
    from sqlalchemy import text

    for i in range(max_attempts):
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            logger.info("Database is ready")
            return
        except Exception as e:
            logger.warning(f"DB not ready (attempt {i+1}/{max_attempts}): {e}")
            time.sleep(delay)
    raise RuntimeError("Database not ready after waiting")


app = FastAPI(title="Todo API", version="1.0.0")

# 跨域:同源反代,不开 CORS;后续要分域再加
# app.add_middleware(
#     CORSMiddleware,
#     allow_origins=["..."],
#     allow_credentials=True,
#     allow_methods=["*"],
#     allow_headers=["*"],
# )


@app.get("/health")
def health():
    return {"status": "ok"}


@app.on_event("startup")
def on_startup():
    wait_for_db()
    Base.metadata.create_all(bind=engine)
    logger.info("Tables created (if not exist)")


app.include_router(auth_router.router)
app.include_router(todos_router.router)
