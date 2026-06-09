import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { applyAgentPatch } from "@/lib/planning/patch-apply";

type PatchRow = {
  id: string;
  workspaceId: string;
  planId: string;
  status: "draft" | "applied" | "rejected";
  patchJson: {
    operations: Array<Record<string, unknown>>;
  };
};

function createFakeDb(
  patch: PatchRow,
  latestVersionNumber = 0,
  options: {
    taskUpdateResults?: Array<Array<Record<string, unknown>>>;
    agentPatchUpdateResult?: Array<Record<string, unknown>>;
  } = {},
) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const taskUpdateWhereClauses: unknown[] = [];
  let taskUpdateCount = 0;
  let inTransaction = false;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function objectContainsValue(value: unknown, expected: string, seen = new WeakSet<object>()): boolean {
    if (value === expected) return true;
    if (!value || typeof value !== "object") return false;
    if (seen.has(value)) return false;
    seen.add(value);
    return Object.values(value as Record<string, unknown>).some((child) => objectContainsValue(child, expected, seen));
  }

  const tx = {
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                orderBy() {
                  return this;
                },
                limit() {
                  if (tableName(table) === "plan_versions") {
                    return Promise.resolve(latestVersionNumber ? [{ versionNumber: latestVersionNumber }] : []);
                  }
                  return Promise.resolve([patch]);
                },
              };
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(condition: unknown) {
              updates.push({ table: tableName(table), values });
              if (tableName(table) === "tasks") {
                taskUpdateWhereClauses.push(condition);
              }
              return {
                returning() {
                  if (tableName(table) === "tasks") {
                    const result = options.taskUpdateResults?.[taskUpdateCount];
                    taskUpdateCount += 1;
                    if (result) return Promise.resolve(result);
                  }
                  if (tableName(table) === "agent_patches" && options.agentPatchUpdateResult) {
                    return Promise.resolve(options.agentPatchUpdateResult);
                  }
                  return Promise.resolve([{ id: values.currentVersionId ?? "updated" }]);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table: tableName(table), values });
          return {
            returning() {
              return Promise.resolve([{ id: `${tableName(table)}-1`, versionNumber: values.versionNumber }]);
            },
          };
        },
      };
    },
  };

  return {
    updates,
    inserts,
    taskUpdateWhereClauses,
    transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
      inTransaction = true;
      return callback(tx);
    },
    wasInTransaction: () => inTransaction,
    taskUpdateWhereContains: (expected: string) =>
      taskUpdateWhereClauses.every((condition) => objectContainsValue(condition, expected)),
  };
}

