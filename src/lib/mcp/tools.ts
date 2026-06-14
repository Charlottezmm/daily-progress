import { and, desc, eq, gte, lt, type SQL } from "drizzle-orm";
import { z } from "zod";
import { checkins, courses, dayCapacities, routines, tasks, timeBlocks } from "@/lib/db/schema";
import { buildCapacityModel } from "@/lib/planning/capacity-model";
import { expandRecurringBlocks } from "@/lib/planning/recurring-time-blocks";
import {
  createDailyCheckin,
  createInboxItem,
  proposeAgentPatch,
  updateTaskSchedule,
  updateTaskStatus,
} from "@/lib/planning/service";
import { saveMcpPlanImport } from "@/lib/mcp/plan-import";
import {
  getConversationSummaries,
  getDecisionRecords,
  recordDecision,
  saveConversationSummary,
} from "@/lib/mcp/conversation-tools";
import { proposeTimetableImport, proposeTimetableImportArgsSchema } from "@/lib/mcp/timetable-import";

type PlanningDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};

type SerializedTask = ReturnType<typeof serializeTask>;

const taskStatusSchema = z.enum(["todo", "done", "skipped", "backlog"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const energyLevelSchema = z.enum(["low", "medium", "high"]);
const daySegmentSchema = z.enum(["morning", "afternoon", "evening"]);
const dateStringSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const createdBySchema = z.enum(["codex", "claude", "user"]);
const conversationContextTypeSchema = z.enum([
  "weekly_review",
  "decision",
  "learning_qa",
  "check_in_followup",
  "methodology",
  "adhoc",
]);
const decisionStatusSchema = z.enum(["active", "superseded", "abandoned"]);
const limitSchema = z.number().int().min(1).max(100).optional();

const emptyArgsSchema = z.object({}).strict();
const rangeArgsSchema = z
  .object({
    date_from: dateStringSchema.optional(),
    date_to: dateStringSchema.optional(),
  })
  .strict();
const mcpAgentPatchSchema = z
  .object({
    operations: z
      .array(
        z
          .object({
            type: z.string(),
            task_id: z.string().optional(),
          })
          .passthrough(),
      )
      .min(1),
  })
  .strict();
const proposePatchArgsSchema = z
  .object({
    mode: z.enum(["today", "week"]),
    reason: z.string().min(1),
    patch: mcpAgentPatchSchema,
    created_by: createdBySchema.optional(),
  })
  .strict();
const jsonStringAgentPatchSchema = z.string().transform((value, ctx) => {
  let parsed: unknown;

  try {
    parsed = JSON.parse(value);
  } catch {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Invalid agent patch JSON",
    });
    return z.NEVER;
  }

  const result = mcpAgentPatchSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      ctx.addIssue(issue);
    }
    return z.NEVER;
  }

  return result.data;
});
const proposePatchRuntimeArgsSchema = proposePatchArgsSchema.extend({
  patch: z.union([mcpAgentPatchSchema, jsonStringAgentPatchSchema]),
});

