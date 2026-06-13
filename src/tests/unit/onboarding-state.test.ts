import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getOnboardingState, recordOnboardingEvent } from "@/lib/onboarding/state";

type RowsByTable = Record<string, Array<Record<string, unknown>>>;

function shanghaiDateParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);

  return {
    year: Number(parts.find((part) => part.type === "year")?.value),
    month: Number(parts.find((part) => part.type === "month")?.value),
    day: Number(parts.find((part) => part.type === "day")?.value),
  };
}

function startOfShanghaiDay(date: Date) {
  const { year, month, day } = shanghaiDateParts(date);
  return new Date(Date.UTC(year, month - 1, day) - 8 * 60 * 60 * 1000);
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function predicateIncludesColumn(value: unknown, columnName: string): boolean {
  if (!value || typeof value !== "object") return false;
  if ("name" in value && (value as { name?: unknown }).name === columnName) return true;
  const chunks = (value as { queryChunks?: unknown }).queryChunks;
  if (Array.isArray(chunks) && chunks.some((chunk) => predicateIncludesColumn(chunk, columnName))) return true;
  return false;
}

function createFakeDb(rows: RowsByTable = {}) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const conflicts: Array<{ target: unknown }> = [];
  const limits: Array<{ table: string; count: number }> = [];
  const wheres: Array<{ table: string; predicate: unknown }> = [];

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function selectableRows(table: unknown, predicate: unknown) {
    const name = tableName(table);
    const todayStart = startOfShanghaiDay(new Date());
    let tableRows = rows[name] ?? [];
    if (name === "tasks" && predicateIncludesColumn(predicate, "date")) {
      tableRows = tableRows.filter((row) => row.date instanceof Date && row.date >= todayStart);
    }
    if (name === "time_blocks" && predicateIncludesColumn(predicate, "ends_at")) {
      tableRows = tableRows.filter((row) => row.endsAt instanceof Date && row.endsAt >= todayStart);
    }
    return {
      orderBy() {
        return this;
      },
      limit(count: number) {
        limits.push({ table: name, count });
        return Promise.resolve(tableRows.slice(0, count));
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(tableRows).then(resolve, reject);
      },
    };
  }

  return {
    inserts,
    select() {
      return {
        from(table: unknown) {
          return {
            where(predicate: unknown) {
              wheres.push({ table: tableName(table), predicate });
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
            onConflictDoNothing(config: { target: unknown }) {
              conflicts.push(config);
              return Promise.resolve();
            },
          };
        },
      };
    },
    conflicts,
    limits,
    wheres,
  };
}

function step(state: Awaited<ReturnType<typeof getOnboardingState>>, id: string) {
  const item = state.steps.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing onboarding step ${id}`);
  return item;
}

describe("onboarding state", () => {
  it("shows plan import as the next action for an empty starter workspace", async () => {
    const state = await getOnboardingState(createFakeDb(), "workspace-1");

    expect(state.signals.workspaceCreated).toBe(true);
    expect(state.nextStep?.id).toBe("plan_imported");
    expect(step(state, "plan_imported")).toMatchObject({
      href: "/import",
      status: "next",
    });
  });

  it("completes plan import when an MCP plan import exists", async () => {
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
      }),
      "workspace-1",
    );

    expect(step(state, "plan_imported").status).toBe("complete");
  });

  it("does not complete plan import for yesterday or older tasks", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const state = await getOnboardingState(
      createFakeDb({
        tasks: [{ id: "task-1", workspaceId: "workspace-1", date: addDays(todayStart, -1) }],
      }),
      "workspace-1",
    );

    expect(step(state, "plan_imported").status).toBe("next");
  });

  it("completes plan import for today or future tasks", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const todayState = await getOnboardingState(
      createFakeDb({
        tasks: [{ id: "task-1", workspaceId: "workspace-1", date: todayStart }],
      }),
      "workspace-1",
    );
    const futureState = await getOnboardingState(
      createFakeDb({
        tasks: [{ id: "task-2", workspaceId: "workspace-1", date: addDays(todayStart, 1) }],
      }),
      "workspace-1",
    );

    expect(step(todayState, "plan_imported").status).toBe("complete");
    expect(step(futureState, "plan_imported").status).toBe("complete");
  });

  it("does not complete schedule import for yesterday or older time blocks", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-1", workspaceId: "workspace-1", endsAt: addDays(todayStart, -1) }],
      }),
      "workspace-1",
    );

    expect(step(state, "schedule_ready").status).toBe("next");
  });

  it("completes schedule import for today or future time blocks", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const todayState = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-1", workspaceId: "workspace-1", endsAt: todayStart }],
      }),
      "workspace-1",
    );
    const futureState = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-2", workspaceId: "workspace-1", endsAt: addDays(todayStart, 1) }],
      }),
      "workspace-1",
    );

    expect(step(todayState, "schedule_ready").status).toBe("complete");
    expect(step(futureState, "schedule_ready").status).toBe("complete");
  });

  it("keeps date predicates in plan and schedule existence queries", async () => {
    const db = createFakeDb();

    await getOnboardingState(db, "workspace-1");

    const taskWhere = db.wheres.find((entry) => entry.table === "tasks")?.predicate;
    const blockWhere = db.wheres.find((entry) => entry.table === "time_blocks")?.predicate;
    expect(taskWhere).toBeTruthy();
    expect(blockWhere).toBeTruthy();
    expect(predicateIncludesColumn(taskWhere, "date")).toBe(true);
    expect(predicateIncludesColumn(blockWhere, "ends_at")).toBe(true);
  });

  it("uses limited existence queries for onboarding state signals", async () => {
    const db = createFakeDb({
      tasks: [
        { id: "task-1", workspaceId: "workspace-1" },
        { id: "task-2", workspaceId: "workspace-1" },
      ],
      time_blocks: [
        { id: "block-1", workspaceId: "workspace-1" },
        { id: "block-2", workspaceId: "workspace-1" },
      ],
    });

    await getOnboardingState(db, "workspace-1");

    expect(db.limits).toEqual(
      expect.arrayContaining([
        { table: "workspace_onboarding_events", count: 1 },
        { table: "mcp_plan_imports", count: 1 },
        { table: "tasks", count: 1 },
        { table: "time_blocks", count: 1 },
        { table: "mcp_tokens", count: 1 },
        { table: "agent_patch_reviews", count: 1 },
      ]),
    );
  });

  it("marks schedule import as skipped when the explicit event exists", async () => {
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        workspace_onboarding_events: [{ eventType: "schedule_import_skipped", workspaceId: "workspace-1" }],
      }),
      "workspace-1",
    );

    expect(step(state, "schedule_ready").status).toBe("skipped");
  });

  it("completes connector setup only for active MCP tokens", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-1", workspaceId: "workspace-1", endsAt: todayStart }],
        mcp_tokens: [{ id: "token-1", workspaceId: "workspace-1", revokedAt: null, expiresAt: null }],
      }),
      "workspace-1",
    );

    expect(step(state, "connector_ready").status).toBe("complete");
  });

  it("does not complete connector setup for revoked tokens", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-1", workspaceId: "workspace-1", endsAt: todayStart }],
        mcp_tokens: [{ id: "token-1", workspaceId: "workspace-1", revokedAt: new Date(), expiresAt: null }],
      }),
      "workspace-1",
    );

    expect(step(state, "connector_ready").status).toBe("next");
  });

  it("does not complete connector setup for expired tokens", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-1", workspaceId: "workspace-1", endsAt: todayStart }],
        mcp_tokens: [{ id: "token-1", workspaceId: "workspace-1", revokedAt: null, expiresAt: new Date("2000-01-01T00:00:00.000Z") }],
      }),
      "workspace-1",
    );

    expect(step(state, "connector_ready").status).toBe("next");
  });

  it("records onboarding events idempotently", async () => {
    const db = createFakeDb();

    await recordOnboardingEvent(db, "workspace-1", "review_opened");
    await recordOnboardingEvent(db, "workspace-1", "review_opened");

    expect(db.inserts).toEqual([
      {
        table: "workspace_onboarding_events",
        values: { workspaceId: "workspace-1", eventType: "review_opened", metadataJson: {} },
      },
      {
        table: "workspace_onboarding_events",
        values: { workspaceId: "workspace-1", eventType: "review_opened", metadataJson: {} },
      },
    ]);
    expect(db.conflicts).toHaveLength(2);
    expect(db.conflicts[0].target).toEqual([
      expect.objectContaining({ name: "workspace_id" }),
      expect.objectContaining({ name: "event_type" }),
    ]);
  });

  it("marks connector setup as skipped when the explicit event exists", async () => {
    const todayStart = startOfShanghaiDay(new Date());
    const state = await getOnboardingState(
      createFakeDb({
        mcp_plan_imports: [{ id: "import-1", workspaceId: "workspace-1" }],
        time_blocks: [{ id: "block-1", workspaceId: "workspace-1", endsAt: todayStart }],
        workspace_onboarding_events: [{ eventType: "connector_setup_skipped", workspaceId: "workspace-1" }],
      }),
      "workspace-1",
    );

    expect(step(state, "connector_ready").status).toBe("skipped");
  });

  it("completes review when review_opened was recorded", async () => {
    const state = await getOnboardingState(
      createFakeDb({
        workspace_onboarding_events: [{ eventType: "review_opened", workspaceId: "workspace-1" }],
      }),
      "workspace-1",
    );

    expect(step(state, "review_ready").status).toBe("complete");
  });

  it("completes review when an agent patch review exists", async () => {
    const state = await getOnboardingState(
      createFakeDb({
        agent_patch_reviews: [{ id: "review-1", workspaceId: "workspace-1" }],
      }),
      "workspace-1",
    );

    expect(step(state, "review_ready").status).toBe("complete");
  });
});

vi.mock("@/lib/auth/session", () => ({
  getWorkspaceIdFromSession: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/planning/view-data", () => ({
  getReschedulePageData: vi.fn(),
}));

describe("onboarding route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires a session", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue(null);
    const { GET, PATCH } = await import("@/app/api/onboarding/route");

    const getResponse = await GET();
    const patchResponse = await PATCH(
      new Request("http://localhost/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: "schedule_import_skipped" }),
      }),
    );

    expect(getResponse.status).toBe(401);
    expect(patchResponse.status).toBe(401);
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });

  it("returns onboarding state for authenticated GET requests", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(createFakeDb());
    const { GET } = await import("@/app/api/onboarding/route");

    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      workspaceId: "workspace-1",
      signals: { workspaceCreated: true },
      nextStep: { id: "plan_imported" },
    });
  });

  it("accepts eventKey on PATCH and records the event", async () => {
    const db = createFakeDb();
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db);
    const { PATCH } = await import("@/app/api/onboarding/route");

    const response = await PATCH(
      new Request("http://localhost/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: "connector_setup_skipped" }),
      }),
    );

    expect(response.status).toBe(200);
    expect(db.inserts[0]).toEqual({
      table: "workspace_onboarding_events",
      values: { workspaceId: "workspace-1", eventType: "connector_setup_skipped", metadataJson: {} },
    });
    expect(db.conflicts).toHaveLength(1);
  });

  it("rejects eventType and unknown fields on PATCH", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(createFakeDb());
    const { PATCH } = await import("@/app/api/onboarding/route");

    const eventTypeResponse = await PATCH(
      new Request("http://localhost/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventType: "connector_setup_skipped" }),
      }),
    );
    const extraFieldResponse = await PATCH(
      new Request("http://localhost/api/onboarding", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ eventKey: "connector_setup_skipped", extra: true }),
      }),
    );

    expect(eventTypeResponse.status).toBe(400);
    expect(extraFieldResponse.status).toBe(400);
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });
});
