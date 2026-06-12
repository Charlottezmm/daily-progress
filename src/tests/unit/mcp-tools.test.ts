import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { allowedPawPlanToolNames, runPawPlanTool } from "@/lib/mcp/tools";

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
  latestVersionNumber?: number;
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
    if (name === "plan_versions") {
      return options.latestVersionNumber ? [{ versionNumber: options.latestVersionNumber }] : [];
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
          values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
            const rows = Array.isArray(values) ? values : [values];
            for (const row of rows) {
              inserts.push({ table: tableName(table), values: row, inTransaction });
            }
            return {
              returning() {
                return Promise.resolve(
                  rows.map((row, index) => ({
                    id: `${tableName(table)}-${inserts.length - rows.length + index + 1}`,
                    ...row,
                  })),
                );
              },
              onConflictDoUpdate() {
                return Promise.resolve();
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
  it("filters write tools out for read-only MCP tokens", () => {
    expect(allowedPawPlanToolNames("read_only")).toEqual([
      "get_today",
      "get_week",
      "get_month",
      "get_checkins",
      "get_tasks",
    ]);
    expect(allowedPawPlanToolNames("read_write")).toContain("import_plan_bundle");
  });

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

  it("creates a check-in date at the Shanghai day boundary for MCP date strings", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });

    await runPawPlanTool(db, "workspace-1", "create_checkin", {
      date: "2026-06-10",
      completed_text: "Finished the Stage 3 check-in path.",
      blocker_text: "",
      next_text: "Verify the UI can read it.",
    });

    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "checkins",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            date: new Date("2026-06-09T16:00:00.000Z"),
          }),
        }),
      ]),
    );
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

  it("denies write MCP tools for read-only tokens", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });

    await expect(
      runPawPlanTool(db, "workspace-1", "create_inbox_item", { title: "Blocked write" }, "read_only"),
    ).rejects.toThrow("MCP token does not allow write tools");
  });

  it("allows read MCP tools for read-only tokens", async () => {
    const db = createFakeDb({ selectRows: { tasks: [] } });

    const result = await runPawPlanTool(db, "workspace-1", "get_tasks", {}, "read_only");

    expect(result).toEqual({ workspaceId: "workspace-1", filters: {}, tasks: [] });
  });

  it("imports a bundled plan into real PawPlan tasks", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });

    const result = await runPawPlanTool(db, "workspace-1", "import_plan_bundle", {
      import_key: "claude-cowork-2026-06-12",
      created_by: "claude",
      source_label: "Claude Cowork task progress review",
      overall_plan: { title: "PawPlan v0.2", summary: "Ship hosted MCP and direct plan import." },
      daily_tasks: [
        {
          title: "Implement hosted MCP endpoint",
          date: "2026-06-12",
          day_segment: "afternoon",
          estimated_minutes: 90,
          priority: "high",
          energy_level: "high",
          project_name: "PawPlan",
          track_name: "Product",
        },
      ],
      weekly_summary: { week_start: "2026-06-08", focus: "MCP import loop", milestones: ["Hosted MCP"] },
      monthly_summary: { month: "2026-06", goal: "Usable personal planning loop", milestones: ["MCP import"] },
    });

    expect(result).toEqual(expect.objectContaining({ imported: true, tasksCreated: 1 }));
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ table: "tasks" }),
        expect.objectContaining({ table: "mcp_plan_imports" }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({ source: "mcp", summary: "Imported MCP plan bundle" }),
        }),
      ]),
    );
  });
});
