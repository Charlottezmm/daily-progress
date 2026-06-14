"use client";

import { useState } from "react";
import { CatIcon } from "./cat-icon";
import { RescheduleList } from "./reschedule-list";
import type { MonthDayView, MonthViewData, PlanTaskView, TimelineItemView, TodayViewData, WeekDayView, WeekViewData } from "@/lib/planning/view-data";
import { redactPrivateTitle } from "@/lib/display/privacy";

type Tab = "day" | "week" | "month" | "reschedule";

function minutesLabel(minutes: number) {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return rest ? `${hours}h ${rest}m` : `${hours}h`;
  }
  return `${minutes}m`;
}

function loadColor(state: string) {
  if (state === "over") return "overloaded";
  return "";
}

function clock(iso: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(iso));
}

const timelineKindClass: Record<TimelineItemView["kind"], string> = {
  task: "task",
  course: "routine",
  meeting: "routine",
  unavailable: "routine",
  routine: "routine",
  recovery: "recovery",
};

const timelineKindLabel: Record<TimelineItemView["kind"], string> = {
  task: "任务",
  course: "课程",
  meeting: "日程",
  unavailable: "不可用",
  routine: "固定",
  recovery: "恢复",
};

function sortByStart(items: TimelineItemView[]) {
  return [...items].sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

const segmentLabel: Record<PlanTaskView["segment"], string> = {
  morning: "上午",
  afternoon: "下午",
  evening: "晚上",
};

const priorityLabel: Record<PlanTaskView["priority"], string> = {
  low: "低",
  normal: "普通",
  high: "高",
  urgent: "紧急",
};

function TaskCard({ task, onOpen, compact = false }: { task: PlanTaskView; onOpen: (task: PlanTaskView) => void; compact?: boolean }) {
  return (
    <button type="button" className={`paw-plan-task-card ${compact ? "compact" : ""}`} onClick={() => onOpen(task)}>
      <span className="paw-plan-task-title">{redactPrivateTitle(task.title)}</span>
      <span className="paw-plan-task-meta">
        {segmentLabel[task.segment]} · {minutesLabel(task.minutes)} · {task.context} · {task.track}
      </span>
      {task.detail.summary ? <span className="paw-plan-task-note">{task.detail.summary}</span> : null}
    </button>
  );
}

function FixedItems({ items }: { items: TimelineItemView[] }) {
  if (items.length === 0) return null;
  return (
    <details className="paw-plan-fixed">
      <summary>固定占用 · {items.length} 项</summary>
      <div className="paw-timeline compact">
        {sortByStart(items).map((item) => (
          <div key={item.id} className="paw-time-block">
            <span className="paw-time-label">
              {clock(item.startsAt)}–{clock(item.endsAt)}
            </span>
            <div className={`paw-time-bar ${timelineKindClass[item.kind]}`}>
              <span>{redactPrivateTitle(item.title)}</span>
              <span className="ml-2 text-xs opacity-70">
                {timelineKindLabel[item.kind]} · {minutesLabel(item.minutes)}
              </span>
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function TaskList({
  label,
  tasks,
  empty,
  onOpen,
}: {
  label: string;
  tasks: PlanTaskView[];
  empty: string;
  onOpen: (task: PlanTaskView) => void;
}) {
  return (
    <section className="paw-plan-task-section">
      <div className="paw-section-label">{label}</div>
      {tasks.length === 0 ? <div className="paw-empty"><p>{empty}</p></div> : null}
      <div className="paw-plan-task-list">
        {tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpen={onOpen} />
        ))}
      </div>
    </section>
  );
}

function TaskDetail({ task }: { task: PlanTaskView | null }) {
  if (!task) {
    return (
      <aside className="paw-plan-detail">
        <p className="paw-section-label">任务详情</p>
        <p className="paw-goal-meta">点击日、周或月里的任务查看说明、完成标准和资源。</p>
      </aside>
    );
  }

  return (
    <aside className="paw-plan-detail">
      <p className="paw-section-label">任务详情</p>
      <h2 className="paw-goal-title">{redactPrivateTitle(task.title)}</h2>
      <div className="paw-plan-detail-meta">
        <span>{task.dateLabel}</span>
        <span>{segmentLabel[task.segment]}</span>
        <span>{minutesLabel(task.minutes)}</span>
        <span>优先级 {priorityLabel[task.priority]}</span>
        <span>能量 {task.energy}</span>
      </div>
      <p className="paw-goal-meta">{task.context} · {task.track}</p>
      {task.notes ? <p className="paw-plan-detail-notes">{task.notes}</p> : <p className="paw-plan-detail-notes muted">这条任务还没有详细描述。</p>}
      {task.detail.sections.length > 0 ? (
        <div className="paw-plan-detail-sections">
          {task.detail.sections.map((section) => (
            <section key={section.label}>
              <h3>{section.label}</h3>
              {section.lines.length === 0 ? null : (
                <ul>
                  {section.lines.map((line, index) => (
                    <li key={`${section.label}-${index}`}>{line}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

function WeekDayCard({ day, onOpenTask }: { day: WeekDayView; onOpenTask: (task: PlanTaskView) => void }) {
  return (
    <details className="paw-week-day" open={day.state === "today"}>
      <summary className="paw-week-day-summary">
        <span>
          <span className={`paw-week-day-name ${day.state === "today" ? "today" : ""}`}>周{day.day}</span>
          <span className="paw-week-day-date">{day.date}</span>
        </span>
        <span className={day.state === "over" ? "paw-overload-badge" : "paw-status-pill"}>
          {day.doneCount}/{day.taskCount} · {day.totalMinutes}
        </span>
      </summary>
      <div className="paw-capacity-bar">
        <div className={`paw-capacity-fill ${loadColor(day.state)}`} style={{ width: `${Math.min(day.load, 100)}%` }} />
      </div>
      <div className="paw-plan-task-list compact">
        {day.tasks.length === 0 ? <p className="paw-goal-meta">无任务</p> : null}
        {day.tasks.map((task) => (
          <TaskCard key={task.id} task={task} onOpen={onOpenTask} compact />
        ))}
      </div>
      <FixedItems items={day.fixedItems} />
    </details>
  );
}

function MonthDayCell({
  day,
  selected,
  onSelect,
}: {
  day: MonthDayView;
  selected: boolean;
  onSelect: (day: MonthDayView) => void;
}) {
  return (
    <button
      type="button"
      className={`paw-month-day ${day.inMonth ? "" : "outside"} ${day.state === "today" ? "today" : ""} ${selected ? "selected" : ""}`}
      onClick={() => onSelect(day)}
    >
      <span className="paw-month-day-number">{day.dayOfMonth}</span>
      {day.taskCount > 0 ? (
        <span className="paw-month-day-count">
          {day.doneCount}/{day.taskCount} · {day.totalMinutes}
        </span>
      ) : null}
      <span className="paw-month-day-dots" aria-hidden="true">
        {day.tasks.slice(0, 4).map((task) => (
          <span key={task.id} className={`paw-month-dot ${task.done ? "done" : ""}`} />
        ))}
      </span>
    </button>
  );
}

export function PlanView({ today, week, month }: { today: TodayViewData; week: WeekViewData; month: MonthViewData }) {
  const [tab, setTab] = useState<Tab>("day");
  const [selectedTask, setSelectedTask] = useState<PlanTaskView | null>(today.overdueTasks[0] ?? today.todayTasks[0] ?? null);
  const [selectedMonthDay, setSelectedMonthDay] = useState<MonthDayView | null>(
    month.days.find((day) => day.state === "today") ?? month.days.find((day) => day.taskCount > 0) ?? null,
  );

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <h1 className="paw-page-date">计划</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="think" />
          <p className="paw-agent-msg">日、周、月都以任务为主。固定占用只做参考；想改任务日期，去「改期」自己调；Agent 的建议在 Review 里确认。</p>
        </div>
        <div className="paw-sub-tabs">
          {[
            ["day", "日"],
            ["week", "周"],
            ["month", "月"],
            ["reschedule", "改期"],
          ].map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setTab(value as Tab)}
              className={`paw-sub-tab ${tab === value ? "active" : ""}`}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {today.dataUnavailable || week.dataUnavailable || month.dataUnavailable ? (
        <section className="paw-status-pill warn" role="status">
          当前没有 DATABASE_URL，Plan 会显示为空态；配置数据库后会读取真实计划。
        </section>
      ) : null}

      {tab === "day" ? (
        <section className="paw-plan-view paw-plan-split">
          <div className="paw-plan-main">
            <TaskList
              label={`未完成遗留 · ${today.overdueTasks.length}`}
              tasks={today.overdueTasks}
              empty="今天以前没有遗留待办。"
              onOpen={setSelectedTask}
            />
            <TaskList
              label={`今日任务 · ${today.todayTasks.filter((task) => task.done).length}/${today.todayTasks.length}`}
              tasks={today.todayTasks}
              empty="今天还没有安排任务。"
              onOpen={setSelectedTask}
            />
            <FixedItems items={today.fixedItems} />
          </div>
          <TaskDetail task={selectedTask} />
        </section>
      ) : null}

      {tab === "week" ? (
        <section className="paw-plan-view paw-plan-split">
          <div className="paw-plan-main">
          <div className="paw-week-grid">
            {week.days.map((day) => (
              <WeekDayCard key={day.date} day={day} onOpenTask={setSelectedTask} />
            ))}
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_0.8fr]">
            <div className="paw-goal-card">
              <h2 className="paw-goal-title">战线占比</h2>
              <div className="mt-4 grid gap-3">
                {week.tracks.length === 0 ? <p className="paw-goal-meta">本周还没有可统计的任务。</p> : null}
                {week.tracks.map((track) => (
                  <div key={track.name} className="grid grid-cols-[72px_1fr_56px] items-center gap-3 text-sm">
                    <span className="font-semibold text-[var(--app-ink)]">{track.name}</span>
                    <div className="paw-goal-progress">
                      <div className="paw-goal-progress-fill" style={{ width: `${track.share}%` }} />
                    </div>
                    <span className="text-right text-xs font-semibold text-[var(--app-ink-soft)]">{track.hours}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="paw-goal-card bg-[var(--app-positive-soft)]">
              <h2 className="paw-goal-title">Recovery</h2>
              <p className="mt-3 text-3xl font-bold text-[var(--app-ink)]">{week.recovery.scheduledHours}</p>
              <p className="paw-goal-meta">目标 {week.recovery.targetHours}。{week.recovery.note}</p>
            </div>
          </div>
          </div>
          <TaskDetail task={selectedTask} />
        </section>
      ) : null}

      {tab === "month" ? (
        <section className="paw-plan-view paw-plan-split">
          <div className="paw-plan-main">
          {month.emptyText ? (
            <article className="paw-goal-card">
              <h2 className="paw-goal-title">本月计划</h2>
              <p className="paw-goal-meta">{month.emptyText}</p>
              <span className="paw-deadline-tag">No data</span>
            </article>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3">
                <div className="paw-goal-card text-center">
                  <p className="text-2xl font-bold text-[var(--app-ink)]">
                    {month.doneCount}/{month.taskCount}
                  </p>
                  <p className="paw-goal-meta">已完成任务</p>
                </div>
                <div className="paw-goal-card text-center">
                  <p className="text-2xl font-bold text-[var(--app-ink)]">{month.completionPercent}%</p>
                  <p className="paw-goal-meta">完成度</p>
                </div>
                <div className="paw-goal-card text-center">
                  <p className="text-2xl font-bold text-[var(--app-ink)]">{month.totalHours}</p>
                  <p className="paw-goal-meta">总工时</p>
                </div>
              </div>

              {month.days.length > 0 ? (
                <article className="paw-goal-card mt-3">
                  <h2 className="paw-goal-title">月视图</h2>
                  <div className="paw-month-calendar">
                    {["一", "二", "三", "四", "五", "六", "日"].map((day) => (
                      <span key={day} className="paw-month-weekday">周{day}</span>
                    ))}
                    {month.days.map((day) => (
                      <MonthDayCell
                        key={day.key}
                        day={day}
                        selected={selectedMonthDay?.key === day.key}
                        onSelect={(next) => {
                          setSelectedMonthDay(next);
                          if (next.tasks[0]) setSelectedTask(next.tasks[0]);
                        }}
                      />
                    ))}
                  </div>
                  {selectedMonthDay ? (
                    <div className="paw-month-selected">
                      <div className="paw-section-label">{selectedMonthDay.dateLabel} · {selectedMonthDay.doneCount}/{selectedMonthDay.taskCount}</div>
                      <div className="paw-plan-task-list compact">
                        {selectedMonthDay.tasks.length === 0 ? <p className="paw-goal-meta">这一天没有任务。</p> : null}
                        {selectedMonthDay.tasks.map((task) => (
                          <TaskCard key={task.id} task={task} onOpen={setSelectedTask} compact />
                        ))}
                      </div>
                    </div>
                  ) : null}
                </article>
              ) : null}

              {month.importSummary ? (
                <article className="paw-goal-card mt-3">
                  <h2 className="paw-goal-title">
                    {month.importSummary.monthLabel ?? month.importSummary.overallTitle ?? "本月目标"}
                  </h2>
                  {month.importSummary.monthGoal ? (
                    <p className="paw-goal-meta">{month.importSummary.monthGoal}</p>
                  ) : null}
                  {month.importSummary.milestones.length > 0 ? (
                    <ul className="mt-3 space-y-1">
                      {month.importSummary.milestones.map((m, i) => (
                        <li key={i} className="flex gap-2 text-sm text-[var(--app-ink-soft)]">
                          <span className="text-[var(--app-accent-dark)]">·</span>
                          <span>{m}</span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </article>
              ) : null}

              {month.weeks.length > 0 ? (
                <article className="paw-goal-card mt-3">
                  <h2 className="paw-goal-title">每周任务分布</h2>
                  <div className="mt-4 grid gap-3">
                    {month.weeks.map((w) => (
                      <div key={w.label} className="grid grid-cols-[88px_1fr_auto] items-center gap-3 text-sm">
                        <span className="font-semibold text-[var(--app-ink)]">{w.label}</span>
                        <div className="paw-goal-progress">
                          <div className="paw-goal-progress-fill" style={{ width: `${Math.min(w.share, 100)}%` }} />
                        </div>
                        <span className="text-right text-xs font-semibold text-[var(--app-ink-soft)]">
                          {w.taskCount} 项 · {w.minutes}
                        </span>
                      </div>
                    ))}
                  </div>
                </article>
              ) : null}

              {month.cards.length > 0 ? (
                <div className="paw-month-goals mt-3">
                  {month.cards.map((card) => (
                    <article key={card.title} className="paw-goal-card">
                      <h2 className="paw-goal-title">{card.title}</h2>
                      <p className="paw-goal-meta">{card.text}</p>
                      {card.progress === null ? null : (
                        <div className="paw-goal-progress">
                          <div className="paw-goal-progress-fill" style={{ width: `${Math.min(card.progress, 100)}%` }} />
                        </div>
                      )}
                      <span className="paw-deadline-tag">{card.tag}</span>
                    </article>
                  ))}
                </div>
              ) : null}
            </>
          )}
          </div>
          <TaskDetail task={selectedTask} />
        </section>
      ) : null}

      {tab === "reschedule" ? (
        <section className="paw-plan-view">
          <RescheduleList />
        </section>
      ) : null}
    </div>
  );
}
