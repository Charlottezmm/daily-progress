import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";
import { updateTaskStatus } from "@/lib/planning/service";
import { readJsonBody } from "@/lib/validation/common";

const taskStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["todo", "done", "skipped", "backlog"]),
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

  const parsed = taskStatusSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid task status" }, { status: 400 });

  const db = getDb();
  const task = await updateTaskStatus(db, {
    workspaceId,
    taskId: parsed.data.id,
    status: parsed.data.status,
    source: "manual",
  });
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 });
  return NextResponse.json({ task });
}
