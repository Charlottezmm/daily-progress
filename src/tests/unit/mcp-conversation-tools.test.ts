import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  getConversationSummaries,
  getDecisionRecords,
  recordDecision,
  saveConversationSummary,
} from "@/lib/mcp/conversation-tools";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
  inTransaction: boolean;
};

type FakeDbOptions = {
  selectRows?: Partial<Record<string, Array<Record<string, unknown>>>>;
};

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: TableWrite[] = [];
  let inTransaction = false;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function rowsFor(table: unknown) {
    return options.selectRows?.[tableName(table)] ?? [];
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
            };
          },
        };
      },
    };
  }

  const client = createClient();

  return {
    inserts,
    transaction: async <T>(callback: (tx: ReturnType<typeof createClient>) => Promise<T>) => {
      inTransaction = true;
      return callback(client);
    },
    ...client,
  };
}

describe("MCP conversation sediment tools", () => {
  it("saves a structured conversation summary scoped to the workspace and records MCP provenance", async () => {
    const db = createFakeDb();

    const result = await saveConversationSummary(db, {
      workspaceId: "workspace-1",
      topic: "Weekly review scope",
      contextType: "weekly_review",
      summary: "We agreed to separate UI handoff from MCP foundation work.",
      decisions: [
        {
          topic: "Implementation boundary",
          chosen: "Add sediment tools only.",
          rationale: "Keeps v0.4 narrow and avoids touching UI work.",
        },
      ],
      openQuestions: ["Should decisions later link to conversations?"],
      createdBy: "codex",
    });

    expect(result).toEqual({ conversationId: "conversations-1" });
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "conversations",
        inTransaction: true,
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          topic: "Weekly review scope",
          contextType: "weekly_review",
          summary: "We agreed to separate UI handoff from MCP foundation work.",
          decisionsJson: [
            {
              topic: "Implementation boundary",
              chosen: "Add sediment tools only.",
              rationale: "Keeps v0.4 narrow and avoids touching UI work.",
            },
          ],
          openQuestionsJson: ["Should decisions later link to conversations?"],
          createdBy: "codex",
        }),
      }),
      expect.objectContaining({
        table: "change_logs",
        inTransaction: true,
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: null,
          source: "mcp",
          summary: "Saved MCP conversation summary",
          detailsJson: expect.objectContaining({
            conversationId: "conversations-1",
            topic: "Weekly review scope",
            contextType: "weekly_review",
            createdBy: "codex",
          }),
        }),
      }),
    ]);
  });

  it("records a structured decision scoped to the workspace and records MCP provenance", async () => {
    const db = createFakeDb();

    const result = await recordDecision(db, {
      workspaceId: "workspace-1",
      topic: "Transcript retention",
      context: "MCP tools need sediment without storing full raw transcript.",
      optionsConsidered: ["Store raw transcript", "Store structured summary only"],
      chosen: "Store structured summary only",
      rationale: "Minimizes sensitive retention while preserving useful context.",
      tradeoffsAccepted: "Lose exact wording unless a user saves it elsewhere.",
      status: "active",
    });

    expect(result).toEqual({ decisionId: "decisions-1" });
    expect(db.inserts).toEqual([
      expect.objectContaining({
        table: "decisions",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          topic: "Transcript retention",
          context: "MCP tools need sediment without storing full raw transcript.",
          optionsConsideredJson: ["Store raw transcript", "Store structured summary only"],
          chosen: "Store structured summary only",
          rationale: "Minimizes sensitive retention while preserving useful context.",
          tradeoffsAccepted: "Lose exact wording unless a user saves it elsewhere.",
          status: "active",
        }),
      }),
      expect.objectContaining({
        table: "change_logs",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          planId: null,
          source: "mcp",
          summary: "Recorded MCP decision",
          detailsJson: expect.objectContaining({
            decisionId: "decisions-1",
            topic: "Transcript retention",
            status: "active",
          }),
        }),
      }),
    ]);
  });

  it("reads recent decisions with optional status and default limit", async () => {
    const createdAt = new Date("2026-06-12T08:00:00.000Z");
    const db = createFakeDb({
      selectRows: {
        decisions: [
          {
            id: "decision-1",
            workspaceId: "workspace-1",
            topic: "Scope",
            context: "Keep v0.4 narrow.",
            optionsConsideredJson: ["Narrow", "Broad"],
            chosen: "Narrow",
            rationale: "Lower integration risk.",
            tradeoffsAccepted: "",
            status: "active",
            createdAt,
          },
        ],
      },
    });

    const result = await getDecisionRecords(db, "workspace-1", { status: "active" });

    expect(result).toEqual({
      workspaceId: "workspace-1",
      filters: { status: "active", limit: 50 },
      decisions: [
        {
          id: "decision-1",
          workspaceId: "workspace-1",
          topic: "Scope",
          context: "Keep v0.4 narrow.",
          optionsConsidered: ["Narrow", "Broad"],
          chosen: "Narrow",
          rationale: "Lower integration risk.",
          tradeoffsAccepted: "",
          status: "active",
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });

  it("reads recent conversation summaries with optional context type and capped limit", async () => {
    const createdAt = new Date("2026-06-12T09:00:00.000Z");
    const db = createFakeDb({
      selectRows: {
        conversations: [
          {
            id: "conversation-1",
            workspaceId: "workspace-1",
            topic: "MCP review",
            contextType: "decision",
            summary: "Saved sediment should be structured.",
            decisionsJson: [{ topic: "Storage", chosen: "Summary", rationale: "Avoid raw transcript." }],
            openQuestionsJson: ["Should this show in UI later?"],
            createdBy: "claude",
            createdAt,
          },
        ],
      },
    });

    const result = await getConversationSummaries(db, "workspace-1", { contextType: "decision", limit: 1000 });

    expect(result).toEqual({
      workspaceId: "workspace-1",
      filters: { contextType: "decision", limit: 100 },
      conversations: [
        {
          id: "conversation-1",
          workspaceId: "workspace-1",
          topic: "MCP review",
          contextType: "decision",
          summary: "Saved sediment should be structured.",
          decisions: [{ topic: "Storage", chosen: "Summary", rationale: "Avoid raw transcript." }],
          openQuestions: ["Should this show in UI later?"],
          createdBy: "claude",
          createdAt: createdAt.toISOString(),
        },
      ],
    });
  });
});
