import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { allowedPawPlanToolNames, pawPlanToolSchemas, runPawPlanTool } from "@/lib/mcp/tools";

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
    if (options.selectRows?.[name]) return options.selectRows[name];
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
  it("publishes propose_patch.patch as a structured object for MCP clients", () => {
    const patchSchema = pawPlanToolSchemas.propose_patch.shape.patch;

    expect(patchSchema).toBeInstanceOf(z.ZodObject);
    const operationsSchema = (patchSchema as z.ZodObject<z.ZodRawShape>).shape.operations;
    expect(operationsSchema).toBeInstanceOf(z.ZodArray);

    const operationSchema = (operationsSchema as z.ZodArray<z.ZodTypeAny>).element;
    expect(operationSchema).toBeInstanceOf(z.ZodObject);
    expect((operationSchema as z.ZodObject<z.ZodRawShape>).shape.type).toBeInstanceOf(z.ZodString);

    const jsonSchema = zodToJsonSchema(pawPlanToolSchemas.propose_patch, {
      strictUnions: true,
      pipeStrategy: "input",
    }) as any;
    const publishedPatchSchema = jsonSchema.properties.patch;
    const publishedOperationSchema = publishedPatchSchema.properties.operations.items;

    expect(publishedPatchSchema.type).toBe("object");
    expect(publishedOperationSchema).toMatchObject({
      type: "object",
      properties: {
        type: { type: "string" },
        task_id: { type: "string" },
      },
      required: ["type"],
      additionalProperties: true,
    });
    expect(publishedOperationSchema.anyOf).toBeUndefined();
  });

  it("filters write tools out for read-only MCP tokens", () => {
    expect(allowedPawPlanToolNames("read_only")).toEqual([
      "get_today",
      "get_week",
      "get_month",
      "get_constraints",
      "get_capacity",
      "get_decisions",
      "get_conversations",
      "get_checkins",
      "get_tasks",
    ]);
    expect(allowedPawPlanToolNames("read_write")).toContain("import_plan_bundle");
    expect(allowedPawPlanToolNames("read_write")).toContain("save_conversation_summary");
    expect(allowedPawPlanToolNames("read_write")).toContain("record_decision");
    expect(allowedPawPlanToolNames("read_write")).toContain("propose_timetable_import");
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

  it("updates task status through the service with source=mcp and persists note in the change log", async () => {
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
        persisted: true,
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
          detailsJson: expect.objectContaining({
            taskId: "task-1",
            status: "done",
            note: "Finished during coworking.",
          }),
        }),
      }),
    ]);
  });

  it("updates task schedule through MCP with source=mcp", async () => {
    const db = createFakeDb({
      taskUpdateResult: [
        {
          id: "task-1",
          workspaceId: "workspace-1",
          planId: "plan-1",
          date: new Date("2026-06-15T00:00:00.000+08:00"),
          daySegment: "afternoon",
        },
      ],
    });

    const result = await runPawPlanTool(db, "workspace-1", "update_task_schedule", {
      task_id: "task-1",
      date: "2026-06-15",
      day_segment: "afternoon",
    });

    expect(result).toEqual({
      task: expect.objectContaining({ id: "task-1", daySegment: "afternoon" }),
    });
    expect(db.updates).toEqual([
      expect.objectContaining({
        table: "tasks",
        values: expect.objectContaining({
          date: new Date("2026-06-14T16:00:00.000Z"),
          daySegment: "afternoon",
          updatedAt: expect.any(Date),
        }),
      }),
    ]);
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "change_logs",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          source: "mcp",
          summary: "Updated task schedule",
          detailsJson: expect.objectContaining({
            taskId: "task-1",
            date: "2026-06-15",
            daySegment: "afternoon",
          }),
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

  it("accepts JSON-stringified patch payloads from MCP connectors", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });
    const patch = {
      operations: [
        {
          type: "move_task",
          task_id: "task-1",
          from_date: "2026-06-14",
          from_day_segment: "afternoon",
          to_date: "2026-06-15",
          to_day_segment: "afternoon",
          reason: "Move SolidWorks back to Monday.",
        },
      ],
    };

    const result = await runPawPlanTool(db, "workspace-1", "propose_patch", {
      mode: "week",
      reason: "Connector serialized the patch object as JSON.",
      patch: JSON.stringify(patch),
      created_by: "claude",
    });

    expect(result).toEqual(expect.objectContaining({ status: "draft", previewOnly: true }));
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "agent_patches",
        values: expect.objectContaining({
          patchJson: patch,
          createdBy: "claude",
        }),
      }),
    ]);
  });

  it("proposes a timetable import as a review draft without writing constraints", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });

    const result = await runPawPlanTool(db, "workspace-1", "propose_timetable_import", {
      reason: "Prepare the user's course table for review.",
      source_label: "summer timetable",
      created_by: "codex",
      rows: [
        {
          title: "Embodied AI seminar",
          kind: "course",
          day_of_week: "mon",
          start_time: "09:00",
          end_time: "10:30",
          starts_on: "2026-06-15",
          ends_on: "2026-06-22",
          course: "Embodied AI",
        },
      ],
    });

    expect(result).toEqual(
      expect.objectContaining({
        patchId: "agent_patches-1",
        workspaceId: "workspace-1",
        planId: "plan-1",
        status: "draft",
        previewOnly: true,
        rowsPreviewed: 1,
        blocksPreviewed: 1,
      }),
    );
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "agent_patches",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          reason: "Prepare the user's course table for review.",
          patchJson: {
            operations: [
              expect.objectContaining({
                type: "import_timetable",
                source_label: "summer timetable",
                rows: [
                  expect.objectContaining({
                    title: "Embodied AI seminar",
                    dayOfWeek: "mon",
                    startTime: "09:00",
                    endTime: "10:30",
                  }),
                ],
                capacity_impact: ["将创建 1 个固定时间块", "不会自动写入，需用户在 Review 确认"],
              }),
            ],
          },
          createdBy: "codex",
        }),
      }),
    ]);
    expect(db.inserts.filter((write) => write.table === "courses" || write.table === "time_blocks")).toEqual([]);
  });

  it("checks timetable import conflicts against expanded recurring occurrences", async () => {
    const db = createFakeDb({
      activePlanId: "plan-1",
      selectRows: {
        time_blocks: [
          {
            id: "existing-tuesday",
            title: "Tuesday meeting",
            startsAt: new Date("2026-06-16T09:30:00.000+08:00"),
            endsAt: new Date("2026-06-16T10:00:00.000+08:00"),
          },
        ],
      },
    });

    const result = await runPawPlanTool(db, "workspace-1", "propose_timetable_import", {
      reason: "Prepare recurring study block.",
      rows: [
        {
          title: "Monday study",
          kind: "routine",
          day_of_week: "mon",
          start_time: "09:00",
          end_time: "10:30",
          starts_on: "2026-06-15",
          ends_on: "2026-06-22",
        },
      ],
    });

    expect(result.conflicts).toEqual([]);
    expect(db.inserts[0].values.patchJson).toEqual({
      operations: [
        expect.objectContaining({
          protected_evidence: [],
        }),
      ],
    });
  });

  it("rejects timetable import rows with multi-day or localized day_of_week values at the MCP schema boundary", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });
    const baseRow = {
      title: "Study block",
      kind: "routine",
      start_time: "05:00",
      end_time: "07:00",
      starts_on: "2026-06-15",
      ends_on: "2026-06-21",
    };

    await expect(
      runPawPlanTool(db, "workspace-1", "propose_timetable_import", {
        reason: "Prepare recurring study blocks.",
        rows: [{ ...baseRow, day_of_week: "Mon-Sat" }],
      }),
    ).rejects.toThrow("Invalid enum value");

    await expect(
      runPawPlanTool(db, "workspace-1", "propose_timetable_import", {
        reason: "Prepare recurring study blocks.",
        rows: [{ ...baseRow, day_of_week: "每天" }],
      }),
    ).rejects.toThrow("Invalid enum value");

    expect(db.inserts).toEqual([]);
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
        note: "Inbox item source recorded as manual.",
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

  it("passes an explicit supported inbox source through to storage", async () => {
    const db = createFakeDb({ activePlanId: "plan-1" });

    const result = await runPawPlanTool(db, "workspace-1", "create_inbox_item", {
      title: "Imported paper note",
      source: "imported",
    });

    expect(result).toEqual({
      item: expect.objectContaining({
        id: "inbox_items-1",
        workspaceId: "workspace-1",
        title: "Imported paper note",
        source: "imported",
      }),
      audit: {
        source: "mcp",
        note: "Inbox item source recorded as imported.",
      },
    });
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "inbox_items",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            title: "Imported paper note",
            source: "imported",
          }),
        }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({
            detailsJson: expect.objectContaining({
              title: "Imported paper note",
              inboxSource: "imported",
            }),
          }),
        }),
      ]),
    );
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

  it("denies conversation write tools for read-only tokens", async () => {
    const db = createFakeDb();

    await expect(
      runPawPlanTool(
        db,
        "workspace-1",
        "record_decision",
        {
          topic: "Scope",
          context: "MCP tool writes are permissioned.",
          options_considered: ["Read-only writes", "Require read-write"],
          chosen: "Require read-write",
          rationale: "Decision records mutate workspace data.",
          tradeoffs_accepted: "Read-only agents need a separate handoff.",
          status: "active",
        },
        "read_only",
      ),
    ).rejects.toThrow("MCP token does not allow write tools");
  });

  it("allows conversation read tools for read-only tokens", async () => {
    const createdAt = new Date("2026-06-12T09:00:00.000Z");
    const db = createFakeDb({
      selectRows: {
        conversations: [
          {
            id: "conversation-1",
            workspaceId: "workspace-1",
            topic: "Weekly review",
            contextType: "weekly_review",
            summary: "Structured sediment only.",
            decisionsJson: [],
            openQuestionsJson: [],
            createdBy: "codex",
            createdAt,
          },
        ],
      },
    });

    const result = await runPawPlanTool(
      db,
      "workspace-1",
      "get_conversations",
      { context_type: "weekly_review" },
      "read_only",
    );

    expect(result).toEqual({
      workspaceId: "workspace-1",
      filters: { contextType: "weekly_review", limit: 50 },
      conversations: [
        expect.objectContaining({
          id: "conversation-1",
          workspaceId: "workspace-1",
          topic: "Weekly review",
          contextType: "weekly_review",
          summary: "Structured sediment only.",
          createdAt: createdAt.toISOString(),
        }),
      ],
    });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
  });

  it("reads workspace constraints through a read-only MCP token without writes", async () => {
    const startsAt = new Date("2026-06-12T01:00:00.000Z");
    const endsAt = new Date("2026-06-12T02:00:00.000Z");
    const db = createFakeDb({
      selectRows: {
        courses: [{ id: "course-1", workspaceId: "workspace-1", name: "Embodied AI", color: "#2563eb" }],
        routines: [
          {
            id: "routine-1",
            workspaceId: "workspace-1",
            title: "Morning walk",
            defaultTimeSegment: "specific_window",
            defaultStartTime: "07:30",
            defaultEndTime: "08:00",
            weekdayPattern: "1,2,3,4,5",
            estimatedMinutes: 30,
            energyLevel: "low",
            createdAt: startsAt,
            updatedAt: startsAt,
          },
        ],
        time_blocks: [
          {
            id: "block-1",
            workspaceId: "workspace-1",
            title: "AI class",
            kind: "course",
            startsAt,
            endsAt,
            recurrenceRule: null,
            courseId: "course-1",
            trackId: null,
            movable: false,
            estimatedMinutes: null,
            energyLevel: null,
          },
        ],
      },
    });

    const result = await runPawPlanTool(
      db,
      "workspace-1",
      "get_constraints",
      { date_from: "2026-06-12", date_to: "2026-06-13" },
      "read_only",
    );

    expect(result).toEqual({
      workspaceId: "workspace-1",
      filters: { date_from: "2026-06-12", date_to: "2026-06-13" },
      courses: [expect.objectContaining({ id: "course-1", workspaceId: "workspace-1", name: "Embodied AI" })],
      routines: [expect.objectContaining({ id: "routine-1", workspaceId: "workspace-1", title: "Morning walk" })],
      timeBlocks: [
        expect.objectContaining({
          id: "block-1",
          workspaceId: "workspace-1",
          kind: "course",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      ],
      protectedBlocks: [
        expect.objectContaining({
          id: "block-1",
          kind: "course",
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
        }),
      ],
    });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
    expect(db.deletes).toEqual([]);
  });

  it("expands recurring constraints in MCP get_constraints", async () => {
    const db = createFakeDb({
      selectRows: {
        courses: [],
        routines: [],
        time_blocks: [
          {
            id: "study-rule",
            workspaceId: "workspace-1",
            title: "Study block",
            kind: "routine",
            startsAt: new Date("2026-06-15T05:00:00.000+08:00"),
            endsAt: new Date("2026-06-30T07:00:00.000+08:00"),
            recurrenceRule: "weekly",
            recurrenceWeekdayMask: 1 << 1,
            courseId: null,
            trackId: null,
            movable: false,
            estimatedMinutes: null,
            energyLevel: null,
          },
        ],
      },
    });

    const result = await runPawPlanTool(
      db,
      "workspace-1",
      "get_constraints",
      { date_from: "2026-06-15", date_to: "2026-06-17" },
      "read_only",
    );

    expect(result.protectedBlocks).toEqual([
      expect.objectContaining({
        id: "study-rule__2026-06-15",
        startsAt: "2026-06-14T21:00:00.000Z",
        endsAt: "2026-06-14T23:00:00.000Z",
      }),
    ]);
  });

  it("reads shared capacity through a read-only MCP token without writes", async () => {
    const db = createFakeDb({
      selectRows: {
        day_capacities: [
          {
            date: new Date("2026-06-12T00:00:00.000+08:00"),
            morningMinutes: 180,
            afternoonMinutes: 240,
            eveningMinutes: 120,
          },
        ],
        tasks: [
          {
            id: "task-1",
            title: "Implement capacity",
            date: new Date("2026-06-12T00:00:00.000+08:00"),
            daySegment: "morning",
            estimatedMinutes: 90,
            status: "todo",
          },
          {
            id: "task-backlog",
            title: "Later",
            date: new Date("2026-06-12T00:00:00.000+08:00"),
            daySegment: "morning",
            estimatedMinutes: 300,
            status: "backlog",
          },
        ],
        time_blocks: [
          {
            id: "block-1",
            title: "Unavailable",
            kind: "unavailable",
            startsAt: new Date("2026-06-12T09:00:00.000+08:00"),
            endsAt: new Date("2026-06-12T10:00:00.000+08:00"),
          },
        ],
        routines: [],
      },
    });

    const result = await runPawPlanTool(
      db,
      "workspace-1",
      "get_capacity",
      { date_from: "2026-06-12", date_to: "2026-06-13" },
      "read_only",
    );

    expect(result).toEqual({
      workspaceId: "workspace-1",
      filters: { date_from: "2026-06-12", date_to: "2026-06-13" },
      capacity: expect.objectContaining({
        days: [
          expect.objectContaining({
            dateKey: "2026-06-12",
            segments: expect.objectContaining({
              morning: expect.objectContaining({
                taskMinutes: 90,
                protectedMinutes: 60,
                remainingMinutes: 30,
              }),
            }),
          }),
        ],
      }),
    });
    expect(db.inserts).toEqual([]);
    expect(db.updates).toEqual([]);
    expect(db.deletes).toEqual([]);
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
