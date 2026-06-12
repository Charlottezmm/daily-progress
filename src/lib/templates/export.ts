import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { courses, routines, segmentEnergySettings, tasks, timeBlocks, tracks, workspaces } from "@/lib/db/schema";

type DbLike = {
  select: (...args: any[]) => any;
};

const daySegmentSchema = z.enum(["morning", "afternoon", "evening"]);
const energyLevelSchema = z.enum(["low", "medium", "high"]);
const routineTimeSegmentSchema = z.enum(["morning", "afternoon", "evening", "specific_window"]);
const trackKindSchema = z.enum(["main", "work", "side", "recovery", "custom"]);
const timeBlockKindSchema = z.enum(["course", "meeting", "unavailable", "routine", "recovery"]);
const taskStatusSchema = z.enum(["todo", "done", "skipped", "backlog"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);

export const pawPlanTemplateSchema = z
  .object({
    schemaVersion: z.literal("pawplan.template.v0.4"),
    exportedAt: z.string().datetime(),
    workspace: z.object({
      name: z.string().min(1).max(120),
    }),
    tracks: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120),
        kind: trackKindSchema,
        targetMinPercent: z.number().int().nullable(),
        targetMaxPercent: z.number().int().nullable(),
        color: z.string().min(1).max(32),
      }),
    ),
    courses: z.array(
      z.object({
        id: z.string().min(1),
        name: z.string().min(1).max(120),
        color: z.string().min(1).max(32),
      }),
    ),
    routines: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(180),
        defaultTimeSegment: routineTimeSegmentSchema,
        defaultStartTime: z.string().nullable(),
        defaultEndTime: z.string().nullable(),
        weekdayPattern: z.string().min(1).max(80),
        estimatedMinutes: z.number().int().min(1).max(1440),
        energyLevel: energyLevelSchema,
      }),
    ),
    segmentEnergySettings: z.array(
      z.object({
        segment: daySegmentSchema,
        energyLevel: energyLevelSchema,
      }),
    ),
    timeBlocks: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(180),
        kind: timeBlockKindSchema,
        startsAt: z.string().datetime(),
        endsAt: z.string().datetime(),
        recurrenceRule: z.string().nullable(),
        courseId: z.string().nullable(),
        trackId: z.string().nullable(),
        movable: z.boolean(),
        estimatedMinutes: z.number().int().nullable(),
        energyLevel: energyLevelSchema.nullable(),
      }),
    ),
    tasks: z.array(
      z.object({
        id: z.string().min(1),
        title: z.string().min(1).max(240),
        notes: z.string().nullable(),
        date: z.string().datetime(),
        daySegment: daySegmentSchema,
        status: taskStatusSchema,
        priority: prioritySchema,
        estimatedMinutes: z.number().int().min(1),
        energyLevel: energyLevelSchema,
        movable: z.boolean(),
        courseId: z.string().nullable(),
        trackId: z.string().nullable(),
        parentTaskId: z.string().nullable(),
      }),
    ),
  })
  .strict();

export type PawPlanTemplate = z.infer<typeof pawPlanTemplateSchema>;

export class TemplateExportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function iso(value: Date | string) {
  return new Date(value).toISOString();
}

export async function exportWorkspaceTemplate(
  db: DbLike,
  workspaceId: string,
  exportedAt: Date = new Date(),
): Promise<PawPlanTemplate> {
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) throw new TemplateExportError("Workspace not found", 404);

  const [trackRows, courseRows, routineRows, energyRows, timeBlockRows, taskRows] = await Promise.all([
    db.select().from(tracks).where(eq(tracks.workspaceId, workspaceId)).orderBy(asc(tracks.createdAt)),
    db.select().from(courses).where(eq(courses.workspaceId, workspaceId)).orderBy(asc(courses.createdAt)),
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(asc(routines.createdAt)),
    db
      .select()
      .from(segmentEnergySettings)
      .where(eq(segmentEnergySettings.workspaceId, workspaceId))
      .orderBy(asc(segmentEnergySettings.segment)),
    db.select().from(timeBlocks).where(eq(timeBlocks.workspaceId, workspaceId)).orderBy(asc(timeBlocks.startsAt)),
    db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId)))
      .orderBy(asc(tasks.date), asc(tasks.createdAt)),
  ]);

  return pawPlanTemplateSchema.parse({
    schemaVersion: "pawplan.template.v0.4",
    exportedAt: exportedAt.toISOString(),
    workspace: { name: workspace.name },
    tracks: trackRows.map((track: typeof tracks.$inferSelect) => ({
      id: track.id,
      name: track.name,
      kind: track.kind,
      targetMinPercent: track.targetMinPercent,
      targetMaxPercent: track.targetMaxPercent,
      color: track.color,
    })),
    courses: courseRows.map((course: typeof courses.$inferSelect) => ({
      id: course.id,
      name: course.name,
      color: course.color,
    })),
    routines: routineRows.map((routine: typeof routines.$inferSelect) => ({
      id: routine.id,
      title: routine.title,
      defaultTimeSegment: routine.defaultTimeSegment,
      defaultStartTime: routine.defaultStartTime,
      defaultEndTime: routine.defaultEndTime,
      weekdayPattern: routine.weekdayPattern,
      estimatedMinutes: routine.estimatedMinutes,
      energyLevel: routine.energyLevel,
    })),
    segmentEnergySettings: energyRows.map((setting: typeof segmentEnergySettings.$inferSelect) => ({
      segment: setting.segment,
      energyLevel: setting.energyLevel,
    })),
    timeBlocks: timeBlockRows.map((block: typeof timeBlocks.$inferSelect) => ({
      id: block.id,
      title: block.title,
      kind: block.kind,
      startsAt: iso(block.startsAt),
      endsAt: iso(block.endsAt),
      recurrenceRule: block.recurrenceRule,
      courseId: block.courseId,
      trackId: block.trackId,
      movable: block.movable,
      estimatedMinutes: block.estimatedMinutes,
      energyLevel: block.energyLevel,
    })),
    tasks: taskRows.map((task: typeof tasks.$inferSelect) => ({
      id: task.id,
      title: task.title,
      notes: task.notes,
      date: iso(task.date),
      daySegment: task.daySegment,
      status: "todo",
      priority: task.priority,
      estimatedMinutes: task.estimatedMinutes,
      energyLevel: task.energyLevel,
      movable: task.movable,
      courseId: task.courseId,
      trackId: task.trackId,
      parentTaskId: task.parentTaskId,
    })),
  });
}
