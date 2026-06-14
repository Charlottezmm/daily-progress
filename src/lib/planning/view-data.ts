import { and, desc, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agentPatches,
  agentPatchReviews,
  checkins,
  courses,
  dayCapacities,
  inboxItems,
  plans,
  projects,
  routineCompletions,
  routines,
  tasks,
  timeBlocks,
  tracks,
} from "@/lib/db/schema";
import {
  buildCapacityModel,
  capacityDateKey,
  type CapacityRoutineInput,
  type CapacityTaskInput,
  type CapacityTimeBlockInput,
} from "@/lib/planning/capacity-model";
import { materializeTimetableRows } from "@/lib/imports/timetable-save";
import { calculateTrackBalance } from "@/lib/planning/track-balance";
import { expandRecurringBlocks } from "@/lib/planning/recurring-time-blocks";
import { buildWarnings } from "@/lib/planning/warnings";
import type { AgentPatch } from "@/lib/patches/patch-schema";

type Segment = "morning" | "afternoon" | "evening";
type Energy = "low" | "medium" | "high";
type TaskStatus = "todo" | "done" | "skipped" | "backlog";

export type InboxItemView = {
  id: string;
  title: string;
  age: string;
};

export type CheckinView = {
  completedText: string;
  blockerText: string;
  nextText: string;
};

export type TodayTaskView = {
  id: string;
  segment: Segment;
  title: string;
  context: string;
  track: string;
  minutes: number;
  energy: "低" | "中" | "高";
  status: TaskStatus;
  blocked: boolean;
  done: boolean;
};

export type TodayRoutineView = {
  id: string;
  title: string;
  minutes: number;
  done: boolean;
};

export type RecoveryBlockView = {
  id: string;
  title: string;
  time: string;
};

export type TimelineItemView = {
  id: string;
  kind: "task" | "course" | "meeting" | "unavailable" | "routine" | "recovery";
  title: string;
  startsAt: string;
  endsAt: string;
  minutes: number;
  segment: Segment;
  protected: boolean;
};

export type WarningView = {
  id: string;
  title: string;
  text: string;
};

export type TodayViewData = {
  dataUnavailable: boolean;
  tasks: TodayTaskView[];
  routines: TodayRoutineView[];
  recoveryBlocks: RecoveryBlockView[];
  warnings: WarningView[];
  timelineItems: TimelineItemView[];
  patchCount: number;
  checkin: CheckinView | null;
  streakDays: number;
};

export type WeekDayView = {
  day: string;
  date: string;
  load: number;
  capacity: string;
  state: "ok" | "over" | "room" | "today";
  items: string[];
  timelineItems: TimelineItemView[];
};

export type TrackBalanceView = {
  name: string;
  hours: string;
  share: number;
  color: string;
  note: string;
};

export type WeekCheckinView = {
  day: string;
  done: string;
  block: string;
  next: string;
};

export type WeekViewData = {
  dataUnavailable: boolean;
  days: WeekDayView[];
  tracks: TrackBalanceView[];
  recovery: {
    scheduledHours: string;
    targetHours: string;
    percent: number;
    note: string;
    blocks: string[];
  };
  checkins: WeekCheckinView[];
};

export type MonthImportSummaryView = {
  overallTitle: string | null;
  overallSummary: string | null;
  weekFocus: string | null;
  monthLabel: string | null;
  monthGoal: string | null;
  milestones: string[];
  importedAt: string | null;
};

export type MonthWeekBucketView = {
  label: string;
  taskCount: number;
  minutes: string;
  share: number;
};

export type MonthCardView = {
  title: string;
  text: string;
  tag: string;
  progress: number | null;
};

export type MonthViewData = {
  dataUnavailable: boolean;
  taskCount: number;
  doneCount: number;
  totalHours: string;
  completionPercent: number;
  importSummary: MonthImportSummaryView | null;
  weeks: MonthWeekBucketView[];
  cards: MonthCardView[];
  emptyText: string | null;
};

export type ReschedulePatchItemView = {
  id: string;
  patchId: string;
  operationIndex: number;
  operationType: string;
  kind: string;
  title: string;
  from?: string;
  to?: string;
  reason: string;
  impact: string[];
  capacity: string;
  protected?: boolean;
  protectedEvidence: string[];
  provenance: {
    patchId: string;
    operationIndex: number;
    createdBy: string;
    createdAt: string;
  };
  skipped?: boolean;
  skippedReason?: string;
  conflict?: {
    reason: string;
    expected?: Record<string, unknown>;
    actual?: Record<string, unknown>;
  };
};

export type RescheduleViewData = {
  dataUnavailable: boolean;
  patchItems: ReschedulePatchItemView[];
};

const recoveryTargetMinutes = 8 * 60;
const segmentCapacityFallback: Record<Segment, number> = {
  morning: 180,
  afternoon: 240,
  evening: 120,
};

const trackColors = ["bg-zinc-900", "bg-sky-700", "bg-violet-600", "bg-emerald-600", "bg-amber-600"];

function isMissingDatabase(error: unknown) {
  return error instanceof Error && error.message.includes("DATABASE_URL is required");
}

