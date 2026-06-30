"""Todo CRUD - 用户隔离是硬约束,每个查询都过滤 user_id"""
from datetime import datetime, timezone
from typing import Annotated, Optional

from dateutil.relativedelta import relativedelta  # type: ignore
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models import Todo, User, RecurrenceEnum, PriorityEnum, PRIORITY_ORDER
from ..schemas import TodoCreate, TodoOut, TodoUpdate

router = APIRouter(prefix="/api/todos", tags=["todos"])


def _next_due_date(current: datetime, recurrence: RecurrenceEnum) -> datetime:
    """根据 recurrence 算下一次到期时间"""
    if recurrence == RecurrenceEnum.DAILY:
        return current + relativedelta(days=1)
    if recurrence == RecurrenceEnum.WEEKLY:
        return current + relativedelta(weeks=1)
    if recurrence == RecurrenceEnum.MONTHLY:
        return current + relativedelta(months=1)
    return current


@router.get("", response_model=list[TodoOut])
def list_todos(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    completed: Optional[bool] = Query(default=None),
    category: Optional[str] = Query(default=None),
    priority: Optional[PriorityEnum] = Query(default=None),
):
    """列表 + 简单筛选. 用户隔离由 user_id 过滤保证."""
    q = db.query(Todo).filter(Todo.user_id == current_user.id)
    if completed is not None:
        q = q.filter(Todo.completed == completed)
    if category is not None:
        q = q.filter(Todo.category == category)
    if priority is not None:
        q = q.filter(Todo.priority == priority)
    todos = q.all()
    # 排序: 优先级 (urg→low) + 未完成在前 + 创建时间倒序
    def sort_key(t: Todo):
        # 未完成(0) 在前, 已完成(1) 在后
        completion_rank = 1 if t.completed else 0
        # priority 越紧急排序值越小
        prio_rank = PRIORITY_ORDER.get(t.priority.value if t.priority else "medium", 2)
        # 创建时间倒序 (负号 = 倒序)
        return (completion_rank, prio_rank, -t.created_at.timestamp())
    todos.sort(key=sort_key)
    return todos


@router.post("", response_model=TodoOut, status_code=201)
def create_todo(
    payload: TodoCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    todo = Todo(
        user_id=current_user.id,
        title=payload.title,
        description=payload.description,
        priority=payload.priority,
        category=payload.category,
        due_date=payload.due_date,
        recurrence=payload.recurrence,
        parent_id=payload.parent_id,
        notify_enabled=payload.notify_enabled,
        notify_before_minutes=payload.notify_before_minutes,
    )
    db.add(todo)
    db.commit()
    db.refresh(todo)
    return todo


@router.get("/{todo_id}", response_model=TodoOut)
def get_todo(
    todo_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    todo = (
        db.query(Todo)
        .filter(Todo.id == todo_id, Todo.user_id == current_user.id)
        .first()
    )
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    return todo


@router.patch("/{todo_id}", response_model=TodoOut)
def update_todo(
    todo_id: int,
    payload: TodoUpdate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    todo = (
        db.query(Todo)
        .filter(Todo.id == todo_id, Todo.user_id == current_user.id)
        .first()
    )
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")

    data = payload.model_dump(exclude_unset=True)

    # 特殊处理 completed: 标记完成时, 如果是 recurring task, 创建下一条
    becoming_complete = data.get("completed") is True and not todo.completed
    old_due_date = todo.due_date

    for field, value in data.items():
        setattr(todo, field, value)

    if becoming_complete:
        todo.completed = True
        todo.completed_at = datetime.now(timezone.utc)
        # 重复任务 → 生成下一条
        if todo.recurrence != RecurrenceEnum.NONE:
            next_todo = Todo(
                user_id=todo.user_id,
                title=todo.title,
                description=todo.description,
                priority=todo.priority,
                category=todo.category,
                recurrence=todo.recurrence,
                notify_enabled=todo.notify_enabled,
                notify_before_minutes=todo.notify_before_minutes,
                due_date=_next_due_date(todo.due_date, todo.recurrence)
                         if todo.due_date else None,
                recurrence_source_id=todo.id,
            )
            db.add(next_todo)

    db.commit()
    db.refresh(todo)
    return todo


@router.delete("/{todo_id}", status_code=204)
def delete_todo(
    todo_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    todo = (
        db.query(Todo)
        .filter(Todo.id == todo_id, Todo.user_id == current_user.id)
        .first()
    )
    if not todo:
        raise HTTPException(status_code=404, detail="Todo not found")
    db.delete(todo)
    db.commit()
    return None
