import { and, desc, eq } from "drizzle-orm";
import { agentPatches, changeLogs, plans, planVersions, tasks } from "@/lib/db/schema";
import { agentPatchSchema, type AgentPatch } from "@/lib/patches/patch-schema";

type PatchApplyDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
};

type ApplyAgentPatchInput = {
  workspaceId: string;
  patchId: string;
  acceptedOperationIndexes: number[];
};

type AppliedOperation = {
  index: number;
  type: AgentPatch["operations"][number]["type"];
  taskId?: string;
  action: string;
};

type SkippedOperation = {
  index: number;
  type: string;
  reason: string;
};

export type ApplyAgentPatchResult = {
  patchId: string;
  planId: string;
  applied: AppliedOperation[];
  skipped: SkippedOperation[];
};

export class PatchApplyError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

function uniqueAcceptedIndexes(indexes: number[]) {
  const normalized = [...new Set(indexes)];
  if (normalized.length === 0) {
    throw new PatchApplyError("Select at least one operation to apply", 400);
  }
  if (normalized.some((index) => !Number.isInteger(index) || index < 0)) {
    throw new PatchApplyError("Invalid accepted operation indexes", 400);
  }
  return normalized;
}

function dateFromDateKey(dateKey: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return null;
  return new Date(`${dateKey}T00:00:00.000Z`);
}

async function applyOperation(tx: any, workspaceId: string, index: number, operation: AgentPatch["operations"][number]) {
  const now = new Date();

  if (operation.type === "move_task") {
    const targetDate = dateFromDateKey(operation.to_date);
    if (!targetDate) {
      return { skipped: { index, type: operation.type, reason: "Invalid target date" } };
    }

    await tx
      .update(tasks)
      .set({ date: targetDate, daySegment: operation.to_day_segment, updatedAt: now })
      .where(and(eq(tasks.id, operation.task_id), eq(tasks.workspaceId, workspaceId)))
      .returning();
    return { applied: { index, type: operation.type, taskId: operation.task_id, action: "updated task date and segment" } };
  }

  if (operation.type === "defer_task") {
    const targetDate = dateFromDateKey(operation.target_week_or_date);
    const values = targetDate ? { date: targetDate, updatedAt: now } : { status: "backlog" as const, updatedAt: now };

    await tx
      .update(tasks)
      .set(values)
      .where(and(eq(tasks.id, operation.task_id), eq(tasks.workspaceId, workspaceId)))
      .returning();
    return {
      applied: {
        index,
        type: operation.type,
        taskId: operation.task_id,
        action: targetDate ? "updated task date" : "moved task to backlog",
      },
    };
  }

  if (operation.type === "move_to_backlog") {
    await tx
      .update(tasks)
      .set({ status: "backlog", updatedAt: now })
      .where(and(eq(tasks.id, operation.task_id), eq(tasks.workspaceId, workspaceId)))
      .returning();
    return { applied: { index, type: operation.type, taskId: operation.task_id, action: "moved task to backlog" } };
  }

  if (operation.type === "change_priority") {
    await tx
      .update(tasks)
      .set({ priority: operation.to_priority, updatedAt: now })
      .where(and(eq(tasks.id, operation.task_id), eq(tasks.workspaceId, workspaceId)))
      .returning();
    return { applied: { index, type: operation.type, taskId: operation.task_id, action: "updated task priority" } };
  }

  return { skipped: { index, type: operation.type, reason: "Unsupported operation for apply v0.1" } };
}

export async function applyAgentPatch(db: PatchApplyDb, input: ApplyAgentPatchInput): Promise<ApplyAgentPatchResult> {
  const acceptedOperationIndexes = uniqueAcceptedIndexes(input.acceptedOperationIndexes);

  return db.transaction(async (tx) => {
    const [patchRow] = await tx
      .select()
      .from(agentPatches)
      .where(
        and(
          eq(agentPatches.id, input.patchId),
          eq(agentPatches.workspaceId, input.workspaceId),
          eq(agentPatches.status, "draft"),
        ),
      )
      .limit(1);

    if (!patchRow) {
      throw new PatchApplyError("Draft patch not found", 404);
    }

    const patch = agentPatchSchema.parse(patchRow.patchJson);
    const applied: AppliedOperation[] = [];
    const skipped: SkippedOperation[] = [];

    for (const index of acceptedOperationIndexes) {
      const operation = patch.operations[index];
      if (!operation) {
        skipped.push({ index, type: "unknown", reason: "Operation index not found" });
        continue;
      }

      const result = await applyOperation(tx, input.workspaceId, index, operation);
      if (result.applied) applied.push(result.applied);
      if (result.skipped) skipped.push(result.skipped);
    }

    const snapshot = {
      kind: "agent_patch_apply_v0.1",
      patchId: input.patchId,
      acceptedOperationIndexes,
      applied,
      skipped,
      appliedAt: new Date().toISOString(),
    };

    const [latestVersion] = await tx
      .select({ versionNumber: planVersions.versionNumber })
      .from(planVersions)
      .where(and(eq(planVersions.workspaceId, input.workspaceId), eq(planVersions.planId, patchRow.planId)))
      .orderBy(desc(planVersions.versionNumber))
      .limit(1);

    const [version] = await tx
      .insert(planVersions)
      .values({
        workspaceId: input.workspaceId,
        planId: patchRow.planId,
        versionNumber: (latestVersion?.versionNumber ?? 0) + 1,
        snapshot,
        source: "agent_patch",
      })
      .returning();

    await tx
      .update(plans)
      .set({ currentVersionId: version.id, updatedAt: new Date() })
      .where(and(eq(plans.id, patchRow.planId), eq(plans.workspaceId, input.workspaceId)))
      .returning();

    await tx.insert(changeLogs).values({
      workspaceId: input.workspaceId,
      planId: patchRow.planId,
      source: "agent_patch",
      summary: `Applied ${applied.length} agent patch operation${applied.length === 1 ? "" : "s"}`,
      detailsJson: {
        patchId: input.patchId,
        acceptedOperationIndexes,
        applied,
        skipped,
      },
    });

    await tx
      .update(agentPatches)
      .set({ status: "applied", appliedAt: new Date() })
      .where(
        and(
          eq(agentPatches.id, input.patchId),
          eq(agentPatches.workspaceId, input.workspaceId),
          eq(agentPatches.status, "draft"),
        ),
      )
      .returning();

    return { patchId: input.patchId, planId: patchRow.planId, applied, skipped };
  });
}
