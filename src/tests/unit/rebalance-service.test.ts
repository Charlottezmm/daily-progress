import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { proposeRebalancePatch } from "@/lib/planning/rebalance";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
};

type TaskRow = {
  id: string;
  workspaceId: string;
  planId: string;
  title: string;
  date: Date;
  daySegment: "morning" | "afternoon" | "evening";
  status: "todo" | "done" | "skipped" | "backlog";
  movable: boolean;
};

type FakeDbOptions = {
  activePlanId?: string | null;
  tasks?: TaskRow[];
  protectedBlockIds?: string[];
};

function containsDeepValue(value: unknown, expected: unknown, seen = new WeakSet<object>()): boolean {
  if (Object.is(value, expected)) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  if (Array.isArray(value)) return value.some((entry) => containsDeepValue(entry, expected, seen));
  return Object.values(value).some((entry) => containsDeepValue(entry, expected, seen));
}

function createTask(overrides: Partial<TaskRow> = {}): TaskRow {
  return {
    id: "task-1",
    workspaceId: "workspace-1",
    planId: "plan-1",
    title: "Draft launch checklist",
    date: new Date("2026-06-17T01:00:00.000Z"),
    daySegment: "morning",
    status: "todo",
    movable: true,
    ...overrides,
  };
}

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: TableWrite[] = [];
  const selects: string[] = [];
  const wherePredicates: unknown[] = [];

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function rowsFor(table: unknown, predicate?: unknown) {
    const name = tableName(table);
    selects.push(name);

    if (name === "tasks") {
      return (options.tasks ?? []).filter(
        (task) =>
          containsDeepValue(predicate, task.workspaceId) &&
          containsDeepValue(predicate, task.id),
      );
    }
    if (name === "plans") return options.activePlanId === null ? [] : [{ id: options.activePlanId ?? "plan-1" }];
    if (name === "time_blocks") return (options.protectedBlockIds ?? []).map((id) => ({ id }));
    return [];
  }

  function selectableRows(table: unknown, predicate?: unknown) {
    const rows = rowsFor(table, predicate);
    return {
      limit() {
        return Promise.resolve(rows);
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
  }

  return {
    inserts,
    selects,
    wherePredicates,
    select() {
      return {
        from(table: unknown) {
          return {
            where(predicate: unknown) {
              wherePredicates.push(predicate);
              return selectableRows(table, predicate);
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
              return Promise.resolve([{ id: `${tableName(table)}-1`, ...values }]);
            },
          };
        },
      };
    },
    update() {
      throw new Error("update should not be called by rebalance proposals");
    },
    delete() {
      throw new Error("delete should not be called by rebalance proposals");
    },
    transaction<T>() {
      throw new Error("transaction should not be called by rebalance proposals");
    },
  };
}

describe("rebalance proposal service", () => {
  it("converts one valid move into a full move_task operation", async () => {
    const db = createFakeDb({ tasks: [createTask()] });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [
        {
          taskId: "task-1",
          toDate: "2026-06-18",
          toDaySegment: "evening",
          reason: "Needs a deeper focus block.",
        },
      ],
      createdBy: "codex",
    });

    expect(result).toEqual({
      patchId: "agent_patches-1",
      operationCount: 1,
      skipped: [],
      warnings: [],
    });
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "agent_patches",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          reason: "Rebalance today.",
          createdBy: "codex",
          patchJson: {
            operations: [
              {
                type: "move_task",
                task_id: "task-1",
                from_date: "2026-06-17",
                from_day_segment: "morning",
                to_date: "2026-06-18",
                to_day_segment: "evening",
                reason: "Needs a deeper focus block.",
              },
            ],
          },
        }),
      }),
    ]);
  });

  it("queries tasks by workspace and requested task ids only", async () => {
    const db = createFakeDb({
      tasks: [
        createTask({ id: "task-1", workspaceId: "workspace-2" }),
        createTask({ id: "task-2", workspaceId: "workspace-1" }),
      ],
    });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [
        {
          taskId: "task-1",
          toDate: "2026-06-18",
          toDaySegment: "evening",
          reason: "Move requested task.",
        },
        {
          taskId: "missing-task",
          toDate: "2026-06-18",
          toDaySegment: "afternoon",
          reason: "Move another requested task.",
        },
      ],
      createdBy: "codex",
    });

    const taskPredicate = db.wherePredicates[0];
    expect(containsDeepValue(taskPredicate, "workspace-1")).toBe(true);
    expect(containsDeepValue(taskPredicate, "task-1")).toBe(true);
    expect(containsDeepValue(taskPredicate, "missing-task")).toBe(true);
    expect(containsDeepValue(taskPredicate, "task-2")).toBe(false);
    expect(result).toEqual({
      operationCount: 0,
      skipped: [
        expect.objectContaining({ taskId: "task-1", code: "task_not_found" }),
        expect.objectContaining({ taskId: "missing-task", code: "task_not_found" }),
      ],
      warnings: [],
    });
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("skips missing tasks with task_not_found", async () => {
    const db = createFakeDb({ tasks: [] });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [
        {
          taskId: "missing-task",
          toDate: "2026-06-18",
          toDaySegment: "afternoon",
          reason: "Move missing task.",
        },
      ],
      createdBy: "codex",
    });

    expect(result).toEqual({
      operationCount: 0,
      skipped: [
        expect.objectContaining({
          taskId: "missing-task",
          code: "task_not_found",
        }),
      ],
      warnings: [],
    });
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("rejects non date-key toDate values before creating a draft", async () => {
    const db = createFakeDb({ tasks: [createTask()] });

    await expect(
      proposeRebalancePatch(db, {
        workspaceId: "workspace-1",
        mode: "today",
        reason: "Rebalance today.",
        moves: [
          {
            taskId: "task-1",
            toDate: "tomorrow",
            toDaySegment: "evening",
            reason: "Move to invalid date.",
          },
        ],
        createdBy: "codex",
      }),
    ).rejects.toThrow("Invalid rebalance target date");
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("rejects impossible toDate calendar days before creating a draft", async () => {
    const db = createFakeDb({ tasks: [createTask()] });

    await expect(
      proposeRebalancePatch(db, {
        workspaceId: "workspace-1",
        mode: "today",
        reason: "Rebalance today.",
        moves: [
          {
            taskId: "task-1",
            toDate: "2026-02-31",
            toDaySegment: "evening",
            reason: "Move to impossible date.",
          },
        ],
        createdBy: "codex",
      }),
    ).rejects.toThrow("Invalid rebalance target date");
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("skips done and skipped tasks with task_not_movable_status", async () => {
    const db = createFakeDb({
      tasks: [
        createTask({ id: "done-task", status: "done" }),
        createTask({ id: "skipped-task", status: "skipped" }),
      ],
    });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "week",
      reason: "Rebalance week.",
      moves: [
        { taskId: "done-task", toDate: "2026-06-18", toDaySegment: "morning", reason: "Move done task." },
        {
          taskId: "skipped-task",
          toDate: "2026-06-18",
          toDaySegment: "afternoon",
          reason: "Move skipped task.",
        },
      ],
      createdBy: "claude",
    });

    expect(result.operationCount).toBe(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({ taskId: "done-task", code: "task_not_movable_status" }),
      expect.objectContaining({ taskId: "skipped-task", code: "task_not_movable_status" }),
    ]);
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("skips movable false tasks with task_not_movable", async () => {
    const db = createFakeDb({ tasks: [createTask({ movable: false })] });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [{ taskId: "task-1", toDate: "2026-06-18", toDaySegment: "evening", reason: "Move fixed task." }],
      createdBy: "user",
    });

    expect(result.operationCount).toBe(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        code: "task_not_movable",
      }),
    ]);
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("skips no-op moves with move_is_noop", async () => {
    const db = createFakeDb({ tasks: [createTask({ daySegment: "afternoon" })] });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [
        {
          taskId: "task-1",
          toDate: "2026-06-17",
          toDaySegment: "afternoon",
          reason: "Keep task in place.",
        },
      ],
      createdBy: "codex",
    });

    expect(result.operationCount).toBe(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({
        taskId: "task-1",
        code: "move_is_noop",
      }),
    ]);
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("normalizes task dates using the Asia Shanghai local calendar day", async () => {
    const db = createFakeDb({
      tasks: [createTask({ date: new Date("2026-06-16T16:30:00.000Z"), daySegment: "evening" })],
    });

    await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [
        {
          taskId: "task-1",
          toDate: "2026-06-18",
          toDaySegment: "morning",
          reason: "Move across local boundary.",
        },
      ],
      createdBy: "codex",
    });

    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "agent_patches",
        values: expect.objectContaining({
          patchJson: {
            operations: [
              expect.objectContaining({
                from_date: "2026-06-17",
                from_day_segment: "evening",
              }),
            ],
          },
        }),
      }),
    ]);
  });

  it("returns no patch when every requested move is skipped", async () => {
    const db = createFakeDb({ tasks: [createTask({ status: "done" })] });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "week",
      reason: "Rebalance week.",
      moves: [
        {
          taskId: "task-1",
          toDate: "2026-06-18",
          toDaySegment: "morning",
          reason: "Move completed task.",
        },
        {
          taskId: "missing-task",
          toDate: "2026-06-19",
          toDaySegment: "evening",
          reason: "Move missing task.",
        },
      ],
      createdBy: "claude",
    });

    expect(result.patchId).toBeUndefined();
    expect(result.operationCount).toBe(0);
    expect(result.skipped).toEqual([
      expect.objectContaining({ taskId: "task-1", code: "task_not_movable_status" }),
      expect.objectContaining({ taskId: "missing-task", code: "task_not_found" }),
    ]);
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toEqual([]);
  });

  it("calls the existing proposeAgentPatch only when at least one operation exists", async () => {
    const db = createFakeDb({
      tasks: [
        createTask({ id: "valid-task" }),
        createTask({ id: "fixed-task", movable: false }),
      ],
    });

    const result = await proposeRebalancePatch(db, {
      workspaceId: "workspace-1",
      mode: "today",
      reason: "Rebalance today.",
      moves: [
        {
          taskId: "valid-task",
          toDate: "2026-06-18",
          toDaySegment: "afternoon",
          reason: "Move valid task.",
        },
        {
          taskId: "fixed-task",
          toDate: "2026-06-18",
          toDaySegment: "evening",
          reason: "Move fixed task.",
        },
      ],
      createdBy: "codex",
    });

    expect(result).toEqual({
      patchId: "agent_patches-1",
      operationCount: 1,
      skipped: [expect.objectContaining({ taskId: "fixed-task", code: "task_not_movable" })],
      warnings: [],
    });
    expect(db.inserts.filter((write) => write.table === "agent_patches")).toHaveLength(1);
    expect(db.selects).toContain("plans");
    expect(db.selects).toContain("time_blocks");
  });
});
