"use client";

import { useState } from "react";

export function QuickCapture() {
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    await fetch("/api/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setTitle("");
    setPending(false);
  }

  return (
    <form onSubmit={submit} className="flex gap-2">
      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="+ Quick Capture"
        className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
      />
      <button disabled={pending} className="rounded bg-zinc-950 px-3 py-2 text-sm text-white disabled:opacity-50">
        Add
      </button>
    </form>
  );
}
