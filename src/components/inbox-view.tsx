"use client";

import { ArrowUpRight, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import type { InboxItemView } from "@/lib/planning/view-data";

type InboxAction = "task" | "routine" | "delete";

const actionLabels: Record<InboxAction, string> = {
  task: "已提升为任务",
  routine: "已转成日常",
  delete: "已删除",
};

export function InboxView({
  initialItems,
  dataUnavailable = false,
}: {
  initialItems: InboxItemView[];
  dataUnavailable?: boolean;
}) {
  const [items, setItems] = useState(initialItems);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const overLimit = items.length > 10;

  useEffect(() => {
    function handleCreated(event: Event) {
      const item = (event as CustomEvent<{ id: string; title: string }>).detail;
      if (!item?.id || !item.title) return;
      setItems((current) => [{ id: item.id, title: item.title, age: "刚刚" }, ...current]);
      setLastAction("已加入 Inbox");
    }

    window.addEventListener("inbox:item-created", handleCreated);
    return () => window.removeEventListener("inbox:item-created", handleCreated);
  }, []);

  async function act(id: string, action: InboxAction) {
    if (dataUnavailable) {
      setLastAction("本地数据源未配置，暂时无法处理。");
      return;
    }

    setPendingId(id);
    const response = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    setPendingId(null);

    if (!response.ok) {
      setLastAction("处理失败，请重试。");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
    setLastAction(actionLabels[action]);
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Inbox</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">待整理暂存池</h1>
          <p className="mt-1 text-sm text-zinc-500">{items.length} 条未处理。这里接住想法，不占今日容量，也不参与 agent patch。</p>
        </div>
        {lastAction ? <span className="w-fit rounded bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{lastAction}</span> : null}
      </section>

      {dataUnavailable ? (
        <section className="flex gap-3 rounded border border-amber-200 bg-amber-50 p-4">
          <TriangleAlert size={18} className="mt-0.5 flex-none text-amber-700" />
          <div>
            <h2 className="text-sm font-semibold text-amber-950">本地数据源未配置</h2>
            <p className="mt-1 text-sm text-amber-800">当前没有 DATABASE_URL，Inbox 会显示为空态；配置数据库后会读取真实数据。</p>
          </div>
        </section>
      ) : null}

      {overLimit ? (
        <section className="flex gap-3 rounded border border-amber-200 bg-amber-50 p-4">
          <TriangleAlert size={18} className="mt-0.5 flex-none text-amber-700" />
          <div>
            <h2 className="text-sm font-semibold text-amber-950">超过 10 条等待处理</h2>
            <p className="mt-1 text-sm text-amber-800">Inbox 不占 capacity，但堆积会污染计划判断。先处理几条，不需要一次清空。</p>
          </div>
        </section>
      ) : null}

      <section className="rounded border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-2 border-b border-zinc-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-zinc-950">未处理条目</h2>
            <p className="text-sm text-zinc-500">每条只做一个决定：变任务、变日常、删除。</p>
          </div>
          <span className="w-fit rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">不写入 capacity · 不触发 patch</span>
        </div>

        {items.length === 0 ? (
          <div className="py-10 text-center">
            <h3 className="font-medium text-zinc-950">Inbox 已清空</h3>
            <p className="mt-1 text-sm text-zinc-500">新的 quick capture 会继续进入这里，等你手动整理。</p>
          </div>
        ) : (
          <div className="mt-3 divide-y divide-zinc-100">
            {items.map((item) => (
              <div key={item.id} className="grid gap-3 py-3 md:grid-cols-[1fr_auto] md:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-zinc-950">{item.title}</p>
                  <p className="mt-1 text-xs text-zinc-500">{item.age} 前捕获 · 仍未分类</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void act(item.id, "task")}
                    className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <ArrowUpRight size={13} />
                    提升为任务
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void act(item.id, "routine")}
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                  >
                    <RefreshCcw size={13} />
                    转成日常
                  </button>
                  <button
                    type="button"
                    disabled={pendingId === item.id}
                    onClick={() => void act(item.id, "delete")}
                    className="inline-flex items-center gap-1 rounded border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
