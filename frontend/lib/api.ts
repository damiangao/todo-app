// 在容器内/浏览器内都通过同源 /api/* 调用,不再走环境变量
const API_BASE = "";

export type User = {
  id: number;
  email: string;
  created_at: string;
};

export type Priority = "low" | "medium" | "high" | "urgent";
export type Recurrence = "none" | "daily" | "weekly" | "monthly";

export type Todo = {
  id: number;
  parent_id: number | null;
  title: string;
  description: string | null;
  completed: boolean;
  completed_at: string | null;
  priority: Priority;
  category: string | null;
  due_date: string | null;
  recurrence: Recurrence;
  recurrence_source_id: number | null;
  created_at: string;
  updated_at: string;
  children: Todo[];
};

export type CreateTodoInput = {
  title: string;
  description?: string | null;
  priority?: Priority;
  category?: string | null;
  due_date?: string | null;
  recurrence?: Recurrence;
  parent_id?: number | null;
};

async function http<T>(
  path: string,
  init?: RequestInit & { json?: unknown }
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    ...init,
    credentials: "include", // httpOnly cookie 必须
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    body: init?.json !== undefined ? JSON.stringify(init.json) : init?.body,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  // auth
  register: (email: string, password: string) =>
    http<{ user: User }>("/api/auth/register", { method: "POST", json: { email, password } }),
  login: (email: string, password: string) =>
    http<{ user: User }>("/api/auth/login", { method: "POST", json: { email, password } }),
  logout: () => http<void>("/api/auth/logout", { method: "POST" }),
  me: () => http<User>("/api/auth/me"),
  refresh: () => http<{ user: User }>("/api/auth/refresh", { method: "POST" }),

  // todos
  listTodos: (filters?: { completed?: boolean; category?: string; priority?: Priority }) => {
    const params = new URLSearchParams();
    if (filters?.completed !== undefined) params.set("completed", String(filters.completed));
    if (filters?.category) params.set("category", filters.category);
    if (filters?.priority) params.set("priority", filters.priority);
    const qs = params.toString();
    return http<Todo[]>(`/api/todos${qs ? "?" + qs : ""}`);
  },
  createTodo: (input: CreateTodoInput) =>
    http<Todo>("/api/todos", { method: "POST", json: input }),
  updateTodo: (id: number, patch: Partial<CreateTodoInput & { completed: boolean }>) =>
    http<Todo>(`/api/todos/${id}`, { method: "PATCH", json: patch }),
  deleteTodo: (id: number) => http<void>(`/api/todos/${id}`, { method: "DELETE" }),
};
