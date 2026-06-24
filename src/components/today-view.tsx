"use client";

import { AlertTriangle, Check, ChevronDown, Clock3, Plus, RotateCcw } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { CatIcon } from "./cat-icon";
import { DailyCheckin } from "./daily-checkin";
import type { TodayViewData } from "@/lib/planning/view-data";

type Task = TodayViewData["tasks"][number];
type PersistedStatus = Task["status"];
type DisplayStatus = PersistedStatus | "blocked";
const weekdayChars = "日一二三四五六";

export function formatTodayGreeting(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? "01";
  const year = Number(value("year"));
  const month = Number(value("month"));
  const day = Number(value("day"));
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return `${month}月${day}日 星期${weekdayChars[weekday]}`;
}

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

export function TodayView({ data, beforeTasks }: { data: TodayViewData; beforeTasks?: ReactNode }) {
  const [tasks, setTasks] = useState<Array<Task & { displayStatus: DisplayStatus }>>(
    data.tasks.map((task) => ({
      ...task,
      displayStatus: task.blocked && task.status === "todo" ? "blocked" : task.status,
    })),
  );
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [choreText, setChoreText] = useState("");
  const [choreSaving, setChoreSaving] = useState(false);

  async function addChore(event: React.FormEvent) {
    event.preventDefault();
    const title = choreText.trim();
    if (!title || choreSaving || data.dataUnavailable) return;
    setChoreSaving(true);
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setChoreSaving(false);
    if (!response.ok) return;
    const { task } = (await response.json()) as { task: { id: string; daySegment: Task["segment"] } };
    setTasks((current) => [
      {
        id: task.id,
        segment: task.daySegment,
        title,
        context: "未分类",
        track: "未分类",
        minutes: 15,
        energy: "中",
        status: "todo",
        blocked: false,
        done: false,
        isChore: true,
        displayStatus: "todo",
      },
      ...current,
    ]);
    setChoreText("");
  }

  const doneCount = tasks.filter((task) => task.displayStatus === "done").length;
  const unresolvedTasks = tasks.filter((task) => task.displayStatus !== "done");
  const unresolvedMinutes = unresolvedTasks.reduce((sum, task) => sum + task.minutes, 0);
  const fixedMinutes = useMemo(() => {
    return data.routines.reduce((sum, routine) => sum + routine.minutes, 0);
  }, [data.routines]);

  // 完成 / 跳过 / 延后的任务沉到列表底部，未处理的永远在最上面
  const sortedTasks = useMemo(() => {
    const sunk = new Set<DisplayStatus>(["done", "skipped", "backlog"]);
    return [...tasks].sort(
      (a, b) => Number(sunk.has(a.displayStatus)) - Number(sunk.has(b.displayStatus)),
    );
  }, [tasks]);

  // FLIP：卡片重新排序时做位置过渡动画
  const listRef = useRef<HTMLDivElement>(null);
  const cardPositions = useRef<Map<string, number>>(new Map());
  useLayoutEffect(() => {
    const cards = listRef.current?.querySelectorAll<HTMLElement>("[data-task-id]") ?? [];
    cards.forEach((el) => {
      const id = el.dataset.taskId;
      if (!id) return;
      const nextTop = el.getBoundingClientRect().top;
      const prevTop = cardPositions.current.get(id);
      if (prevTop !== undefined && prevTop !== nextTop) {
        el.animate(
          [{ transform: `translateY(${prevTop - nextTop}px)` }, { transform: "none" }],
          { duration: 380, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
        );
      }
      cardPositions.current.set(id, nextTop);
    });
  });

  // 猫的表情和台词跟随状态（小时数挂载后再取，避免 SSR 时区差异）
  const [hour, setHour] = useState<number | null>(null);
  useEffect(() => {
    setHour(new Date().getHours());
  }, []);

  const allDone = tasks.length > 0 && doneCount === tasks.length;
  const blockedCount = tasks.filter((task) => task.displayStatus === "blocked").length;
  let catMood: "happy" | "think" | "sleep" | "celebrate" | "worried" | "cheer" = "think";
  let catMsg = `今天排了 ${tasks.length} 件事。完成就勾掉，做不完的我来重排。`;
  if (allDone) {
    catMood = "celebrate";
    catMsg = "全部搞定！剩下的时间都是你的。";
  } else if (hour !== null && (hour >= 22 || hour < 4)) {
    catMood = "sleep";
    catMsg = "很晚了，记个收工反馈就去休息吧。";
  } else if (blockedCount > 0) {
    catMood = "worried";
    catMsg = `有 ${blockedCount} 件卡住了，先做别的，重排的事交给我。`;
  } else if (tasks.length === 0) {
    catMood = "sleep";
    catMsg = "今天还没有安排任务，要记什么找右下角的小猫。";
  } else if (doneCount > 0) {
    catMood = "cheer";
    catMsg = `已完成 ${doneCount}/${tasks.length}，节奏不错，继续。`;
  }

  async function patchTask(id: string, body: { status?: PersistedStatus; blocked?: boolean }) {
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...body }),
    });
  }

  function setTaskStatus(id: string, status: DisplayStatus) {
    const currentTask = tasks.find((task) => task.id === id);
    if (!currentTask) return;

    // 卡住：独立于 status 的持久化标记
    if (status === "blocked") {
      const nextBlocked = currentTask.displayStatus !== "blocked";
      setTasks((current) =>
        current.map((task) =>
          task.id === id ? { ...task, displayStatus: nextBlocked ? "blocked" : "todo" } : task,
        ),
      );
      void patchTask(id, { blocked: nextBlocked });
      return;
    }

    const nextStatus = currentTask.displayStatus === status ? "todo" : status;
    const wasBlocked = currentTask.displayStatus === "blocked";
    setTasks((current) =>
      current.map((task) =>
        task.id === id
          ? {
              ...task,
              displayStatus: nextStatus,
              status: nextStatus,
              done: nextStatus === "done" || nextStatus === "skipped",
            }
          : task,
      ),
    );
    // 设真实状态时，若此前被标卡住，一并清掉 blocked
    void patchTask(id, wasBlocked ? { status: nextStatus, blocked: false } : { status: nextStatus });
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <p className="paw-greeting">{formatTodayGreeting()}</p>
        <h1 className="paw-page-date">今日执行</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood={catMood} />
          <p className="paw-agent-msg">{catMsg}</p>
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

      {beforeTasks}

      <section>
        <div className="paw-section-label">今日任务 · 完成 {doneCount}/{tasks.length}</div>

        <form className="paw-chore-add" onSubmit={addChore}>
          <input
            type="text"
            value={choreText}
            onChange={(event) => setChoreText(event.target.value)}
            placeholder="记个杂事，回车加进今天（15 分钟）"
            disabled={data.dataUnavailable}
            className="paw-chore-input"
            aria-label="记个今日杂事"
          />
          <button type="submit" disabled={!choreText.trim() || choreSaving || data.dataUnavailable} className="paw-chore-btn">
            <Plus size={15} /> 加杂事
          </button>
        </form>

        {tasks.length > 0 && doneCount === tasks.length ? (
          <div className="paw-celebrate" role="status">
            <CatIcon size={44} mood="celebrate" />
            <p className="paw-celebrate-text">今天全部搞定，收工！</p>
          </div>
        ) : null}

        {tasks.length === 0 ? (
          <div className="paw-empty">
            <p>今天还没有安排任务。</p>
            <p>点右下角的小猫记个想法，或者在「更多 → 导入」里放入你的计划。</p>
          </div>
        ) : null}

        <div className="paw-task-list" ref={listRef}>
          {sortedTasks.map((task) => {
            const expanded = expandedId === task.id;
            return (
            <article key={task.id} data-task-id={task.id} className={`paw-task-card ${statusClass(task.displayStatus)} ${expanded ? "expanded" : ""}`}>
              <div className="paw-task-head">
                <button
                  type="button"
                  onClick={() => setTaskStatus(task.id, "done")}
                  className={`paw-task-check ${task.displayStatus === "done" ? "selected" : ""}`}
                  aria-label={task.displayStatus === "done" ? "标记为未完成" : "标记完成"}
                >
                  <Check size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => setExpandedId(expanded ? null : task.id)}
                  className="paw-task-summary"
                  aria-expanded={expanded}
                >
                  <span className="paw-task-title-row">
                    {task.isChore ? <span className="paw-chore-badge">杂事</span> : null}
                    <span className="paw-task-title">{task.title}</span>
                  </span>
                  <span className="paw-task-headmeta">
                    <Clock3 size={12} />
                    {minutesLabel(task.minutes)}
                    <ChevronDown size={16} className="paw-task-chevron" />
                  </span>
                </button>
              </div>
              {expanded ? (
                <div className="paw-task-detail">
                  <div className="paw-task-meta">
                    <span className="paw-task-tag">{task.context}</span>
                    <span>{task.track}</span>
                    <span>能量 {task.energy}</span>
                  </div>
                  <div className="paw-task-actions">
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
                    <p className="mt-2 flex items-center gap-1 text-xs text-amber-700">
                      <AlertTriangle size={12} />
                      标了卡住没关系，Agent 会帮你想办法重排。
                    </p>
                  ) : null}
                </div>
              ) : null}
            </article>
            );
          })}
        </div>
      </section>

      <section className="mt-6">
        <div className="paw-card p-5">
          <h2 className="text-base font-bold text-[var(--app-ink)]">没做完的不用管</h2>
          <p className="mt-1 text-sm font-medium text-[var(--app-ink-soft)]">
            没完成、卡住、延后的任务，Agent 会重新安排，你不用手动改日期。
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
