import { eq } from "drizzle-orm";
import { z } from "zod";
import {
  courses,
  plans,
  planVersions,
  routines,
  segmentEnergySettings,
  tasks,
  timeBlocks,
  tracks,
} from "@/lib/db/schema";
import { pawPlanTemplateSchema, type PawPlanTemplate } from "@/lib/templates/export";

type DbLike = {
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  transaction: <T>(callback: (tx: DbLike) => Promise<T>) => Promise<T>;
};

export const templateImportRequestSchema = z
  .object({
    template: pawPlanTemplateSchema,
    mode: z.literal("new_plan"),
  })
  .strict();

export type TemplateImportRequest = z.infer<typeof templateImportRequestSchema>;

export class TemplateImportError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function parseDate(value: string) {
  return new Date(value);
}

function planDateRange(template: PawPlanTemplate, now = new Date()) {
  const dates = [
    ...template.tasks.map((task) => parseDate(task.date)),
    ...template.timeBlocks.map((block) => parseDate(block.startsAt)),
    ...template.timeBlocks.map((block) => parseDate(block.endsAt)),
  ].filter((date) => !Number.isNaN(date.getTime()));

  if (dates.length === 0) {
    const end = new Date(now);
    end.setDate(end.getDate() + 30);
    return { startDate: now, endDate: end };
  }

  return {
    startDate: new Date(Math.min(...dates.map((date) => date.getTime()))),
    endDate: new Date(Math.max(...dates.map((date) => date.getTime()))),
  };
}

function mappedId(map: Map<string, string>, id: string | null) {
  if (!id) return null;
  return map.get(id) ?? null;
}

export async function importWorkspaceTemplate(
  db: DbLike,
  workspaceId: string,
  request: TemplateImportRequest,
  now: Date = new Date(),
) {
  const parsed = templateImportRequestSchema.safeParse(request);
  if (!parsed.success) throw new TemplateImportError("Invalid template import request", 400);

  const template = parsed.data.template;
  const range = planDateRange(template, now);
  const baselineSnapshot = {
    schemaVersion: template.schemaVersion,
    importedAt: now.toISOString(),
    source: "template",
    sourceWorkspaceName: template.workspace.name,
    counts: {
      tracks: template.tracks.length,
      courses: template.courses.length,
      routines: template.routines.length,
      timeBlocks: template.timeBlocks.length,
      tasks: template.tasks.length,
    },
  };

  return db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(plans)
      .values({
        workspaceId,
        title: `${template.workspace.name} Template`,
        startDate: range.startDate,
        endDate: range.endDate,
        status: "active",
        baselineSnapshot,
      })
      .returning();

    const [version] = await tx
      .insert(planVersions)
      .values({
        workspaceId,
        planId: plan.id,
        versionNumber: 1,
        snapshot: baselineSnapshot,
        source: "baseline",
      })
      .returning();

    await tx.update(plans).set({ currentVersionId: version.id }).where(eq(plans.id, plan.id));

    const trackRows =
      template.tracks.length > 0
        ? await tx
            .insert(tracks)
            .values(
              template.tracks.map((track) => ({
                workspaceId,
                name: track.name,
                kind: track.kind,
                targetMinPercent: track.targetMinPercent,
                targetMaxPercent: track.targetMaxPercent,
                color: track.color,
              })),
            )
            .returning()
        : [];
    const trackIdMap = new Map(template.tracks.map((track, index) => [track.id, trackRows[index]?.id]));

    const courseRows =
      template.courses.length > 0
        ? await tx
            .insert(courses)
            .values(
              template.courses.map((course) => ({
                workspaceId,
                name: course.name,
                color: course.color,
              })),
            )
            .returning()
        : [];
    const courseIdMap = new Map(template.courses.map((course, index) => [course.id, courseRows[index]?.id]));

    if (template.routines.length > 0) {
      await tx.insert(routines).values(
        template.routines.map((routine) => ({
          workspaceId,
          title: routine.title,
          defaultTimeSegment: routine.defaultTimeSegment,
          defaultStartTime: routine.defaultStartTime,
          defaultEndTime: routine.defaultEndTime,
          weekdayPattern: routine.weekdayPattern,
          estimatedMinutes: routine.estimatedMinutes,
          energyLevel: routine.energyLevel,
        })),
      );
    }

    if (template.segmentEnergySettings.length > 0) {
      await tx.insert(segmentEnergySettings).values(
        template.segmentEnergySettings.map((setting) => ({
          workspaceId,
          segment: setting.segment,
          energyLevel: setting.energyLevel,
        })),
      );
    }

    if (template.timeBlocks.length > 0) {
      await tx.insert(timeBlocks).values(
        template.timeBlocks.map((block) => ({
          workspaceId,
          title: block.title,
          kind: block.kind,
          startsAt: parseDate(block.startsAt),
          endsAt: parseDate(block.endsAt),
          recurrenceRule: block.recurrenceRule,
          courseId: mappedId(courseIdMap, block.courseId),
          trackId: mappedId(trackIdMap, block.trackId),
          movable: block.movable,
          estimatedMinutes: block.estimatedMinutes,
          energyLevel: block.energyLevel,
        })),
      );
    }

    if (template.tasks.length > 0) {
      await tx.insert(tasks).values(
        template.tasks.map((task) => ({
          workspaceId,
          planId: plan.id,
          title: task.title,
          notes: task.notes,
          date: parseDate(task.date),
          daySegment: task.daySegment,
          status: "todo",
          priority: task.priority,
          estimatedMinutes: task.estimatedMinutes,
          energyLevel: task.energyLevel,
          movable: task.movable,
          courseId: mappedId(courseIdMap, task.courseId),
          trackId: mappedId(trackIdMap, task.trackId),
          parentTaskId: null,
        })),
      );
    }

    return {
      planId: plan.id,
      tasksCreated: template.tasks.length,
      routinesCreated: template.routines.length,
      timeBlocksCreated: template.timeBlocks.length,
    };
  });
}
