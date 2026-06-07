"use client";

import { ArrowRight, Check, Lock, RotateCcw, ShieldCheck, Sparkles, X } from "lucide-react";
import { useState } from "react";

type Decision = "accepted" | "rejected";

type PatchItem = {
  id: string;
  kind: string;
  title: string;
  from?: string;
  to?: string;
  reason: string;
  impact: string[];
  capacity: string;
  protected?: boolean;
};

const patchItems: PatchItem[] = [
  {
    id: "p1",
    kind: "移动",
    title: "完成 MCP token 范围说明",
    from: "周六 上午",
    to: "周日 上午",
    reason: "周六上午容量接近上限，周日上午在 reset 前仍有空窗。",
    impact: ["周六容量 -90m", "周日负载 +90m"],
    capacity: "周六 95% -> 72%",
  },
  {
    id: "p2",
    kind: "拆分",
    title: "线性代数 eigenvalues 习题",
    from: "1 x 75m",
    to: "2 x 40m",
    reason: "拆到两段更适合中等能量窗口，避免挤压晚间恢复。",
    impact: ["专注窗口更短", "保留晚间恢复块"],
    capacity: "周六 +40m，周四 +40m",
  },
  {
    id: "p3",
    kind: "延期",
    title: "读 20 页 Seeing Like a State",
    from: "今天晚上",
    to: "下周",
    reason: "低优先级且不阻塞本周目标，延期能保护今晚免打扰块。",
    impact: ["保护 recovery", "本周阅读减少 30m"],
    capacity: "今晚 65% -> 58%",
  },
  {
    id: "p4",
    kind: "受保护",
    title: "移动 Evening run 来释放时间",
    from: "周六 19:00",
    to: "不可应用",
    reason: "这是 routine 保护块，agent 不能移动、缩短或删除。",
    impact: ["routine protected", "需要手动处理"],
    capacity: "不改变容量",
    protected: true,
  },
];

export function ReschedulePreview() {
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const actionable = patchItems.filter((item) => !item.protected);
  const accepted = actionable.filter((item) => decisions[item.id] === "accepted").length;
  const rejected = actionable.filter((item) => decisions[item.id] === "rejected").length;
  const pending = actionable.length - accepted - rejected;

  function decide(id: string, decision: Decision) {
    setDecisions((current) => {
      const next = { ...current };
      if (next[id] === decision) {
        delete next[id];
      } else {
        next[id] = decision;
      }
      return next;
    });
  }

  function acceptAll() {
    setDecisions(Object.fromEntries(actionable.map((item) => [item.id, "accepted" as Decision])));
  }

  function rejectAll() {
    setDecisions(Object.fromEntries(actionable.map((item) => [item.id, "rejected" as Decision])));
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-24">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">Reschedule Preview</p>
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
              <Sparkles size={12} />
              agent 建议
            </span>
          </div>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">重排变更审核</h1>
          <p className="mt-1 text-sm text-zinc-500">逐条确认后才应用。这里是 change review，不是聊天记录。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={rejectAll} className="rounded border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800 hover:bg-zinc-50">
            全部拒绝
          </button>
          <button type="button" onClick={acceptAll} className="rounded bg-zinc-950 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800">
            全部接受
          </button>
        </div>
      </section>

      <section className="flex gap-3 rounded border border-emerald-200 bg-emerald-50/60 p-4">
        <ShieldCheck size={18} className="mt-0.5 flex-none text-emerald-700" />
        <div>
          <h2 className="text-sm font-semibold text-zinc-950">routine / recovery 受保护</h2>
          <p className="mt-1 text-sm text-zinc-600">agent 只能建议任务移动、拆分、延期和优先级调整；日常事项与恢复块不能自动改动。</p>
        </div>
      </section>

      <section className="space-y-3">
        {patchItems.map((item) => {
          const decision = decisions[item.id];
          return (
            <article
              key={item.id}
              className={`rounded border bg-white p-4 ${
                item.protected ? "border-emerald-200 bg-emerald-50/40" : decision === "accepted" ? "border-zinc-950" : decision === "rejected" ? "border-zinc-200 opacity-70" : "border-zinc-200"
              }`}
            >
              <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                <div>
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-700">{item.kind}</span>
                    {item.protected ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700">
                        <Lock size={12} />
                        已阻止
                      </span>
                    ) : null}
                    {decision ? <span className="rounded bg-zinc-950 px-2 py-1 text-xs font-medium text-white">{decision === "accepted" ? "已接受" : "已拒绝"}</span> : null}
                  </div>
                  <h2 className="text-base font-semibold text-zinc-950">{item.title}</h2>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    {item.from ? <span className="rounded border border-zinc-200 px-2 py-1 text-zinc-600">{item.from}</span> : null}
                    <ArrowRight size={14} className="text-zinc-400" />
                    {item.to ? <span className="rounded border border-zinc-300 bg-zinc-50 px-2 py-1 font-medium text-zinc-900">{item.to}</span> : null}
                  </div>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    <div>
                      <p className="text-xs font-medium text-zinc-500">Reason</p>
                      <p className="mt-1 text-sm text-zinc-800">{item.reason}</p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500">Impact</p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {item.impact.map((impact) => (
                          <span key={impact} className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-700">{impact}</span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-zinc-500">Capacity</p>
                      <p className="mt-1 text-sm text-zinc-800">{item.capacity}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-row gap-2 lg:flex-col lg:items-stretch lg:justify-center">
                  {item.protected ? (
                    <div className="rounded border border-emerald-200 bg-white px-3 py-2 text-sm text-emerald-700">需要手动处理</div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => decide(item.id, "accepted")}
                        className={`inline-flex flex-1 items-center justify-center gap-1 rounded px-3 py-2 text-sm font-medium ${
                          decision === "accepted" ? "bg-zinc-950 text-white" : "border border-zinc-300 text-zinc-900 hover:bg-zinc-50"
                        }`}
                      >
                        <Check size={15} />
                        接受
                      </button>
                      <button
                        type="button"
                        onClick={() => decide(item.id, "rejected")}
                        className={`inline-flex flex-1 items-center justify-center gap-1 rounded px-3 py-2 text-sm font-medium ${
                          decision === "rejected" ? "bg-rose-600 text-white" : "border border-rose-200 text-rose-700 hover:bg-rose-50"
                        }`}
                      >
                        <X size={15} />
                        拒绝
                      </button>
                    </>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="fixed inset-x-0 bottom-0 border-t border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center">
          <div className="text-sm text-zinc-600">
            <strong className="text-zinc-950">{accepted}</strong> 接受 · <strong className="text-zinc-950">{rejected}</strong> 拒绝 ·{" "}
            <strong className="text-zinc-950">{pending}</strong> 待定
          </div>
          <div className="flex gap-2 sm:ml-auto">
            <button type="button" onClick={() => setDecisions({})} className="inline-flex items-center gap-1 rounded border border-zinc-300 px-3 py-2 text-sm font-medium text-zinc-800">
              <RotateCcw size={14} />
              重置
            </button>
            <button
              type="button"
              disabled={accepted === 0}
              className="rounded bg-zinc-950 px-3 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              应用 {accepted} 项变更
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
