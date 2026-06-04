import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { parsePlanMarkdown } from "@/lib/imports/plan-markdown";
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

  return NextResponse.json({ preview: parsePlanMarkdown(parsed.data.markdown) });
}
