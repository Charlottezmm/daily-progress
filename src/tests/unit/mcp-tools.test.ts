import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { runPawPlanTool } from "@/lib/mcp/tools";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
  inTransaction: boolean;
};

type FakeDbOptions = {
  activePlanId?: string | null;
  protectedBlockIds?: string[];
  selectRows?: Partial<Record<string, Array<Record<string, unknown>>>>;
  taskUpdateResult?: Array<Record<string, unknown>>;
};

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: TableWrite[] = [];
  const updates: TableWrite[] = [];
  const deletes: Array<{ table: string; inTransaction: boolean }> = [];
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
    return options.selectRows?.[name] ?? [];
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
                updates.push({ table: tableName(table), values, inTransaction });
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
            inserts.push({ table: tableName(table), values, inTransaction });
            return {
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
      delete(table: unknown) {
        return {
          where() {
            deletes.push({ table: tableName(table), inTransaction });
            return Promise.resolve();
          },
        };
      },
    };
  }

  const client = createClient();

  return {
    inserts,
    updates,
    deletes,
    transaction: async <T>(callback: (tx: ReturnType<typeof createClient>) => Promise<T>) => {
      inTransaction = true;
      return callback(client);
    },
    ...client,
  };
}

describe("MCP planning tools", () => {
  it("reads tasks scoped to the requested workspace", async () => {
    const taskDate = new Date("2026-06-10T00:00:00.000Z");
    const db = createFakeDb({
      selectRows: {
        tasks: [
          {
            id: "task-1",
            workspaceId: "workspace-1",
            planId: "plan-1",
            title: "Ship MCP contract",
            notes: "Use service handlers.",
            date: taskDate,
            daySegment: "morning",
            status: "todo",
            priority: "high",
            estimatedMinutes: 90,
            energyLevel: "high",
            movable: true,
            projectId: null,
            courseId: null,
            trackId: null,
            parentTaskId: null,
            createdAt: taskDate,
            updatedAt: taskDate,
          },
        ],
      },
    });

    const result = await runPawPlanTool(db, "workspace-1", "get_tasks", {
      status: "todo",
      date_from: "2026-06-10",
      date_to: "2026-06-11",
    });

    expect(result).toEqual({
      workspaceId: "workspace-1",
      filters: {
        status: "todo",
        date_from: "2026-06-10",
        date_to: "2026-06-11",
      },
      tasks: [
        expect.objectContaining({
          id: "task-1",
          workspaceId: "workspace-1",
          title: "Ship MCP contract",
          status: "todo",
          date: taskDate.toISOString(),
        }),
      ],
    });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("updates task status through the service with source=mcp and reports note handling", async () => {
    const db = createFakeDb({
      taskUpdateResult: [{ id: "task-1", workspaceId: "workspace-1", planId: "plan-1", status: "done" }],
    });

    const result = await runPawPlanTool(db, "workspace-1", "update_task_status", {
      task_id: "task-1",
      status: "done",
      note: "Finished during coworking.",
    });

    expect(result).toEqual({
      task: expect.objectContaining({ id: "task-1", status: "done" }),
      note: {
        received: "Finished during coworking.",
        persisted: false,
        reason: "Task status notes are not supported by the current schema.",
      },
    });
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
          source: "mcp",
          detailsJson: expect.objectContaining({ taskId: "task-1", status: "done" }),
        }),
      }),
    ]);
  });

  it("proposes a patch as preview-only draft without updating tasks", async () => {
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

    const result = await runPawPlanTool(db, "workspace-1", "propose_patch", {
      mode: "today",
      reason: "Preview a narrower plan.",
      patch,
      created_by: "codex",
    });

    expect(result).toEqual(
      expect.objectContaining({
        patchId: "agent_patches-1",
        workspaceId: "workspace-1",
        planId: "plan-1",
        status: "draft",
        previewOnly: true,
      }),
    );
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "agent_patches",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          patchJson: patch,
          createdBy: "codex",
        }),
      }),
    ]);
    expect(db.updates.filter((write) => write.table === "tasks")).toEqual([]);
  });

  it("creates an inbox item as manual source and records an MCP audit change log", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });

    const result = await runPawPlanTool(db, "workspace-1", "create_inbox_item", {
      title: "Clarify MCP setup",
    });

    expect(result).toEqual({
      item: expect.objectContaining({
        id: "inbox_items-1",
        workspaceId: "workspace-1",
        title: "Clarify MCP setup",
        source: "manual",
      }),
      audit: {
        source: "mcp",
        note: "Inbox item source remains manual because the current schema only supports manual/imported.",
      },
    });
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "inbox_items",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          title: "Clarify MCP setup",
          source: "manual",
        }),
      }),
      expect.objectContaining({
        table: "change_logs",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          source: "mcp",
          summary: "Created inbox item through MCP",
          detailsJson: expect.objectContaining({
            title: "Clarify MCP setup",
            inboxSource: "manual",
          }),
        }),
      }),
    ]);
    expect(db.inserts.filter((write) => write.table === "inbox_items").map((write) => write.values.source)).not.toContain("mcp");
  });
});
