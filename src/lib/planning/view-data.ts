import { and, desc, eq, gt, gte, isNull, lt } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import {
  agentPatches,
  checkins,
  courses,
  dayCapacities,
  inboxItems,
  projects,
  routineCompletions,
  routines,
  tasks,
  timeBlocks,
  tracks,
} from "@/lib/db/schema";
import { calculateTrackBalance } from "@/lib/planning/track-balance";
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

export type ReschedulePatchItemView = {
  id: string;
  patchId: string;
  kind: string;
  title: string;
  from?: string;
  to?: string;
  reason: string;
  impact: string[];
  capacity: string;
  protected?: boolean;
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

function emptyTodayData(dataUnavailable = false): TodayViewData {
  return {
    dataUnavailable,
    tasks: [],
    routines: [],
    recoveryBlocks: [],
    warnings: dataUnavailable
      ? [{ id: "data_unavailable", title: "本地数据源未配置", text: "当前没有 DATABASE_URL，页面显示为空态；配置数据库后会读取真实计划。" }]
      : [],
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

    const [taskRows, routineRows, completionRows, todayBlocks, weekRecoveryBlocks, inboxRows, todayCheckinRows, yesterdayCheckinRows, patchRows] =
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
    const warningRows = buildWarnings({
      inboxCount: inboxRows.length,
      hadYesterdayCheckin: yesterdayCheckinRows.length > 0,
      recoveryMinutesThisWeek,
      recoveryTargetMinutes,
    });

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

    const [taskRows, blockRows, capacityRows, checkinRows] = await Promise.all([
      db
        .select()
        .from(tasks)
        .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.date, start), lt(tasks.date, end))),
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
        .from(checkins)
        .where(and(eq(checkins.workspaceId, workspaceId), gte(checkins.date, start), lt(checkins.date, end)))
        .orderBy(desc(checkins.date))
        .limit(4),
    ]);

    const capacities = new Map(capacityRows.map((row) => [toDateKey(row.date), row]));
    const itemsByDay = new Map<string, string[]>();
    const loadByDay = new Map<string, number>();
    const capacityByDay = new Map<string, number>();

    for (const date of weekDates) {
      const capacity = capacities.get(toDateKey(date));
      capacityByDay.set(toDateKey(date), capacity ? capacity.morningMinutes + capacity.afternoonMinutes + capacity.eveningMinutes : 540);
      itemsByDay.set(toDateKey(date), []);
      loadByDay.set(toDateKey(date), 0);
    }

    for (const task of taskRows) {
      const key = toDateKey(task.date);
      itemsByDay.get(key)?.push(task.title);
      loadByDay.set(key, (loadByDay.get(key) ?? 0) + task.estimatedMinutes);
    }

    for (const block of blockRows) {
      const key = toDateKey(block.startsAt);
      itemsByDay.get(key)?.push(block.title);
      loadByDay.set(key, (loadByDay.get(key) ?? 0) + minutesBetween(block.startsAt, block.endsAt));
    }

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
      days: weekDates.map((date) => {
        const key = toDateKey(date);
        const capacity = capacityByDay.get(key) ?? 540;
        const load = loadByDay.get(key) ?? 0;
        const percent = capacity === 0 ? 0 : Math.round((load / capacity) * 100);
        return {
          day: weekdayLabel(date),
          date: monthDayLabel(date),
          load: percent,
          capacity: hoursLabel(load),
          state: isSameShanghaiDay(date, today) ? "today" : percent > 100 ? "over" : percent < 60 ? "room" : "ok",
          items: (itemsByDay.get(key) ?? []).slice(0, 4),
        };
      }),
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

function operationKind(type: string) {
  const labels: Record<string, string> = {
    move_task: "移动",
    split_task: "拆分",
    defer_task: "延期",
    move_to_backlog: "移入 backlog",
    change_priority: "优先级",
    suggest_milestone_change: "里程碑",
  };
  return labels[type] ?? type;
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
    const tasksById = new Map(taskRows.map((task) => [task.id, task.title]));

    const patchItems: ReschedulePatchItemView[] = [];
    for (const patch of patchRows) {
      const parsed = patch.patchJson as AgentPatch;
      parsed.operations.forEach((operation, index) => {
        const taskId = "task_id" in operation ? operation.task_id : null;
        const title = taskId ? tasksById.get(taskId) ?? `任务 ${taskId.slice(0, 8)}` : "里程碑建议";
        const base = {
          id: `${patch.id}:${index}`,
          patchId: patch.id,
          kind: operationKind(operation.type),
          title,
          reason: operation.reason,
          capacity: "应用前会重新计算相关日期容量。",
          protected: false,
        };

        if (operation.type === "move_task") {
          patchItems.push({
            ...base,
            from: `${operation.from_date} ${operation.from_day_segment}`,
            to: `${operation.to_date} ${operation.to_day_segment}`,
            impact: ["任务移动", `patch ${patch.id.slice(0, 8)}`],
          });
        } else if (operation.type === "split_task") {
          patchItems.push({
            ...base,
            from: "原任务",
            to: `${operation.new_tasks.length} 个子任务`,
            impact: operation.new_tasks.map((task) => `${task.title} · ${task.estimated_minutes}m`).slice(0, 3),
          });
        } else if (operation.type === "defer_task") {
          patchItems.push({
            ...base,
            from: "当前排期",
            to: operation.target_week_or_date,
            impact: ["延期", `patch ${patch.id.slice(0, 8)}`],
          });
        } else if (operation.type === "move_to_backlog") {
          patchItems.push({
            ...base,
            from: "当前计划",
            to: "Backlog",
            impact: ["释放本周容量", `patch ${patch.id.slice(0, 8)}`],
          });
        } else if (operation.type === "change_priority") {
          patchItems.push({
            ...base,
            from: operation.from_priority,
            to: operation.to_priority,
            impact: ["优先级变化", `patch ${patch.id.slice(0, 8)}`],
          });
        } else {
          patchItems.push({
            ...base,
            title: operation.milestone_id,
            from: "当前里程碑",
            to: operation.proposed_text,
            impact: ["文字建议", `patch ${patch.id.slice(0, 8)}`],
          });
        }
      });
    }

    return { dataUnavailable: false, patchItems };
  } catch (error) {
    if (isMissingDatabase(error)) return emptyRescheduleData(true);
    throw error;
  }
}
