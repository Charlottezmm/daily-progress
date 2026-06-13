"use client";

import { useState } from "react";
import { CatIcon } from "./cat-icon";
import { RescheduleList } from "./reschedule-list";
import type { MonthViewData, TodayViewData, WeekViewData } from "@/lib/planning/view-data";

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

export function PlanView({ today, week, month }: { today: TodayViewData; week: WeekViewData; month: MonthViewData }) {
  const [tab, setTab] = useState<Tab>("day");

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <h1 className="paw-page-date">计划</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="think" />
          <p className="paw-agent-msg">日、周、月的安排都在这里。想调整的话，去 Review 里确认。</p>
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
        <section className="paw-plan-view">
          <div className="paw-timeline">
              {today.routines.map((routine) => (
                <div key={routine.id} className="paw-time-block">
                  <span className="paw-time-label">{minutesLabel(routine.minutes)}</span>
                  <div className="paw-time-bar routine">{routine.title}</div>
                </div>
              ))}
              {today.tasks.map((task) => (
                <div key={task.id} className="paw-time-block">
                  <span className="paw-time-label">{minutesLabel(task.minutes)}</span>
                  <div className="paw-time-bar task">
                    {task.title}
                  </div>
                </div>
              ))}
              {today.recoveryBlocks.map((block) => (
                <div key={block.id} className="paw-time-block">
                  <span className="paw-time-label">{block.time}</span>
                  <div className="paw-time-bar recovery">{block.title}</div>
                </div>
              ))}
              {today.tasks.length === 0 && today.routines.length === 0 && today.recoveryBlocks.length === 0 ? (
                <div className="paw-time-block">
                  <span className="paw-time-label">--</span>
                  <div className="paw-time-bar empty">今天还没有可展示的安排。</div>
                </div>
              ) : null}
          </div>
        </section>
      ) : null}

      {tab === "week" ? (
        <section className="paw-plan-view">
          <div className="paw-week-grid">
            {week.days.map((day) => (
              <article key={day.date} className="paw-week-day">
                <div className="paw-week-day-header">
                  <div>
                    <p className={`paw-week-day-name ${day.state === "today" ? "today" : ""}`}>周{day.day}</p>
                    <p className="text-sm font-semibold text-[var(--app-ink-soft)]">{day.date}</p>
                  </div>
                  <span className={day.state === "over" ? "paw-overload-badge" : "paw-status-pill"}>
                    {day.capacity}
                  </span>
                </div>
                <div className="paw-capacity-bar">
                  <div className={`paw-capacity-fill ${loadColor(day.state)}`} style={{ width: `${Math.min(day.load, 100)}%` }} />
                </div>
                <div className="paw-week-tasks">
                  {day.items.length === 0 ? <p>无安排</p> : null}
                  {day.items.map((item) => (
                    <p key={item} className="truncate">{item}</p>
                  ))}
                </div>
              </article>
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
        </section>
      ) : null}

      {tab === "month" ? (
        <section className="paw-plan-view paw-month-goals">
          {month.emptyText ? (
            <article className="paw-goal-card">
              <h2 className="paw-goal-title">本月计划</h2>
              <p className="paw-goal-meta">{month.emptyText}</p>
              <span className="paw-deadline-tag">No data</span>
            </article>
          ) : null}
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
