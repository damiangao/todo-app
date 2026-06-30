"""Pydantic schemas"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, EmailStr, Field, ConfigDict, field_validator
from .models import PriorityEnum, RecurrenceEnum


# === Auth ===
class UserCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserOut(BaseModel):
    id: int
    email: EmailStr
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


# === Todo ===
class TodoBase(BaseModel):
    title: str = Field(min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=2000)
    priority: PriorityEnum = PriorityEnum.MEDIUM
    category: Optional[str] = Field(default=None, max_length=50)
    # AwareDatetime: 强制带 tzinfo (避免 naive datetime 写入 DB)
    # 前端必须传 .toISOString() 出来的 Z 后缀字符串
    due_date: Optional[datetime] = None
    recurrence: RecurrenceEnum = RecurrenceEnum.NONE

    @field_validator("due_date")
    @classmethod
    def _due_date_must_be_aware(cls, v):
        if v is not None and v.tzinfo is None:
            # 拒绝 naive datetime - 前端必须 ISO 字符串带 Z
            raise ValueError(
                "due_date must be timezone-aware (前端请用 new Date().toISOString())"
            )
        return v


class TodoCreate(TodoBase):
    parent_id: Optional[int] = None


class TodoUpdate(BaseModel):
    title: Optional[str] = Field(default=None, min_length=1, max_length=500)
    description: Optional[str] = Field(default=None, max_length=2000)
    completed: Optional[bool] = None
    priority: Optional[PriorityEnum] = None
    category: Optional[str] = Field(default=None, max_length=50)
    due_date: Optional[datetime] = None
    recurrence: Optional[RecurrenceEnum] = None


class TodoOut(TodoBase):
    id: int
    parent_id: Optional[int] = None
    completed: bool
    completed_at: Optional[datetime] = None
    recurrence_source_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    children: list["TodoOut"] = []

    model_config = ConfigDict(from_attributes=True)


TodoOut.model_rebuild()
