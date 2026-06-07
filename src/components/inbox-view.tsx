"use client";

import { ArrowUpRight, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { useState } from "react";

const initialItems = [
  { id: "i1", title: "问 Sam GPU credits 什么时候续", age: "2h" },
  { id: "i2", title: "月底前预约牙医", age: "5h" },
  { id: "i3", title: "想法：weekly review template", age: "1d" },
  { id: "i4", title: "域名续费快到期", age: "1d" },
  { id: "i5", title: "报销表跟进", age: "2d" },
  { id: "i6", title: "浇植物，要不要做成 routine", age: "2d" },
  { id: "i7", title: "读 MCP spec 更新", age: "3d" },
  { id: "i8", title: "给妈妈挑生日礼物", age: "3d" },
  { id: "i9", title: "导出旧 Roam graph", age: "4d" },
  { id: "i10", title: "试新的咖啡研磨档位", age: "4d" },
  { id: "i11", title: "安排眼科检查", age: "5d" },
  { id: "i12", title: "取消不用的订阅", age: "6d" },
];

const actionLabels = {
  task: "已提升为任务",
  routine: "已转成日常",
  delete: "已删除",
};

export function InboxView() {
  const [items, setItems] = useState(initialItems);
  const [lastAction, setLastAction] = useState<string | null>(null);
  const overLimit = items.length > 10;

  function act(id: string, action: keyof typeof actionLabels) {
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
                    onClick={() => act(item.id, "task")}
                    className="inline-flex items-center gap-1 rounded border border-zinc-300 px-2.5 py-1.5 text-xs font-medium text-zinc-900 hover:bg-zinc-50"
                  >
                    <ArrowUpRight size={13} />
                    提升为任务
                  </button>
                  <button
                    type="button"
                    onClick={() => act(item.id, "routine")}
                    className="inline-flex items-center gap-1 rounded border border-zinc-200 px-2.5 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    <RefreshCcw size={13} />
                    转成日常
                  </button>
                  <button
                    type="button"
                    onClick={() => act(item.id, "delete")}
                    className="inline-flex items-center gap-1 rounded border border-rose-200 px-2.5 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-50"
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
