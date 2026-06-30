"""配置加载，从环境变量读取，不打印敏感值"""
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # 数据库
    database_url: str = ""

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7

    # Cookie
    cookie_secure: bool = False  # HTTP 部署,先 False
    cookie_samesite: str = "lax"
    cookie_domain: str = ""  # 同域反代,不需要

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    def assemble_db_url(self) -> str:
        if self.database_url:
            return self.database_url
        # 走 docker compose 时,db 主机名是 "db"
        import os
        user = os.getenv("POSTGRES_USER", "todouser")
        pwd = os.getenv("POSTGRES_PASSWORD", "")
        db = os.getenv("POSTGRES_DB", "todoapp")
        return f"postgresql://{user}:{pwd}@db:5432/{db}"


settings = Settings()  # type: ignore
