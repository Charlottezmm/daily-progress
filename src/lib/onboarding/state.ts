import { and, eq, gt, gte, isNull, or } from "drizzle-orm";
import {
  agentPatchReviews,
  mcpPlanImports,
  mcpTokens,
  tasks,
  timeBlocks,
  workspaceOnboardingEvents,
} from "@/lib/db/schema";

export type OnboardingEventType = "schedule_import_skipped" | "connector_setup_skipped" | "review_opened";
export type OnboardingStepId = "plan_imported" | "schedule_ready" | "connector_ready" | "review_ready";
export type OnboardingStepStatus = "complete" | "skipped" | "next" | "pending";

export type OnboardingStep = {
  id: OnboardingStepId;
  title: string;
  description: string;
  href: string;
  status: OnboardingStepStatus;
  skipEventType?: Extract<OnboardingEventType, "schedule_import_skipped" | "connector_setup_skipped">;
};

export type OnboardingState = {
  workspaceId: string;
  signals: {
    workspaceCreated: boolean;
    planImported: boolean;
    scheduleReady: boolean;
    scheduleSkipped: boolean;
    connectorReady: boolean;
    connectorSkipped: boolean;
    reviewReady: boolean;
  };
  completedCount: number;
  totalCount: number;
  nextStep: OnboardingStep | null;
  steps: OnboardingStep[];
};

type DbLike = {
  select: (...args: any[]) => any;
  insert: (table: any) => any;
};

function asDate(value: unknown) {
  if (value instanceof Date) return value;
  if (typeof value === "string" || typeof value === "number") {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
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

async function firstWorkspaceRow(
  db: DbLike,
  table: any,
  workspaceId: string,
  predicate = eq(table.workspaceId, workspaceId),
): Promise<Record<string, unknown> | null> {
  const rows = await db.select({ id: table.id }).from(table).where(predicate).limit(1);
  return rows[0] ?? null;
}

async function hasOnboardingEvent(db: DbLike, workspaceId: string, eventType: OnboardingEventType) {
  return Boolean(
    await firstWorkspaceRow(
      db,
      workspaceOnboardingEvents,
      workspaceId,
      and(eq(workspaceOnboardingEvents.workspaceId, workspaceId), eq(workspaceOnboardingEvents.eventType, eventType)),
    ),
  );
}

function isActiveMcpToken(row: Record<string, unknown>, now: Date) {
  if (row.revokedAt) return false;
  const expiresAt = asDate(row.expiresAt);
  return !expiresAt || expiresAt > now;
}

function stepStatus(done: boolean, skipped: boolean): Exclude<OnboardingStepStatus, "next"> {
  if (skipped) return "skipped";
  return done ? "complete" : "pending";
}

export async function recordOnboardingEvent(db: DbLike, workspaceId: string, eventType: OnboardingEventType) {
  await db
    .insert(workspaceOnboardingEvents)
    .values({
      workspaceId,
      eventType,
      metadataJson: {},
    })
    .onConflictDoNothing({
      target: [workspaceOnboardingEvents.workspaceId, workspaceOnboardingEvents.eventType],
    });
}

export async function getOnboardingState(db: DbLike, workspaceId: string): Promise<OnboardingState> {
  const now = new Date();
  const todayStart = startOfShanghaiDay(now);
  const activeTokenPredicate = and(
    eq(mcpTokens.workspaceId, workspaceId),
    isNull(mcpTokens.revokedAt),
    or(isNull(mcpTokens.expiresAt), gt(mcpTokens.expiresAt, now)),
  );
  const currentOrFutureTaskPredicate = and(eq(tasks.workspaceId, workspaceId), gte(tasks.date, todayStart));
  const currentOrFutureBlockPredicate = and(eq(timeBlocks.workspaceId, workspaceId), gte(timeBlocks.endsAt, todayStart));
  const [
    scheduleSkipped,
    connectorSkipped,
    reviewOpened,
    importRow,
    taskRow,
    blockRow,
    tokenRow,
    reviewRow,
  ] = await Promise.all([
    hasOnboardingEvent(db, workspaceId, "schedule_import_skipped"),
    hasOnboardingEvent(db, workspaceId, "connector_setup_skipped"),
    hasOnboardingEvent(db, workspaceId, "review_opened"),
    firstWorkspaceRow(db, mcpPlanImports, workspaceId),
    firstWorkspaceRow(db, tasks, workspaceId, currentOrFutureTaskPredicate),
    firstWorkspaceRow(db, timeBlocks, workspaceId, currentOrFutureBlockPredicate),
    firstWorkspaceRow(db, mcpTokens, workspaceId, activeTokenPredicate),
    firstWorkspaceRow(db, agentPatchReviews, workspaceId),
  ]);

  const hasTask = Boolean(taskRow);
  const hasTimeBlock = Boolean(blockRow);
  const hasActiveMcpToken = Boolean(tokenRow && isActiveMcpToken(tokenRow, now));

  const signals = {
    workspaceCreated: true,
    planImported: Boolean(importRow) || hasTask,
    scheduleReady: hasTimeBlock || scheduleSkipped,
    scheduleSkipped,
    connectorReady: hasActiveMcpToken || connectorSkipped,
    connectorSkipped,
    reviewReady: reviewOpened || Boolean(reviewRow),
  };

  const steps: OnboardingStep[] = [
    {
      id: "plan_imported",
      title: "导入真实计划",
      description: "把 Claude/Codex 输出的计划导入 PawPlan。",
      href: "/import",
      status: stepStatus(signals.planImported, false),
    },
    {
      id: "schedule_ready",
      title: "导入固定日程",
      description: "导入课程、会议或不可移动时间块。",
      href: "/constraints",
      status: stepStatus(hasTimeBlock, scheduleSkipped),
      skipEventType: "schedule_import_skipped",
    },
    {
      id: "connector_ready",
      title: "连接 Codex MCP",
      description: "创建 active MCP token，或显式跳过连接设置。",
      href: "/settings",
      status: stepStatus(hasActiveMcpToken, connectorSkipped),
      skipEventType: "connector_setup_skipped",
    },
    {
      id: "review_ready",
      title: "打开审核页",
      description: "看一次 Agent 建议审核页。",
      href: "/review",
      status: stepStatus(signals.reviewReady, false),
    },
  ];

  const firstPending = steps.find((step) => step.status === "pending");
  const finalSteps = steps.map((step) => (
    firstPending && step.id === firstPending.id ? { ...step, status: "next" as const } : step
  ));
  const completedCount = finalSteps.filter((step) => step.status === "complete" || step.status === "skipped").length;

  return {
    workspaceId,
    signals,
    completedCount,
    totalCount: finalSteps.length,
    nextStep: finalSteps.find((step) => step.status === "next") ?? null,
    steps: finalSteps,
  };
}
