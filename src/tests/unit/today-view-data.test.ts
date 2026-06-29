import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  agentPatches,
  checkins,
  courses,
  dayCapacities,
  inboxItems,
  projects,
  routineCompletions,
  routines,
  tasks,
  timeBlocks,
  tracks,
} from "@/lib/db/schema";

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

vi.mock("@/lib/planning/active-plan", () => ({
  getActivePlanId: vi.fn(),
}));

type Table = object;

function sqlParamValues(value: unknown): unknown[] {
  if (!value || typeof value !== "object") return [];
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  if (!Array.isArray(chunks)) return [];
  return chunks.flatMap((chunk) => {
    if (chunk && typeof chunk === "object" && "value" in chunk && "encoder" in chunk) {
      return [(chunk as { value: unknown }).value];
    }
    return sqlParamValues(chunk);
  });
}

function hasStatusColumn(value: unknown, seen = new Set<unknown>()): boolean {
  if (!value || typeof value !== "object" || seen.has(value)) return false;
  seen.add(value);
  if ((value as { name?: unknown }).name === "status") return true;
  if (Array.isArray(value)) return value.some((item) => hasStatusColumn(item, seen));
  const chunks = (value as { queryChunks?: unknown[] }).queryChunks;
  if (Array.isArray(chunks) && chunks.some((chunk) => hasStatusColumn(chunk, seen))) return true;
  return Object.values(value).some((item) => hasStatusColumn(item, seen));
}

function queryResult<T>(rows: T[]) {
  return {
    where: vi.fn((condition: unknown) => {
      const statuses = sqlParamValues(condition)
        .flatMap((value) => (Array.isArray(value) ? value : [value]))
        .filter((value): value is string =>
          value === "todo" || value === "done" || value === "skipped" || value === "backlog",
        );
      if (statuses.length === 0 && hasStatusColumn(condition)) {
        return queryResult(rows.filter((row) => (row as { status?: string }).status !== "backlog"));
      }
      if (statuses.length === 0) return queryResult(rows);
      return queryResult(rows.filter((row) => statuses.includes((row as { status?: string }).status ?? "")));
    }),
    orderBy: vi.fn(() => Promise.resolve(rows)),
    limit: vi.fn((count: number) => Promise.resolve(rows.slice(0, count))),
    then: (resolve: (value: T[]) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  };
}

function createDb(rowsByTable: Map<Table, unknown[]>) {
  return {
    select: vi.fn(() => ({
      from: vi.fn((table: Table) => queryResult(rowsByTable.get(table) ?? [])),
    })),
  };
}

describe("today page data", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T02:00:00.000Z"));
    vi.clearAllMocks();
  });

  it("excludes backlog tasks from Today's task list and capacity", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { getActivePlanId } = await import("@/lib/planning/active-plan");
    const today = new Date("2026-06-28T16:00:00.000Z");
    const db = createDb(
      new Map<Table, unknown[]>([
        [projects, []],
        [courses, []],
        [tracks, []],
        [
          tasks,
          [
            {
              id: "todo-task",
              title: "Today todo",
              date: today,
              daySegment: "afternoon",
              status: "todo",
              estimatedMinutes: 60,
              blocked: false,
              isChore: false,
              priority: "normal",
              energyLevel: "medium",
              projectId: null,
              courseId: null,
              trackId: null,
            },
            {
              id: "backlog-task",
              title: "Deferred placeholder",
              date: today,
              daySegment: "afternoon",
              status: "backlog",
              estimatedMinutes: 300,
              blocked: false,
              isChore: false,
              priority: "normal",
              energyLevel: "medium",
              projectId: null,
              courseId: null,
              trackId: null,
            },
          ],
        ],
        [routines, []],
        [routineCompletions, []],
        [timeBlocks, []],
        [dayCapacities, []],
        [inboxItems, []],
        [checkins, []],
        [agentPatches, []],
      ]),
    );
    vi.mocked(getDb).mockReturnValue(db as never);
    vi.mocked(getActivePlanId).mockResolvedValue("plan-1");
    const { getTodayPageData } = await import("@/lib/planning/view-data");

    const data = await getTodayPageData("workspace-1");

    expect(data.tasks.map((task) => task.id)).toEqual(["todo-task"]);
    expect(data.todayTasks.map((task) => task.id)).toEqual(["todo-task"]);
    expect(data.timelineItems.map((item) => item.id)).toEqual(["todo-task"]);
    expect(data.warnings.map((warning) => warning.id)).not.toContain("capacity_overload");
  });
});
