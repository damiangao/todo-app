"""一次性迁移: drop 老 todos/users + 老枚举, 让 Base.create_all 重建新 schema"""
from sqlalchemy import text
from app.db import engine, Base
# 触发所有 model import, 这样 Base.metadata 才包含 priority_enum 等
import app.models  # noqa


def main():
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS todos CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))
        conn.execute(text("DROP SCHEMA IF EXISTS todoapp CASCADE"))
        conn.execute(text("DROP TYPE IF EXISTS priority_enum CASCADE"))
        conn.execute(text("DROP TYPE IF EXISTS recurrence_enum CASCADE"))
    # 用 create_all 重建
    Base.metadata.create_all(engine)
    print("✅ schema reset done")


if __name__ == "__main__":
    main()
