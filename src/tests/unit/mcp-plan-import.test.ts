import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { saveMcpPlanImport } from "@/lib/mcp/plan-import";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
  inTransaction: boolean;
};

type FakeDbOptions = {
  activePlan?: Record<string, unknown> | null;
  existingImports?: Array<Record<string, unknown>>;
  existingProjects?: Array<Record<string, unknown>>;
  existingTracks?: Array<Record<string, unknown>>;
  latestVersionNumber?: number;
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
      return options.activePlan === null
        ? []
        : [
            options.activePlan ?? {
              id: "plan-1",
              workspaceId: "workspace-1",
              baselineSnapshot: {
                version: 1,
                source: "starter",
                goal: null,
              },
            },
          ];
    }
    if (name === "mcp_plan_imports") return options.existingImports ?? [];
    if (name === "projects") return options.existingProjects ?? [];
    if (name === "tracks") return options.existingTracks ?? [];
    if (name === "plan_versions") {
      return options.latestVersionNumber ? [{ versionNumber: options.latestVersionNumber }] : [];
    }
    return [];
  }

  function selectableRows(table: unknown) {
    const rows = rowsFor(table);
    return {
      orderBy() {
        return this;
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
              then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
                return Promise.resolve().then(resolve, reject);
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
                    return Promise.resolve([{ id: values.currentVersionId ?? "updated", ...values }]);
                  },
                };
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
    ...client,
  };
}

function planImportInput() {
  return {
    workspaceId: "workspace-1",
    importKey: "claude-cowork-2026-06-12",
    createdBy: "claude" as const,
    sourceLabel: "Claude Cowork task progress review",
    overallPlan: {
      title: "PawPlan v0.2",
      summary: "Ship hosted MCP connection and imported planning views.",
    },
    dailyTasks: [
      {
        title: "Implement hosted MCP endpoint",
        date: "2026-06-12",
        daySegment: "afternoon" as const,
        estimatedMinutes: 90,
        priority: "high" as const,
        energyLevel: "high" as const,
        notes: "Imported from planning discussion.",
        projectName: "PawPlan",
        trackName: "Product",
      },
      {
        title: "Verify read-only token behavior",
        date: "2026-06-13",
        daySegment: "morning" as const,
        estimatedMinutes: 45,
        projectName: "PawPlan",
        trackName: "Product",
      },
    ],
    weeklySummary: {
      weekStart: "2026-06-08",
      focus: "Make PawPlan agent-readable and agent-writable.",
      milestones: ["Hosted MCP", "Token UI"],
    },
    monthlySummary: {
      month: "2026-06",
      goal: "Move PawPlan to a usable personal planning loop.",
      milestones: ["Production deploy", "MCP import"],
    },
  };
}

