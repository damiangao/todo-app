"""注册/登录/刷新/登出/me - cookie 模式鉴权"""
from typing import Annotated

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session

from ..auth import (
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_password,
    verify_password,
)
from ..config import settings
from ..db import get_db
from ..models import User
from ..schemas import TokenResponse, UserCreate, UserLogin, UserOut

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_cookies(response: Response, access: str, refresh: str) -> None:
    common = {
        "httponly": True,
        "samesite": settings.cookie_samesite,
        "secure": settings.cookie_secure,
        "path": "/",
    }
    response.set_cookie(
        key="access_token",
        value=access,
        max_age=settings.access_token_expire_minutes * 60,
        **common,
    )
    response.set_cookie(
        key="refresh_token",
        value=refresh,
        max_age=settings.refresh_token_expire_days * 86400,
        **common,
    )


def _clear_cookies(response: Response) -> None:
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")


def _build_token_response(user: User) -> TokenResponse:
    return TokenResponse(
        access_token=create_access_token(user.id),
        refresh_token=create_refresh_token(user.id),
        user=UserOut.model_validate(user),
    )


@router.post("/register", response_model=TokenResponse, status_code=201)
def register(payload: UserCreate, response: Response, db: Annotated[Session, Depends(get_db)]):
    existing = db.query(User).filter(User.email == payload.email.lower()).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=payload.email.lower(),
        hashed_password=hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    tokens = _build_token_response(user)
    _set_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/login", response_model=TokenResponse)
def login(payload: UserLogin, response: Response, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.email == payload.email.lower()).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    tokens = _build_token_response(user)
    _set_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/refresh", response_model=TokenResponse)
def refresh(
    response: Response,
    db: Annotated[Session, Depends(get_db)],
    refresh_token: Annotated[str | None, Cookie(alias="refresh_token")] = None,
):
    """用 refresh_token cookie 换新的 access + refresh"""
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh token")
    user_id = decode_token(refresh_token, "refresh")
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    tokens = _build_token_response(user)
    _set_cookies(response, tokens.access_token, tokens.refresh_token)
    return tokens


@router.post("/logout", status_code=204)
def logout(response: Response):
    _clear_cookies(response)
    # 不要再返回新 Response,直接让 FastAPI 用注入的 response (带 204 状态)
    response.status_code = 204
    return None


@router.get("/me", response_model=UserOut)
def me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user
