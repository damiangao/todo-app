"""ORM 模型: User + Todo"""
from datetime import datetime, timezone
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, ForeignKey, Index, Enum
)
from sqlalchemy.orm import relationship
import enum
from .db import Base


def utcnow():
    return datetime.now(timezone.utc)


class PriorityEnum(str, enum.Enum):
    """优先级: 0=低 1=中 2=高 3=紧急"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


PRIORITY_ORDER = {
    "urgent": 0,  # 排序时最前
    "high": 1,
    "medium": 2,
    "low": 3,
}


class RecurrenceEnum(str, enum.Enum):
    """重复规则: 标记完成时自动生成下一条"""
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, nullable=False, index=True)
    hashed_password = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)

    todos = relationship("Todo", back_populates="owner", cascade="all, delete-orphan")


class Todo(Base):
    __tablename__ = "todos"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    parent_id = Column(Integer, ForeignKey("todos.id", ondelete="CASCADE"), nullable=True)
    title = Column(String(500), nullable=False)
    description = Column(String(2000), nullable=True)
    completed = Column(Boolean, default=False, nullable=False)
    completed_at = Column(DateTime(timezone=True), nullable=True)
    priority = Column(
        Enum(PriorityEnum, name="priority_enum"),
        default=PriorityEnum.MEDIUM,
        nullable=False,
    )
    category = Column(String(50), nullable=True, index=True)  # 用户自定义标签
    due_date = Column(DateTime(timezone=True), nullable=True)
    recurrence = Column(
        Enum(RecurrenceEnum, name="recurrence_enum"),
        default=RecurrenceEnum.NONE,
        nullable=False,
    )
    recurrence_source_id = Column(Integer, ForeignKey("todos.id", ondelete="SET NULL"), nullable=True)
    notify_enabled = Column(Boolean, default=False, nullable=False)
    notify_before_minutes = Column(Integer, default=10, nullable=False)
    notified_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow, nullable=False)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow, nullable=False)

    owner = relationship("User", back_populates="todos")
    children = relationship(
        "Todo",
        back_populates="parent",
        cascade="all, delete-orphan",
        foreign_keys="Todo.parent_id",
    )
    parent = relationship(
        "Todo",
        remote_side=[id],
        back_populates="children",
        foreign_keys="Todo.parent_id",
    )

    __table_args__ = (
        Index("ix_todos_user_id", "user_id"),
        Index("ix_todos_user_completed", "user_id", "completed"),
        Index("ix_todos_due_date", "due_date"),
    )
