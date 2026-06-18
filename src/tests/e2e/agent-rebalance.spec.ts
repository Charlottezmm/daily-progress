import { expect, test } from "@playwright/test";
import { getTableName } from "drizzle-orm";
import { allowedPawPlanToolNames, runPawPlanTool } from "@/lib/mcp/tools";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
};

function createFakeDb(options: {
  activePlanId?: string | null;
  taskRows?: Array<Record<string, unknown>>;
  agentRunRows?: Array<Record<string, unknown>>;
} = {}) {
  const inserts: TableWrite[] = [];
  const updates: TableWrite[] = [];
  const tableCounts = new Map<string, number>();

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function nextId(table: string) {
    const count = (tableCounts.get(table) ?? 0) + 1;
    tableCounts.set(table, count);
    return `${table}-${count}`;
  }

  function rowsFor(table: unknown) {
    const name = tableName(table);
    if (name === "plans") return options.activePlanId === null ? [] : [{ id: options.activePlanId ?? "plan-1" }];
    if (name === "tasks") return options.taskRows ?? [];
    if (name === "time_blocks") return [];
    if (name === "agent_runs") return options.agentRunRows ?? [];
    return [];
  }

  function selectableRows(table: unknown) {
    const rows = rowsFor(table);
    return {
      orderBy() {
        return selectableRows(table);
      },
      limit(count: number) {
        return Promise.resolve(rows.slice(0, count));
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
  }

  return {
    inserts,
    updates,
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
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          const name = tableName(table);
          inserts.push({ table: name, values });
          return {
            returning() {
              return Promise.resolve([{ id: nextId(name), ...values }]);
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
                  return Promise.resolve([{ id: "agent_runs-1", ...values }]);
                },
              };
            },
          };
        },
      };
    },
    delete() {
      throw new Error("rebalance e2e must not delete rows");
    },
    transaction<T>() {
      throw new Error("rebalance e2e must not apply patches in a transaction");
    },
  };
}

test("rebalance tools are write-only and create idempotent Review drafts", async () => {
  expect(allowedPawPlanToolNames("read_write")).toContain("propose_daily_rebalance");
  expect(allowedPawPlanToolNames("read_write")).toContain("propose_week_rebalance");
  expect(allowedPawPlanToolNames("read_only")).not.toContain("propose_daily_rebalance");
  expect(allowedPawPlanToolNames("read_only")).not.toContain("propose_week_rebalance");

  const db = createFakeDb({
    taskRows: [
      {
        id: "task-1",
        date: new Date("2026-06-17T01:00:00.000Z"),
        daySegment: "morning",
        status: "todo",
        movable: true,
      },
    ],
  });

  const result = await runPawPlanTool(db, "workspace-1", "propose_daily_rebalance", {
    idempotency_key: "e2e-rebalance-1",
    reason: "Move overloaded morning task.",
    moves: [
      {
        task_id: "task-1",
        to_date: "2026-06-18",
        to_day_segment: "evening",
        reason: "Needs a quieter block.",
      },
    ],
    created_by: "codex",
  });

  expect(result).toEqual(expect.objectContaining({
    status: "draft_created",
    patchId: "agent_patches-1",
    reviewUrl: "/review",
    operationCount: 1,
  }));
  expect(db.inserts.map((write) => write.table)).toEqual(["agent_runs", "agent_patches"]);
  expect(db.inserts[1].values.patchJson).toEqual({
    operations: [
      expect.objectContaining({
        type: "move_task",
        task_id: "task-1",
        from_date: "2026-06-17",
        from_day_segment: "morning",
        to_date: "2026-06-18",
        to_day_segment: "evening",
      }),
    ],
  });
  expect(db.updates[0]).toEqual(expect.objectContaining({
    table: "agent_runs",
    values: expect.objectContaining({ status: "draft_created", patchId: "agent_patches-1" }),
  }));
});

test("duplicate and no-change rebalance calls do not create extra Review drafts", async () => {
  const duplicateDb = createFakeDb({
    agentRunRows: [
      {
        id: "existing-run",
        patchId: "existing-patch",
        idempotencyKey: "e2e-duplicate-1",
        status: "draft_created",
        resultJson: { operationCount: 1, skipped: [] },
        warningsJson: [],
        errorJson: null,
      },
    ],
  });

  const duplicate = await runPawPlanTool(duplicateDb, "workspace-1", "propose_daily_rebalance", {
    idempotency_key: "e2e-duplicate-1",
    reason: "Retry same run.",
    moves: [{ task_id: "task-1", to_date: "2026-06-18", to_day_segment: "evening", reason: "retry" }],
  });

  expect(duplicate).toEqual(expect.objectContaining({
    status: "duplicate",
    patchId: "existing-patch",
  }));
  expect(duplicateDb.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);

  const noChangeDb = createFakeDb({
    taskRows: [
      {
        id: "task-1",
        date: new Date("2026-06-17T01:00:00.000Z"),
        daySegment: "morning",
        status: "done",
        movable: true,
      },
    ],
  });

  const noChange = await runPawPlanTool(noChangeDb, "workspace-1", "propose_week_rebalance", {
    idempotency_key: "e2e-no-change-1",
    reason: "Completed tasks should not move.",
    moves: [{ task_id: "task-1", to_date: "2026-06-18", to_day_segment: "evening", reason: "done" }],
  });

  expect(noChange).toEqual(expect.objectContaining({
    status: "no_change",
    operationCount: 0,
    skipped: [expect.objectContaining({ taskId: "task-1", code: "task_not_movable_status" })],
  }));
  expect(noChangeDb.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
});