describe("MCP plan import service", () => {
  it("creates real tasks, provenance storage, active plan snapshot, and MCP audit log", async () => {
    const db = createFakeDb({ latestVersionNumber: 2 });

    const result = await saveMcpPlanImport(db, planImportInput());

    expect(result).toEqual({
      imported: true,
      duplicate: false,
      importId: "mcp_plan_imports-5",
      planId: "plan-1",
      tasksCreated: 2,
      taskIds: ["tasks-3", "tasks-4"],
    });
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "projects",
          values: expect.objectContaining({ workspaceId: "workspace-1", name: "PawPlan" }),
        }),
        expect.objectContaining({
          table: "tracks",
          values: expect.objectContaining({ workspaceId: "workspace-1", name: "Product", kind: "custom" }),
        }),
        expect.objectContaining({
          table: "tasks",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            title: "Implement hosted MCP endpoint",
            date: new Date("2026-06-11T16:00:00.000Z"),
            daySegment: "afternoon",
            projectId: "projects-1",
            trackId: "tracks-2",
          }),
        }),
        expect.objectContaining({
          table: "mcp_plan_imports",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            importKey: "claude-cowork-2026-06-12",
            taskCount: 2,
            snapshot: expect.objectContaining({
              overall_plan: expect.objectContaining({ title: "PawPlan v0.2" }),
              daily_tasks: expect.any(Array),
            }),
            derivedTaskIds: ["tasks-3", "tasks-4"],
            provenanceJson: expect.objectContaining({
              created_by: "claude",
              source_label: "Claude Cowork task progress review",
            }),
          }),
        }),
        expect.objectContaining({
          table: "plan_versions",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            versionNumber: 3,
            source: "mcp",
            snapshot: expect.objectContaining({
              overall_plan: expect.objectContaining({ title: "PawPlan v0.2" }),
              weekly_summary: expect.objectContaining({ week_start: "2026-06-08" }),
              monthly_summary: expect.objectContaining({ month: "2026-06" }),
            }),
          }),
        }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            source: "mcp",
            summary: "Imported MCP plan bundle",
            detailsJson: expect.objectContaining({
              importKey: "claude-cowork-2026-06-12",
              taskCount: 2,
              derivedTaskIds: ["tasks-3", "tasks-4"],
            }),
          }),
        }),
      ]),
    );
    expect(db.updates).toEqual([
      expect.objectContaining({
        table: "plans",
        values: expect.objectContaining({
          currentVersionId: "plan_versions-6",
          baselineSnapshot: expect.objectContaining({
            overall_plan: expect.objectContaining({ title: "PawPlan v0.2" }),
            weekly_summary: expect.objectContaining({ focus: "Make PawPlan agent-readable and agent-writable." }),
            monthly_summary: expect.objectContaining({ goal: "Move PawPlan to a usable personal planning loop." }),
          }),
        }),
      }),
    ]);
  });

  it("reuses existing projects and tracks by name", async () => {
    const db = createFakeDb({
      existingProjects: [{ id: "project-existing", name: "PawPlan", workspaceId: "workspace-1" }],
      existingTracks: [{ id: "track-existing", name: "Product", workspaceId: "workspace-1" }],
    });

    await saveMcpPlanImport(db, planImportInput());

    expect(db.inserts.filter((write) => write.table === "projects")).toEqual([]);
    expect(db.inserts.filter((write) => write.table === "tracks")).toEqual([]);
    expect(db.inserts.filter((write) => write.table === "tasks")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          values: expect.objectContaining({ projectId: "project-existing", trackId: "track-existing" }),
        }),
      ]),
    );
  });

  it("is idempotent by workspace and import key", async () => {
    const db = createFakeDb({
      existingImports: [
        {
          id: "import-existing",
          workspaceId: "workspace-1",
          planId: "plan-1",
          importKey: "claude-cowork-2026-06-12",
          taskCount: 2,
          derivedTaskIds: ["task-existing-1", "task-existing-2"],
        },
      ],
    });

    const result = await saveMcpPlanImport(db, planImportInput());

    expect(result).toEqual({
      imported: false,
      duplicate: true,
      importId: "import-existing",
      planId: "plan-1",
      tasksCreated: 2,
      taskIds: ["task-existing-1", "task-existing-2"],
    });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("rejects invalid task dates and duplicate imported tasks before writing data", async () => {
    const db = createFakeDb();
    const invalidDate = planImportInput();
    invalidDate.dailyTasks[0] = { ...invalidDate.dailyTasks[0], date: "2026-99-12" };

    await expect(saveMcpPlanImport(db, invalidDate)).rejects.toMatchObject({
      message: "Invalid MCP plan task date",
      status: 400,
    });

    const duplicateTasks = planImportInput();
    duplicateTasks.dailyTasks[1] = {
      ...duplicateTasks.dailyTasks[0],
      estimatedMinutes: 45,
    };

    await expect(saveMcpPlanImport(db, duplicateTasks)).rejects.toMatchObject({
      message: "Duplicate MCP plan task",
      status: 400,
    });

    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });
});
