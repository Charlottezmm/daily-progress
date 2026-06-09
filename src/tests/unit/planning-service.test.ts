import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  createDailyCheckin,
  proposeAgentPatch,
  updateTaskStatus,
} from "@/lib/planning/service";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
};

type FakeDbOptions = {
  activePlanId?: string | null;
  taskUpdateResult?: Array<Record<string, unknown>>;
  protectedBlockIds?: string[];
};

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: TableWrite[] = [];
  const updates: TableWrite[] = [];
  let inTransaction = false;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function rowsFor(table: unknown) {
    const name = tableName(table);
    if (name === "plans") {
      return options.activePlanId === null ? [] : [{ id: options.activePlanId ?? "plan-1" }];
    }
    if (name === "time_blocks") {
      return (options.protectedBlockIds ?? []).map((id) => ({ id }));
    }
    return [];
  }

  function selectableRows(table: unknown) {
    const rows = rowsFor(table);
    return {
      limit() {
        return Promise.resolve(rows);
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
  }

  function createClient() {
    return {
      select() {
        return {
          from(table: unknown) {
            return {
              where() {
                return selectableRows(table);
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
                    return Promise.resolve(options.taskUpdateResult ?? []);
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
              onConflictDoUpdate(config: { set: Record<string, unknown> }) {
                updates.push({ table: tableName(table), values: config.set });
                return Promise.resolve();
              },
              returning() {
                return Promise.resolve([{ id: `${tableName(table)}-1`, ...values }]);
              },
              then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
                return Promise.resolve().then(resolve, reject);
              },
            };
          },
        };
      },
    };
  }

  const client = createClient();

  return {
    inserts,
    updates,
    transaction: async <T>(callback: (tx: ReturnType<typeof createClient>) => Promise<T>) => {
      inTransaction = true;
      return callback(client);
    },
    wasInTransaction: () => inTransaction,
    ...client,
  };
}

describe("planning service", () => {
  it("updates task status and writes a manual change log", async () => {
    const db = createFakeDb({
      taskUpdateResult: [{ id: "task-1", planId: "plan-1", status: "done" }],
    });

    const task = await updateTaskStatus(db, {
      workspaceId: "workspace-1",
      taskId: "task-1",
      status: "done",
      source: "manual",
    });

    expect(db.wasInTransaction()).toBe(true);
    expect(task).toEqual({ id: "task-1", planId: "plan-1", status: "done" });
    expect(db.updates).toEqual([
      expect.objectContaining({
        table: "tasks",
        values: expect.objectContaining({ status: "done", updatedAt: expect.any(Date) }),
      }),
    ]);
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "change_logs",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          source: "manual",
          detailsJson: expect.objectContaining({ taskId: "task-1", status: "done" }),
        }),
      }),
    ]);
  });

  it("creates a daily check-in using an explicit date", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });
    const date = new Date("2026-06-10T00:00:00.000Z");

    await createDailyCheckin(db, {
      workspaceId: "workspace-1",
      date,
      completedText: "Shipped the narrow refactor.",
      blockerText: "",
      nextText: "Run full verification.",
      source: "manual",
    });

    expect(db.wasInTransaction()).toBe(true);
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "checkins",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            date,
            completedText: "Shipped the narrow refactor.",
            blockerText: "",
            nextText: "Run full verification.",
          }),
        }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            source: "manual",
            detailsJson: expect.objectContaining({ date: date.toISOString() }),
          }),
        }),
      ]),
    );
  });

  it("proposes an agent patch as draft without changing tasks", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });
    const patch = {
      operations: [
        {
          type: "change_priority",
          task_id: "task-1",
          from_priority: "normal",
          to_priority: "high",
          reason: "Deadline moved earlier.",
        },
      ],
    };

    const result = await proposeAgentPatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      patch,
      createdBy: "codex",
    });

    expect(result).toEqual(
      expect.objectContaining({
        patchId: "agent_patches-1",
        workspaceId: "workspace-1",
        planId: "plan-1",
        mode: "today",
        reason: "Rebalance today.",
        patch,
        createdBy: "codex",
        status: "draft",
      }),
    );
    expect(db.updates.filter((write) => write.table === "tasks")).toEqual([]);
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "agent_patches",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          reason: "Rebalance today.",
          patchJson: patch,
          createdBy: "codex",
        }),
      }),
    ]);
  });
});
