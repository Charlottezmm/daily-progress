import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ImportSaveError, savePlanImport } from "@/lib/imports/plan-save";
import { readJsonBody } from "@/lib/validation/common";

const bodySchema = z.object({
  markdown: z.string().min(1).max(200_000),
});

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid plan markdown payload" }, { status: 400 });
  }

  try {
    const result = await savePlanImport(getDb(), { workspaceId, markdown: parsed.data.markdown });
    return NextResponse.json({
      result,
      message: "Saved plan.md preview. Projects were created or reused; tasks and milestones were not generated.",
    });
  } catch (error) {
    if (error instanceof ImportSaveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
