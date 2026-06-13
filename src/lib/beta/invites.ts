import { createHash } from "node:crypto";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import type { getDb } from "@/lib/db/client";
import { betaInviteCodes } from "@/lib/db/schema";

type InviteDb = Pick<ReturnType<typeof getDb>, "select" | "update">;

type InviteFailureReason = "invalid" | "expired" | "disabled" | "exhausted";

type InviteValidationResult =
  | { ok: true; inviteCodeId: string }
  | { ok: false; reason: InviteFailureReason };

function normalizeInviteCode(code: string) {
  return code.trim().toUpperCase();
}

export function hashInviteCode(code: string) {
  return createHash("sha256").update(normalizeInviteCode(code)).digest("hex");
}

export async function validateAndRedeemInviteCode(
  db: InviteDb,
  code: string,
  now = new Date(),
): Promise<InviteValidationResult> {
  const [invite] = await db
    .select()
    .from(betaInviteCodes)
    .where(eq(betaInviteCodes.codeHash, hashInviteCode(code)))
    .limit(1);

  if (!invite) return { ok: false, reason: "invalid" };
  if (invite.disabledAt) return { ok: false, reason: "disabled" };
  if (invite.expiresAt && invite.expiresAt <= now) return { ok: false, reason: "expired" };
  if (invite.maxRedemptions !== null && invite.redemptionCount >= invite.maxRedemptions) {
    return { ok: false, reason: "exhausted" };
  }

  const [redeemed] = await db
    .update(betaInviteCodes)
    .set({ redemptionCount: sql`${betaInviteCodes.redemptionCount} + 1` })
    .where(and(
      eq(betaInviteCodes.id, invite.id),
      isNull(betaInviteCodes.disabledAt),
      or(isNull(betaInviteCodes.expiresAt), sql`${betaInviteCodes.expiresAt} > ${now}`),
      or(isNull(betaInviteCodes.maxRedemptions), sql`${betaInviteCodes.redemptionCount} < ${betaInviteCodes.maxRedemptions}`),
    ))
    .returning();

  if (!redeemed) return { ok: false, reason: "exhausted" };
  return { ok: true, inviteCodeId: redeemed.id };
}
