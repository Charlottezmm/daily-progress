import { and, eq, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { agentPatches, plans, timeBlocks } from "@/lib/db/schema";
import { validatePatchAgainstProtectedBlocks } from "@/lib/patches/patch-schema";
import { readJsonBody } from "@/lib/validation/common";

const proposalBodySchema = z.object({
  mode: z.enum(["today", "week"]),
  reason: z.string().min(1),
  patch: z.unknown(),
  createdBy: z.enum(["claude", "codex", "user"]).default("claude"),
});

function startOfToday() {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

async function getActivePlanId(workspaceId: string) {
  const db = getDb();
  const [plan] = await db
    .select({ id: plans.id })
    .from(plans)
    .where(and(eq(plans.workspaceId, workspaceId), eq(plans.status, "active")))
    .limit(1);
  return plan?.id ?? null;
}

async function getProtectedBlockIds(workspaceId: string) {
  const db = getDb();
  const rows = await db
    .select({ id: timeBlocks.id })
    .from(timeBlocks)
    .where(
      and(
        eq(timeBlocks.workspaceId, workspaceId),
        or(eq(timeBlocks.kind, "routine"), eq(timeBlocks.kind, "recovery")),
      ),
    );
  return rows.map((row) => row.id);
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsed = proposalBodySchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid agent patch proposal" }, { status: 400 });
  }

  const planId = await getActivePlanId(workspaceId);
  if (!planId) {
    return NextResponse.json({ error: "No active plan" }, { status: 400 });
  }

  const protectedBlockIds = await getProtectedBlockIds(workspaceId);
  let patch;
  try {
    patch = validatePatchAgainstProtectedBlocks(parsed.data.patch, protectedBlockIds);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Invalid agent patch" },
      { status: 400 },
    );
  }

  const scopeStart = startOfToday();
  const scopeEnd = parsed.data.mode === "today" ? addDays(scopeStart, 1) : addDays(scopeStart, 7);
  const db = getDb();
  const [agentPatch] = await db
    .insert(agentPatches)
    .values({
      workspaceId,
      planId,
      scopeStart,
      scopeEnd,
      reason: parsed.data.reason,
      patchJson: patch,
      createdBy: parsed.data.createdBy,
    })
    .returning();

  return NextResponse.json({
    patchId: agentPatch.id,
    workspaceId,
    planId,
    mode: parsed.data.mode,
    reason: parsed.data.reason,
    patch,
    createdBy: parsed.data.createdBy,
    status: "draft",
  });
}
