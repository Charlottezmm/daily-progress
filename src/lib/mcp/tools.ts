import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { checkins, tasks } from "@/lib/db/schema";
import {
  createDailyCheckin,
  createInboxItem,
  proposeAgentPatch,
  updateTaskStatus,
} from "@/lib/planning/service";

type PlanningDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};

type SerializedTask = ReturnType<typeof serializeTask>;

const taskStatusSchema = z.enum(["todo", "done", "skipped", "backlog"]);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const emptyArgsSchema = z.object({}).strict();
const rangeArgsSchema = z
  .object({
    date_from: dateStringSchema.optional(),
    date_to: dateStringSchema.optional(),
  })
  .strict();

export const pawPlanToolSchemas = {
  get_today: emptyArgsSchema,
  get_week: emptyArgsSchema,
  get_month: rangeArgsSchema,
  get_checkins: z
    .object({
      days: z.number().int().min(1).max(90).optional(),
    })
    .strict(),
  get_tasks: z
    .object({
      status: taskStatusSchema.optional(),
      date_from: dateStringSchema.optional(),
      date_to: dateStringSchema.optional(),
    })
    .strict(),
  create_inbox_item: z
    .object({
      title: z.string().trim().min(1).max(240),
    })
    .strict(),
  create_checkin: z
    .object({
      date: dateStringSchema.optional(),
      completed_text: z.string().max(1000),
      blocker_text: z.string().max(1000).optional(),
      next_text: z.string().max(1000).optional(),
    })
    .strict(),
  update_task_status: z
    .object({
      task_id: z.string().min(1),
      status: taskStatusSchema,
      note: z.string().max(1000).optional(),
    })
    .strict(),
  propose_patch: z
    .object({
      mode: z.enum(["today", "week"]),
      reason: z.string().min(1),
      patch: z.unknown(),
      created_by: z.enum(["codex", "claude", "user"]).optional(),
    })
    .strict(),
};

export type PawPlanToolName = keyof typeof pawPlanToolSchemas;

export const pawPlanToolNames = Object.keys(pawPlanToolSchemas) as PawPlanToolName[];

export const pawPlanToolDescriptions: Record<PawPlanToolName, string> = {
  get_today: "Read today's PawPlan planning context for the configured workspace.",
  get_week: "Read this week's PawPlan planning context for the configured workspace.",
  get_month: "Read a minimal raw month/range task list for the configured workspace.",
  get_checkins: "Read recent daily check-ins for the configured workspace.",
  get_tasks: "Read workspace-scoped tasks, optionally filtered by status and date range.",
  create_inbox_item: "Create an inbox item and record an MCP audit changelog.",
  create_checkin: "Create or update a daily check-in with MCP source attribution.",
  update_task_status: "Update a task status with MCP source attribution.",
  propose_patch: "Create a preview-only agent patch draft; this never applies the patch.",
};

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

function startOfShanghaiDay(date: Date) {
  const { year, month, day } = shanghaiDateParts(date);
  return new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
}

function parseDateBoundary(value: string) {
  return new Date(`${value}T00:00:00.000+08:00`);
}

