import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { inboxItems, routines, tasks } from "@/lib/db/schema";
import { getActivePlanId } from "@/lib/planning/active-plan";
import { createInboxItem } from "@/lib/planning/service";
import { startOfShanghaiDay } from "@/lib/planning/view-data";
import { readJsonBody } from "@/lib/validation/common";

const inboxSchema = z.object({
  title: z.string().trim().min(1).max(240),
});

const inboxActionSchema = z.object({
  id: z.string().uuid(),
  action: z.enum(["task", "routine", "delete"]),
});

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const items = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.processedAt)))
    .orderBy(desc(inboxItems.createdAt));

  return NextResponse.json({ items });
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = inboxSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inbox item" }, { status: 400 });
  }

  const db = getDb();
  const item = await createInboxItem(db, { workspaceId, title: parsed.data.title, source: "manual" });
  return NextResponse.json({ item });
}

export async function PATCH(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = inboxActionSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid inbox action" }, { status: 400 });
  }

  const db = getDb();
  const [item] = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.id, parsed.data.id), eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.processedAt)))
    .limit(1);

  if (!item) return NextResponse.json({ error: "Inbox item not found" }, { status: 404 });

  if (parsed.data.action === "delete") {
    await db.delete(inboxItems).where(and(eq(inboxItems.id, item.id), eq(inboxItems.workspaceId, workspaceId)));
    return NextResponse.json({ ok: true, action: "delete" });
  }

  if (parsed.data.action === "task") {
    const planId = await getActivePlanId(db, workspaceId);
    if (!planId) return NextResponse.json({ error: "No active plan" }, { status: 400 });
    await db.insert(tasks).values({
      workspaceId,
      planId,
      title: item.title,
      date: startOfShanghaiDay(new Date()),
      daySegment: "morning",
      estimatedMinutes: 30,
      energyLevel: "medium",
      priority: "normal",
      status: "todo",
    });
  }

  if (parsed.data.action === "routine") {
    await db.insert(routines).values({
      workspaceId,
      title: item.title,
      defaultTimeSegment: "evening",
      weekdayPattern: "daily",
      estimatedMinutes: 30,
      energyLevel: "low",
    });
  }

  await db
    .update(inboxItems)
    .set({ processedAt: new Date() })
    .where(and(eq(inboxItems.id, item.id), eq(inboxItems.workspaceId, workspaceId)));

  return NextResponse.json({ ok: true, action: parsed.data.action });
}
