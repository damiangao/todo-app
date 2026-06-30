# Todo App

多端同步的 Todo 应用。Next.js (PWA) + FastAPI + Postgres，Docker Compose 一把梭部署，80 端口对外。

## 架构

```
浏览器 (PWA)
    ↓
nginx :80 (反代)
    ↓                ↓
frontend:3000   backend:8000 (FastAPI)
                     ↓
                  db:5432 (Postgres 16)
```

- **多端同步**：浏览器 PWA，同源 cookie 走 httpOnly，刷新页面数据一致
- **离线**：Service Worker + IndexedDB 暂存改动，上线后批量同步
- **用户隔离**：每个用户只能看自己的 todos，JWT 校验 + 服务端 `user_id` 过滤双重保护
- **认证**：JWT 双 token (access 15min + refresh 7d)，httpOnly cookie 防 XSS

## 目录

```
todo-app/
├── backend/          FastAPI + SQLAlchemy
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db.py
│   │   ├── models.py       User / Todo
│   │   ├── schemas.py      Pydantic
│   │   ├── auth.py         JWT + bcrypt
│   │   └── routers/
│   │       ├── auth_router.py    /api/auth/*
│   │       └── todos_router.py   /api/todos/*
│   ├── requirements.txt
│   └── Dockerfile
├── frontend/         Next.js 14 App Router + PWA
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── page.tsx         redirect → /todos
│   │   ├── login/page.tsx
│   │   ├── todos/page.tsx
│   │   └── globals.css
│   ├── lib/
│   │   ├── api.ts           fetch 封装
│   │   ├── auth-context.tsx
│   │   └── offline.ts       IndexedDB 队列
│   ├── public/              PWA manifest + icon
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── Dockerfile
├── nginx/
│   └── nginx.conf    反代 + gzip
├── docker-compose.yml
├── .env              密钥(不提交)
├── .env.example
└── .gitignore
```

## 启动

```bash
cd ~/projects/todo-app
sudo docker compose up -d --build
```

首次构建 ~15 分钟（pip / npm 拉包）。之后启动秒级。

## 验证

```bash
# 1. 健康检查
curl -s http://localhost/health

# 2. 注册
curl -s -c /tmp/c.txt -X POST http://localhost/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"a@a.com","password":"password123"}'

# 3. 登录 (用上面注册的账号)
curl -s -c /tmp/c.txt -X POST http://localhost/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"a@a.com","password":"password123"}'

# 4. 拿当前用户
curl -s -b /tmp/c.txt http://localhost/api/auth/me

# 5. 创建 todo
curl -s -b /tmp/c.txt -X POST http://localhost/api/todos \
  -H "Content-Type: application/json" \
  -d '{"title":"测试一下"}'

# 6. 列表
curl -s -b /tmp/c.txt http://localhost/api/todos

# 7. 退出
curl -s -b /tmp/c.txt -X POST http://localhost/api/auth/logout
```

## 运维

```bash
# 看日志
sudo docker compose logs -f

# 看单个服务
sudo docker compose logs -f backend

# 停止
sudo docker compose down

# 重启单个服务
sudo docker compose restart backend

# 进容器
sudo docker compose exec backend sh
sudo docker compose exec db psql -U todouser -d todoapp

# 删数据(慎用)
sudo docker compose down -v
```

## 环境变量 (.env)

| 变量 | 说明 |
|---|---|
| `POSTGRES_DB` | 数据库名 |
| `POSTGRES_USER` | 数据库用户 |
| `POSTGRES_PASSWORD` | 数据库密码 |
| `JWT_SECRET` | JWT 签名密钥 (≥32 字符) |
| `JWT_ALGORITHM` | 默认 `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | 默认 15 |
| `REFRESH_TOKEN_EXPIRE_DAYS` | 默认 7 |

**生成新密钥：**
```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

## API 速查

### Auth

| Method | Path | 说明 |
|---|---|---|
| POST | `/api/auth/register` | 注册，返回 access + refresh cookie |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/auth/refresh` | 用 refresh cookie 换新 token |
| POST | `/api/auth/logout` | 清 cookie |
| GET | `/api/auth/me` | 当前用户 |

### Todos (需登录)

| Method | Path | Body | 说明 |
|---|---|---|---|
| GET | `/api/todos` | - | 列表 |
| POST | `/api/todos` | `{title, description?}` | 创建 |
| PATCH | `/api/todos/{id}` | `{title?, description?, completed?}` | 改 |
| DELETE | `/api/todos/{id}` | - | 删 |

## 已知限制 / V1 没做

- ❌ HTTPS（HTTP 部署，上线前要加 certbot / 反代到云厂商 LB）
- ❌ Alembic 迁移（用 `create_all`，加表要手动改）
- ❌ 邮件验证 / 找回密码
- ❌ 第三方登录
- ❌ 多设备 token 撤销
- ❌ 富文本 / 子任务
- ❌ 实时同步（现在是拉模型，多 tab 同时改会冲突）

## 故障排查

**80 端口被占：**
```bash
sudo lsof -i :80
# 看是哪个 docker 容器或进程在用
```

**build 卡住：**
- `files.pythonhosted.org` 在国内慢，等 5-10 分钟
- 看 journalctl: `sudo journalctl -u docker --since "5 min ago"`

**登录后 /me 401：**
- 看 cookie 是不是 httpOnly（浏览器 devtools → Application → Cookies）
- 是不是同源（前端和后端都走 :80）

**db 健康检查不过：**
```bash
sudo docker compose logs db
```
