"use client";

import { CalendarDays, Pencil, Plus, Save, Table, Trash2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { BackLink } from "./back-link";
import { CatIcon } from "./cat-icon";

type EditableKind = "course" | "meeting" | "unavailable" | "routine" | "recovery";
type WeekdayKey = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

type Course = {
  id: string;
  name: string;
  color?: string;
};

type TimeBlock = {
  id: string;
  title: string;
  kind: EditableKind;
  startsAt: string;
  endsAt: string;
  recurrenceRule: string | null;
  courseId: string | null;
  courseName: string | null;
  movable: false;
};

type ConstraintsResponse = {
  workspaceId: string;
  courses: Course[];
  timeBlocks: TimeBlock[];
  summary?: {
    courseCount: number;
    timeBlockCount: number;
    conflictCount: number;
    nextStartsAt: string | null;
  };
  conflicts?: Array<{
    id: string;
    firstTitle: string;
    secondTitle: string;
    startsAt: string;
    endsAt: string;
  }>;
};

type UpsertConstraintResponse = {
  timeBlock?: TimeBlock;
  course?: Course | null;
  error?: string;
};

type TimeBlockForm = {
  id: string | null;
  kind: EditableKind;
  title: string;
  date: string;
  start: string;
  end: string;
  courseName: string;
  recurrenceRule: string;
};

const emptyForm: TimeBlockForm = {
  id: null,
  kind: "course",
  title: "",
  date: new Date().toISOString().slice(0, 10),
  start: "09:00",
  end: "10:00",
  courseName: "",
  recurrenceRule: "",
};

const kindLabels: Record<EditableKind, string> = {
  course: "课程",
  meeting: "会议",
  unavailable: "不可用",
  routine: "日常事项",
  recovery: "恢复 / 休息",
};

const weekdayOrder: WeekdayKey[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
const weekdayLabels: Record<WeekdayKey, string> = {
  mon: "周一",
  tue: "周二",
  wed: "周三",
  thu: "周四",
  fri: "周五",
  sat: "周六",
  sun: "周日",
};

const weekdayLookup: Record<string, WeekdayKey> = {
  mon: "mon",
  tue: "tue",
  wed: "wed",
  thu: "thu",
  fri: "fri",
  sat: "sat",
  sun: "sun",
};

function shanghaiDateTime(date: string, time: string) {
  return `${date}T${time}:00.000+08:00`;
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
}

function weekdayKey(value: string): WeekdayKey {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Shanghai",
    weekday: "short",
  }).format(new Date(value)).toLowerCase();
  return weekdayLookup[weekday] ?? "mon";
}

function shanghaiInputParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "00";
  return {
    date: `${part("year")}-${part("month")}-${part("day")}`,
    time: `${part("hour")}:${part("minute")}`,
  };
}

function sortedBlocks(blocks: TimeBlock[]) {
  return [...blocks].sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
}

type ConstraintGroup = {
  key: string;
  title: string;
  kind: EditableKind;
  courseName: string | null;
  recurrenceRule: string | null;
  startTime: string;
  endTime: string;
  firstDate: string;
  lastDate: string;
  weekdays: WeekdayKey[];
  blocks: TimeBlock[];
};

function weekdaySummary(days: WeekdayKey[]) {
  if (days.length === 7) return "每天";
  if (days.length === 6 && days.every((day) => day !== "sun")) return "周一到周六";
  if (days.length === 5 && days.every((day) => day !== "sat" && day !== "sun")) return "工作日";
  return days.map((day) => weekdayLabels[day]).join(" / ");
}

export function buildConstraintGroups(blocks: TimeBlock[]): ConstraintGroup[] {
  const groups = new Map<string, ConstraintGroup>();

  for (const block of sortedBlocks(blocks)) {
    const startTime = formatTime(block.startsAt);
    const endTime = formatTime(block.endsAt);
    const key = [
      block.kind,
      block.title.trim().toLowerCase(),
      block.courseName?.trim().toLowerCase() ?? "",
      block.recurrenceRule?.trim().toLowerCase() ?? "",
      startTime,
      endTime,
    ].join("|");
    const day = weekdayKey(block.startsAt);
    const existing = groups.get(key);
    if (existing) {
      existing.blocks.push(block);
      existing.lastDate = block.startsAt;
      if (!existing.weekdays.includes(day)) existing.weekdays.push(day);
      existing.weekdays.sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b));
      continue;
    }

    groups.set(key, {
      key,
      title: block.title,
      kind: block.kind,
      courseName: block.courseName,
      recurrenceRule: block.recurrenceRule,
      startTime,
      endTime,
      firstDate: block.startsAt,
      lastDate: block.startsAt,
      weekdays: [day],
      blocks: [block],
    });
  }

  return [...groups.values()].sort((a, b) => (
    a.startTime.localeCompare(b.startTime) ||
    a.title.localeCompare(b.title) ||
    weekdayOrder.indexOf(a.weekdays[0]) - weekdayOrder.indexOf(b.weekdays[0])
  ));
}

