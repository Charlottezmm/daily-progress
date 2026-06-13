"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

export function FloatingCat() {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const inputRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (open && rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || status === "saving") return;
    setStatus("saving");
    try {
      const response = await fetch("/api/inbox", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      if (!response.ok) throw new Error("save failed");
      const data = (await response.json()) as { item?: { id: string; title: string } };
      if (data.item) {
        window.dispatchEvent(new CustomEvent("inbox:item-created", { detail: data.item }));
      }
      setTitle("");
      setStatus("saved");
      window.setTimeout(() => setStatus("idle"), 1600);
    } catch {
      setStatus("error");
    }
  }

  return (
    <div ref={rootRef} className="floating-cat-root">
      {open ? (
        <form onSubmit={submit} className="floating-cat-panel">
          <p className="floating-cat-hint">记一条想法，先放进暂存池</p>
          <div className="floating-cat-row">
            <input
              ref={inputRef}
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
                if (status !== "saving") setStatus("idle");
              }}
              placeholder="比如：查一下 LeRobot 的安装文档"
              className="floating-cat-input"
            />
            <button type="submit" disabled={!title.trim() || status === "saving"} className="floating-cat-send">
              {status === "saving" ? "…" : "记下"}
            </button>
          </div>
          {status === "saved" ? <p className="floating-cat-status ok">已收进暂存池</p> : null}
          {status === "error" ? <p className="floating-cat-status err">没存上，再试一次</p> : null}
        </form>
      ) : null}
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`floating-cat-btn ${open ? "open" : ""}`}
        aria-label={open ? "收起快速捕捉" : "快速捕捉想法"}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={status === "error" ? "/cats/sorry.png" : open ? "/cats/think.png" : "/cats/happy.png"}
          alt=""
          width={44}
          height={44}
        />
      </button>
    </div>
  );
}
