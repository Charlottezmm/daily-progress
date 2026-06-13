import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { setWorkspaceSession } from "@/lib/auth/session";
import { validateAndRedeemInviteCode } from "@/lib/beta/invites";
import { getDb } from "@/lib/db/client";
import { changeLogs, plans, planVersions, workspaceBetaAccess, workspaces } from "@/lib/db/schema";
import { readJsonBody } from "@/lib/validation/common";
import { buildDefaultPlanValues } from "@/lib/workspaces/default-plan";

const betaWorkspaceSchema = z.object({
  workspaceName: z.string().trim().min(1).max(120),
  password: z.string().min(8).max(128),
  inviteCode: z.string().trim().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/),
});

const inviteErrors = {
  invalid: "Invite code invalid",
  expired: "Invite code expired",
  disabled: "Invite code disabled",
  exhausted: "Invite code exhausted",
} as const;

function isWorkspaceNameUniqueViolation(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; constraint?: unknown; message?: unknown };
  if (candidate.code !== "23505") return false;
  return candidate.constraint === "workspaces_name_unique"
    || (typeof candidate.message === "string" && candidate.message.includes("workspaces_name_unique"));
}

function suffixedWorkspaceName(name: string) {
  return `${name} 2`;
}

export async function POST(request: Request) {
  const parsed = betaWorkspaceSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid beta workspace payload" }, { status: 400 });
  }

  const db = getDb();
  try {
    const result = await db.transaction(async (tx) => {
      const [existingWorkspace] = await tx
        .select({ id: workspaces.id })
        .from(workspaces)
        .where(eq(workspaces.name, parsed.data.workspaceName))
        .limit(1);
      const workspaceName = existingWorkspace ? suffixedWorkspaceName(parsed.data.workspaceName) : parsed.data.workspaceName;

      const invite = await validateAndRedeemInviteCode(tx, parsed.data.inviteCode);
      if (!invite.ok) {
        return { ok: false as const, status: 403, error: inviteErrors[invite.reason] };
      }

      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const [created] = await tx
        .insert(workspaces)
        .values({ name: workspaceName, passwordHash })
        .returning();
      const defaults = buildDefaultPlanValues(created.id);
      const [plan] = await tx.insert(plans).values(defaults.plan).returning();
      const [version] = await tx
        .insert(planVersions)
        .values({ ...defaults.version, planId: plan.id })
        .returning();
      await tx.update(plans).set({ currentVersionId: version.id }).where(eq(plans.id, plan.id));
      await tx.insert(changeLogs).values({ ...defaults.changeLog, planId: plan.id });
      await tx.insert(workspaceBetaAccess).values({ workspaceId: created.id, inviteCodeId: invite.inviteCodeId });
      return { ok: true as const, workspaceId: created.id, planId: plan.id, workspaceName };
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }

    await setWorkspaceSession(result.workspaceId);
    return NextResponse.json({ workspaceId: result.workspaceId, planId: result.planId, created: true }, { status: 201 });
  } catch (error) {
    if (isWorkspaceNameUniqueViolation(error)) {
      return NextResponse.json({ error: "Workspace name is unavailable; try again" }, { status: 400 });
    }
    throw error;
  }
}