function toDateKey(date: Date) {
  const { year, month, day } = shanghaiDateParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function serializeTask(task: Record<string, any>) {
  return {
    ...task,
    date: task.date instanceof Date ? task.date.toISOString() : task.date,
    createdAt: task.createdAt instanceof Date ? task.createdAt.toISOString() : task.createdAt,
    updatedAt: task.updatedAt instanceof Date ? task.updatedAt.toISOString() : task.updatedAt,
  };
}

function serializeCheckin(checkin: Record<string, any>) {
  return {
    ...checkin,
    date: checkin.date instanceof Date ? checkin.date.toISOString() : checkin.date,
    createdAt: checkin.createdAt instanceof Date ? checkin.createdAt.toISOString() : checkin.createdAt,
    updatedAt: checkin.updatedAt instanceof Date ? checkin.updatedAt.toISOString() : checkin.updatedAt,
  };
}

function buildTaskFilters(
  workspaceId: string,
  args: {
    status?: "todo" | "done" | "skipped" | "backlog";
    date_from?: string;
    date_to?: string;
  },
) {
  const filters: SQL[] = [eq(tasks.workspaceId, workspaceId)];
  if (args.status) filters.push(eq(tasks.status, args.status));
  if (args.date_from) filters.push(gte(tasks.date, parseDateBoundary(args.date_from)));
  if (args.date_to) filters.push(lt(tasks.date, parseDateBoundary(args.date_to)));
  return filters;
}

async function readTasks(
  db: PlanningDb,
  workspaceId: string,
  args: {
    status?: "todo" | "done" | "skipped" | "backlog";
    date_from?: string;
    date_to?: string;
  },
) {
  const rows = await db
    .select()
    .from(tasks)
    .where(and(...buildTaskFilters(workspaceId, args)))
    .orderBy(tasks.date, tasks.daySegment, tasks.createdAt);

  return {
    workspaceId,
    filters: args,
    tasks: rows.map(serializeTask),
  };
}

async function readCheckins(db: PlanningDb, workspaceId: string, days = 7) {
  const start = addDays(startOfShanghaiDay(new Date()), -days + 1);
  const rows = await db
    .select()
    .from(checkins)
    .where(and(eq(checkins.workspaceId, workspaceId), gte(checkins.date, start)))
    .orderBy(desc(checkins.date));

  return {
    workspaceId,
    days,
    checkins: rows.map(serializeCheckin),
  };
}

async function readToday(db: PlanningDb, workspaceId: string) {
  const start = startOfShanghaiDay(new Date());
  const end = addDays(start, 1);
  const [taskContext, checkinContext] = await Promise.all([
    readTasks(db, workspaceId, {
      date_from: toDateKey(start),
      date_to: toDateKey(end),
    }),
    readCheckins(db, workspaceId, 1),
  ]);

  return {
    workspaceId,
    scope: "today",
    date: toDateKey(start),
    tasks: taskContext.tasks,
    checkins: checkinContext.checkins,
  };
}

async function readWeek(db: PlanningDb, workspaceId: string) {
  const today = startOfShanghaiDay(new Date());
  const shanghaiNoon = new Date(today.getTime() + 20 * 60 * 60 * 1000);
  const weekday = shanghaiNoon.getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = addDays(today, mondayOffset);
  const end = addDays(start, 7);
  const taskContext = await readTasks(db, workspaceId, {
    date_from: toDateKey(start),
    date_to: toDateKey(end),
  });

  const groupedTasks = (taskContext.tasks as SerializedTask[]).reduce<Record<string, SerializedTask[]>>((groups, task) => {
    const key = task.date ? toDateKey(new Date(task.date)) : "undated";
    groups[key] = groups[key] ?? [];
    groups[key].push(task);
    return groups;
  }, {});

  return {
    workspaceId,
    scope: "week",
    date_from: toDateKey(start),
    date_to: toDateKey(end),
    groupedTasks,
  };
}

async function readMonth(
  db: PlanningDb,
  workspaceId: string,
  args: {
    date_from?: string;
    date_to?: string;
  },
) {
  const start = args.date_from ? parseDateBoundary(args.date_from) : startOfShanghaiDay(new Date());
  const end = args.date_to ? parseDateBoundary(args.date_to) : addDays(start, 31);
  const taskContext = await readTasks(db, workspaceId, {
    date_from: toDateKey(start),
    date_to: toDateKey(end),
  });

  const groupedTasks = (taskContext.tasks as SerializedTask[]).reduce<Record<string, SerializedTask[]>>((groups, task) => {
    const key = task.date ? toDateKey(new Date(task.date)) : "undated";
    groups[key] = groups[key] ?? [];
    groups[key].push(task);
    return groups;
  }, {});

  return {
    workspaceId,
    scope: "raw_month_task_range",
    note: "Current app has no full month planner contract; this is a real workspace-scoped task query grouped by date.",
    date_from: toDateKey(start),
    date_to: toDateKey(end),
    groupedTasks,
  };
}

export async function runPawPlanTool(
  db: PlanningDb,
  workspaceId: string,
  name: string,
  args: unknown = {},
) {
  if (!workspaceId) throw new Error("PAWPLAN_WORKSPACE_ID is required");
  if (!Object.hasOwn(pawPlanToolSchemas, name)) throw new Error(`Unknown PawPlan MCP tool: ${name}`);

  const toolName = name as PawPlanToolName;
  if (toolName === "get_today") {
    pawPlanToolSchemas.get_today.parse(args);
    return readToday(db, workspaceId);
  }
  if (toolName === "get_week") {
    pawPlanToolSchemas.get_week.parse(args);
    return readWeek(db, workspaceId);
  }
  if (toolName === "get_month") {
    const parsed = pawPlanToolSchemas.get_month.parse(args);
    return readMonth(db, workspaceId, parsed);
  }
  if (toolName === "get_checkins") {
    const parsed = pawPlanToolSchemas.get_checkins.parse(args);
    return readCheckins(db, workspaceId, parsed.days ?? 7);
  }
  if (toolName === "get_tasks") {
    const parsed = pawPlanToolSchemas.get_tasks.parse(args);
    return readTasks(db, workspaceId, parsed);
  }

  if (toolName === "create_inbox_item") {
    const parsed = pawPlanToolSchemas.create_inbox_item.parse(args);
    const item = await createInboxItem(db, {
      workspaceId,
      title: parsed.title,
      source: "manual",
      changeLogSource: "mcp",
    });

    return {
      item,
      audit: {
        source: "mcp",
        note: "Inbox item source remains manual because the current schema only supports manual/imported.",
      },
    };
  }

  if (toolName === "create_checkin") {
    const parsed = pawPlanToolSchemas.create_checkin.parse(args);
    const result = await createDailyCheckin(db, {
      workspaceId,
      date: parsed.date,
      completedText: parsed.completed_text,
      blockerText: parsed.blocker_text ?? "",
      nextText: parsed.next_text ?? "",
      source: "mcp",
    });

    return {
      ...result,
      date: result.date.toISOString(),
      source: "mcp",
    };
  }

  if (toolName === "update_task_status") {
    const parsed = pawPlanToolSchemas.update_task_status.parse(args);
    const task = await updateTaskStatus(db, {
      workspaceId,
      taskId: parsed.task_id,
      status: parsed.status,
      source: "mcp",
    });
    if (!task) throw new Error("Task not found");

    return {
      task,
      note: parsed.note
        ? {
            received: parsed.note,
            persisted: false,
            reason: "Task status notes are not supported by the current schema.",
          }
        : undefined,
    };
  }

  const parsed = pawPlanToolSchemas.propose_patch.parse(args);
  const result = await proposeAgentPatch(db, {
    workspaceId,
    mode: parsed.mode,
    reason: parsed.reason,
    patch: parsed.patch,
    createdBy: parsed.created_by ?? "codex",
  });

  return {
    ...result,
    previewOnly: true,
  };
}
