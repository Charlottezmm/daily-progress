import { and, asc, eq, sql } from "drizzle-orm";
import { routines, segmentEnergySettings } from "@/lib/db/schema";

type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
  delete: (...args: any[]) => any;
};

type DaySegment = "morning" | "afternoon" | "evening";
type EnergyLevel = "low" | "medium" | "high";
type RoutineTimeSegment = "morning" | "afternoon" | "evening" | "specific_window";

export type RoutineInput = {
  id?: string;
  title: string;
  defaultTimeSegment: RoutineTimeSegment;
  defaultStartTime?: string | null;
  defaultEndTime?: string | null;
  weekdayPattern: string;
  estimatedMinutes: number;
  energyLevel: EnergyLevel;
};

export type SegmentEnergySettingInput = {
  segment: DaySegment;
  energyLevel: EnergyLevel;
};

const segmentOrder: DaySegment[] = ["morning", "afternoon", "evening"];
const defaultSegmentEnergy: Record<DaySegment, EnergyLevel> = {
  morning: "high",
  afternoon: "medium",
  evening: "low",
};

export class SettingsServiceError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function normalizedSegmentEnergy(rows: Array<{ segment: DaySegment; energyLevel: EnergyLevel }>) {
  const bySegment = new Map<DaySegment, EnergyLevel>();
  for (const row of rows) bySegment.set(row.segment, row.energyLevel);

  return segmentOrder.map((segment) => ({
    segment,
    energyLevel: bySegment.get(segment) ?? defaultSegmentEnergy[segment],
  }));
}

function routineValues(workspaceId: string, input: RoutineInput) {
  return {
    workspaceId,
    title: input.title,
    defaultTimeSegment: input.defaultTimeSegment,
    defaultStartTime: input.defaultStartTime ?? null,
    defaultEndTime: input.defaultEndTime ?? null,
    weekdayPattern: input.weekdayPattern,
    estimatedMinutes: input.estimatedMinutes,
    energyLevel: input.energyLevel,
  };
}

export async function getSettings(db: DbLike, workspaceId: string) {
  const [routineRows, energyRows] = await Promise.all([
    db.select().from(routines).where(eq(routines.workspaceId, workspaceId)).orderBy(asc(routines.createdAt)),
    db.select().from(segmentEnergySettings).where(eq(segmentEnergySettings.workspaceId, workspaceId)),
  ]);

  return {
    routines: routineRows,
    segmentEnergySettings: normalizedSegmentEnergy(energyRows),
    recoveryTarget: {
      minutes: 480,
      editable: false,
      source: "system_default" as const,
    },
  };
}

export async function upsertRoutine(db: DbLike, workspaceId: string, input: RoutineInput) {
  const now = new Date();
  const values = routineValues(workspaceId, input);

  if (!input.id) {
    const [routine] = await db.insert(routines).values(values).returning();
    return routine;
  }

  const [routine] = await db
    .update(routines)
    .set({ ...values, updatedAt: now })
    .where(and(eq(routines.id, input.id), eq(routines.workspaceId, workspaceId)))
    .returning();

  if (!routine) throw new SettingsServiceError("Routine not found", 404);
  return routine;
}

export async function deleteRoutine(db: DbLike, workspaceId: string, id: string) {
  const [routine] = await db
    .delete(routines)
    .where(and(eq(routines.id, id), eq(routines.workspaceId, workspaceId)))
    .returning();

  if (!routine) throw new SettingsServiceError("Routine not found", 404);
  return { ok: true };
}

export async function upsertSegmentEnergySettings(
  db: DbLike,
  workspaceId: string,
  settings: SegmentEnergySettingInput[],
) {
  const now = new Date();
  await db
    .insert(segmentEnergySettings)
    .values(settings.map((setting) => ({ workspaceId, ...setting, updatedAt: now })))
    .onConflictDoUpdate({
      target: [segmentEnergySettings.workspaceId, segmentEnergySettings.segment],
      set: {
        energyLevel: sql`excluded.energy_level`,
        updatedAt: now,
      },
    });

  return { ok: true };
}

export function rejectRecoveryTargetUpdate() {
  throw new SettingsServiceError("Recovery target is not configurable yet", 400);
}
