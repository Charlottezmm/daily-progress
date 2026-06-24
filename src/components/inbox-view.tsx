"use client";

import { ArrowUpRight, ChevronDown, RefreshCcw, Trash2, TriangleAlert } from "lucide-react";
import { useEffect, useState } from "react";
import { BackLink } from "./back-link";
import { CatIcon } from "./cat-icon";
import { QuickCapture } from "./quick-capture";
import type { InboxItemView } from "@/lib/planning/view-data";

type DaySegment = "morning" | "afternoon" | "evening";
type RoutineTimeSegment = DaySegment | "specific_window";
type TaskPriority = "low" | "normal" | "high" | "urgent";
type InboxAction = "task" | "quick_chore_task" | "routine" | "delete";

type PromotionForm = {
  taskDate: string;
  taskSegment: DaySegment;
  taskEstimate: string;
  taskPriority: TaskPriority;
  routinePattern: string;
  routineSegment: RoutineTimeSegment;
  routineEstimate: string;
};

type InboxActionPayload =
  | { action: "delete" }
  | {
      action: "task";
      date: string;
      daySegment: DaySegment;
      estimatedMinutes: number;
      priority?: TaskPriority;
    }
  | {
      action: "quick_chore_task";
      daySegment?: DaySegment;
    }
  | {
      action: "routine";
      weekdayPattern: string;
      defaultTimeSegment: RoutineTimeSegment;
      estimatedMinutes: number;
    };

const actionLabels: Record<InboxAction, string> = {
  task: "已提升为任务",
  quick_chore_task: "已加入今日小杂事",
  routine: "已转成日常",
  delete: "已删除",
};

const segmentLabels: Record<DaySegment, string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

