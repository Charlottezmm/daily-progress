import { NextResponse } from "next/server";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { exportWorkspaceTemplate, TemplateExportError } from "@/lib/templates/export";

function templateError(error: unknown) {
  if (error instanceof TemplateExportError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "Failed to export template" }, { status: 500 });
}

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await exportWorkspaceTemplate(getDb(), workspaceId));
  } catch (error) {
    return templateError(error);
  }
}