export const pawPlanToolSchemas = {
  get_today: emptyArgsSchema,
  get_week: emptyArgsSchema,
  get_month: rangeArgsSchema,
  get_constraints: rangeArgsSchema,
  get_capacity: rangeArgsSchema,
  get_decisions: z
    .object({
      status: decisionStatusSchema.optional(),
      limit: limitSchema,
    })
    .strict(),
  get_conversations: z
    .object({
      context_type: conversationContextTypeSchema.optional(),
      limit: limitSchema,
    })
    .strict(),
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
      source: z.enum(["manual", "imported"]).optional(),
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
  update_task_schedule: z
    .object({
      task_id: z.string().min(1),
      date: dateStringSchema.optional(),
      day_segment: daySegmentSchema.optional(),
      status: taskStatusSchema.optional(),
      blocked: z.boolean().optional(),
    })
    .strict(),
  save_conversation_summary: z
    .object({
      topic: z.string().trim().min(1).max(240),
      context_type: conversationContextTypeSchema,
      summary: z.string().trim().min(1).max(10000),
      decisions: z
        .array(
          z
            .object({
              topic: z.string().trim().min(1).max(240),
              chosen: z.string().trim().min(1).max(2000),
              rationale: z.string().trim().min(1).max(4000),
            })
            .strict(),
        )
        .max(50),
      open_questions: z.array(z.string().trim().min(1).max(1000)).max(50),
      created_by: createdBySchema,
    })
    .strict(),
  record_decision: z
    .object({
      topic: z.string().trim().min(1).max(240),
      context: z.string().trim().min(1).max(10000),
      options_considered: z.array(z.string().trim().min(1).max(2000)).min(1).max(50),
      chosen: z.string().trim().min(1).max(4000),
      rationale: z.string().trim().min(1).max(10000),
      tradeoffs_accepted: z.string().trim().max(10000),
      status: decisionStatusSchema,
    })
    .strict(),
  propose_patch: proposePatchArgsSchema,
  propose_timetable_import: proposeTimetableImportArgsSchema,
  import_plan_bundle: z
    .object({
      import_key: z.string().trim().min(1).max(160),
      created_by: createdBySchema.optional(),
      source_label: z.string().trim().max(120).optional(),
      overall_plan: z
        .object({
          title: z.string().trim().min(1).max(180),
          summary: z.string().trim().min(1).max(2000),
        })
        .strict(),
      daily_tasks: z
        .array(
          z
            .object({
              title: z.string().trim().min(1).max(240),
              date: dateStringSchema,
              day_segment: daySegmentSchema,
              estimated_minutes: z.number().int().min(5).max(480),
              priority: prioritySchema.optional(),
              energy_level: energyLevelSchema.optional(),
              notes: z.string().max(2000).optional(),
              project_name: z.string().trim().max(120).optional(),
              track_name: z.string().trim().max(120).optional(),
            })
            .strict(),
        )
        .min(1)
        .max(200),
      weekly_summary: z
        .object({
          week_start: dateStringSchema,
          focus: z.string().trim().min(1).max(2000),
          milestones: z.array(z.string().trim().min(1).max(240)).max(20),
        })
        .strict(),
      monthly_summary: z
        .object({
          month: z.string().regex(/^\d{4}-\d{2}$/),
          goal: z.string().trim().min(1).max(2000),
          milestones: z.array(z.string().trim().min(1).max(240)).max(30),
        })
        .strict(),
    })
    .strict(),
};

export type PawPlanToolName = keyof typeof pawPlanToolSchemas;
export type McpPermission = "read_only" | "read_write";

export const pawPlanToolNames = Object.keys(pawPlanToolSchemas) as PawPlanToolName[];

export const pawPlanToolDescriptions: Record<PawPlanToolName, string> = {
  get_today: "Read today's PawPlan planning context for the configured workspace.",
  get_week: "Read this week's PawPlan planning context for the configured workspace.",
  get_month: "Read a minimal raw month/range task list for the configured workspace.",
  get_constraints: "Read workspace-scoped protected blocks, courses, routines, and time blocks.",
  get_capacity: "Read shared day/segment capacity for the configured workspace.",
  get_decisions: "Read recent workspace-scoped structured decisions, optionally filtered by status.",
  get_conversations: "Read recent workspace-scoped structured conversation summaries, optionally filtered by context type.",
  get_checkins: "Read recent daily check-ins for the configured workspace.",
  get_tasks: "Read workspace-scoped tasks, optionally filtered by status and date range.",
  create_inbox_item: "Create an inbox item and record an MCP audit changelog.",
  create_checkin: "Create or update a daily check-in with MCP source attribution.",
  update_task_status: "Update a task status with MCP source attribution.",
  update_task_schedule: "Update a task date or day segment with MCP source attribution.",
  save_conversation_summary: "Save a structured conversation summary without storing raw transcript, with MCP provenance.",
  record_decision: "Record a structured workspace decision with MCP provenance.",
  propose_patch: "Create a preview-only agent patch draft; this never applies the patch.",
  propose_timetable_import: "Create a preview-only timetable import draft for user review; this never writes constraints directly.",
  import_plan_bundle: "Import a trusted structured plan bundle into real PawPlan tasks with MCP provenance.",
};

