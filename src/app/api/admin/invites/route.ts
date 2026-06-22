import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { buildInviteCodeInsert } from "@/lib/beta/invites";
import { appBaseUrl, inviteUrlForCode, randomInviteCode } from "@/lib/beta/invite-links";
import { getDb } from "@/lib/db/client";
import { betaInviteCodes, workspaceBetaAccess, workspaces } from "@/lib/db/schema";
import { isAdminWorkspaceId } from "@/lib/admin/owner";
import { readJsonBody } from "@/lib/validation/common";

const createInviteSchema = z.object({
  label: z.string().trim().min(1).max(120),
  maxRedemptions: z.number().int().min(1).max(100).default(1),
  expiresInDays: z.number().int().min(1).max(365).nullable().default(30),
}).strict();

const patchInviteSchema = z.object({
  action: z.literal("disable"),
  id: z.string().min(1),
}).strict();

async function requireAdminWorkspace() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return { ok: false as const, response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  if (!isAdminWorkspaceId(workspaceId)) {
    return { ok: false as const, response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const, workspaceId };
}

function serializeInvite(row: typeof betaInviteCodes.$inferSelect) {
  return {
    id: row.id,
    label: row.label,
    maxRedemptions: row.maxRedemptions,
    redemptionCount: row.redemptionCount,
    expiresAt: row.expiresAt,
    disabledAt: row.disabledAt,
    createdAt: row.createdAt,
  };
}

export async function GET() {
  const admin = await requireAdminWorkspace();
  if (!admin.ok) return admin.response;

  const db = getDb();
  const [invites, workspaceRows] = await Promise.all([
    db.select().from(betaInviteCodes).orderBy(desc(betaInviteCodes.createdAt)),
    db
      .select({
        workspaceId: workspaces.id,
        workspaceName: workspaces.name,
        workspaceCreatedAt: workspaces.createdAt,
        inviteLabel: betaInviteCodes.label,
        inviteMaxRedemptions: betaInviteCodes.maxRedemptions,
        inviteRedemptionCount: betaInviteCodes.redemptionCount,
        inviteExpiresAt: betaInviteCodes.expiresAt,
        inviteDisabledAt: betaInviteCodes.disabledAt,
      })
      .from(workspaces)
      .leftJoin(workspaceBetaAccess, eq(workspaceBetaAccess.workspaceId, workspaces.id))
      .leftJoin(betaInviteCodes, eq(betaInviteCodes.id, workspaceBetaAccess.inviteCodeId))
      .orderBy(desc(workspaces.createdAt)),
  ]);

  return NextResponse.json({
    inviteUrlBase: `${appBaseUrl()}/join`,
    invites: invites.map(serializeInvite),
    workspaces: workspaceRows,
  });
}

export async function POST(request: Request) {
  const admin = await requireAdminWorkspace();
  if (!admin.ok) return admin.response;

  const parsed = createInviteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invite request" }, { status: 400 });

  const code = randomInviteCode();
  const expiresAt =
    parsed.data.expiresInDays === null ? null : new Date(Date.now() + parsed.data.expiresInDays * 24 * 60 * 60 * 1000);
  const [invite] = await getDb()
    .insert(betaInviteCodes)
    .values(buildInviteCodeInsert({
      code,
      label: parsed.data.label,
      maxRedemptions: parsed.data.maxRedemptions,
      expiresAt,
    }))
    .returning();

  return NextResponse.json({
    invite: {
      ...serializeInvite(invite),
      inviteUrl: inviteUrlForCode(code),
    },
  }, { status: 201 });
}

export async function PATCH(request: Request) {
  const admin = await requireAdminWorkspace();
  if (!admin.ok) return admin.response;

  const parsed = patchInviteSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid invite action" }, { status: 400 });

  const [invite] = await getDb()
    .update(betaInviteCodes)
    .set({ disabledAt: new Date() })
    .where(eq(betaInviteCodes.id, parsed.data.id))
    .returning();
  if (!invite) return NextResponse.json({ error: "Invite not found" }, { status: 404 });

  return NextResponse.json({ invite: serializeInvite(invite) });
}
