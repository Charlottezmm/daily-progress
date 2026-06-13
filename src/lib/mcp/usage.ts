import { and, count, eq, gte, inArray, lt } from "drizzle-orm";
import { mcpUsageEvents } from "@/lib/db/schema";
import { isPawPlanWriteTool, pawPlanWriteToolNames, type McpPermission } from "@/lib/mcp/tools";

export const HOSTED_MCP_DAILY_WRITE_LIMIT = 50;

type UsageDb = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
};

export class McpUsageLimitError extends Error {
  status = 429;

  constructor(message = "Hosted MCP daily write limit reached") {
    super(message);
  }
}

function truncateToolName(value: string) {
  return value.slice(0, 80);
}

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

export function extractMcpUsageToolName(payload: unknown) {
  if (!payload || typeof payload !== "object") return "unknown";
  if (Array.isArray(payload)) return "batch";

  const record = payload as Record<string, unknown>;
  const method = typeof record.method === "string" ? record.method : "unknown";
  if (method !== "tools/call") return truncateToolName(method);

  const params = record.params;
  if (!params || typeof params !== "object") return "tools/call";
  const name = (params as Record<string, unknown>).name;
  return typeof name === "string" && name ? truncateToolName(name) : "tools/call";
}

export async function recordHostedMcpUsage(
  db: UsageDb,
  input: {
    workspaceId: string;
    tokenId: string | null;
    toolName: string;
    permission: McpPermission;
    success: boolean;
    createdAt?: Date;
  },
) {
  await db.insert(mcpUsageEvents).values({
    workspaceId: input.workspaceId,
    tokenId: input.tokenId,
    toolName: truncateToolName(input.toolName),
    permission: input.permission,
    success: input.success,
    createdAt: input.createdAt ?? new Date(),
  });
}

export async function assertHostedMcpWriteAllowed(
  db: UsageDb,
  input: {
    workspaceId: string;
    toolName: string;
    now?: Date;
  },
) {
  if (!isPawPlanWriteTool(input.toolName)) return;

  const start = startOfShanghaiDay(input.now ?? new Date());
  const end = addDays(start, 1);
  const rows = await db
    .select({ value: count() })
    .from(mcpUsageEvents)
    .where(
      and(
        eq(mcpUsageEvents.workspaceId, input.workspaceId),
        eq(mcpUsageEvents.success, true),
        inArray(mcpUsageEvents.toolName, pawPlanWriteToolNames),
        gte(mcpUsageEvents.createdAt, start),
        lt(mcpUsageEvents.createdAt, end),
      ),
    );
  const used = Number(rows[0]?.value ?? 0);
  if (used >= HOSTED_MCP_DAILY_WRITE_LIMIT) {
    throw new McpUsageLimitError();
  }
}