const pawPlanToolPermissions: Record<PawPlanToolName, "read" | "write"> = {
  get_today: "read",
  get_week: "read",
  get_month: "read",
  get_constraints: "read",
  get_capacity: "read",
  get_decisions: "read",
  get_conversations: "read",
  get_checkins: "read",
  get_tasks: "read",
  create_inbox_item: "write",
  create_checkin: "write",
  update_task_status: "write",
  update_task_schedule: "write",
  save_conversation_summary: "write",
  record_decision: "write",
  propose_patch: "write",
  propose_timetable_import: "write",
  import_plan_bundle: "write",
};

export const pawPlanWriteToolNames = pawPlanToolNames.filter(
  (name) => pawPlanToolPermissions[name] === "write",
);

export function isPawPlanWriteTool(name: string) {
  return Object.hasOwn(pawPlanToolSchemas, name) && pawPlanToolPermissions[name as PawPlanToolName] === "write";
}

export function allowedPawPlanToolNames(permission: McpPermission) {
  return pawPlanToolNames.filter((name) => permission === "read_write" || pawPlanToolPermissions[name] === "read");
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

function serializeDateFields(row: Record<string, any>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [key, value instanceof Date ? value.toISOString() : value]),
  );
}

function readRange(args: { date_from?: string; date_to?: string }) {
  const start = args.date_from ? parseDateBoundary(args.date_from) : startOfShanghaiDay(new Date());
  const end = args.date_to ? parseDateBoundary(args.date_to) : addDays(start, 7);
  return { start, end, date_from: toDateKey(start), date_to: toDateKey(end) };
}

