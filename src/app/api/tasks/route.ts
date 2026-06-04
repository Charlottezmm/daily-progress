import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { tasks } from "@/lib/db/schema";

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  const items = await db.select().from(tasks).where(eq(tasks.workspaceId, workspaceId));
  return NextResponse.json({ tasks: items });
}