const routineSegmentLabels: Record<RoutineTimeSegment, string> = {
  ...segmentLabels,
  specific_window: "固定时间窗",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

function localDateKey(date: Date) {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const day = date.getDate().toString().padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateKeyOffset(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return localDateKey(date);
}

function defaultPromotionForm(todayKey: string): PromotionForm {
  return {
    taskDate: todayKey,
    taskSegment: "morning",
    taskEstimate: "30",
    taskPriority: "normal",
    routinePattern: "daily",
    routineSegment: "evening",
    routineEstimate: "30",
  };
}

function minutesFromInput(value: string) {
  const minutes = Number(value);
  if (!Number.isInteger(minutes)) return null;
  if (minutes < 5 || minutes > 480) return null;
  return minutes;
}

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
  const [todayKey] = useState(() => localDateKey(new Date()));
  const [forms, setForms] = useState<Record<string, PromotionForm>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const overLimit = items.length > 10;

  function formFor(id: string) {
    return forms[id] ?? defaultPromotionForm(todayKey);
  }

  function updateForm(id: string, patch: Partial<PromotionForm>) {
    setForms((current) => ({
      ...current,
      [id]: { ...defaultPromotionForm(todayKey), ...current[id], ...patch },
    }));
  }

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

  async function act(id: string, payload: InboxActionPayload) {
    if (dataUnavailable) {
      setLastAction("本地数据源未配置，暂时无法处理。");
      return;
    }

    setPendingId(id);
    const response = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, ...payload }),
    });
    setPendingId(null);

    if (!response.ok) {
      setLastAction("处理失败，请重试。");
      return;
    }

    setItems((current) => current.filter((item) => item.id !== id));
    setForms((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setLastAction(actionLabels[payload.action]);
  }

  function promoteTask(id: string) {
    const form = formFor(id);
    const estimatedMinutes = minutesFromInput(form.taskEstimate);
    if (!form.taskDate || !estimatedMinutes) {
      setLastAction("请先补齐任务日期和 5-480 分钟估时。");
      return;
    }

    void act(id, {
      action: "task",
      date: form.taskDate,
      daySegment: form.taskSegment,
      estimatedMinutes,
      priority: form.taskPriority,
    });
  }

  function quickPromoteTask(id: string, dayOffset: number) {
    const form = formFor(id);
    const estimatedMinutes = minutesFromInput(form.taskEstimate) ?? 30;
    void act(id, {
      action: "task",
      date: dateKeyOffset(dayOffset),
      daySegment: form.taskSegment,
      estimatedMinutes,
      priority: form.taskPriority,
    });
  }

  function promoteRoutine(id: string) {
    const form = formFor(id);
    const estimatedMinutes = minutesFromInput(form.routineEstimate);
    if (!form.routinePattern.trim() || !estimatedMinutes) {
      setLastAction("请先补齐日常重复规则和 5-480 分钟估时。");
      return;
    }

    void act(id, {
      action: "routine",
      weekdayPattern: form.routinePattern.trim(),
      defaultTimeSegment: form.routineSegment,
      estimatedMinutes,
    });
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <BackLink />
        <h1 className="paw-page-date">暂存池</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="think" />
          <p className="paw-agent-msg">想到什么先丢进来；这里是捕获缓冲区，不会自动排进计划。攒着的 {items.length} 条想处理时再处理。</p>
        </div>
        <div className="paw-status-pills">
          <span className="paw-status-pill">未处理 {items.length}</span>
          <span className="paw-status-pill">不占今日容量</span>
          {lastAction ? <span className="paw-status-pill link">{lastAction}</span> : null}
        </div>
      </section>

      {dataUnavailable ? (
        <section className="paw-trust-banner">
          <TriangleAlert size={18} className="mt-0.5 flex-none text-amber-700" />
          当前没有 DATABASE_URL，Inbox 会显示为空态；配置数据库后会读取真实数据。
        </section>
      ) : null}

      {overLimit ? (
        <section className="paw-trust-banner">
          <CatIcon size={28} mood="worried" />
          攒了 10 多条啦，挑几条处理一下吧，不用一次清空。
        </section>
      ) : null}

      <QuickCapture />

      <section className="paw-list-card">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">未处理条目</h2>
            <p className="paw-list-subtitle">捕获只保存标题；提升时再明确日期、时段、估时或重复规则。</p>
          </div>
          <span className="paw-status-pill">不打扰计划</span>
        </div>

        {items.length === 0 ? (
          <div className="paw-empty mt-4">
            <h3>暂存池是空的</h3>
            <p>随手记下的想法会先到这里，想处理的时候再处理。</p>
          </div>
        ) : (
          <div className="paw-list">
            {items.map((item) => {
              const form = formFor(item.id);
              return (
              <div key={item.id} className="paw-inbox-item">
                <div className="paw-inbox-head">
                  <div className="min-w-0">
                    <p className="paw-row-title">{item.title}</p>
                    <p className="paw-row-meta">{item.age} 前捕获 · 未安排，不占今日容量</p>
                  </div>
                  <div className="paw-inbox-head-actions">
                    <button
                      type="button"
                      disabled={pendingId === item.id}
                      onClick={() => void act(item.id, { action: "quick_chore_task" })}
                      className="paw-secondary-btn !px-3 !py-2 !text-xs"
                    >
                      <ArrowUpRight size={13} />
                      今日杂事
                    </button>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                      className="paw-secondary-btn !px-3 !py-2 !text-xs"
                      aria-expanded={expandedId === item.id}
                    >
                      提升…
                      <ChevronDown size={13} className={`paw-inbox-chevron ${expandedId === item.id ? "open" : ""}`} />
                    </button>
                    <button
                      type="button"
                      disabled={pendingId === item.id}
                      onClick={() => void act(item.id, { action: "delete" })}
                      className="paw-secondary-btn !px-2 !py-2 !text-xs text-[var(--app-danger)]"
                      aria-label="删除"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>

                {expandedId === item.id ? (
                  <div className="paw-inbox-detail">
                    <div className="paw-inbox-quickdates">
                      <span className="paw-field-label">一键丢到</span>
                      <button type="button" disabled={pendingId === item.id} onClick={() => quickPromoteTask(item.id, 0)} className="paw-secondary-btn !px-3 !py-1.5 !text-xs">
                        今天
                      </button>
                      <button type="button" disabled={pendingId === item.id} onClick={() => quickPromoteTask(item.id, 1)} className="paw-secondary-btn !px-3 !py-1.5 !text-xs">
                        明天
                      </button>
                      <span className="paw-inbox-quickdates-hint">需要精确日期/时段就用下面</span>
                    </div>
                    <div className="grid w-full min-w-0 gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-line)] bg-[var(--app-bg)] p-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(7rem,0.8fr)_minmax(5rem,0.55fr)_minmax(6rem,0.65fr)_auto] sm:items-end">
                      <label className="min-w-0">
                        <span className="paw-field-label">任务日期</span>
                        <input
                          type="date"
                          value={form.taskDate}
                          onChange={(event) => updateForm(item.id, { taskDate: event.target.value })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                        />
                      </label>
                      <label className="min-w-0">
                        <span className="paw-field-label">时段</span>
                        <select
                          value={form.taskSegment}
                          onChange={(event) => updateForm(item.id, { taskSegment: event.target.value as DaySegment })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                        >
                          {Object.entries(segmentLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-0">
                        <span className="paw-field-label">分钟</span>
                        <input
                          type="number"
                          min={5}
                          max={480}
                          step={5}
                          value={form.taskEstimate}
                          onChange={(event) => updateForm(item.id, { taskEstimate: event.target.value })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                        />
                      </label>
                      <label className="min-w-0">
                        <span className="paw-field-label">优先级</span>
                        <select
                          value={form.taskPriority}
                          onChange={(event) => updateForm(item.id, { taskPriority: event.target.value as TaskPriority })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                        >
                          {Object.entries(priorityLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        type="button"
                        disabled={pendingId === item.id}
                        onClick={() => promoteTask(item.id)}
                        className="paw-secondary-btn !w-full !px-3 !py-2 !text-xs sm:!w-auto"
                      >
                        <ArrowUpRight size={13} />
                        提升任务
                      </button>
                    </div>

                    <div className="grid w-full min-w-0 gap-2 rounded-[var(--app-radius-sm)] border border-[var(--app-line)] bg-[var(--app-bg)] p-3 sm:grid-cols-[minmax(9rem,1fr)_minmax(7rem,0.8fr)_minmax(5rem,0.55fr)_auto] sm:items-end">
                      <label className="min-w-0">
                        <span className="paw-field-label">重复规则</span>
                        <input
                          value={form.routinePattern}
                          onChange={(event) => updateForm(item.id, { routinePattern: event.target.value })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                          placeholder="daily / mon,wed,fri"
                        />
                      </label>
                      <label className="min-w-0">
                        <span className="paw-field-label">默认时段</span>
                        <select
                          value={form.routineSegment}
                          onChange={(event) => updateForm(item.id, { routineSegment: event.target.value as RoutineTimeSegment })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                        >
                          {Object.entries(routineSegmentLabels).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="min-w-0">
                        <span className="paw-field-label">分钟</span>
                        <input
                          type="number"
                          min={5}
                          max={480}
                          step={5}
                          value={form.routineEstimate}
                          onChange={(event) => updateForm(item.id, { routineEstimate: event.target.value })}
                          disabled={pendingId === item.id}
                          className="paw-input !bg-[var(--app-surface)] !px-3 !py-2 !text-xs"
                        />
                      </label>
                      <button
                        type="button"
                        disabled={pendingId === item.id}
                        onClick={() => promoteRoutine(item.id)}
                        className="paw-secondary-btn !w-full !px-3 !py-2 !text-xs sm:!w-auto"
                      >
                        <RefreshCcw size={13} />
                        转日常
                      </button>
                    </div>

                  </div>
                ) : null}
              </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
