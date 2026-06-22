import { getDb } from "@/lib/db/client";
import { betaInviteCodes } from "@/lib/db/schema";
import { buildInviteCodeInsert } from "@/lib/beta/invites";
import { inviteUrlForCode, randomInviteCode } from "@/lib/beta/invite-links";

type Options = {
  code?: string;
  label: string;
  maxRedemptions: number | null;
  expiresInDays: number | null;
};

function readOptions(argv: string[]): Options {
  const options: Options = {
    label: "v1 formal invite",
    maxRedemptions: 1,
    expiresInDays: 30,
  };

  for (const arg of argv) {
    const [key, value] = arg.split("=", 2);
    if (key === "--code") options.code = value;
    if (key === "--label" && value) options.label = value;
    if (key === "--max-redemptions") {
      options.maxRedemptions = value === "null" ? null : Number.parseInt(value, 10);
    }
    if (key === "--expires-in-days") {
      options.expiresInDays = value === "null" ? null : Number.parseInt(value, 10);
    }
  }

  if (!Number.isInteger(options.maxRedemptions) && options.maxRedemptions !== null) {
    throw new Error("--max-redemptions must be an integer or null");
  }
  if (options.maxRedemptions !== null && options.maxRedemptions < 1) {
    throw new Error("--max-redemptions must be >= 1");
  }
  if (!Number.isInteger(options.expiresInDays) && options.expiresInDays !== null) {
    throw new Error("--expires-in-days must be an integer or null");
  }
  if (options.expiresInDays !== null && options.expiresInDays < 1) {
    throw new Error("--expires-in-days must be >= 1");
  }
  if (options.label.trim().length === 0 || options.label.length > 120) {
    throw new Error("--label must be 1-120 characters");
  }

  return options;
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  const code = options.code ?? randomInviteCode();
  const expiresAt =
    options.expiresInDays === null ? null : new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000);
  const [invite] = await getDb()
    .insert(betaInviteCodes)
    .values(buildInviteCodeInsert({
      code,
      label: options.label,
      maxRedemptions: options.maxRedemptions,
      expiresAt,
    }))
    .returning();

  const inviteUrl = inviteUrlForCode(code);

  console.log("Created PawPlan v1 formal invite link. Raw token is shown once; store it before closing this terminal.");
  console.log(JSON.stringify({
    id: invite.id,
    label: invite.label,
    code,
    inviteUrl,
    maxRedemptions: invite.maxRedemptions,
    expiresAt: invite.expiresAt ? invite.expiresAt.toISOString() : null,
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