describe("applyAgentPatch", () => {
  it("rejects empty accepted operation lists", async () => {
    const db = createFakeDb({
      id: "patch-1",
      workspaceId: "workspace-1",
      planId: "plan-1",
      status: "draft",
      patchJson: { operations: [] },
    });

    await expect(
      applyAgentPatch(db, {
        workspaceId: "workspace-1",
        patchId: "patch-1",
        acceptedOperationIndexes: [],
      }),
    ).rejects.toThrow("Select at least one operation to apply");
  });

  it("applies selected supported operations and records skipped unsupported operations", async () => {
    const db = createFakeDb({
      id: "patch-1",
      workspaceId: "workspace-1",
      planId: "plan-1",
      status: "draft",
      patchJson: {
        operations: [
          {
            type: "move_task",
            task_id: "task-move",
            from_date: "2026-06-10",
            from_day_segment: "morning",
            to_date: "2026-06-11",
            to_day_segment: "afternoon",
            reason: "Move it out of a full morning.",
          },
          {
            type: "change_priority",
            task_id: "task-priority",
            from_priority: "normal",
            to_priority: "high",
            reason: "Deadline moved earlier.",
          },
          {
            type: "split_task",
            task_id: "task-split",
            new_tasks: [{ title: "Outline", estimated_minutes: 30, day_segment: "morning" }],
            reason: "Too large for one block.",
          },
        ],
      },
    }, 3);

    const result = await applyAgentPatch(db, {
      workspaceId: "workspace-1",
      patchId: "patch-1",
      acceptedOperationIndexes: [0, 1, 2],
    });

    expect(db.wasInTransaction()).toBe(true);
    expect(result.applied.map((operation) => operation.type)).toEqual(["move_task", "change_priority"]);
    expect(result.skipped).toEqual([{ index: 2, type: "split_task", reason: "Unsupported operation for apply v0.1" }]);
    expect(db.updates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "tasks",
          values: expect.objectContaining({
            date: new Date("2026-06-11T00:00:00.000Z"),
            daySegment: "afternoon",
          }),
        }),
        expect.objectContaining({
          table: "tasks",
          values: expect.objectContaining({ priority: "high" }),
        }),
        expect.objectContaining({
          table: "plans",
          values: expect.objectContaining({ currentVersionId: "plan_versions-1" }),
        }),
        expect.objectContaining({
          table: "agent_patches",
          values: expect.objectContaining({ status: "applied", appliedAt: expect.any(Date) }),
        }),
      ]),
    );
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "plan_versions",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            versionNumber: 4,
            source: "agent_patch",
          }),
        }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            source: "agent_patch",
            detailsJson: expect.objectContaining({
              patchId: "patch-1",
              acceptedOperationIndexes: [0, 1, 2],
              skipped: [{ index: 2, type: "split_task", reason: "Unsupported operation for apply v0.1" }],
            }),
          }),
        }),
      ]),
    );
  });

  it("skips missing task updates and keeps skipped details in the apply result", async () => {
    const db = createFakeDb(
      {
        id: "patch-1",
        workspaceId: "workspace-1",
        planId: "plan-1",
        status: "draft",
        patchJson: {
          operations: [
            {
              type: "move_task",
              task_id: "task-missing",
              from_date: "2026-06-10",
              from_day_segment: "morning",
              to_date: "2026-06-11",
              to_day_segment: "afternoon",
              reason: "Move it out of a full morning.",
            },
            {
              type: "change_priority",
              task_id: "task-priority",
              from_priority: "normal",
              to_priority: "high",
              reason: "Deadline moved earlier.",
            },
          ],
        },
      },
      3,
      { taskUpdateResults: [[], [{ id: "task-priority" }]] },
    );

    const result = await applyAgentPatch(db, {
      workspaceId: "workspace-1",
      patchId: "patch-1",
      acceptedOperationIndexes: [0, 1],
    });

    expect(result.applied).toEqual([
      { index: 1, type: "change_priority", taskId: "task-priority", action: "updated task priority" },
    ]);
    expect(result.skipped).toEqual([{ index: 0, type: "move_task", reason: "Task not found" }]);
    expect(db.taskUpdateWhereContains("plan_id")).toBe(true);
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "plan_versions",
          values: expect.objectContaining({
            snapshot: expect.objectContaining({
              applied: result.applied,
              skipped: result.skipped,
            }),
          }),
        }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({
            detailsJson: expect.objectContaining({
              applied: result.applied,
              skipped: result.skipped,
            }),
          }),
        }),
      ]),
    );
  });

  it("rejects selected operations when none can be applied without writing apply records", async () => {
    const db = createFakeDb({
      id: "patch-1",
      workspaceId: "workspace-1",
      planId: "plan-1",
      status: "draft",
      patchJson: {
        operations: [
          {
            type: "move_task",
            task_id: "task-missing",
            from_date: "2026-06-10",
            from_day_segment: "morning",
            to_date: "2026-06-11",
            to_day_segment: "afternoon",
            reason: "Move it out of a full morning.",
          },
        ],
      },
    }, 3, { taskUpdateResults: [[]] });

    await expect(
      applyAgentPatch(db, {
        workspaceId: "workspace-1",
        patchId: "patch-1",
        acceptedOperationIndexes: [0],
      }),
    ).rejects.toMatchObject({ message: "No selected operations could be applied", status: 400 });

    expect(db.inserts.filter((insert) => insert.table === "plan_versions" || insert.table === "change_logs")).toEqual([]);
    expect(db.updates.filter((update) => update.table === "plans" || update.table === "agent_patches")).toEqual([]);
  });

  it("rolls back when marking the draft patch applied does not update a row", async () => {
    const db = createFakeDb(
      {
        id: "patch-1",
        workspaceId: "workspace-1",
        planId: "plan-1",
        status: "draft",
        patchJson: {
          operations: [
            {
              type: "change_priority",
              task_id: "task-priority",
              from_priority: "normal",
              to_priority: "high",
              reason: "Deadline moved earlier.",
            },
          ],
        },
      },
      3,
      { agentPatchUpdateResult: [] },
    );

    await expect(
      applyAgentPatch(db, {
        workspaceId: "workspace-1",
        patchId: "patch-1",
        acceptedOperationIndexes: [0],
      }),
    ).rejects.toMatchObject({ message: "Draft patch not found", status: 404 });
  });

  it("rejects impossible calendar dates when no selected operations can be applied", async () => {
    const db = createFakeDb({
      id: "patch-1",
      workspaceId: "workspace-1",
      planId: "plan-1",
      status: "draft",
      patchJson: {
        operations: [
          {
            type: "move_task",
            task_id: "task-move",
            from_date: "2026-02-28",
            from_day_segment: "morning",
            to_date: "2026-02-31",
            to_day_segment: "afternoon",
            reason: "Move it out of a full morning.",
          },
        ],
      },
    }, 3);

    await expect(
      applyAgentPatch(db, {
        workspaceId: "workspace-1",
        patchId: "patch-1",
        acceptedOperationIndexes: [0],
      }),
    ).rejects.toMatchObject({ message: "No selected operations could be applied", status: 400 });

    expect(db.inserts.filter((insert) => insert.table === "plan_versions" || insert.table === "change_logs")).toEqual([]);
    expect(db.updates.filter((update) => update.table === "plans" || update.table === "agent_patches")).toEqual([]);
  });
});
