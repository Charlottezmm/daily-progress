import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { applyReviewPatch, PatchApplyError } from "@/lib/planning/service";
import { readJsonBody } from "@/lib/validation/common";

const applyPatchBodySchema = z.object({
  patchId: z.string().min(1),
  acceptedOperationIndexes: z.array(z.number().int().nonnegative()).default([]),
  rejectedOperationIndexes: z.array(z.number().int().nonnegative()).default([]),
}).refine((value) => value.acceptedOperationIndexes.length > 0 || value.rejectedOperationIndexes.length > 0);

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = applyPatchBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Select at least one operation to apply" }, { status: 400 });
  }

  try {
    const result = await applyReviewPatch(getDb(), {
      workspaceId,
      patchId: parsed.data.patchId,
      acceptedOperationIndexes: parsed.data.acceptedOperationIndexes,
      rejectedOperationIndexes: parsed.data.rejectedOperationIndexes,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PatchApplyError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "Failed to apply agent patch" }, { status: 500 });
  }
}
