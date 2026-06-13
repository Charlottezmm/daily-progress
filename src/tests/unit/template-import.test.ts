import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  agentPatches,
  checkins,
  conversations,
  courses,
  decisions,
  mcpTokens,
  plans,
  planVersions,
  routines,
  segmentEnergySettings,
  tasks,
  timeBlocks,
  tracks,
} from "@/lib/db/schema";
import { importWorkspaceTemplate } from "@/lib/templates/import";
import type { PawPlanTemplate } from "@/lib/templates/export";

type TableWrite = {
  table: string;
  values: Record<string, unknown>;
  inTransaction: boolean;
};

function createImportDb() {
  const inserts: TableWrite[] = [];
  const updates: TableWrite[] = [];
  let inTransaction = false;
  const counters: Record<string, number> = {};

  function nextId(tableName: string) {
    counters[tableName] = (counters[tableName] ?? 0) + 1;
    return `${tableName}-${counters[tableName]}`;
  }

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function createClient() {
    return {
      insert(table: unknown) {
        const tableNameValue = tableName(table);
        return {
          values(values: Record<string, unknown> | Array<Record<string, unknown>>) {
            const rows = Array.isArray(values) ? values : [values];
            for (const row of rows) {
              inserts.push({ table: tableNameValue, values: row, inTransaction });
            }
            return {
              returning() {
                return Promise.resolve(
                  rows.map((row) => ({
                    id: nextId(tableNameValue),
                    ...row,
                  })),
                );
              },
              then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
                return Promise.resolve(undefined).then(resolve, reject);
              },
            };
          },
        };
      },
      update(table: unknown) {
        const tableNameValue = tableName(table);
        return {
          set(values: Record<string, unknown>) {
            return {
              where() {
                updates.push({ table: tableNameValue, values, inTransaction });
                return Promise.resolve([{ id: "updated", ...values }]);
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
      try {
        return await callback(client);
      } finally {
        inTransaction = false;
      }
    },
    ...client,
  };
}

const template: PawPlanTemplate = {
  schemaVersion: "pawplan.template.v0.4",
  exportedAt: "2026-06-12T00:00:00.000Z",
  workspace: { name: "Source Workspace" },
  tracks: [
    {
      id: "source-track",
      name: "Research",
      kind: "main",
      targetMinPercent: 50,
      targetMaxPercent: 70,
      color: "#16a34a",
    },
  ],
  courses: [{ id: "source-course", name: "Deep Learning", color: "#2563eb" }],
  routines: [
    {
      id: "source-routine",
      title: "Cook dinner",
      defaultTimeSegment: "evening",
      defaultStartTime: null,
      defaultEndTime: null,
      weekdayPattern: "daily",
      estimatedMinutes: 45,
      energyLevel: "low",
    },
  ],
  segmentEnergySettings: [
    { segment: "morning", energyLevel: "high" },
    { segment: "afternoon", energyLevel: "medium" },
    { segment: "evening", energyLevel: "low" },
  ],
  timeBlocks: [
    {
      id: "source-block",
      title: "Deep Learning Lecture",
      kind: "course",
      startsAt: "2026-09-07T01:00:00.000Z",
      endsAt: "2026-09-07T03:00:00.000Z",
      recurrenceRule: "weekly",
      courseId: "source-course",
      trackId: "source-track",
      movable: false,
      estimatedMinutes: null,
      energyLevel: null,
    },
  ],
  tasks: [
    {
      id: "source-task",
      title: "Finish paper draft",
      notes: "template notes",
      date: "2026-09-08T00:00:00.000Z",
      daySegment: "morning",
      status: "done",
      priority: "high",
      estimatedMinutes: 120,
      energyLevel: "high",
      movable: true,
      courseId: "source-course",
      trackId: "source-track",
      parentTaskId: null,
    },
  ],
};

describe("template import", () => {
  it("creates isolated workspace scoped rows and resets imported tasks to todo", async () => {
    const db = createImportDb();

    const result = await importWorkspaceTemplate(db, "target-workspace", { template, mode: "new_plan" });

    expect(result).toEqual({
      planId: "plans-1",
      tasksCreated: 1,
      routinesCreated: 1,
      timeBlocksCreated: 1,
    });
    expect(db.inserts.every((write) => write.inTransaction)).toBe(true);
    expect(db.inserts.map((write) => write.table)).not.toEqual(
      expect.arrayContaining([
        getTableName(mcpTokens),
        getTableName(checkins),
        getTableName(agentPatches),
        getTableName(conversations),
        getTableName(decisions),
      ]),
    );
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: getTableName(plans),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            title: "Source Workspace Template",
            status: "active",
          }),
        }),
        expect.objectContaining({
          table: getTableName(planVersions),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            planId: "plans-1",
            versionNumber: 1,
            source: "baseline",
          }),
        }),
        expect.objectContaining({
          table: getTableName(tracks),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            name: "Research",
          }),
        }),
        expect.objectContaining({
          table: getTableName(courses),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            name: "Deep Learning",
          }),
        }),
        expect.objectContaining({
          table: getTableName(routines),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            title: "Cook dinner",
          }),
        }),
        expect.objectContaining({
          table: getTableName(segmentEnergySettings),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            segment: "morning",
          }),
        }),
        expect.objectContaining({
          table: getTableName(timeBlocks),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            title: "Deep Learning Lecture",
            courseId: "courses-1",
            trackId: "tracks-1",
          }),
        }),
        expect.objectContaining({
          table: getTableName(tasks),
          values: expect.objectContaining({
            workspaceId: "target-workspace",
            planId: "plans-1",
            title: "Finish paper draft",
            status: "todo",
            courseId: "courses-1",
            trackId: "tracks-1",
          }),
        }),
      ]),
    );
    expect(db.updates).toEqual([
      expect.objectContaining({
        table: getTableName(plans),
        values: expect.objectContaining({ currentVersionId: "plan_versions-1" }),
      }),
    ]);
  });
});
