import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { completeAgentRun, failAgentRun, getLatestAgentRuns, startAgentRun } from "@/lib/agent-runs/service";

type AgentRunRow = {
  id: string;
  workspaceId: string;
  planId: string | null;
  patchId: string | null;
  kind: string;
  idempotencyKey: string;
  status: string;
  reason: string;
  inputJson: unknown;
  resultJson: unknown;
  warningsJson: unknown;
  errorJson: unknown;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
};

function createFakeDb(
  options: {
    agentRunRows?: AgentRunRow[];
    agentRunSelectBatches?: AgentRunRow[][];
    insertError?: unknown;
    updateRows?: Array<Record<string, unknown>>;
  } = {},
) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown>; where?: unknown }> = [];
  const selects: Array<{ table: string; fields: unknown; whereCalled: boolean; orderByCalled: boolean; limit?: number }> =
    [];
  const now = new Date("2026-06-17T00:00:00.000Z");
  const selectBatches = options.agentRunSelectBatches ? [...options.agentRunSelectBatches] : null;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function rowsFor(table: unknown) {
    if (tableName(table) !== "agent_runs") return [];
    if (selectBatches) return selectBatches.shift() ?? [];
    return options.agentRunRows ?? [];
  }

  function projectRows(rows: AgentRunRow[], fields: unknown) {
    if (!fields || typeof fields !== "object") return rows;
    const fieldNames = Object.keys(fields as Record<string, unknown>) as Array<keyof AgentRunRow>;
    return rows.map((row) => Object.fromEntries(fieldNames.map((field) => [field, row[field]])));
  }

  return {
    inserts,
    updates,
    selects,
    select(fields?: unknown) {
      return {
        from(table: unknown) {
          const select = { table: tableName(table), fields, whereCalled: false, orderByCalled: false, limit: undefined };
          selects.push(select);
          return {
            where() {
              select.whereCalled = true;
              const rows = rowsFor(table);
              return {
                orderBy() {
                  select.orderByCalled = true;
                  return {
                    limit(count: number) {
                      select.limit = count;
                      return Promise.resolve(projectRows(rows.slice(0, count), fields));
                    },
                  };
                },
                limit(count: number) {
                  select.limit = count;
                  return Promise.resolve(projectRows(rows.slice(0, count), fields));
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
              if (options.insertError) return Promise.reject(options.insertError);
              return Promise.resolve([{ id: "run-1", createdAt: now, updatedAt: now, ...values }]);
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where(predicate?: unknown) {
              updates.push({ table: tableName(table), values, where: predicate });
              return {
                returning() {
                  return Promise.resolve(options.updateRows ?? [{ id: "run-1", workspaceId: "workspace-1", ...values }]);
                },
              };
            },
          };
        },
      };
    },
  };
}

function containsDeepValue(value: unknown, expected: unknown, seen = new WeakSet<object>()): boolean {
  if (value === expected) return true;
  if (!value || typeof value !== "object") return false;
  if (seen.has(value)) return false;
  seen.add(value);

  return Object.values(value).some((entry) => containsDeepValue(entry, expected, seen));
}

describe("agent run service", () => {
  it("creates a started run for a new idempotency key", async () => {
    const db = createFakeDb();

    const result = await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: { source: "codex" },
      createdBy: "codex",
    });

    expect(result).toEqual({ duplicate: false, runId: "run-1" });
    expect(db.inserts[0]).toEqual(
      expect.objectContaining({
        table: "agent_runs",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: "plan-1",
          kind: "morning_rebalance",
          idempotencyKey: "agent-key-1",
          status: "started",
        }),
      }),
    );
  });

  it("redacts raw prompt and token fields from stored input json", async () => {
    const db = createFakeDb();

    await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: {
        systemPrompt: "raw prompt text",
        nested: { mcpBearerToken: "pwp_live_secret" },
      },
      createdBy: "codex",
    });

    expect(db.inserts[0].values.inputJson).toEqual({
      systemPrompt: "[redacted]",
      nested: { mcpBearerToken: "[redacted]" },
    });
    expect(JSON.stringify(db.inserts[0].values.inputJson)).not.toContain("raw prompt text");
    expect(JSON.stringify(db.inserts[0].values.inputJson)).not.toContain("pwp_live_secret");
  });

  it("serializes safe input json shapes without losing dates urls maps sets or circular references", async () => {
    const circular: Record<string, unknown> = { label: "self" };
    circular.self = circular;
    const db = createFakeDb();

    await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: {
        requestedAt: new Date("2026-06-17T01:02:03.000Z"),
        callbackUrl: new URL("https://pawplan.example/review"),
        metadata: new Map([["mode", "morning"]]),
        selectedTaskIds: new Set(["task-1", "task-2"]),
        nested: circular,
        rawPrompt: "do not store",
      },
      createdBy: "codex",
    });

    expect(db.inserts[0].values.inputJson).toEqual({
      requestedAt: "2026-06-17T01:02:03.000Z",
      callbackUrl: "https://pawplan.example/review",
      metadata: [["mode", "morning"]],
      selectedTaskIds: ["task-1", "task-2"],
      nested: { label: "self", self: "[circular]" },
      rawPrompt: "[redacted]",
    });
  });

  it("redacts sensitive string keys inside maps", async () => {
    const db = createFakeDb();

    await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: {
        metadata: new Map([
          ["mcpBearerToken", "secret-token"],
          ["safe", "visible"],
        ]),
      },
      createdBy: "codex",
    });

    expect(db.inserts[0].values.inputJson).toEqual({
      metadata: [
        ["mcpBearerToken", "[redacted]"],
        ["safe", "visible"],
      ],
    });
    expect(JSON.stringify(db.inserts[0].values.inputJson)).not.toContain("secret-token");
  });

  it("does not treat shared references as circular input json", async () => {
    const shared = { label: "same-object" };
    const db = createFakeDb();

    await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: {
        first: shared,
        second: shared,
      },
      createdBy: "codex",
    });

    expect(db.inserts[0].values.inputJson).toEqual({
      first: { label: "same-object" },
      second: { label: "same-object" },
    });
  });

  it("returns an existing run for a duplicate idempotency key", async () => {
    const db = createFakeDb({
      agentRunRows: [
        {
          id: "run-existing",
          workspaceId: "workspace-1",
          planId: "plan-1",
          patchId: "patch-1",
          kind: "morning_rebalance",
          idempotencyKey: "agent-key-1",
          status: "draft_created",
          reason: "rebalance today",
          inputJson: {},
          resultJson: { operationCount: 3, skipped: [] },
          warningsJson: [{ code: "LOW_CONFIDENCE", message: "needs review" }],
          errorJson: null,
          createdBy: "codex",
          createdAt: new Date("2026-06-17T00:00:00.000Z"),
          updatedAt: new Date("2026-06-17T00:01:00.000Z"),
        },
      ],
    });

    const result = await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: {},
      createdBy: "codex",
    });

    expect(db.inserts).toEqual([]);
    expect(result).toEqual({
      duplicate: true,
      result: {
        runId: "run-existing",
        status: "duplicate",
        patchId: "patch-1",
        reviewUrl: "/review",
        operationCount: 3,
        skipped: [],
        warnings: [{ code: "LOW_CONFIDENCE", message: "needs review" }],
        idempotencyKey: "agent-key-1",
      },
    });
  });

  it("returns duplicate for a failed run with compact error and no insert", async () => {
    const db = createFakeDb({
      agentRunRows: [
        {
          id: "run-failed",
          workspaceId: "workspace-1",
          planId: "plan-1",
          patchId: null,
          kind: "evening_review",
          idempotencyKey: "agent-key-failed",
          status: "failed",
          reason: "review today",
          inputJson: {},
          resultJson: { operationCount: 0, skipped: [] },
          warningsJson: [{ code: "PARTIAL_CONTEXT", message: "Some context was unavailable" }],
          errorJson: {
            code: "PATCH_BUILD_FAILED",
            message: "Could not build a safe patch",
            rawPrompt: "do not return this",
          },
          createdBy: "codex",
          createdAt: new Date("2026-06-17T00:00:00.000Z"),
          updatedAt: new Date("2026-06-17T00:01:00.000Z"),
        },
      ],
    });

    const result = await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "evening_review",
      idempotencyKey: "agent-key-failed",
      reason: "review today",
      inputJson: {},
      createdBy: "codex",
    });

    expect(db.inserts).toEqual([]);
    expect(result).toEqual({
      duplicate: true,
      result: {
        runId: "run-failed",
        status: "duplicate",
        reviewUrl: "/review",
        operationCount: 0,
        skipped: [],
        warnings: [{ code: "PARTIAL_CONTEXT", message: "Some context was unavailable" }],
        idempotencyKey: "agent-key-failed",
        error: { code: "PATCH_BUILD_FAILED", message: "Could not build a safe patch" },
      },
    });
  });

  it("reads back an existing run after an insert unique idempotency conflict", async () => {
    const existingRun: AgentRunRow = {
      id: "run-existing",
      workspaceId: "workspace-1",
      planId: "plan-1",
      patchId: "patch-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      status: "draft_created",
      reason: "rebalance today",
      inputJson: {},
      resultJson: { operationCount: 1, skipped: [] },
      warningsJson: [],
      errorJson: null,
      createdBy: "codex",
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
      updatedAt: new Date("2026-06-17T00:01:00.000Z"),
    };
    const db = createFakeDb({
      agentRunSelectBatches: [[], [existingRun]],
      insertError: { code: "23505", constraint: "agent_runs_workspace_idempotency_unique" },
    });

    const result = await startAgentRun(db, {
      workspaceId: "workspace-1",
      planId: "plan-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      reason: "rebalance today",
      inputJson: {},
      createdBy: "codex",
    });

    expect(db.inserts).toHaveLength(1);
    expect(result).toEqual({
      duplicate: true,
      result: {
        runId: "run-existing",
        status: "duplicate",
        patchId: "patch-1",
        reviewUrl: "/review",
        operationCount: 1,
        skipped: [],
        warnings: [],
        idempotencyKey: "agent-key-1",
      },
    });
  });

  it("marks a started run as draft_created", async () => {
    const db = createFakeDb();
    const warnings = [{ taskId: "task-1", code: "LOW_CONFIDENCE", message: "needs review" }];

    const result = await completeAgentRun(db, {
      workspaceId: "workspace-1",
      runId: "run-1",
      idempotencyKey: "agent-key-1",
      status: "draft_created",
      patchId: "patch-1",
      operationCount: 2,
      skipped: [{ taskId: "task-2", code: "LOCKED", message: "protected block" }],
      warnings,
    });

    expect(result).toEqual({
      runId: "run-1",
      status: "draft_created",
      patchId: "patch-1",
      reviewUrl: "/review",
      operationCount: 2,
      skipped: [{ taskId: "task-2", code: "LOCKED", message: "protected block" }],
      warnings,
      idempotencyKey: "agent-key-1",
    });
    expect(db.updates[0]).toEqual(
      expect.objectContaining({
        table: "agent_runs",
        values: expect.objectContaining({
          status: "draft_created",
          patchId: "patch-1",
          resultJson: result,
          warningsJson: warnings,
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(containsDeepValue(db.updates[0].where, "started")).toBe(true);
  });

  it("marks a started run as failed with compact error json", async () => {
    const db = createFakeDb();

    const result = await failAgentRun(db, {
      workspaceId: "workspace-1",
      runId: "run-1",
      idempotencyKey: "agent-key-1",
      error: { code: "PATCH_BUILD_FAILED", message: "Could not build a safe patch" },
      warnings: [{ code: "PARTIAL_CONTEXT", message: "Some tasks were skipped" }],
    });

    expect(result).toEqual({
      runId: "run-1",
      status: "failed",
      reviewUrl: "/review",
      operationCount: 0,
      skipped: [],
      warnings: [{ code: "PARTIAL_CONTEXT", message: "Some tasks were skipped" }],
      idempotencyKey: "agent-key-1",
      error: { code: "PATCH_BUILD_FAILED", message: "Could not build a safe patch" },
    });
    expect(db.updates[0]).toEqual(
      expect.objectContaining({
        table: "agent_runs",
        values: expect.objectContaining({
          status: "failed",
          resultJson: result,
          warningsJson: [{ code: "PARTIAL_CONTEXT", message: "Some tasks were skipped" }],
          errorJson: { code: "PATCH_BUILD_FAILED", message: "Could not build a safe patch" },
          updatedAt: expect.any(Date),
        }),
      }),
    );
    expect(Object.keys(db.updates[0].values.errorJson as Record<string, unknown>)).toEqual(["code", "message"]);
    expect(containsDeepValue(db.updates[0].where, "started")).toBe(true);
  });

  it("does not let a late failure overwrite a completed run", async () => {
    const completedRun: AgentRunRow = {
      id: "run-1",
      workspaceId: "workspace-1",
      planId: "plan-1",
      patchId: "patch-1",
      kind: "morning_rebalance",
      idempotencyKey: "agent-key-1",
      status: "draft_created",
      reason: "rebalance today",
      inputJson: {},
      resultJson: {
        runId: "run-1",
        status: "draft_created",
        patchId: "patch-1",
        reviewUrl: "/review",
        operationCount: 2,
        skipped: [],
        warnings: [{ code: "LOW_CONFIDENCE", message: "needs review" }],
        idempotencyKey: "agent-key-1",
      },
      warningsJson: [{ code: "LOW_CONFIDENCE", message: "needs review" }],
      errorJson: null,
      createdBy: "codex",
      createdAt: new Date("2026-06-17T00:00:00.000Z"),
      updatedAt: new Date("2026-06-17T00:01:00.000Z"),
    };
    const db = createFakeDb({
      updateRows: [],
      agentRunSelectBatches: [[completedRun]],
    });

    const result = await failAgentRun(db, {
      workspaceId: "workspace-1",
      runId: "run-1",
      idempotencyKey: "agent-key-1",
      error: { code: "LATE_FAILURE", message: "arrived late" },
    });

    expect(db.updates[0].values).toEqual(expect.objectContaining({ status: "failed" }));
    expect(result).toEqual({
      runId: "run-1",
      status: "draft_created",
      patchId: "patch-1",
      reviewUrl: "/review",
      operationCount: 2,
      skipped: [],
      warnings: [{ code: "LOW_CONFIDENCE", message: "needs review" }],
      idempotencyKey: "agent-key-1",
    });
  });

  it("throws when update misses and no run can be read back", async () => {
    const db = createFakeDb({
      updateRows: [],
      agentRunSelectBatches: [[]],
    });

    await expect(
      completeAgentRun(db, {
        workspaceId: "workspace-1",
        runId: "run-missing",
        idempotencyKey: "agent-key-missing",
        status: "no_change",
        operationCount: 0,
        skipped: [],
        warnings: [],
      }),
    ).rejects.toThrow("Agent run not found");
  });

  it("lists latest agent runs with default limit and projected fields", async () => {
    const createdAt = new Date("2026-06-17T00:00:00.000Z");
    const warningsJson = [{ code: "LOW_CONFIDENCE", message: "needs review" }];
    const errorJson = { code: "PATCH_BUILD_FAILED", message: "Could not build a safe patch" };
    const db = createFakeDb({
      agentRunRows: [
        {
          id: "run-1",
          workspaceId: "workspace-1",
          planId: "plan-1",
          patchId: "patch-1",
          kind: "morning_rebalance",
          idempotencyKey: "agent-key-1",
          status: "draft_created",
          reason: "rebalance today",
          inputJson: { source: "codex" },
          resultJson: {},
          warningsJson,
          errorJson,
          createdBy: "codex",
          createdAt,
          updatedAt: new Date("2026-06-17T00:01:00.000Z"),
        },
      ],
    });

    const result = await getLatestAgentRuns(db, { workspaceId: "workspace-1" });

    expect(db.selects[0]).toEqual(
      expect.objectContaining({
        table: "agent_runs",
        whereCalled: true,
        orderByCalled: true,
        limit: 10,
      }),
    );
    expect(Object.keys(db.selects[0].fields as Record<string, unknown>)).toEqual([
      "id",
      "kind",
      "status",
      "patchId",
      "reason",
      "createdAt",
      "errorJson",
      "warningsJson",
    ]);
    expect(result).toEqual([
      {
        id: "run-1",
        kind: "morning_rebalance",
        status: "draft_created",
        patchId: "patch-1",
        reason: "rebalance today",
        createdAt,
        errorJson,
        warningsJson,
      },
    ]);
  });

  it("passes a custom limit when listing latest agent runs", async () => {
    const db = createFakeDb();

    await getLatestAgentRuns(db, { workspaceId: "workspace-1", limit: 3 });

    expect(db.selects[0]).toEqual(
      expect.objectContaining({
        table: "agent_runs",
        whereCalled: true,
        orderByCalled: true,
        limit: 3,
      }),
    );
  });
});
