import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  deleteRoutine,
  getSettings,
  rejectRecoveryTargetUpdate,
  SettingsServiceError,
  upsertRoutine,
  upsertSegmentEnergySettings,
} from "@/lib/settings/settings-service";
import { readJsonBody } from "@/lib/validation/common";

const energyLevelSchema = z.enum(["low", "medium", "high"]);
const segmentSchema = z.enum(["morning", "afternoon", "evening"]);
const timeSegmentSchema = z.enum(["morning", "afternoon", "evening", "specific_window"]);
const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

const routineSchema = z.object({
  id: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(180),
  defaultTimeSegment: timeSegmentSchema,
  defaultStartTime: timeSchema.nullish(),
  defaultEndTime: timeSchema.nullish(),
  weekdayPattern: z.string().trim().min(1).max(80),
  estimatedMinutes: z.number().int().min(1).max(1440),
  energyLevel: energyLevelSchema,
});

const energySettingsSchema = z
  .array(z.object({ segment: segmentSchema, energyLevel: energyLevelSchema }))
  .length(3)
  .superRefine((settings, context) => {
    const segments = new Set(settings.map((setting) => setting.segment));
    for (const segment of segmentSchema.options) {
      if (!segments.has(segment)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing ${segment} energy setting`,
        });
      }
    }
  });

const settingsActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("upsert_routine"), routine: routineSchema }),
  z.object({ action: z.literal("delete_routine"), id: z.string().uuid() }),
  z.object({ action: z.literal("save_energy"), settings: energySettingsSchema }),
  z.object({ action: z.literal("set_recovery_target"), minutes: z.number().int().min(0) }),
]);

function serviceError(error: unknown) {
  if (error instanceof SettingsServiceError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Failed to update settings" }, { status: 500 });
}

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  return NextResponse.json(await getSettings(db, workspaceId));
}

export async function PATCH(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await readJsonBody(request);
  if (body && typeof body === "object" && "recoveryTargetMinutes" in body) {
    return NextResponse.json({ error: "Recovery target is not configurable yet" }, { status: 400 });
  }

  const parsed = settingsActionSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "Invalid settings action" }, { status: 400 });

  if (parsed.data.action === "set_recovery_target") {
    try {
      rejectRecoveryTargetUpdate();
    } catch (error) {
      return serviceError(error);
    }
  }

  const db = getDb();
  try {
    if (parsed.data.action === "upsert_routine") {
      const routine = await upsertRoutine(db, workspaceId, parsed.data.routine);
      return NextResponse.json({ routine });
    }
    if (parsed.data.action === "delete_routine") {
      return NextResponse.json(await deleteRoutine(db, workspaceId, parsed.data.id));
    }
    if (parsed.data.action === "save_energy") {
      return NextResponse.json(await upsertSegmentEnergySettings(db, workspaceId, parsed.data.settings));
    }
  } catch (error) {
    return serviceError(error);
  }
}
