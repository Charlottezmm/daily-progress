import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { createImportPreviewToken } from "@/lib/imports/preview-token";
import { buildTimetableImportPreview, materializeTimetableRows } from "@/lib/imports/timetable-save";
import { findTimetableImportConflicts } from "@/lib/mcp/timetable-import";
import { readJsonBody } from "@/lib/validation/common";

const bodySchema = z.object({
  csv: z.string().min(1).max(200_000),
});

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid timetable CSV payload" }, { status: 400 });
  }

  try {
    const preview = buildTimetableImportPreview(parsed.data.csv);
    let existingConflicts: string[] = [];
    let conflictCheckUnavailable = false;
    try {
      existingConflicts = await findTimetableImportConflicts(getDb(), {
        workspaceId,
        blocks: materializeTimetableRows(preview.rows),
      });
    } catch {
      conflictCheckUnavailable = true;
    }
    return NextResponse.json({
      preview: {
        ...preview,
        warnings: [
          ...preview.warnings,
          ...(conflictCheckUnavailable ? ["Existing timetable conflict check is unavailable."] : []),
        ],
        conflicts: [...preview.conflicts, ...existingConflicts],
      },
      previewToken: createImportPreviewToken({
        kind: "timetable",
        workspaceId,
        content: parsed.data.csv,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid timetable CSV" },
      { status: 400 },
    );
  }
}
