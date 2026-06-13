import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { PlanningServiceError, proposeAgentPatch } from "@/lib/planning/service";
import { readJsonBody } from "@/lib/validation/common";

const proposalBodySchema = z.object({
  mode: z.enum(["today", "week"]),
  reason: z.string().min(1),
  patch: z.unknown(),
  createdBy: z.enum(["claude", "codex", "user"]).default("claude"),
});

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = proposalBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agent patch proposal" }, { status: 400 });
  }

  try {
    const result = await proposeAgentPatch(getDb(), {
      workspaceId,
      mode: parsed.data.mode,
      reason: parsed.data.reason,
      patch: parsed.data.patch,
      createdBy: parsed.data.createdBy,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof PlanningServiceError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid agent patch" },
      { status: 400 },
    );
  }
}
