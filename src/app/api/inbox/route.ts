import { and, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { inboxItems } from "@/lib/db/schema";
import { readJsonBody } from "@/lib/validation/common";

const inboxSchema = z.object({
  title: z.string().trim().min(1).max(240),
});

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const items = await db
    .select()
    .from(inboxItems)
    .where(and(eq(inboxItems.workspaceId, workspaceId), isNull(inboxItems.processedAt)));

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
  const [item] = await db.insert(inboxItems).values({ workspaceId, title: parsed.data.title }).returning();
  return NextResponse.json({ item });
}
