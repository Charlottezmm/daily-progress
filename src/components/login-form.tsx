"use client";

import { useState } from "react";
import { CatIcon } from "./cat-icon";

type LoginResponse = {
  error?: string;
};

export function LoginForm() {
  const [workspaceName, setWorkspaceName] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workspaceName, password }),
    });
    const data = (await response.json()) as LoginResponse;
    setPending(false);

    if (!response.ok) {
      setMessage(data.error ?? "登录失败");
      return;
    }

    window.location.href = "/today";
  }

  return (
    <form onSubmit={submit} className="paw-login">
      <div className="paw-login-card">
        <div>
          <h1 className="paw-login-brand">
            <CatIcon size={38} />
            PawPlan
          </h1>
          <p className="paw-login-copy">创建或进入你的 workspace。每个人只看到自己的计划数据。</p>
        </div>
        <div className="paw-login-fields">
          <input
            value={workspaceName}
            onChange={(event) => setWorkspaceName(event.target.value)}
            placeholder="Workspace name"
            className="paw-input"
          />
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            type="password"
            className="paw-input"
          />
          <button disabled={pending} className="paw-primary-btn">
            {pending ? "Saving..." : "Continue"}
          </button>
          {message ? <p className="paw-error">{message}</p> : null}
        </div>
      </div>
    </form>
  );
}
