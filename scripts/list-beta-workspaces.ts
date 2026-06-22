import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { betaInviteCodes, workspaceBetaAccess, workspaces } from "@/lib/db/schema";

async function main() {
  const rows = await getDb()
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
    .orderBy(desc(workspaces.createdAt));

  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
