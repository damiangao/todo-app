"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api, User } from "@/lib/api";

type AuthState =
  | { status: "loading" }
  | { status: "anon" }
  | { status: "authed"; user: User };

const Ctx = createContext<{
  auth: AuthState;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState>({ status: "loading" });

  // 启动时拉 /me 验 cookie
  useEffect(() => {
    api.me()
      .then((user) => setAuth({ status: "authed", user }))
      .catch(async () => {
        // 401 试 refresh
        try {
          const r = await api.refresh();
          setAuth({ status: "authed", user: r.user });
        } catch {
          setAuth({ status: "anon" });
        }
      });
  }, []);

  const login = async (email: string, password: string) => {
    const r = await api.login(email, password);
    setAuth({ status: "authed", user: r.user });
  };
  const register = async (email: string, password: string) => {
    const r = await api.register(email, password);
    setAuth({ status: "authed", user: r.user });
  };
  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setAuth({ status: "anon" });
    }
  };

  return <Ctx.Provider value={{ auth, login, register, logout }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be inside AuthProvider");
  return v;
}