function isMissingReviewAuditTable(error: unknown) {
  return error instanceof Error && error.message.includes('relation "agent_patch_reviews" does not exist');
}

function emptyTodayData(dataUnavailable = false): TodayViewData {
  return {
    dataUnavailable,
    tasks: [],
    routines: [],
    recoveryBlocks: [],
    warnings: dataUnavailable
      ? [{ id: "data_unavailable", title: "本地数据源未配置", text: "当前没有 DATABASE_URL，页面显示为空态；配置数据库后会读取真实计划。" }]
      : [],
    timelineItems: [],
    patchCount: 0,
    checkin: null,
    streakDays: 0,
  };
}

function emptyWeekData(dataUnavailable = false): WeekViewData {
  return {
    dataUnavailable,
    days: buildWeekDates(new Date()).map((date) => ({
      day: weekdayLabel(date),
      date: monthDayLabel(date),
      load: 0,
      capacity: "空",
      state: isSameShanghaiDay(date, startOfShanghaiDay(new Date())) ? "today" : "room",
      items: [],
      timelineItems: [],
    })),
    tracks: [],
    recovery: {
      scheduledHours: "0h",
      targetHours: "8h",
      percent: 0,
      note: dataUnavailable ? "本地数据源未配置，无法读取恢复块。" : "本周还没有恢复块。",
      blocks: [],
    },
    checkins: [],
  };
}

function emptyMonthData(dataUnavailable = false): MonthViewData {
  return {
    dataUnavailable,
    taskCount: 0,
    doneCount: 0,
    totalHours: "0h",
    completionPercent: 0,
    importSummary: null,
    weeks: [],
    cards: [],
    emptyText: dataUnavailable ? "本地数据源未配置，无法读取月度计划。" : "还没有月度计划数据。导入计划或创建本月任务后，这里会显示真实任务分布。",
  };
}

function emptyRescheduleData(dataUnavailable = false): RescheduleViewData {
  return { dataUnavailable, patchItems: [] };
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function shanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

export function startOfShanghaiDay(date: Date) {
  const { year, month, day } = shanghaiDateParts(date);
  return new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
}

function toDateKey(date: Date) {
  const { year, month, day } = shanghaiDateParts(date);
  return `${year}-${month}-${day}`;
}

function isSameShanghaiDay(a: Date, b: Date) {
  return toDateKey(a) === toDateKey(b);
}

function startOfShanghaiWeek(date: Date) {
  const start = startOfShanghaiDay(date);
  const shanghaiNoon = new Date(start.getTime() + 20 * 60 * 60 * 1000);
  const day = shanghaiNoon.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(start, mondayOffset);
}

function buildWeekDates(date: Date) {
  const start = startOfShanghaiWeek(date);
  return Array.from({ length: 7 }, (_, index) => addDays(start, index));
}

function weekdayLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", { timeZone: "Asia/Shanghai", weekday: "short" }).format(date).replace("周", "");
}

function monthDayLabel(date: Date) {
  const { month, day } = shanghaiDateParts(date);
  return `${month}/${day}`;
}