function datesInRange(start: Date, end: Date) {
  const dates: Date[] = [];
  for (let cursor = start; cursor < end; cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
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

async function readConstraints(
  db: PlanningDb,
  workspaceId: string,
  args: {
    date_from?: string;
    date_to?: string;
  },
) {
  const range = readRange(args);
  const [courseRows, routineRows, blockRows] = await Promise.all([
    db.select().from(courses).where(eq(courses.workspaceId, workspaceId)).orderBy(courses.createdAt),
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(routines.createdAt),
    db
      .select()
      .from(timeBlocks)
      .where(and(eq(timeBlocks.workspaceId, workspaceId), lt(timeBlocks.startsAt, range.end), gte(timeBlocks.endsAt, range.start)))
      .orderBy(timeBlocks.startsAt),
  ]);

  const serializedBlocks: Record<string, unknown>[] = expandRecurringBlocks(blockRows, range.start, range.end).map(
    (block: Record<string, any>) => serializeDateFields(block),
  );
  return {
    workspaceId,
    filters: args,
    courses: courseRows.map(serializeDateFields),
    routines: routineRows.map(serializeDateFields),
    timeBlocks: serializedBlocks,
    protectedBlocks: serializedBlocks.filter((block) =>
      ["course", "meeting", "unavailable", "routine", "recovery"].includes(String(block.kind)),
    ),
  };
}

async function readCapacity(
  db: PlanningDb,
  workspaceId: string,
  args: {
    date_from?: string;
    date_to?: string;
  },
) {
  const range = readRange(args);
  const [taskRows, blockRows, routineRows, capacityRows] = await Promise.all([
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), gte(tasks.date, range.start), lt(tasks.date, range.end))),
    db
      .select()
      .from(timeBlocks)
      .where(and(eq(timeBlocks.workspaceId, workspaceId), lt(timeBlocks.startsAt, range.end), gte(timeBlocks.endsAt, range.start))),
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)),
    db
      .select()
      .from(dayCapacities)
      .where(and(eq(dayCapacities.workspaceId, workspaceId), gte(dayCapacities.date, range.start), lt(dayCapacities.date, range.end))),
  ]);

  return {
    workspaceId,
    filters: args,
    capacity: buildCapacityModel({
      dates: datesInRange(range.start, range.end),
      capacities: capacityRows,
      tasks: taskRows,
      timeBlocks: blockRows,
      routines: routineRows,
    }),
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
  permission: McpPermission = "read_write",
) {
  if (!workspaceId) throw new Error("PAWPLAN_WORKSPACE_ID is required");
  if (!Object.hasOwn(pawPlanToolSchemas, name)) throw new Error(`Unknown PawPlan MCP tool: ${name}`);

  const toolName = name as PawPlanToolName;
  if (permission !== "read_write" && pawPlanToolPermissions[toolName] === "write") {
    throw new Error("MCP token does not allow write tools");
  }

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
  if (toolName === "get_constraints") {
    const parsed = pawPlanToolSchemas.get_constraints.parse(args);
    return readConstraints(db, workspaceId, parsed);
  }
  if (toolName === "get_capacity") {
    const parsed = pawPlanToolSchemas.get_capacity.parse(args);
    return readCapacity(db, workspaceId, parsed);
  }
  if (toolName === "get_decisions") {
    const parsed = pawPlanToolSchemas.get_decisions.parse(args);
    return getDecisionRecords(db, workspaceId, parsed);
  }
  if (toolName === "get_conversations") {
    const parsed = pawPlanToolSchemas.get_conversations.parse(args);
    return getConversationSummaries(db, workspaceId, {
      contextType: parsed.context_type,
      limit: parsed.limit,
    });
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
      source: parsed.source ?? "manual",
      changeLogSource: "mcp",
    });

    return {
      item,
      audit: {
        source: "mcp",
        note: `Inbox item source recorded as ${item.source}.`,
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
      note: parsed.note,
      source: "mcp",
    });
    if (!task) throw new Error("Task not found");

    return {
      task,
      note: parsed.note
        ? {
            received: parsed.note,
            persisted: true,
          }
      : undefined,
    };
  }

  if (toolName === "update_task_schedule") {
    const parsed = pawPlanToolSchemas.update_task_schedule.parse(args);
    if (!parsed.date && !parsed.day_segment) throw new Error("date or day_segment is required");
    const task = await updateTaskSchedule(db, {
      workspaceId,
      taskId: parsed.task_id,
      status: parsed.status,
      blocked: parsed.blocked,
      date: parsed.date,
      daySegment: parsed.day_segment,
      source: "mcp",
    });
    if (!task) throw new Error("Task not found");

    return { task };
  }

  if (toolName === "save_conversation_summary") {
    const parsed = pawPlanToolSchemas.save_conversation_summary.parse(args);
    return saveConversationSummary(db, {
      workspaceId,
      topic: parsed.topic,
      contextType: parsed.context_type,
      summary: parsed.summary,
      decisions: parsed.decisions,
      openQuestions: parsed.open_questions,
      createdBy: parsed.created_by,
    });
  }

  if (toolName === "record_decision") {
    const parsed = pawPlanToolSchemas.record_decision.parse(args);
    return recordDecision(db, {
      workspaceId,
      topic: parsed.topic,
      context: parsed.context,
      optionsConsidered: parsed.options_considered,
      chosen: parsed.chosen,
      rationale: parsed.rationale,
      tradeoffsAccepted: parsed.tradeoffs_accepted,
      status: parsed.status,
    });
  }

  if (toolName === "import_plan_bundle") {
    const parsed = pawPlanToolSchemas.import_plan_bundle.parse(args);
    return saveMcpPlanImport(db, {
      workspaceId,
      importKey: parsed.import_key,
      createdBy: parsed.created_by ?? "codex",
      sourceLabel: parsed.source_label,
      overallPlan: parsed.overall_plan,
      dailyTasks: parsed.daily_tasks.map((task) => ({
        title: task.title,
        date: task.date,
        daySegment: task.day_segment,
        estimatedMinutes: task.estimated_minutes,
        priority: task.priority,
        energyLevel: task.energy_level,
        notes: task.notes,
        projectName: task.project_name,
        trackName: task.track_name,
      })),
      weeklySummary: {
        weekStart: parsed.weekly_summary.week_start,
        focus: parsed.weekly_summary.focus,
        milestones: parsed.weekly_summary.milestones,
      },
      monthlySummary: parsed.monthly_summary,
    });
  }

  if (toolName === "propose_timetable_import") {
    const parsed = pawPlanToolSchemas.propose_timetable_import.parse(args);
    return proposeTimetableImport(db, workspaceId, parsed);
  }

  const parsed = proposePatchRuntimeArgsSchema.parse(args);
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
