"""v2 单测: auth + todos + 隔离 + 重复任务 + due-soon"""
import os
os.environ.setdefault("DATABASE_URL", "postgresql+psycopg2://todouser:TZX6DsIwVKtiK3s3F9HhKcp4wRfNCWohjrFqvNAi__Y@localhost:5432/todoapp")
os.environ.setdefault("JWT_SECRET", "testsecret")
os.environ.setdefault("JWT_REFRESH_SECRET", "testrefresh")
os.environ.setdefault("ACCESS_TOKEN_EXPIRE_MINUTES", "15")
os.environ.setdefault("REFRESH_TOKEN_EXPIRE_DAYS", "7")

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text
from app.main import app as fastapi_app
from app.db import engine, Base
import app.models  # noqa: F401 触发 model 注册


@pytest.fixture(scope="module", autouse=True)
def reset_db():
    """每个 module 重置一次 DB"""
    with engine.begin() as conn:
        conn.execute(text("DROP TABLE IF EXISTS todos CASCADE"))
        conn.execute(text("DROP TABLE IF EXISTS users CASCADE"))
        conn.execute(text("DROP TYPE IF EXISTS priority_enum CASCADE"))
        conn.execute(text("DROP TYPE IF EXISTS recurrence_enum CASCADE"))
    Base.metadata.create_all(engine)
    yield


@pytest.fixture
def client():
    return TestClient(fastapi_app)


def _register(client, email, password="samurai2026"):
    r = client.post("/api/auth/register", json={"email": email, "password": password})
    assert r.status_code == 201, r.text
    return r.json()


# === Auth ===
def test_register_login_me(client):
    r = client.post("/api/auth/register", json={"email": "a@cp.net", "password": "samurai2026"})
    assert r.status_code == 201
    assert r.json()["user"]["email"] == "a@cp.net"
    me = client.get("/api/auth/me")
    assert me.status_code == 200
    assert me.json()["email"] == "a@cp.net"


def test_logout_clears_session(client):
    _register(client, "b@cp.net")
    assert client.get("/api/auth/me").status_code == 200
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").status_code == 401


def test_duplicate_email_rejected(client):
    _register(client, "c@cp.net")
    r = client.post("/api/auth/register", json={"email": "c@cp.net", "password": "samurai2026"})
    assert r.status_code == 400


def test_wrong_password_rejected(client):
    _register(client, "d@cp.net", "rightpass1")
    r = client.post("/api/auth/login", json={"email": "d@cp.net", "password": "wrongpass1"})
    assert r.status_code == 401


# === Todos v2 ===
def test_create_with_all_fields(client):
    _register(client, "e@cp.net")
    r = client.post("/api/todos", json={
        "title": "v2 test",
        "description": "with everything",
        "priority": "urgent",
        "category": "主线",
        "recurrence": "daily",
        "notify_enabled": True,
        "notify_before_minutes": 30,
    })
    assert r.status_code == 201
    body = r.json()
    assert body["priority"] == "urgent"
    assert body["category"] == "主线"
    assert body["recurrence"] == "daily"
    assert body["notify_enabled"] is True
    assert body["notify_before_minutes"] == 30


def test_user_isolation(client):
    _register(client, "f@cp.net")
    client.post("/api/todos", json={"title": "f 私有"})
    # 清 cookie, 切到 g
    client.post("/api/auth/logout")
    _register(client, "g@cp.net")
    client.post("/api/todos", json={"title": "g 私有"})
    g_list = client.get("/api/todos").json()
    titles = [t["title"] for t in g_list]
    assert "g 私有" in titles
    assert "f 私有" not in titles


def test_filter_by_priority(client):
    _register(client, "h@cp.net")
    client.post("/api/todos", json={"title": "low", "priority": "low"})
    client.post("/api/todos", json={"title": "urgent", "priority": "urgent"})
    r = client.get("/api/todos?priority=urgent").json()
    titles = [t["title"] for t in r]
    assert titles == ["urgent"]


def test_filter_by_completed(client):
    _register(client, "i@cp.net")
    r1 = client.post("/api/todos", json={"title": "todo1"}).json()
    client.post("/api/todos", json={"title": "todo2"})
    client.patch(f"/api/todos/{r1['id']}", json={"completed": True})
    active = client.get("/api/todos?completed=false").json()
    done = client.get("/api/todos?completed=true").json()
    assert len(active) == 1 and active[0]["title"] == "todo2"
    assert len(done) == 1 and done[0]["title"] == "todo1"


def test_recurring_generates_next(client):
    _register(client, "j@cp.net")
    r = client.post("/api/todos", json={
        "title": "daily todo",
        "recurrence": "daily",
        "due_date": "2030-01-01T10:00:00Z",
    }).json()
    # 标记完成
    client.patch(f"/api/todos/{r['id']}", json={"completed": True})
    all_todos = client.get("/api/todos").json()
    assert len(all_todos) == 2
    # 找到下一条 (recurrence_source_id == r.id)
    next_todo = [t for t in all_todos if t["recurrence_source_id"] == r["id"]][0]
    assert next_todo["title"] == "daily todo"
    assert next_todo["completed"] is False
    # due_date 应该是 2030-01-02
    assert next_todo["due_date"].startswith("2030-01-02")


def test_due_soon_endpoint(client):
    _register(client, "k@cp.net")
    # 30 分钟后到期 + 通知
    from datetime import datetime, timezone, timedelta
    due = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    client.post("/api/todos", json={
        "title": "soon",
        "due_date": due,
        "notify_enabled": True,
        "notify_before_minutes": 60,  # 提前 60 分钟
    })
    # 60 分钟窗口应看到
    r = client.get("/api/todos/due-soon?window_minutes=60").json()
    assert len(r) == 1
    assert r[0]["title"] == "soon"


def test_ack_notify(client):
    _register(client, "l@cp.net")
    from datetime import datetime, timezone, timedelta
    due = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
    r = client.post("/api/todos", json={
        "title": "ack me",
        "due_date": due,
        "notify_enabled": True,
    }).json()
    # ack
    ack = client.post(f"/api/todos/{r['id']}/ack-notify")
    assert ack.status_code == 204
    # due-soon 仍返回 (前端靠 notified_at 判断, 不剔除)
    assert len(client.get("/api/todos/due-soon").json()) == 1
    # 字段已更新
    me = client.get(f"/api/todos/{r['id']}").json()
    assert me["notified_at"] is not None


def test_subtask(client):
    _register(client, "m@cp.net")
    parent = client.post("/api/todos", json={"title": "parent"}).json()
    child = client.post("/api/todos", json={"title": "child", "parent_id": parent["id"]}).json()
    assert child["parent_id"] == parent["id"]
    # 删除 parent → cascade 删 child
    client.delete(f"/api/todos/{parent['id']}")
    assert client.get(f"/api/todos/{child['id']}").status_code == 404


def test_unauth_blocked(client):
    # 不注册不登录
    r = client.get("/api/todos")
    assert r.status_code == 401
