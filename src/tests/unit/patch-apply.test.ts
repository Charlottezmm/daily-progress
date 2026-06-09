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

function createFakeDb(patch: PatchRow, latestVersionNumber = 0) {
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  let inTransaction = false;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
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
            where() {
              updates.push({ table: tableName(table), values });
              return {
                returning() {
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
    transaction: async <T>(callback: (transaction: typeof tx) => Promise<T>) => {
      inTransaction = true;
      return callback(tx);
    },
    wasInTransaction: () => inTransaction,
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
});
