import { and, desc, eq, type SQL } from "drizzle-orm";
import { changeLogs, conversations, decisions } from "@/lib/db/schema";

type PlanningDb = {
  transaction<T>(callback: (tx: any) => Promise<T>): Promise<T>;
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

type ConversationContextType =
  | "weekly_review"
  | "decision"
  | "learning_qa"
  | "check_in_followup"
  | "methodology"
  | "adhoc";
type DecisionStatus = "active" | "superseded" | "abandoned";
type CreatedBy = "codex" | "claude" | "user";

type ConversationDecision = {
  topic: string;
  chosen: string;
  rationale: string;
};

type SaveConversationSummaryInput = {
  workspaceId: string;
  topic: string;
  contextType: ConversationContextType;
  summary: string;
  decisions: ConversationDecision[];
  openQuestions: string[];
  createdBy: CreatedBy;
};

type RecordDecisionInput = {
  workspaceId: string;
  topic: string;
  context: string;
  optionsConsidered: string[];
  chosen: string;
  rationale: string;
  tradeoffsAccepted: string;
  status: DecisionStatus;
};

function normalizeLimit(limit?: number) {
  return Math.min(Math.max(limit ?? 50, 1), 100);
}

function serializeCreatedAt(value: unknown) {
  return value instanceof Date ? value.toISOString() : value;
}

export async function saveConversationSummary(db: PlanningDb, input: SaveConversationSummaryInput) {
  return db.transaction(async (tx) => {
    const [conversation] = await tx
      .insert(conversations)
      .values({
        workspaceId: input.workspaceId,
        topic: input.topic,
        contextType: input.contextType,
        summary: input.summary,
        decisionsJson: input.decisions,
        openQuestionsJson: input.openQuestions,
        createdBy: input.createdBy,
      })
      .returning();

    await tx.insert(changeLogs).values({
      workspaceId: input.workspaceId,
      planId: null,
      source: "mcp",
      summary: "Saved MCP conversation summary",
      detailsJson: {
        conversationId: conversation.id,
        topic: input.topic,
        contextType: input.contextType,
        createdBy: input.createdBy,
      },
    });

    return { conversationId: conversation.id };
  });
}

export async function recordDecision(db: PlanningDb, input: RecordDecisionInput) {
  return db.transaction(async (tx) => {
    const [decision] = await tx
      .insert(decisions)
      .values({
        workspaceId: input.workspaceId,
        topic: input.topic,
        context: input.context,
        optionsConsideredJson: input.optionsConsidered,
        chosen: input.chosen,
        rationale: input.rationale,
        tradeoffsAccepted: input.tradeoffsAccepted,
        status: input.status,
      })
      .returning();

    await tx.insert(changeLogs).values({
      workspaceId: input.workspaceId,
      planId: null,
      source: "mcp",
      summary: "Recorded MCP decision",
      detailsJson: {
        decisionId: decision.id,
        topic: input.topic,
        status: input.status,
      },
    });

    return { decisionId: decision.id };
  });
}

export async function getDecisionRecords(
  db: PlanningDb,
  workspaceId: string,
  args: {
    status?: DecisionStatus;
    limit?: number;
  } = {},
) {
  const limit = normalizeLimit(args.limit);
  const filters: SQL[] = [eq(decisions.workspaceId, workspaceId)];
  if (args.status) filters.push(eq(decisions.status, args.status));

  const rows = await db
    .select()
    .from(decisions)
    .where(and(...filters))
    .orderBy(desc(decisions.createdAt))
    .limit(limit);

  return {
    workspaceId,
    filters: { status: args.status, limit },
    decisions: rows.map((row: Record<string, any>) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      topic: row.topic,
      context: row.context,
      optionsConsidered: row.optionsConsideredJson,
      chosen: row.chosen,
      rationale: row.rationale,
      tradeoffsAccepted: row.tradeoffsAccepted,
      status: row.status,
      createdAt: serializeCreatedAt(row.createdAt),
    })),
  };
}

export async function getConversationSummaries(
  db: PlanningDb,
  workspaceId: string,
  args: {
    contextType?: ConversationContextType;
    limit?: number;
  } = {},
) {
  const limit = normalizeLimit(args.limit);
  const filters: SQL[] = [eq(conversations.workspaceId, workspaceId)];
  if (args.contextType) filters.push(eq(conversations.contextType, args.contextType));

  const rows = await db
    .select()
    .from(conversations)
    .where(and(...filters))
    .orderBy(desc(conversations.createdAt))
    .limit(limit);

  return {
    workspaceId,
    filters: { contextType: args.contextType, limit },
    conversations: rows.map((row: Record<string, any>) => ({
      id: row.id,
      workspaceId: row.workspaceId,
      topic: row.topic,
      contextType: row.contextType,
      summary: row.summary,
      decisions: row.decisionsJson,
      openQuestions: row.openQuestionsJson,
      createdBy: row.createdBy,
      createdAt: serializeCreatedAt(row.createdAt),
    })),
  };
}