export function ConstraintsView() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [timeBlocks, setTimeBlocks] = useState<TimeBlock[]>([]);
  const [summary, setSummary] = useState<ConstraintsResponse["summary"]>(undefined);
  const [conflicts, setConflicts] = useState<NonNullable<ConstraintsResponse["conflicts"]>>([]);
  const [form, setForm] = useState<TimeBlockForm>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const [dataUnavailable, setDataUnavailable] = useState(false);
  const [timelineDay, setTimelineDay] = useState<WeekdayKey>("mon");

  const visibleBlocks = useMemo(() => sortedBlocks(timeBlocks), [timeBlocks]);
  const constraintGroups = useMemo(() => buildConstraintGroups(visibleBlocks), [visibleBlocks]);
  const timelineBlocks = useMemo(
    () => visibleBlocks.filter((block) => weekdayKey(block.startsAt) === timelineDay),
    [timelineDay, visibleBlocks],
  );

  useEffect(() => {
    let active = true;

    async function loadConstraints() {
      try {
        const response = await fetch("/api/constraints");
        if (!response.ok) {
          if (active) {
            setDataUnavailable(true);
            setMessage("日历与课程读取失败。");
          }
          return;
        }

        const data = (await response.json()) as ConstraintsResponse;
        if (!active) return;
        setWorkspaceId(data.workspaceId);
        setCourses(data.courses ?? []);
        setTimeBlocks(data.timeBlocks ?? []);
        setSummary(data.summary);
        setConflicts(data.conflicts ?? []);
        setDataUnavailable(false);
      } catch {
        if (!active) return;
        setDataUnavailable(true);
        setMessage("日历与课程读取失败。");
      }
    }

    void loadConstraints();
    return () => {
      active = false;
    };
  }, []);

  async function saveTimeBlock(event: React.FormEvent) {
    event.preventDefault();
    if (!form.title.trim()) {
      setMessage("标题不能为空。");
      return;
    }
    if (form.kind === "course" && !form.courseName.trim()) {
      setMessage("课程约束需要课程名。");
      return;
    }

    setPending("save");
    const response = await fetch("/api/constraints", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "upsert_time_block",
        timeBlock: {
          id: form.id ?? undefined,
          title: form.title.trim(),
          kind: form.kind,
          startsAt: shanghaiDateTime(form.date, form.start),
          endsAt: shanghaiDateTime(form.date, form.end),
          courseName: form.kind === "course" ? form.courseName.trim() : null,
          recurrenceRule: form.recurrenceRule.trim() || null,
        },
      }),
    });
    const data = (await response.json()) as UpsertConstraintResponse;
    setPending(null);

    if (!response.ok || !data.timeBlock) {
      setMessage(data.error ?? "约束保存失败。");
      return;
    }
    const savedBlock = data.timeBlock;

    setTimeBlocks((current) => {
      const existing = current.some((block) => block.id === savedBlock.id);
      if (!existing) return [...current, savedBlock];
      return current.map((block) => (block.id === savedBlock.id ? savedBlock : block));
    });
    if (data.course) {
      setCourses((current) =>
        current.some((course) => course.id === data.course?.id)
          ? current
          : [...current, data.course as Course],
      );
    } else if (savedBlock.courseId && savedBlock.courseName) {
      const courseId = savedBlock.courseId;
      const courseName = savedBlock.courseName;
      setCourses((current) =>
        current.some((course) => course.id === courseId)
          ? current
          : [...current, { id: courseId, name: courseName }],
      );
    }
    setForm(emptyForm);
    setMessage("约束已保存。");
  }

  function editExistingTimeBlock(block: TimeBlock) {
    const start = shanghaiInputParts(block.startsAt);
    const end = shanghaiInputParts(block.endsAt);
    setForm({
      id: block.id,
      kind: block.kind,
      title: block.title,
      date: start.date,
      start: start.time,
      end: end.time,
      courseName: block.courseName ?? "",
      recurrenceRule: block.recurrenceRule ?? "",
    });
    setMessage("正在编辑现有约束。");
  }

  async function deleteExistingTimeBlock(block: TimeBlock) {
    setPending(block.id);
    const response = await fetch("/api/constraints", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "delete_time_block", id: block.id }),
    });
    setPending(null);

    if (!response.ok) {
      setMessage("约束删除失败。");
      return;
    }

    setTimeBlocks((current) => current.filter((item) => item.id !== block.id));
    setMessage("约束已删除。");
  }

  return (
    <div className="paw-page">
      <section className="paw-page-header">
        <BackLink />
        <h1 className="paw-page-date">日历与课程</h1>
        <div className="paw-agent-row">
          <CatIcon size={40} mood="think" />
          <p className="paw-agent-msg">这里看每天的固定结构：课程、日常事项、恢复时间都按时间线排开；重复实例会折叠成周循环摘要。</p>
        </div>
        <div className="paw-status-pills">
          <span className="paw-status-pill">{workspaceId ? `Workspace: ${workspaceId}` : "Workspace 读取中"}</span>
          <span className="paw-status-pill">课程: {summary?.courseCount ?? courses.length}</span>
          <span className="paw-status-pill">循环: {constraintGroups.length}</span>
          <span className="paw-status-pill">实例: {summary?.timeBlockCount ?? timeBlocks.length}</span>
          <span className={conflicts.length > 0 ? "paw-status-pill warn" : "paw-status-pill"}>冲突: {summary?.conflictCount ?? conflicts.length}</span>
          {dataUnavailable ? <span className="paw-status-pill warn">数据源不可用</span> : null}
          {message ? <span className="paw-status-pill link">{message}</span> : null}
        </div>
      </section>

      <section className="paw-list-card mb-4">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">日时间线</h2>
            <p className="paw-list-subtitle">按星期查看一天怎么排；这里展示课程、日常事项、恢复和不可用时间。</p>
          </div>
          <Link href="/import" className="paw-secondary-btn !px-4 !py-2 !text-sm" aria-label="导入 timetable.csv">
            <Table size={15} />
            导入 timetable.csv
          </Link>
        </div>

        <div className="paw-weekday-tabs mt-4" role="tablist" aria-label="选择星期">
          {weekdayOrder.map((day) => (
            <button
              key={day}
              type="button"
              className={`paw-weekday-tab ${timelineDay === day ? "active" : ""}`}
              onClick={() => setTimelineDay(day)}
            >
              {weekdayLabels[day]}
            </button>
          ))}
        </div>

        <div className="paw-constraint-timeline mt-4">
          {timelineBlocks.length === 0 ? (
            <div className="paw-time-block">
              <span className="paw-time-label">--</span>
              <div className="paw-time-bar empty">这一天还没有固定安排。</div>
            </div>
          ) : (
            timelineBlocks.map((block) => (
              <div key={block.id} className="paw-time-block">
                <span className="paw-time-label">
                  {formatTime(block.startsAt)}–{formatTime(block.endsAt)}
                </span>
                <div className={`paw-time-bar ${block.kind}`}>
                  <span>{block.title}</span>
                  <span className="ml-2 text-xs opacity-70">
                    {kindLabels[block.kind]}{block.courseName ? ` · ${block.courseName}` : ""}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="paw-mcp-grid mt-4">
          <div className="paw-mcp-info">
            <p className="paw-field-label">下一个固定块</p>
            <p className="paw-mcp-value">{summary?.nextStartsAt ? formatDateTime(summary.nextStartsAt) : "暂无"}</p>
          </div>
          <div className="paw-mcp-info">
            <p className="paw-field-label">冲突检查</p>
            <p className="paw-mcp-value">{conflicts.length > 0 ? `${conflicts.length} 个冲突需处理` : "未发现冲突"}</p>
          </div>
        </div>
        {conflicts.length > 0 ? (
          <div className="paw-list mt-4">
            {conflicts.map((conflict) => (
              <div key={conflict.id} className="paw-list-row">
                <div className="min-w-0">
                  <p className="paw-row-title">{conflict.firstTitle} overlaps {conflict.secondTitle}</p>
                  <p className="paw-row-meta">{formatDateTime(conflict.startsAt)} - {formatDateTime(conflict.endsAt)}</p>
                </div>
                <span className="paw-status-pill warn">conflict</span>
              </div>
            ))}
          </div>
        ) : null}
      </section>

      <section className="paw-list-card mb-4">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">{form.id ? "编辑约束" : "新增约束"}</h2>
            <p className="paw-list-subtitle">保存到 time_blocks，固定约束默认不可移动。</p>
          </div>
          <span className="paw-more-icon">
            <CalendarDays size={18} />
          </span>
        </div>

        <form onSubmit={saveTimeBlock} className="paw-constraint-form border-t border-[var(--app-line)] pt-4">
          <div className="paw-constraint-form-grid first">
            <label>
              <span className="paw-field-label">类型</span>
              <select
                value={form.kind}
                onChange={(event) => setForm((current) => ({ ...current, kind: event.target.value as EditableKind }))}
                className="paw-input"
              >
                {(Object.keys(kindLabels) as EditableKind[]).map((kind) => (
                  <option key={kind} value={kind}>
                    {kindLabels[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="paw-field-label">标题</span>
              <input
                value={form.title}
                onChange={(event) => setForm((current) => ({ ...current, title: event.target.value }))}
                className="paw-input"
                maxLength={180}
                placeholder="课程 / 会议 / 不可用时间"
              />
            </label>
          </div>

          <div className="paw-constraint-form-grid time">
            <label>
              <span className="paw-field-label">日期</span>
              <input
                type="date"
                value={form.date}
                onChange={(event) => setForm((current) => ({ ...current, date: event.target.value }))}
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">开始</span>
              <input
                type="time"
                value={form.start}
                onChange={(event) => setForm((current) => ({ ...current, start: event.target.value }))}
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">结束</span>
              <input
                type="time"
                value={form.end}
                onChange={(event) => setForm((current) => ({ ...current, end: event.target.value }))}
                className="paw-input"
              />
            </label>
            <label>
              <span className="paw-field-label">重复规则</span>
              <input
                value={form.recurrenceRule}
                onChange={(event) => setForm((current) => ({ ...current, recurrenceRule: event.target.value }))}
                className="paw-input"
                placeholder="weekly / weekdays"
              />
            </label>
          </div>

          <div className="paw-constraint-form-grid last">
            <label>
              <span className="paw-field-label">课程名</span>
              <input
                value={form.courseName}
                onChange={(event) => setForm((current) => ({ ...current, courseName: event.target.value }))}
                className="paw-input"
                list="constraint-courses"
                placeholder={form.kind === "course" ? "课程名" : "非课程可留空"}
              />
              <datalist id="constraint-courses">
                {courses.map((course) => (
                  <option key={course.id} value={course.name} />
                ))}
              </datalist>
            </label>
            <div className="paw-save-row !mt-6">
              <button type="submit" disabled={pending === "save"} className="paw-primary-btn !px-4 !py-2 !text-sm">
                {pending === "save" ? <Save size={15} /> : <Plus size={15} />}
                {pending === "save" ? "保存中" : form.id ? "更新约束" : "保存约束"}
              </button>
              {form.id ? (
                <button type="button" onClick={() => setForm(emptyForm)} className="paw-secondary-btn !px-4 !py-2 !text-sm">
                  取消编辑
                </button>
              ) : null}
            </div>
          </div>
        </form>
      </section>

      <section className="paw-list-card">
        <div className="paw-list-header">
          <div>
            <h2 className="paw-list-title">周循环摘要</h2>
            <p className="paw-list-subtitle">同名同时间的实例已折叠；展开后可以编辑或删除具体日期。</p>
          </div>
          <span className="paw-status-pill">{constraintGroups.length} 组 / {visibleBlocks.length} 个实例</span>
        </div>

        {visibleBlocks.length === 0 ? (
          <div className="paw-empty mt-4">
            <h3>还没有日历约束</h3>
            <p>新增课程、会议或不可用时间后，会显示在这里。</p>
          </div>
        ) : (
          <div className="paw-list mt-4">
            {constraintGroups.map((group) => (
              <div key={group.key} className="paw-constraint-group">
                <div className="min-w-0">
                  <p className="paw-row-title">{group.title}</p>
                  <p className="paw-row-meta">
                    {kindLabels[group.kind]} · {group.startTime}–{group.endTime} · {weekdaySummary(group.weekdays)}
                    {group.courseName ? ` · ${group.courseName}` : ""}
                    {group.recurrenceRule ? ` · ${group.recurrenceRule}` : ""}
                  </p>
                  <p className="paw-row-meta">
                    {formatDate(group.firstDate)} - {formatDate(group.lastDate)} · {group.blocks.length} 个实例
                  </p>
                </div>
                <details className="paw-constraint-instances">
                  <summary>查看 / 编辑 {group.blocks.length} 个实例</summary>
                  <div className="paw-list">
                    {group.blocks.map((block) => (
                      <div key={block.id} className="paw-list-row compact">
                        <div className="min-w-0">
                          <p className="paw-row-title">{formatDateTime(block.startsAt)} - {formatDateTime(block.endsAt)}</p>
                          <p className="paw-row-meta">
                            {kindLabels[block.kind]} · movable: false
                          </p>
                        </div>
                        <div className="paw-row-actions">
                          <button
                            type="button"
                            disabled={pending === block.id}
                            onClick={() => editExistingTimeBlock(block)}
                            aria-label={`编辑 ${block.title}`}
                            className="paw-secondary-btn !px-3 !py-2 !text-xs"
                          >
                            <Pencil size={13} />
                            编辑
                          </button>
                          <button
                            type="button"
                            disabled={pending === block.id}
                            onClick={() => void deleteExistingTimeBlock(block)}
                            aria-label={`删除 ${block.title}`}
                            className="paw-secondary-btn !px-3 !py-2 !text-xs text-[var(--app-danger)]"
                          >
                            <Trash2 size={13} />
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
