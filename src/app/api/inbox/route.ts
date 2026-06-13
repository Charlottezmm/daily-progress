import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { inboxItems } from "@/lib/db/schema";
import { createInboxItem, PlanningServiceError, processInboxItem } from "@/lib/planning/service";
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
  try {
    const result = await processInboxItem(db, {
      workspaceId,
      inboxItemId: parsed.data.id,
      action: parsed.data.action,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlanningServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to process inbox item" }, { status: 500 });
  }
}
