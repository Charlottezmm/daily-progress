"use client";

import { AlertTriangle, Check, Clock3, Coffee, Lock, Sparkles } from "lucide-react";
import { useState } from "react";

import { DailyCheckin } from "./daily-checkin";
import type { TodayViewData } from "@/lib/planning/view-data";

type Segment = TodayViewData["tasks"][number]["segment"];
type Task = TodayViewData["tasks"][number];

const segmentLabels: Record<Segment, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

function minutesLabel(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function TodayView({ data }: { data: TodayViewData }) {
  const [tasks, setTasks] = useState(data.tasks);
  const completed = tasks.filter((task) => task.done).length;
  const remainingMinutes = tasks.filter((task) => !task.done).reduce((sum, task) => sum + task.minutes, 0);

  function toggleTask(id: string) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
    void fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status: tasks.find((task) => task.id === id)?.done ? "todo" : "done" }),
    });
  }

  return (
    <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.16em] text-zinc-500">今天</p>
          <h1 className="mt-1 text-2xl font-semibold text-zinc-950">Today</h1>
          <p className="mt-1 text-sm font-medium text-zinc-800">今日计划</p>
          <p className="mt-1 text-sm text-zinc-500">主任务按上午 / 下午 / 晚上推进，日常和恢复块单独保护。</p>
        </div>
        {data.patchCount > 0 ? (
          <a
            href="/reschedule"
            className="inline-flex w-fit items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
          >
            <Sparkles size={16} />
            {data.patchCount} 条待审核调整
          </a>
        ) : null}
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <div className="flex flex-col gap-2 border-b border-zinc-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="font-medium text-zinc-950">主任务</h2>
            <p className="text-sm text-zinc-500">已完成 {completed}/{tasks.length}，剩余 {minutesLabel(remainingMinutes)}。</p>
          </div>
          <span className="inline-flex w-fit items-center gap-1 rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">
            <Clock3 size={13} />
            不含日常 / 恢复
          </span>
        </div>

          <div className="mt-4 space-y-5">
          {tasks.length === 0 ? (
            <div className="rounded border border-dashed border-zinc-200 bg-zinc-50 px-3 py-8 text-center text-sm text-zinc-500">
              今天还没有任务。先用 Quick Capture 收进 Inbox，或导入计划后再排。
            </div>
          ) : null}
          {(Object.keys(segmentLabels) as Segment[]).map((segment) => {
            const segmentTasks = tasks.filter((task) => task.segment === segment);
            const segmentMinutes = segmentTasks.filter((task) => !task.done).reduce((sum, task) => sum + task.minutes, 0);
            return (
              <div key={segment}>
                <div className="mb-2 flex items-center gap-3">
                  <h3 className="text-sm font-semibold text-zinc-800">{segmentLabels[segment]}</h3>
                  <div className="h-px flex-1 bg-zinc-100" />
                  <span className="text-xs text-zinc-500">{segmentMinutes ? minutesLabel(segmentMinutes) : "完成"}</span>
                </div>
                <div className="space-y-2">
                  {segmentTasks.map((task) => (
                    <button
                      key={task.id}
                      type="button"
                      onClick={() => toggleTask(task.id)}
                      className="flex w-full items-start gap-3 rounded border border-zinc-200 bg-zinc-50 px-3 py-3 text-left transition hover:border-zinc-300"
                    >
                      <span
                        className={`mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full border ${
                          task.done ? "border-zinc-950 bg-zinc-950 text-white" : "border-zinc-300 bg-white text-transparent"
                        }`}
                      >
                        <Check size={13} />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className={`block text-sm font-medium ${task.done ? "text-zinc-400 line-through" : "text-zinc-950"}`}>{task.title}</span>
                        <span className="mt-1 flex flex-wrap gap-2 text-xs text-zinc-500">
                          <span>{minutesLabel(task.minutes)}</span>
                          <span>{task.context}</span>
                          <span>{task.track}</span>
                          <span>能量 {task.energy}</span>
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <div className="rounded border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-950">日常事项</h2>
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{data.routines.filter((item) => item.done).length}/{data.routines.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {data.routines.length === 0 ? <p className="text-sm text-zinc-500">还没有 routine。后续可在 Settings 添加。</p> : null}
            {data.routines.map((routine) => (
              <div key={routine.id} className="flex items-center justify-between rounded border border-zinc-100 px-3 py-2">
                <div>
                  <p className="text-sm font-medium text-zinc-900">{routine.title}</p>
                  <p className="text-xs text-zinc-500">{minutesLabel(routine.minutes)} · 不参与 agent 重排</p>
                </div>
                <span className={`text-xs ${routine.done ? "text-emerald-700" : "text-zinc-500"}`}>{routine.done ? "已完成" : "待做"}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded border border-emerald-200 bg-emerald-50/60 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-medium text-zinc-950">恢复保护</h2>
            <span className="inline-flex items-center gap-1 rounded bg-white px-2 py-1 text-xs text-emerald-700">
              <Lock size={13} />
              protected
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {data.recoveryBlocks.length === 0 ? <p className="text-sm text-emerald-800">今天没有已保护的恢复块。</p> : null}
            {data.recoveryBlocks.map((block) => (
              <div key={block.id} className="flex items-center gap-3 rounded border border-emerald-100 bg-white px-3 py-2">
                <span className="rounded bg-emerald-100 p-2 text-emerald-700">
                  <Coffee size={16} />
                </span>
                <div>
                  <p className="text-sm font-medium text-zinc-900">{block.title}</p>
                  <p className="text-xs text-zinc-500">{block.time} · 不移动、不压缩</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="rounded border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle size={16} className="text-amber-600" />
          <h2 className="font-medium text-zinc-950">轻量提醒</h2>
        </div>
        <div className="grid gap-2 md:grid-cols-2">
          {data.warnings.length === 0 ? <p className="text-sm text-zinc-500">当前没有需要 surfaced 的提醒。</p> : null}
          {data.warnings.map((warning) => (
            <div key={warning.id} className="rounded bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-950">{warning.title}</p>
              <p className="mt-1 text-xs text-amber-800">{warning.text}</p>
            </div>
          ))}
        </div>
      </section>

      <DailyCheckin
        initialCompletedText={data.checkin?.completedText}
        initialBlockerText={data.checkin?.blockerText}
        initialNextText={data.checkin?.nextText}
        initialStreakDays={data.streakDays}
        dataUnavailable={data.dataUnavailable}
      />
    </div>
  );
}
