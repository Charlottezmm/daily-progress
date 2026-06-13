"use client";

import { useState } from "react";
import { CatIcon } from "./cat-icon";
import { safeRelativeNextPath } from "@/lib/auth/next-url";

type LoginResponse = {
  error?: string;
};

type LoginMode = "login" | "create";

export function LoginForm({ nextPath = "/today" }: { nextPath?: string }) {
  const [mode, setMode] = useState<LoginMode>("login");
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/beta/workspaces", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(mode === "login" ? { workspaceName, password } : { workspaceName, password, inviteCode }),
    });
    const data = (await response.json()) as LoginResponse;
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "登录失败");
      return;
    }

    window.location.href = safeRelativeNextPath(nextPath);
  }

  return (
    <form onSubmit={submit} className="paw-login">
      <div className="paw-login-card">
        <div>
          <h1 className="paw-login-brand">
            <CatIcon size={38} />
            PawPlan
          </h1>
          <p className="paw-login-copy">
            已有 workspace 可直接登录；Public Beta 新 workspace 需要 invite code。当前没有密码找回，密码丢了就进不去。
          </p>
        </div>
        <div className="paw-login-fields">
          <div className="paw-login-mode" aria-label="登录模式">
            <button
              type="button"
              className={mode === "login" ? "paw-login-mode-btn is-active" : "paw-login-mode-btn"}
              aria-pressed={mode === "login"}
              onClick={() => {
                setMode("login");
                setMessage(null);
              }}
            >
              登录已有 workspace
            </button>
            <button
              type="button"
              className={mode === "create" ? "paw-login-mode-btn is-active" : "paw-login-mode-btn"}
              aria-pressed={mode === "create"}
              onClick={() => {
                setMode("create");
                setMessage(null);
              }}
            >
              使用 invite code 创建
            </button>
          </div>
          <input
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace 名称"
            className="paw-input"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="密码"
            type="password"
            className="paw-input"
          />
          {mode === "create" ? (
            <input
              value={inviteCode}
              onChange={(event) => setInviteCode(event.target.value)}
              placeholder="Invite code"
              className="paw-input"
            />
          ) : null}
          <p className="text-xs font-semibold leading-relaxed text-[var(--app-ink-soft)]">
            {mode === "create"
              ? "创建前请保存好 workspace 名称和密码；当前没有邮箱或找回入口。"
              : "如果忘记 workspace 密码，目前没有自助找回或重置入口。"}
          </p>
          <button disabled={pending} className="paw-primary-btn">
            {pending ? "处理中…" : mode === "login" ? "进入" : "创建并进入"}
          </button>
          {message ? <p className="paw-error">{message}</p> : null}
        </div>
      </div>
    </form>
  );
}
