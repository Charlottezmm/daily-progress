import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { PlanningServiceError, updateTaskSchedule, updateTaskStatus } from "@/lib/planning/service";
import { readJsonBody } from "@/lib/validation/common";

const taskUpdateSchema = z
  .object({
    id: z.string().uuid(),
    status: z.enum(["todo", "done", "skipped", "backlog"]).optional(),
    blocked: z.boolean().optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    daySegment: z.enum(["morning", "afternoon", "evening"]).optional(),
  })
  .refine((value) => value.status || value.blocked !== undefined || value.date || value.daySegment, {
    message: "At least one task update field is required",
  });

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const items = await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId));
  return NextResponse.json({ tasks: items });
}

export async function PATCH(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = taskUpdateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task update" }, { status: 400 });

  const db = getDb();
  try {
    const hasScheduleUpdate = parsed.data.date !== undefined || parsed.data.daySegment !== undefined;
    const task = hasScheduleUpdate
      ? await updateTaskSchedule(db, {
          workspaceId,
          taskId: parsed.data.id,
          status: parsed.data.status,
          blocked: parsed.data.blocked,
          date: parsed.data.date,
          daySegment: parsed.data.daySegment,
          source: "manual",
        })
      : await updateTaskStatus(db, {
          workspaceId,
          taskId: parsed.data.id,
          status: parsed.data.status,
          blocked: parsed.data.blocked,
          source: "manual",
        });

    if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
    return NextResponse.json({ task });
  } catch (error) {
    if (error instanceof PlanningServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
