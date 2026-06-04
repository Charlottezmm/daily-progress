import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setWorkspaceSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { readJsonBody } from "@/lib/validation/common";

const loginSchema = z.object({
  workspaceName: z.string().trim().min(1),
  password: z.string().min(8),
});

export async function POST(request: Request) {
  const parsed = loginSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid login payload" }, { status: 400 });
  }

  const db = getDb();
  const [workspace] = await db
    .select()
    .from(workspaces)
    .where(eq(workspaces.name, parsed.data.workspaceName))
    .limit(1);

  if (!workspace) {
    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const [created] = await db
      .insert(workspaces)
      .values({ name: parsed.data.workspaceName, passwordHash })
      .returning();
    await setWorkspaceSession(created.id);
    return NextResponse.json({ workspaceId: created.id, created: true });
  }

  const ok = await bcrypt.compare(parsed.data.password, workspace.passwordHash);
  if (!ok) {
    return NextResponse.json({ error: "Invalid workspace password" }, { status: 401 });
  }

  await setWorkspaceSession(workspace.id);
  return NextResponse.json({ workspaceId: workspace.id, created: false });
}
