"use client";

import { useState } from "react";

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
    <form onSubmit={submit} className="mx-auto flex min-h-screen max-w-sm flex-col justify-center gap-4 px-6">
      <div>
        <h1 className="text-xl font-semibold">Daily Progress</h1>
        <p className="mt-1 text-sm text-zinc-500">创建或进入你的 workspace。</p>
      </div>
      <input
        value={workspaceName}
        onChange={(event) => setWorkspaceName(event.target.value)}
        placeholder="Workspace name"
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      <input
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder="Password"
        type="password"
        className="rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      <button disabled={pending} className="rounded bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50">
        {pending ? "Saving..." : "Continue"}
      </button>
      {message ? <p className="text-sm text-red-600">{message}</p> : null}
    </form>
  );
}
