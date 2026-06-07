"use client";

import { AlertTriangle, Check, Clock3, Coffee, Lock, Sparkles } from "lucide-react";
import { useState } from "react";

import { DailyCheckin } from "./daily-checkin";

type Segment = "morning" | "afternoon" | "evening";

type Task = {
  id: string;
  segment: Segment;
  title: string;
  context: string;
  track: string;
  minutes: number;
  energy: "低" | "中" | "高";
  done: boolean;
};

const segmentLabels: Record<Segment, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

const initialTasks: Task[] = [
  { id: "t1", segment: "morning", title: "完成 MCP token 范围说明", context: "Planner", track: "主线", minutes: 90, energy: "高", done: false },
  { id: "t2", segment: "morning", title: "复核 patch approval 边界", context: "Planner", track: "主线", minutes: 45, energy: "中", done: false },
  { id: "t3", segment: "afternoon", title: "线性代数 eigenvalues 习题", context: "MATH 221", track: "课程", minutes: 75, energy: "中", done: false },
  { id: "t4", segment: "afternoon", title: "回复 advisor 关于 thesis scope", context: "Inbox", track: "课程", minutes: 20, energy: "低", done: false },
  { id: "t5", segment: "evening", title: "读 20 页 Seeing Like a State", context: "Reading", track: "阅读", minutes: 30, energy: "低", done: false },
];

const routines = [
  { id: "r1", title: "做晚饭", minutes: 40, done: false },
  { id: "r2", title: "整理桌面和餐具", minutes: 15, done: false },
  { id: "r3", title: "通勤到 campus", minutes: 50, done: true },
];

const recoveryBlocks = [
  { id: "rc1", title: "免打扰恢复块", time: "20:30 - 22:30" },
  { id: "rc2", title: "周日 reset", time: "全天保护" },
];

const warnings = [
  { id: "w1", title: "Inbox 已超过 10 条", text: "先处理几条即可，不要让 warning 抢掉今日主任务。" },
  { id: "w2", title: "本周恢复低于目标", text: "已排 3.5h / 目标 8h，优先保护今晚恢复块。" },
];

function minutesLabel(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

export function TodayView() {
  const [tasks, setTasks] = useState(initialTasks);
  const completed = tasks.filter((task) => task.done).length;
  const remainingMinutes = tasks.filter((task) => !task.done).reduce((sum, task) => sum + task.minutes, 0);

  function toggleTask(id: string) {
    setTasks((current) => current.map((task) => (task.id === id ? { ...task, done: !task.done } : task)));
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
        <a
          href="/reschedule"
          className="inline-flex w-fit items-center gap-2 rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900"
        >
          <Sparkles size={16} />
          3 条待审核调整
        </a>
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
            <span className="rounded bg-zinc-100 px-2 py-1 text-xs text-zinc-600">{routines.filter((item) => item.done).length}/{routines.length}</span>
          </div>
          <div className="mt-3 space-y-2">
            {routines.map((routine) => (
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
            {recoveryBlocks.map((block) => (
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
          {warnings.map((warning) => (
            <div key={warning.id} className="rounded bg-amber-50 px-3 py-2">
              <p className="text-sm font-medium text-amber-950">{warning.title}</p>
              <p className="mt-1 text-xs text-amber-800">{warning.text}</p>
            </div>
          ))}
        </div>
      </section>

      <DailyCheckin />
    </div>
  );
}
