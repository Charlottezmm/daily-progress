import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { clearWorkspaceSession, getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { readJsonBody } from "@/lib/validation/common";

const deleteWorkspaceSchema = z.object({
  confirmation: z.string().trim().regex(/^DELETE .+$/),
});

export async function DELETE(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = deleteWorkspaceSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Type DELETE <workspace name> to confirm deletion" }, { status: 400 });
  }

  const db = getDb();
  const [workspace] = await db.select().from(workspaces).where(eq(workspaces.id, workspaceId)).limit(1);
  if (!workspace) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  if (parsed.data.confirmation !== `DELETE ${workspace.name}`) {
    return NextResponse.json({ error: "Workspace confirmation does not match" }, { status: 400 });
  }

  await db.delete(workspaces).where(eq(workspaces.id, workspaceId));
  await clearWorkspaceSession();
  return NextResponse.json({ deleted: true });
}
