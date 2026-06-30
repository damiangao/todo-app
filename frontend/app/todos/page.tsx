"use client";
import { useState, useEffect, FormEvent, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api, Todo, Priority, Recurrence } from "@/lib/api";

const PRIORITY_LABEL: Record<Priority, string> = {
  low: "低",
  medium: "中",
  high: "高",
  urgent: "紧急",
};
const RECURRENCE_LABEL: Record<Recurrence, string> = {
  none: "不重复",
  daily: "每天",
  weekly: "每周",
  monthly: "每月",
};

type Filter = "all" | "active" | "completed" | "urgent" | "overdue";

// 把 UTC ISO 字符串转成 datetime-local 需要的本地时间字符串
// (HTML datetime-local 没有时区概念, 用户填的"今晚 23:00"是本地时间,
//  后端存 UTC, 显示时必须把 UTC 转回本地时区再放回 input)
function utcIsoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);  // 有 Z 后缀, 浏览器会按 UTC 解析
  if (isNaN(d.getTime())) return "";
  // 取本地时间 (用户视角的"墙钟"), 格式 YYYY-MM-DDTHH:mm
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 计算"应当的默认到期时间": 当天 18:00; 过了 18:00 顺延到次日 18:00
// (本地时区. 选 18:00 是常见的"下班前完成"语义)
function computeDefaultDueDateLocal(): string {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// 显示给用户看的默认时间 (更易读: "今天 18:00" / "明天 18:00")
function defaultDueDatePlaceholder(): string {
  const d = new Date();
  d.setHours(18, 0, 0, 0);
  if (d.getTime() <= Date.now()) {
    d.setDate(d.getDate() + 1);
    return "明天 18:00";
  }
  return "今天 18:00";
}

function formatDue(due: string | null) {
  if (!due) return null;
  const d = new Date(due);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const isPast = d.getTime() < now.getTime();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  const time = `${hh}:${mm}`;
  if (isToday) return `今天 ${time}`;
  if (isPast) return `已过期 ${md} ${time}`;
  return `${md} ${time}`;
}

function isOverdue(todo: Todo): boolean {
  if (!todo.due_date || todo.completed) return false;
  return new Date(todo.due_date).getTime() < Date.now();
}

function isDueToday(todo: Todo): boolean {
  if (!todo.due_date || todo.completed) return false;
  const d = new Date(todo.due_date);
  const now = new Date();
  return d.toDateString() === now.toDateString();
}

export default function TodosPage() {
  const { auth, logout } = useAuth();
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Todo | null>(null);
  const [addingChildFor, setAddingChildFor] = useState<number | null>(null);

  // 未登录 → 跳 login
  useEffect(() => {
    if (auth.status === "anon") router.replace("/login");
  }, [auth.status, router]);

  // 拉数据
  const reload = async () => {
    if (auth.status !== "authed") return;
    setLoading(true);
    try {
      const list = await api.listTodos();
      setTodos(list);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { reload(); }, [auth.status]);

  // 启动/停止通知轮询

  const filtered = useMemo(() => {
    let list = todos;
    if (filter === "active") list = list.filter(t => !t.completed);
    if (filter === "completed") list = list.filter(t => t.completed);
    if (filter === "urgent") list = list.filter(t => t.priority === "urgent" && !t.completed);
    if (filter === "overdue") list = list.filter(t => isOverdue(t));
    return list;
  }, [todos, filter]);

  const stats = useMemo(() => ({
    total: todos.length,
    active: todos.filter(t => !t.completed).length,
    done: todos.filter(t => t.completed).length,
    overdue: todos.filter(t => isOverdue(t)).length,
  }), [todos]);

  const toggleComplete = async (t: Todo) => {
    // 乐观更新
    setTodos(prev => prev.map(p => p.id === t.id ? { ...p, completed: !p.completed } : p));
    try {
      const updated = await api.updateTodo(t.id, { completed: !t.completed });
      // 后端可能为 recurring task 生成了下一条, 整体刷新
      await reload();
    } catch (e) {
      console.error(e);
      await reload();
    }
  };

  const remove = async (t: Todo) => {
    if (!confirm(`确认删除 "${t.title}"?`)) return;
    setTodos(prev => prev.filter(p => p.id !== t.id));
    try {
      await api.deleteTodo(t.id);
    } catch (e) {
      console.error(e);
      await reload();
    }
  };

  if (auth.status === "loading" || auth.status === "anon") {
    return <div className="cp-app cp-dim">// 加载中 ...</div>;
  }

  return (
    <div className="cp-app">
      {/* Header */}
      <header className="cp-header">
        <div className="cp-header__logo cp-glitch">
          NIGHT<span>.</span>CITY
        </div>
        <div className="cp-flex">
          <span className="cp-dim cp-mono" style={{ fontSize: 12 }}>
            {auth.user.email}
          </span>
          <button className="cp-btn cp-btn--ghost cp-btn--sm" onClick={logout}>
            LOGOUT
          </button>
        </div>
      </header>

      {/* Stats */}
      <div className="cp-flex cp-mb-4" style={{ fontSize: 12, color: "var(--cp-fg-dim)" }}>
        <span>[ 总:{stats.total} ]</span>
        <span style={{ color: "var(--cp-yellow)" }}>[ 进行:{stats.active} ]</span>
        <span style={{ color: "var(--cp-green)" }}>[ 完成:{stats.done} ]</span>
        {stats.overdue > 0 && <span style={{ color: "var(--cp-magenta)" }}>[ 过期:{stats.overdue} ]</span>}
      </div>

      {/* Filters */}
      <div className="cp-filters">
        {(["all", "active", "overdue", "urgent", "completed"] as Filter[]).map(f => (
          <button
            key={f}
            className="cp-btn cp-btn--sm"
            style={{
              backgroundColor: filter === f ? "var(--cp-yellow)" : "transparent",
              color: filter === f ? "var(--cp-bg)" : "var(--cp-fg-dim)",
            }}
            onClick={() => setFilter(f)}
          >
            {f === "all" ? "ALL" : f === "active" ? "ACTIVE" : f === "overdue" ? "💀 OVERDUE" : f === "urgent" ? "⚠ URGENT" : "DONE"}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button className="cp-btn cp-btn--sm" onClick={() => { setEditing(null); setShowForm(true); }}>
          + NEW
        </button>
      </div>

      {/* Form Modal */}
      {showForm && (
        <TodoForm
          initial={editing || (addingChildFor ? { parent_id: addingChildFor } as any : null)}
          onClose={() => { setShowForm(false); setEditing(null); setAddingChildFor(null); }}
          onSaved={async () => { setShowForm(false); setEditing(null); setAddingChildFor(null); await reload(); }}
        />
      )}

      {/* List */}
      {loading ? (
        <div className="cp-empty">// LOADING ...</div>
      ) : filtered.length === 0 ? (
        <div className="cp-empty">// 暂无任务 //</div>
      ) : (
        <div className="cp-list">
          {filtered.map(t => (
            <TodoItem
              key={t.id}
              todo={t}
              onToggle={() => toggleComplete(t)}
              onEdit={() => { setEditing(t); setShowForm(true); }}
              onDelete={() => remove(t)}
              onAddChild={() => { setAddingChildFor(t.id); setShowForm(true); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ===== TodoItem =====
function TodoItem({ todo, onToggle, onEdit, onDelete, onAddChild }: {
  todo: Todo;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
}) {
  const overdue = isOverdue(todo);
  const dueToday = isDueToday(todo);
  const cls = [
    "cp-todo",
    todo.priority === "urgent" && !todo.completed ? "cp-todo--urgent" : "",
    todo.completed ? "cp-todo--completed" : "",
    overdue ? "cp-todo--overdue" : "",
    dueToday ? "cp-todo--due-today" : "",
    todo.parent_id ? "cp-todo--child" : "",
  ].filter(Boolean).join(" ");

  return (
    <>
      <div className={cls}>
        <div
          className={`cp-todo__check ${todo.completed ? "cp-todo__check--checked" : ""}`}
          onClick={onToggle}
          role="checkbox"
          aria-checked={todo.completed}
        >
          {todo.completed ? "✓" : ""}
        </div>
        <div className="cp-todo__body">
          <div className="cp-todo__title">{todo.title}</div>
          {todo.description && <div className="cp-todo__desc">{todo.description}</div>}
          <div className="cp-todo__meta">
            <span className={`cp-tag cp-tag--${todo.priority}`}>{PRIORITY_LABEL[todo.priority]}</span>
            {todo.category && <span className="cp-tag cp-tag--category">#{todo.category}</span>}
            {todo.recurrence !== "none" && <span className="cp-tag cp-tag--recurring">↻ {RECURRENCE_LABEL[todo.recurrence]}</span>}
            {todo.due_date && <span className="cp-todo__due">⏱ {formatDue(todo.due_date)}</span>}
          </div>
        </div>
        <div className="cp-todo__actions">
          <button className="cp-btn cp-btn--ghost cp-btn--sm" onClick={onAddChild} title="添加子任务">+</button>
          <button className="cp-btn cp-btn--ghost cp-btn--sm" onClick={onEdit}>编辑</button>
          <button className="cp-btn cp-btn--danger cp-btn--sm" onClick={onDelete}>删</button>
        </div>
      </div>
      {todo.children?.map(c => (
        <TodoItem
          key={c.id}
          todo={c}
          onToggle={() => onToggle()}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </>
  );
}

// ===== TodoForm =====
function TodoForm({ initial, onClose, onSaved }: {
  initial: Todo | { parent_id: number } | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = initial && "id" in initial;
  const parentId = initial && "parent_id" in initial ? initial.parent_id : null;
  const [title, setTitle] = useState((initial && "title" in initial ? initial.title : "") || "");
  const [description, setDescription] = useState((initial && "description" in initial ? (initial.description || "") : "") || "");
  const [priority, setPriority] = useState<Priority>((initial && "priority" in initial ? initial.priority : "medium") || "medium");
  const [category, setCategory] = useState((initial && "category" in initial ? (initial.category || "") : "") || "");
  // 新建时 DUE 留空, 用 placeholder 提示默认 (今天 18:00 / 明天 18:00)
  // 编辑时如果有 due_date 就用本地时间回填
  const [dueDate, setDueDate] = useState(
    initial && "due_date" in initial && initial.due_date
      ? utcIsoToLocalInput(initial.due_date)
      : ""
  );
  const [recurrence, setRecurrence] = useState<Recurrence>((initial && "recurrence" in initial ? initial.recurrence : "none") || "none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      // 用户没填时间 → 用 placeholder 暗示的默认时间 (今天/明天 18:00)
      const finalDueDate = dueDate || computeDefaultDueDateLocal();
      const payload: any = {
        title,
        description: description || null,
        priority,
        category: category || null,
        due_date: finalDueDate ? new Date(finalDueDate).toISOString() : null,
        recurrence,
      };
      if (parentId) payload.parent_id = parentId;
      if (isEdit) {
        await api.updateTodo((initial as Todo).id, payload);
      } else {
        await api.createTodo(payload);
      }
      onSaved();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      const m = msg.match(/"detail":"([^"]+)"/);
      setError(m ? m[1] : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)",
        display: "flex", alignItems: "center", justifyContent: "center",
        zIndex: 1000, padding: 20,
      }}
      onClick={onClose}
    >
      <form
        className="cp-form"
        onClick={(e) => e.stopPropagation()}
        onSubmit={submit}
        style={{ maxWidth: 560, width: "100%", maxHeight: "90vh", overflowY: "auto" }}
      >
        <h3 className="cp-mb-2">
          {isEdit ? "EDIT TODO" : parentId ? "NEW SUBTASK" : "NEW TODO"}
        </h3>
        {error && <div className="cp-auth__error">[ERR] {error}</div>}

        <div>
          <label className="cp-dim" style={{ fontSize: 11, textTransform: "uppercase" }}>TITLE //</label>
          <input
            type="text" required value={title} onChange={(e) => setTitle(e.target.value)}
            placeholder="杀 Voodoo Boys" autoFocus
          />
        </div>

        <div>
          <label className="cp-dim" style={{ fontSize: 11, textTransform: "uppercase" }}>DESCRIPTION //</label>
          <textarea
            rows={2} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Pacific Dreams 任务"
          />
        </div>

        <div className="cp-form__row">
          <div>
            <label className="cp-dim" style={{ fontSize: 11 }}>PRIORITY //</label>
            <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              <option value="low">低</option>
              <option value="medium">中</option>
              <option value="high">高</option>
              <option value="urgent">紧急</option>
            </select>
          </div>
          <div>
            <label className="cp-dim" style={{ fontSize: 11 }}>CATEGORY //</label>
            <input type="text" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="主线 / 支线 / 日常" />
          </div>
        </div>

        <div className="cp-form__row">
          <div>
            <label className="cp-dim" style={{ fontSize: 11 }}>DUE //</label>
            <input
              type="datetime-local"
              value={dueDate}
              placeholder={defaultDueDatePlaceholder()}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          <div>
            <label className="cp-dim" style={{ fontSize: 11 }}>RECURRENCE //</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value as Recurrence)}>
              <option value="none">不重复</option>
              <option value="daily">每天</option>
              <option value="weekly">每周</option>
              <option value="monthly">每月</option>
            </select>
          </div>
        </div>

        <div className="cp-form__row" style={{ justifyContent: "flex-end" }}>
          <button type="button" className="cp-btn cp-btn--ghost" onClick={onClose}>CANCEL</button>
          <button type="submit" className="cp-btn" disabled={busy}>
            {busy ? "..." : isEdit ? "SAVE" : "CREATE"}
          </button>
        </div>
      </form>
    </div>
  );
}
