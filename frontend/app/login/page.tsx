"use client";
import { useState, useEffect, FormEvent, Suspense } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

function LoginInner() {
  const { auth, login, register } = useAuth();
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // 读 URL ?mode=register
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("mode") === "register") setMode("register");
  }, []);

  // 已登录 → 跳到 /todos
  useEffect(() => {
    if (auth.status === "authed") {
      router.replace("/todos");
    }
  }, [auth.status, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") {
        await login(email, password);
      } else {
        await register(email, password);
      }
      router.replace("/todos");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "unknown error";
      const m = msg.match(/"detail":"([^"]+)"/);
      setError(m ? m[1] : msg);
    } finally {
      setBusy(false);
    }
  };

  if (auth.status === "loading") {
    return (
      <div className="cp-auth">
        <div className="cp-flicker cp-dim">// 初始化 ...</div>
      </div>
    );
  }

  return (
    <div className="cp-auth">
      <div className="cp-auth__panel">
        <div className="cp-auth__title">NIGHT.CITY</div>
        <div className="cp-auth__subtitle">// todo.exe</div>

        {error && <div className="cp-auth__error">[ERR] {error}</div>}

        <form onSubmit={submit}>
          <div className="cp-auth__field">
            <label>EMAIL //</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="runner@nightcity.net"
              autoFocus
            />
          </div>
          <div className="cp-auth__field">
            <label>PASSWORD //</label>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="min 8 chars"
            />
          </div>

          <button type="submit" className="cp-btn" style={{ width: "100%" }} disabled={busy}>
            {busy ? "..." : mode === "login" ? ">> JACK IN" : ">> REGISTER"}
          </button>
        </form>

        <div className="cp-auth__switch">
          {mode === "login" ? (
            <>
              没账号?{" "}
              <a onClick={() => { setMode("register"); setError(null); }} style={{ cursor: "pointer" }}>
                新建一个
              </a>
            </>
          ) : (
            <>
              已有账号?{" "}
              <a onClick={() => { setMode("login"); setError(null); }} style={{ cursor: "pointer" }}>
                登录
              </a>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="cp-auth"><div className="cp-dim">// ...</div></div>}>
      <LoginInner />
    </Suspense>
  );
}
