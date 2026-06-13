import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { buildPlanImportPreview } from "@/lib/imports/plan-markdown";
import { createImportPreviewToken } from "@/lib/imports/preview-token";
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
    return NextResponse.json({
      preview: buildPlanImportPreview(parsed.data.markdown),
      previewToken: createImportPreviewToken({
        kind: "plan",
        workspaceId,
        content: parsed.data.markdown,
      }),
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid plan markdown" },
      { status: 400 },
    );
  }
}