function hoursLabel(minutes: number) {
  if (minutes <= 0) return "0h";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest}m`;
  return rest ? `${hours}h ${rest}m` : `${hours}h`;
}

type WeekCapacityInput = {
  weekDates: Date[];
  today: Date;
  taskRows: CapacityTaskInput[];
  blockRows: CapacityTimeBlockInput[];
  routineRows: CapacityRoutineInput[];
  capacityRows: Array<{
    date: Date;
    morningMinutes: number;
    afternoonMinutes: number;
    eveningMinutes: number;
  }>;
};

export function buildWeekCapacityDays(input: WeekCapacityInput): WeekDayView[] {
  const capacity = buildCapacityModel({
    dates: input.weekDates,
    capacities: input.capacityRows,
    tasks: input.taskRows,
    timeBlocks: input.blockRows,
    routines: input.routineRows,
  });
  const byDate = new Map(capacity.days.map((day) => [day.dateKey, day]));

  return input.weekDates.map((date) => {
    const key = capacityDateKey(date);
    const day = byDate.get(key);
    const available = day ? segmentCapacity(day.segments.morning.availableMinutes, day.segments.afternoon.availableMinutes, day.segments.evening.availableMinutes) : 540;
    const used = day ? segmentCapacity(day.segments.morning.totalUsedMinutes, day.segments.afternoon.totalUsedMinutes, day.segments.evening.totalUsedMinutes) : 0;
    const percent = available === 0 ? 0 : Math.round((used / available) * 100);
    return {
      day: weekdayLabel(date),
      date: monthDayLabel(date),
      load: percent,
      capacity: hoursLabel(used),
      state: isSameShanghaiDay(date, input.today) ? "today" : percent > 100 ? "over" : percent < 60 ? "room" : "ok",
      items: day
        ? segmentOrder
            .flatMap((segment) => day.segments[segment].blocks.map((block) => block.title))
            .slice(0, 4)
        : [],
      timelineItems: buildDayTimelineItems({
        date,
        taskRows: input.taskRows,
        blockRows: input.blockRows,
        routineRows: input.routineRows,
      }),
    };
  });
}

const segmentOrder: Segment[] = ["morning", "afternoon", "evening"];

function segmentCapacity(morning: number, afternoon: number, evening: number) {
  return morning + afternoon + evening;
}

function timeOnShanghaiDay(date: Date, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  const start = startOfShanghaiDay(date);
  return new Date(start.getTime() + (hour || 0) * 60 * 60 * 1000 + (minute || 0) * 60 * 1000);
}

function segmentStart(date: Date, segment: Segment) {
  if (segment === "afternoon") return timeOnShanghaiDay(date, "12:00");
  if (segment === "evening") return timeOnShanghaiDay(date, "18:00");
  return startOfShanghaiDay(date);
}

function segmentForDate(date: Date): Segment {
  const start = startOfShanghaiDay(date);
  const minutes = Math.floor((date.getTime() - start.getTime()) / 60000);
  if (minutes >= 18 * 60) return "evening";
  if (minutes >= 12 * 60) return "afternoon";
  return "morning";
}

function weekdayForShanghaiDay(date: Date) {
  const start = startOfShanghaiDay(date);
  const noon = new Date(start.getTime() + 20 * 60 * 60 * 1000);
  return noon.getUTCDay();
}

function routineAppliesOnDate(routine: CapacityRoutineInput, date: Date) {
  const pattern = routine.weekdayPattern?.trim().toLowerCase();
  if (!pattern || pattern === "daily" || pattern === "*") return true;

  const weekday = weekdayForShanghaiDay(date);
  const names = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const tokens = pattern.split(/[\s,，/|]+/).filter(Boolean);
  return tokens.some((token) => token === names[weekday] || token === String(weekday) || (weekday === 0 && token === "7"));
}

function timelineItem(
  item: Omit<TimelineItemView, "startsAt" | "endsAt" | "minutes"> & { startsAt: Date; endsAt: Date },
): TimelineItemView {
  return {
    ...item,
    startsAt: item.startsAt.toISOString(),
    endsAt: item.endsAt.toISOString(),
    minutes: minutesBetween(item.startsAt, item.endsAt),
  };
}

export function buildDayTimelineItems(input: {
  date: Date;
  taskRows: CapacityTaskInput[];
  blockRows: CapacityTimeBlockInput[];
  routineRows: CapacityRoutineInput[];
}): TimelineItemView[] {
  const dayStart = startOfShanghaiDay(input.date);
  const dayEnd = addDays(dayStart, 1);
  const dateKey = capacityDateKey(dayStart);
  const items: TimelineItemView[] = [];

  for (const task of input.taskRows) {
    if (task.status === "backlog") continue;
    if (capacityDateKey(task.date) !== dateKey) continue;

    const startsAt = segmentStart(dayStart, task.daySegment);
    items.push(
      timelineItem({
        id: task.id,
        kind: "task",
        title: task.title,
        startsAt,
        endsAt: new Date(startsAt.getTime() + task.estimatedMinutes * 60_000),
        segment: task.daySegment,
        protected: false,
      }),
    );
  }

  for (const block of expandRecurringBlocks(input.blockRows, dayStart, dayEnd)) {
    if (block.endsAt <= dayStart || block.startsAt >= dayEnd) continue;
    const startsAt = new Date(Math.max(block.startsAt.getTime(), dayStart.getTime()));
    const endsAt = new Date(Math.min(block.endsAt.getTime(), dayEnd.getTime()));
    items.push(
      timelineItem({
        id: block.id,
        kind: block.kind,
        title: block.title,
        startsAt,
        endsAt,
        segment: segmentForDate(startsAt),
        protected: true,
      }),
    );
  }

  for (const routine of input.routineRows) {
    if (!routineAppliesOnDate(routine, dayStart)) continue;

    const segment = routine.defaultTimeSegment === "specific_window"
      ? segmentForDate(timeOnShanghaiDay(dayStart, routine.defaultStartTime ?? "00:00"))
      : routine.defaultTimeSegment;
    const startsAt = routine.defaultTimeSegment === "specific_window"
      ? timeOnShanghaiDay(dayStart, routine.defaultStartTime ?? "00:00")
      : segmentStart(dayStart, segment);
    const endsAt = routine.defaultTimeSegment === "specific_window" && routine.defaultEndTime
      ? timeOnShanghaiDay(dayStart, routine.defaultEndTime)
      : new Date(startsAt.getTime() + routine.estimatedMinutes * 60_000);

    items.push(
      timelineItem({
        id: routine.id,
        kind: "routine",
        title: routine.title,
        startsAt,
        endsAt,
        segment,
        protected: true,
      }),
    );
  }

  return items.sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title));
}

function timeLabel(date: Date) {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function ageLabel(createdAt: Date, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - createdAt.getTime()) / 60000));
  if (minutes < 60) return minutes <= 1 ? "刚刚" : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}

function energyLabel(energy: Energy) {
  if (energy === "high") return "高";
  if (energy === "low") return "低";
  return "中";
}

function statusDone(status: TaskStatus) {
  return status === "done" || status === "skipped";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function readImportSummary(snapshot: unknown): MonthImportSummaryView | null {
  if (!isRecord(snapshot)) return null;
  const source = isRecord(snapshot.importSummary) ? snapshot.importSummary : snapshot;
  const overall = isRecord(source.overall_plan) ? source.overall_plan : isRecord(source.overallPlan) ? source.overallPlan : null;
  const weekly = isRecord(source.weekly_summary) ? source.weekly_summary : isRecord(source.weeklySummary) ? source.weeklySummary : null;
  const monthly = isRecord(source.monthly_summary) ? source.monthly_summary : isRecord(source.monthlySummary) ? source.monthlySummary : null;

  const summary = {
    overallTitle: stringValue(overall?.title) ?? stringValue(source.title),
    overallSummary: stringValue(overall?.summary) ?? stringValue(source.goal),
    weekFocus: stringValue(weekly?.focus),
    monthLabel: stringValue(monthly?.month),
    monthGoal: stringValue(monthly?.goal),
    milestones: stringArray(monthly?.milestones).concat(stringArray(weekly?.milestones)),
    importedAt: stringValue(source.importedAt) ?? stringValue(source.imported_at),
  };

  if (
    !summary.overallTitle &&
    !summary.overallSummary &&
    !summary.weekFocus &&
    !summary.monthGoal &&
    summary.milestones.length === 0
  ) {
    return null;
  }
  return summary;
}

function buildMonthCards(input: {
  taskCount: number;
  doneCount: number;
  totalHours: string;
  completionPercent: number;
  importSummary: MonthImportSummaryView | null;
  weeks: MonthWeekBucketView[];
}): MonthCardView[] {
  if (input.taskCount === 0 && !input.importSummary) return [];

  const cards: MonthCardView[] = [
    {
      title: input.importSummary?.overallTitle ?? "本月任务",
      text:
        input.importSummary?.monthGoal ??
        input.importSummary?.overallSummary ??
        `本月共 ${input.taskCount} 个任务，预计 ${input.totalHours}。`,
      tag: input.taskCount > 0 ? `已完成 ${input.doneCount}/${input.taskCount}` : input.importSummary?.monthLabel ?? "Imported",
      progress: input.taskCount > 0 ? input.completionPercent : null,
    },
  ];

  if (input.weeks.length > 0 || input.importSummary?.weekFocus) {
    cards.push({
      title: "每周拆分",
      text:
        input.importSummary?.weekFocus ??
        input.weeks.map((week) => `${week.label}: ${week.taskCount} 个 / ${week.minutes}`).join("；"),
      tag: input.weeks.length > 0 ? `${input.weeks.length} 周有任务` : "Weekly",
      progress: null,
    });
  }

  if (input.importSummary?.milestones.length) {
    cards.push({
      title: "重要节点",
      text: input.importSummary.milestones.join("；"),
      tag: input.importSummary.monthLabel ?? "Milestones",
      progress: null,
    });
  }

  return cards;
}

function minutesBetween(start: Date, end: Date) {
  return Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
}

function dateRangeForToday(now = new Date()) {
  const start = startOfShanghaiDay(now);
  return { start, end: addDays(start, 1) };
}

function dateRangeForWeek(now = new Date()) {
  const start = startOfShanghaiWeek(now);
  return { start, end: addDays(start, 7) };
}

function dateRangeForMonth(now = new Date()) {
  const { year, month } = shanghaiDateParts(now);
  const start = new Date(Date.UTC(year, month - 1, 1) - 8 * 60 * 60 * 1000);
  const end = new Date(Date.UTC(month === 12 ? year + 1 : year, month === 12 ? 0 : month, 1) - 8 * 60 * 60 * 1000);
  return { start, end, monthKey: `${year}-${String(month).padStart(2, "0")}` };
}

function weeksInMonth(now = new Date()) {
  const { start, end } = dateRangeForMonth(now);
  const weeks = new Set<string>();
  for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
    weeks.add(toDateKey(startOfShanghaiWeek(cursor)));
  }
  return weeks;
}

async function loadReferenceMaps(workspaceId: string) {
  const db = getDb();
  const [projectRows, courseRows, trackRows] = await Promise.all([
    db.select().from(projects).where(eq(projects.workspaceId, workspaceId)),
    db.select().from(courses).where(eq(courses.workspaceId, workspaceId)),
    db.select().from(tracks).where(eq(tracks.workspaceId, workspaceId)),
  ]);

  return {
    projects: new Map(projectRows.map((project) => [project.id, project])),
    courses: new Map(courseRows.map((course) => [course.id, course])),
    tracks: new Map(trackRows.map((track) => [track.id, track])),
  };
}

async function loadCheckinStreak(workspaceId: string) {
  const db = getDb();
  const rows = await db
    .select({ date: checkins.date })
    .from(checkins)
    .where(eq(checkins.workspaceId, workspaceId))
    .orderBy(desc(checkins.date));

  const checkedDates = new Set(rows.map((row) => toDateKey(row.date)));
  let cursor = startOfShanghaiDay(new Date());
  let streak = 0;
  while (checkedDates.has(toDateKey(cursor))) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export async function getInboxPageData(workspaceId: string): Promise<{ dataUnavailable: boolean; items: InboxItemView[] }> {
  try {
    const db = getDb();
    const rows = await db
      .select()
      .from(inboxItems)
      .where(and(eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.processedAt)))
      .orderBy(desc(inboxItems.createdAt));

    return {
      dataUnavailable: false,
      items: rows.map((item) => ({ id: item.id, title: item.title, age: ageLabel(item.createdAt) })),
    };
  } catch (error) {
    if (isMissingDatabase(error)) return { dataUnavailable: true, items: [] };
    throw error;
  }
}

export async function getTodayPageData(workspaceId: string): Promise<TodayViewData> {
  try {
    const db = getDb();
    const { start, end } = dateRangeForToday();
    const { start: weekStart, end: weekEnd } = dateRangeForWeek();
    const yesterday = addDays(start, -1);
    const refs = await loadReferenceMaps(workspaceId);

    const [
      taskRows,
      routineRows,
      completionRows,
      todayBlocks,
      todayCapacityRows,
      weekRecoveryBlocks,
      inboxRows,
      todayCheckinRows,
      yesterdayCheckinRows,
      patchRows,
    ] =
      await Promise.all([
        db
          .select()
          .from(tasks)
          .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.date, start), lt(tasks.date, end)))
          .orderBy(tasks.daySegment, tasks.createdAt),
        db.select().from(routines).where(eq(routines.workspaceId, workspaceId)),
        db
          .select()
          .from(routineCompletions)
          .where(and(eq(routineCompletions.workspaceId, workspaceId), gte(routineCompletions.date, start), lt(routineCompletions.date, end))),
        db
          .select()
          .from(timeBlocks)
          .where(and(eq(timeBlocks.workspaceId, workspaceId), lt(timeBlocks.startsAt, end), gt(timeBlocks.endsAt, start))),
        db
          .select()
          .from(dayCapacities)
          .where(and(eq(dayCapacities.workspaceId, workspaceId), gte(dayCapacities.date, start), lt(dayCapacities.date, end))),
        db
          .select()
          .from(timeBlocks)
          .where(and(eq(timeBlocks.workspaceId, workspaceId), eq(timeBlocks.kind, "recovery"), lt(timeBlocks.startsAt, weekEnd), gt(timeBlocks.endsAt, weekStart))),
        db
          .select({ id: inboxItems.id })
          .from(inboxItems)
          .where(and(eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.processedAt))),
        db
          .select()
          .from(checkins)
          .where(and(eq(checkins.workspaceId, workspaceId), gte(checkins.date, start), lt(checkins.date, end)))
          .limit(1),
        db
          .select()
          .from(checkins)
          .where(and(eq(checkins.workspaceId, workspaceId), gte(checkins.date, yesterday), lt(checkins.date, start)))
          .limit(1),
        db
          .select({ id: agentPatches.id })
          .from(agentPatches)
          .where(and(eq(agentPatches.workspaceId, workspaceId), eq(agentPatches.status, "draft"))),
      ]);

    const completedRoutineIds = new Set(completionRows.filter((row) => row.completed).map((row) => row.routineId));
    const recoveryMinutesThisWeek = weekRecoveryBlocks.reduce((sum, block) => sum + minutesBetween(block.startsAt, block.endsAt), 0);
    const capacity = buildCapacityModel({
      dates: [start],
      capacities: todayCapacityRows,
      tasks: taskRows,
      timeBlocks: todayBlocks,
      routines: routineRows,
    });
    const warningRows = [
      ...buildWarnings({
        inboxCount: inboxRows.length,
        hadYesterdayCheckin: yesterdayCheckinRows.length > 0,
        recoveryMinutesThisWeek,
        recoveryTargetMinutes,
      }),
      ...capacity.warnings,
    ];

    const todayCheckin = todayCheckinRows[0] ?? null;
    return {
      dataUnavailable: false,
      tasks: taskRows.map((task) => {
        const project = task.projectId ? refs.projects.get(task.projectId) : null;
        const course = task.courseId ? refs.courses.get(task.courseId) : null;
        const track = task.trackId ? refs.tracks.get(task.trackId) : null;
        return {
          id: task.id,
          segment: task.daySegment,
          title: task.title,
          context: course?.name ?? project?.name ?? "未分类",
          track: track?.name ?? "未分类",
          minutes: task.estimatedMinutes,
          energy: energyLabel(task.energyLevel),
          status: task.status,
          blocked: task.blocked,
          done: statusDone(task.status),
        };
      }),
      routines: routineRows.map((routine) => ({
        id: routine.id,
        title: routine.title,
        minutes: routine.estimatedMinutes,
        done: completedRoutineIds.has(routine.id),
      })),
      recoveryBlocks: todayBlocks
        .filter((block) => block.kind === "recovery")
        .map((block) => ({
          id: block.id,
          title: block.title,
          time: `${timeLabel(block.startsAt)} - ${timeLabel(block.endsAt)}`,
        })),
      warnings: warningRows.map((warning) => ({
        id: warning.code,
        title: warning.message,
        text: warning.code === "inbox_pileup" ? "Inbox 不占 capacity，但堆积会污染计划判断。" : "这条提醒会进入下一次 agent 重排上下文。",
      })),
      timelineItems: buildDayTimelineItems({
        date: start,
        taskRows,
        blockRows: todayBlocks,
        routineRows,
      }),
      patchCount: patchRows.length,
      checkin: todayCheckin
        ? {
            completedText: todayCheckin.completedText,
            blockerText: todayCheckin.blockerText,
            nextText: todayCheckin.nextText,
          }
        : null,
      streakDays: await loadCheckinStreak(workspaceId),
    };
  } catch (error) {
    if (isMissingDatabase(error)) return emptyTodayData(true);
    throw error;
  }
}

export async function getWeekPageData(workspaceId: string): Promise<WeekViewData> {
  try {
    const db = getDb();
    const now = new Date();
    const today = startOfShanghaiDay(now);
    const { start, end } = dateRangeForWeek(now);
    const weekDates = buildWeekDates(now);
    const refs = await loadReferenceMaps(workspaceId);

    const [taskRows, blockRows, routineRows, capacityRows, checkinRows] = await Promise.all([
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.date, start), lt(tasks.date, end))),
      db
        .select()
        .from(timeBlocks)
        .where(and(eq(timeBlocks.workspaceId, workspaceId), lt(timeBlocks.startsAt, end), gt(timeBlocks.endsAt, start))),
      db.select().from(routines).where(eq(routines.workspaceId, workspaceId)),
      db
        .select()
        .from(dayCapacities)
        .where(and(eq(dayCapacities.workspaceId, workspaceId), gte(dayCapacities.date, start), lt(dayCapacities.date, end))),
      db
        .select()
        .from(checkins)
        .where(and(eq(checkins.workspaceId, workspaceId), gte(checkins.date, start), lt(checkins.date, end)))
        .orderBy(desc(checkins.date))
        .limit(4),
    ]);

    const recoveryBlocks = blockRows.filter((block) => block.kind === "recovery");
    const recoveryMinutes = recoveryBlocks.reduce((sum, block) => sum + minutesBetween(block.startsAt, block.endsAt), 0);
    const balance = calculateTrackBalance([
      ...taskRows.map((task) => ({
        trackId: task.trackId ?? "untracked",
        minutes: task.estimatedMinutes,
      })),
      ...recoveryBlocks.map((block) => ({
        trackId: block.trackId ?? "recovery",
        minutes: minutesBetween(block.startsAt, block.endsAt),
      })),
    ]);

    return {
      dataUnavailable: false,
      days: buildWeekCapacityDays({ weekDates, today, taskRows, blockRows, routineRows, capacityRows }),
      tracks: balance.map((item, index) => {
        const track = refs.tracks.get(item.trackId);
        return {
          name: track?.name ?? (item.trackId === "recovery" ? "恢复" : "未分类"),
          hours: hoursLabel(item.minutes),
          share: item.percent,
          color: trackColors[index % trackColors.length],
          note: track?.targetMaxPercent && item.percent > track.targetMaxPercent ? "超过目标上限" : "按本周已排",
        };
      }),
      recovery: {
        scheduledHours: hoursLabel(recoveryMinutes),
        targetHours: "8h",
        percent: Math.min(100, Math.round((recoveryMinutes / recoveryTargetMinutes) * 100)),
        note:
          recoveryMinutes < recoveryTargetMinutes
            ? `低于目标 ${hoursLabel(recoveryTargetMinutes - recoveryMinutes)}。至少再保护一个免打扰块。`
            : "已达到本周恢复目标。",
        blocks: recoveryBlocks.map((block) => `${block.title} · ${timeLabel(block.startsAt)} - ${timeLabel(block.endsAt)}`).slice(0, 3),
      },
      checkins: checkinRows.map((checkin) => ({
        day: `周${weekdayLabel(checkin.date)}`,
        done: checkin.completedText || "未填写",
        block: checkin.blockerText || "未填写",
        next: checkin.nextText || "未填写",
      })),
    };
  } catch (error) {
    if (isMissingDatabase(error)) return emptyWeekData(true);
    throw error;
  }
}

type MonthTaskInput = {
  id: string;
  title: string;
  status: TaskStatus;
  date: Date;
  estimatedMinutes?: number;
};

export function buildMonthPlanViewData(
  taskRows: MonthTaskInput[],
  activePlanSnapshot: unknown,
  now = new Date(),
): MonthViewData {
  const totalMinutes = taskRows.reduce((sum, task) => sum + (task.estimatedMinutes ?? 30), 0);
  const doneCount = taskRows.filter((task) => statusDone(task.status)).length;
  const minutesByWeek = new Map<string, number>();
  const countByWeek = new Map<string, number>();

  for (const task of taskRows) {
    const key = toDateKey(startOfShanghaiWeek(task.date));
    minutesByWeek.set(key, (minutesByWeek.get(key) ?? 0) + (task.estimatedMinutes ?? 30));
    countByWeek.set(key, (countByWeek.get(key) ?? 0) + 1);
  }

  const weeks = Array.from(countByWeek.keys()).map((key, index) => {
    const minutes = minutesByWeek.get(key) ?? 0;
    return {
      label: `第 ${index + 1} 周`,
      taskCount: countByWeek.get(key) ?? 0,
      minutes: hoursLabel(minutes),
      share: totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0,
    };
  });
  const importSummary = readImportSummary(activePlanSnapshot);
  const completionPercent = taskRows.length ? Math.round((doneCount / taskRows.length) * 100) : 0;
  const cards = buildMonthCards({
    taskCount: taskRows.length,
    doneCount,
    totalHours: hoursLabel(totalMinutes),
    completionPercent,
    importSummary,
    weeks,
  });

  return {
    dataUnavailable: false,
    taskCount: taskRows.length,
    doneCount,
    totalHours: hoursLabel(totalMinutes),
    completionPercent,
    importSummary,
    weeks,
    cards,
    emptyText: cards.length === 0 ? "还没有月度计划数据。导入计划或创建本月任务后，这里会显示真实任务分布。" : null,
  };
}

export async function getMonthPlanData(workspaceId: string): Promise<MonthViewData> {
  try {
    const db = getDb();
    const { start, end } = dateRangeForMonth();
    const [planRow] = await db
      .select({ baselineSnapshot: plans.baselineSnapshot })
      .from(plans)
      .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
      .limit(1);
    const taskRows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.date, start), lt(tasks.date, end)))
      .orderBy(tasks.date, tasks.createdAt);

    const totalMinutes = taskRows.reduce((sum, task) => sum + task.estimatedMinutes, 0);
    const doneCount = taskRows.filter((task) => statusDone(task.status)).length;
    const minutesByWeek = new Map<number, number>();
    const countByWeek = new Map<number, number>();

    for (const task of taskRows) {
      const weekIndex = Math.floor((startOfShanghaiDay(task.date).getTime() - start.getTime()) / (7 * 24 * 60 * 60 * 1000)) + 1;
      minutesByWeek.set(weekIndex, (minutesByWeek.get(weekIndex) ?? 0) + task.estimatedMinutes);
      countByWeek.set(weekIndex, (countByWeek.get(weekIndex) ?? 0) + 1);
    }

    const weeks = Array.from(countByWeek.keys())
      .sort((a, b) => a - b)
      .map((weekIndex) => {
        const minutes = minutesByWeek.get(weekIndex) ?? 0;
        return {
          label: `第 ${weekIndex} 周`,
          taskCount: countByWeek.get(weekIndex) ?? 0,
          minutes: hoursLabel(minutes),
          share: totalMinutes ? Math.round((minutes / totalMinutes) * 100) : 0,
        };
      });

    const importSummary = readImportSummary(planRow?.baselineSnapshot);
    const completionPercent = taskRows.length ? Math.round((doneCount / taskRows.length) * 100) : 0;
    const totalHours = hoursLabel(totalMinutes);
    const cards = buildMonthCards({
      taskCount: taskRows.length,
      doneCount,
      totalHours,
      completionPercent,
      importSummary,
      weeks,
    });

    return {
      dataUnavailable: false,
      taskCount: taskRows.length,
      doneCount,
      totalHours,
      completionPercent,
      importSummary,
      weeks,
      cards,
      emptyText: cards.length === 0 ? "还没有月度计划数据。导入计划或创建本月任务后，这里会显示真实任务分布。" : null,
    };
  } catch (error) {
    if (isMissingDatabase(error)) return emptyMonthData(true);
    throw error;
  }
}

function operationKind(type: string) {
  const labels: Record<string, string> = {
    move_task: "移动",
    split_task: "拆分",
    defer_task: "延期",
    move_to_backlog: "移入 backlog",
    change_priority: "优先级",
    suggest_milestone_change: "里程碑",
    import_timetable: "导入日程",
  };
  return labels[type] ?? type;
}

type ReviewPatchRow = {
  id: string;
  patchJson: unknown;
  createdBy: string;
  createdAt: Date;
};

type ReviewTaskRow = {
  id: string;
  title: string;
};

type ReviewAuditRow = {
  patchId: string;
  skippedJson: unknown;
  conflictJson: unknown;
};

function evidenceList(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
}

function reviewEventsByIndex(value: unknown) {
  const map = new Map<number, Record<string, unknown>>();
  if (!Array.isArray(value)) return map;
  for (const item of value) {
    if (!isRecord(item) || typeof item.index !== "number") continue;
    map.set(item.index, item);
  }
  return map;
}

export function buildReschedulePatchItems(input: {
  patches: ReviewPatchRow[];
  tasks: ReviewTaskRow[];
  reviews?: ReviewAuditRow[];
}): ReschedulePatchItemView[] {
  const tasksById = new Map(input.tasks.map((task) => [task.id, task.title]));
  const reviewsByPatchId = new Map(input.reviews?.map((review) => [review.patchId, review]) ?? []);

  const patchItems: ReschedulePatchItemView[] = [];
  for (const patch of input.patches) {
    const parsed = patch.patchJson as AgentPatch;
    const review = reviewsByPatchId.get(patch.id);
    const skippedByIndex = reviewEventsByIndex(review?.skippedJson);
    const conflictByIndex = reviewEventsByIndex(review?.conflictJson);

    parsed.operations.forEach((operation, index) => {
      const taskId = "task_id" in operation ? operation.task_id : null;
      const title = taskId ? tasksById.get(taskId) ?? `任务 ${taskId.slice(0, 8)}` : "里程碑建议";
      const skipped = skippedByIndex.get(index);
      const conflict = conflictByIndex.get(index);
      const base = {
        id: `${patch.id}:${index}`,
        patchId: patch.id,
        operationIndex: index,
        operationType: operation.type,
        kind: operationKind(operation.type),
        title,
        reason: operation.reason,
        capacity: "应用前会重新计算相关日期容量。",
        protected: false,
        protectedEvidence: evidenceList(operation.protected_evidence),
        provenance: {
          patchId: patch.id,
          operationIndex: index,
          createdBy: patch.createdBy,
          createdAt: patch.createdAt.toISOString(),
        },
        skipped: Boolean(skipped),
        skippedReason: typeof skipped?.reason === "string" ? skipped.reason : undefined,
        conflict: conflict
          ? {
              reason: typeof conflict.reason === "string" ? conflict.reason : "操作存在冲突",
              expected: isRecord(conflict.expected) ? conflict.expected : undefined,
              actual: isRecord(conflict.actual) ? conflict.actual : undefined,
            }
          : undefined,
      };

      if (operation.type === "move_task") {
        patchItems.push({
          ...base,
          from: `${operation.from_date} ${operation.from_day_segment}`,
          to: `${operation.to_date} ${operation.to_day_segment}`,
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : ["任务移动", `patch ${patch.id.slice(0, 8)}`],
        });
      } else if (operation.type === "split_task") {
        patchItems.push({
          ...base,
          from: "原任务",
          to: `${operation.new_tasks.length} 个子任务`,
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : operation.new_tasks.map((task) => `${task.title} · ${task.estimated_minutes}m`).slice(0, 3),
        });
      } else if (operation.type === "defer_task") {
        patchItems.push({
          ...base,
          from: "当前排期",
          to: operation.target_week_or_date,
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : ["延期", `patch ${patch.id.slice(0, 8)}`],
        });
      } else if (operation.type === "move_to_backlog") {
        patchItems.push({
          ...base,
          from: "当前计划",
          to: "Backlog",
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : ["释放本周容量", `patch ${patch.id.slice(0, 8)}`],
        });
      } else if (operation.type === "change_priority") {
        patchItems.push({
          ...base,
          from: operation.from_priority,
          to: operation.to_priority,
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : ["优先级变化", `patch ${patch.id.slice(0, 8)}`],
        });
      } else if (operation.type === "import_timetable") {
        const blockCount = materializeTimetableRows(operation.rows).length;
        patchItems.push({
          ...base,
          title: `导入日程表：${operation.source_label ?? "MCP draft"}`,
          from: "未导入",
          to: `${operation.rows.length} 行 / ${blockCount} 个时间块`,
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : [`将创建 ${blockCount} 个固定时间块`, "不会自动写入，需用户确认"],
        });
      } else {
        patchItems.push({
          ...base,
          title: operation.milestone_id,
          from: "当前里程碑",
          to: operation.proposed_text,
          impact: evidenceList(operation.capacity_impact).length
            ? evidenceList(operation.capacity_impact)
            : ["文字建议", `patch ${patch.id.slice(0, 8)}`],
        });
      }
    });
  }

  return patchItems;
}

export async function getReschedulePageData(workspaceId: string): Promise<RescheduleViewData> {
  try {
    const db = getDb();
    const [patchRows, taskRows] = await Promise.all([
      db
        .select()
        .from(agentPatches)
        .where(and(eq(agentPatches.workspaceId, workspaceId), eq(agentPatches.status, "draft")))
        .orderBy(desc(agentPatches.createdAt)),
      db.select({ id: tasks.id, title: tasks.title }).from(tasks).where(eq(tasks.workspaceId, workspaceId)),
    ]);
    const reviewRows = await db
      .select({
        patchId: agentPatchReviews.patchId,
        skippedJson: agentPatchReviews.skippedJson,
        conflictJson: agentPatchReviews.conflictJson,
      })
      .from(agentPatchReviews)
      .where(eq(agentPatchReviews.workspaceId, workspaceId))
      .orderBy(desc(agentPatchReviews.createdAt))
      .catch((error: unknown) => {
        if (isMissingReviewAuditTable(error)) return [];
        throw error;
      });
    const patchItems = buildReschedulePatchItems({ patches: patchRows, tasks: taskRows, reviews: reviewRows });

    return { dataUnavailable: false, patchItems };
  } catch (error) {
    if (isMissingDatabase(error)) return emptyRescheduleData(true);
    throw error;
  }
}
