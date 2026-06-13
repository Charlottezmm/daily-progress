import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { getOnboardingState, recordOnboardingEvent } from "@/lib/onboarding/state";
import { readJsonBody } from "@/lib/validation/common";

const patchOnboardingSchema = z
  .object({
    eventKey: z.enum(["schedule_import_skipped", "connector_setup_skipped", "review_opened"]),
  })
  .strict();

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const db = getDb();
  return NextResponse.json(await getOnboardingState(db, workspaceId));
}

export async function PATCH(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = patchOnboardingSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid onboarding event" }, { status: 400 });

  const db = getDb();
  await recordOnboardingEvent(db, workspaceId, parsed.data.eventKey);
  return NextResponse.json(await getOnboardingState(db, workspaceId));
}
