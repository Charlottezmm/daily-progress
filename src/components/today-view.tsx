"use client";

import { AlertTriangle, Check, Clock3, RotateCcw } from "lucide-react";
import { useMemo, useState } from "react";

import { CatIcon } from "./cat-icon";
import { DailyCheckin } from "./daily-checkin";
import type { TodayViewData } from "@/lib/planning/view-data";

type Task = TodayViewData["tasks"][number];
type PersistedStatus = Task["status"];
type DisplayStatus = PersistedStatus | "blocked";

function minutesLabel(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function statusClass(status: DisplayStatus) {
  if (status === "done") return "done";
  if (status === "blocked") return "stuck";
  if (status === "skipped") return "skipped";
  if (status === "backlog") return "deferred";
  return "";
}

export function TodayView({ data }: { data: TodayViewData }) {
  const [tasks, setTasks] = useState<Array<Task & { displayStatus: DisplayStatus }>>(
    data.tasks.map((task) => ({ ...task, displayStatus: task.status })),
  );

  const doneCount = tasks.filter((task) => task.displayStatus === "done").length;
  const unresolvedTasks = tasks.filter((task) => task.displayStatus !== "done");
  const unresolvedMinutes = unresolvedTasks.reduce((sum, task) => sum + task.minutes, 0);
  const fixedMinutes = useMemo(() => {
    return data.routines.reduce((sum, routine) => sum + routine.minutes, 0);
  }, [data.routines]);

  async function persistStatus(id: string, status: PersistedStatus) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, status }),
    });
  }

  function setTaskStatus(id: string, status: DisplayStatus) {
    setTasks((current) =>
      current.map((task) => {
        if (task.id !== id) return task;
        const nextStatus = task.displayStatus === status ? "todo" : status;
        return {
          ...task,
          displayStatus: nextStatus,
          status: nextStatus === "blocked" ? task.status : nextStatus,
          done: nextStatus === "done" || nextStatus === "skipped",
        };
      }),
    );

    if (status !== "blocked") {
      const currentTask = tasks.find((task) => task.id === id);
      const nextStatus = currentTask?.displayStatus === status ? "todo" : status;
      void persistStatus(id, nextStatus);
    }
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <p className="paw-greeting">今天</p>
        <h1 className="paw-page-date">今日执行</h1>
        <div className="paw-agent-row">
          <CatIcon size={44} />
          <p className="paw-agent-msg">Agent 今天排了 {tasks.length} 个任务；你只需要勾选事实，未完成项会进入下一次审核。</p>
        </div>
        <div className="paw-status-pills">
          {fixedMinutes > 0 ? <span className="paw-status-pill">固定安排 {minutesLabel(fixedMinutes)}</span> : null}
          <span className="paw-status-pill">剩余 {minutesLabel(unresolvedMinutes)}</span>
          {data.patchCount > 0 ? (
            <a href="/review" className="paw-status-pill link">
              {data.patchCount} 条建议待确认
            </a>
          ) : null}
          {data.warnings.slice(0, 1).map((warning) => (
            <span key={warning.id} className="paw-status-pill warn">
              {warning.title}
            </span>
          ))}
        </div>
      </section>

      {data.dataUnavailable ? (
        <section className="paw-status-pill warn" role="status">
          当前没有 DATABASE_URL，Today 显示为空态；配置数据库后会读取真实计划。
        </section>
      ) : null}

      <section>
        <div className="paw-section-label">今日任务 · 完成 {doneCount}/{tasks.length}</div>

        {tasks.length === 0 ? (
          <div className="paw-empty">
            <p>今天还没有 Agent 安排的任务。</p>
            <p>可以先在 Inbox 捕捉想法，或等 scheduled automation 写回计划。</p>
          </div>
        ) : null}

        <div className="paw-task-list">
          {tasks.map((task) => (
            <article key={task.id} className={`paw-task-card ${statusClass(task.displayStatus)}`}>
              <div className="paw-task-body">
                <h3 className="paw-task-title">{task.title}</h3>
                <div className="paw-task-meta">
                  <span className="inline-flex items-center gap-1">
                    <Clock3 size={12} />
                    {minutesLabel(task.minutes)}
                  </span>
                  <span className="paw-dot" />
                  <span className="paw-task-tag">{task.context}</span>
                  <span>{task.track}</span>
                  <span>能量 {task.energy}</span>
                </div>
              </div>
              <div className="paw-task-actions">
                <button
                  type="button"
                  onClick={() => setTaskStatus(task.id, "done")}
                  className={`paw-act-btn done ${task.displayStatus === "done" ? "selected" : ""}`}
                >
                  <Check size={14} /> 完成
                </button>
                <button
                  type="button"
                  onClick={() => setTaskStatus(task.id, "blocked")}
                  className={`paw-act-btn stuck ${task.displayStatus === "blocked" ? "selected" : ""}`}
                >
                  卡住
                </button>
                <button
                  type="button"
                  onClick={() => setTaskStatus(task.id, "skipped")}
                  className={`paw-act-btn skip ${task.displayStatus === "skipped" ? "selected" : ""}`}
                >
                  跳过
                </button>
                <button
                  type="button"
                  onClick={() => setTaskStatus(task.id, "backlog")}
                  className={`paw-act-btn defer ${task.displayStatus === "backlog" ? "selected" : ""}`}
                >
                  延后
                </button>
              </div>
              {task.displayStatus === "blocked" ? (
                <p className="mt-2 flex items-center gap-1 text-xs text-amber-700 sm:hidden">
                  <AlertTriangle size={12} />
                  卡住状态会进入本页反馈；下一阶段会写入 MCP 任务状态。
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>

      <section className="mt-6">
        <div className="paw-card p-5">
          <h2 className="text-base font-bold text-[var(--app-ink)]">下一次自动审核</h2>
          <p className="mt-1 text-sm font-medium text-[var(--app-ink-soft)]">
            今天没完成、卡住或延后的任务，会进入下一次 Agent 审核；你不用手动改日期。
          </p>
          <a href="/review" className="mt-3 inline-flex items-center gap-1 text-sm font-bold text-[var(--app-accent-dark)]">
            去看建议 <RotateCcw size={14} />
          </a>
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
