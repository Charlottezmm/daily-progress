import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { ImportSaveError } from "@/lib/imports/plan-save";
import { verifyImportPreviewToken } from "@/lib/imports/preview-token";
import { saveTimetableImport } from "@/lib/imports/timetable-save";
import { readJsonBody } from "@/lib/validation/common";

const bodySchema = z.object({
  csv: z.string().min(1).max(200_000),
  confirmation: z.string().optional(),
  previewToken: z.string().optional(),
});

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timetable CSV payload" }, { status: 400 });
  }
  if (parsed.data.confirmation !== "CONFIRM_TIMETABLE_IMPORT") {
    return NextResponse.json({ error: "Timetable import confirmation required" }, { status: 400 });
  }
  const tokenResult = verifyImportPreviewToken({
    token: parsed.data.previewToken,
    kind: "timetable",
    workspaceId,
    content: parsed.data.csv,
  });
  if (!tokenResult.ok) {
    return NextResponse.json({ error: tokenResult.reason }, { status: 400 });
  }

  try {
    const result = await saveTimetableImport(getDb(), {
      workspaceId,
      csv: parsed.data.csv,
      confirmation: parsed.data.confirmation,
    });
    return NextResponse.json({
      result,
      message: "Saved timetable.csv preview. This adds new time blocks; duplicate imports are not deduplicated.",
    });
  } catch (error) {
    if (error instanceof ImportSaveError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
