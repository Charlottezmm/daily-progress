import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { ConstraintsServiceError, deleteTimeBlock, getConstraints, upsertTimeBlock } from "@/lib/constraints/service";

type FakeDbOptions = {
  activePlan?: Record<string, unknown> | null;
  courses?: Array<Record<string, unknown>>;
  timeBlocks?: Array<Record<string, unknown>>;
  deletedRows?: Array<Record<string, unknown>>;
};

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: string; values: Record<string, unknown>; inTransaction: boolean }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown>; inTransaction: boolean }> = [];
  const deletes: Array<{ table: string; inTransaction: boolean }> = [];
  let inTransaction = false;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function rowsFor(table: unknown) {
    const name = tableName(table);
    if (name === "plans") return options.activePlan === null ? [] : [options.activePlan ?? { id: "plan-1" }];
    if (name === "courses") return options.courses ?? [];
    if (name === "time_blocks") return options.timeBlocks ?? [];
    return [];
  }

  function selectableRows(table: unknown) {
    const rows = rowsFor(table);
    return {
      orderBy() {
        return this;
      },
      limit() {
        return Promise.resolve(rows.slice(0, 1));
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
              orderBy() {
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
                    return Promise.resolve([{ id: "block-1", ...values }]);
                  },
                };
              },
            };
          },
        };
      },
      delete(table: unknown) {
        return {
          where() {
            deletes.push({ table: tableName(table), inTransaction });
            return {
              returning() {
                return Promise.resolve(options.deletedRows ?? [{ id: "block-1" }]);
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
    deletes,
    transaction: async <T>(callback: (tx: ReturnType<typeof createClient>) => Promise<T>) => {
      inTransaction = true;
      return callback(client);
    },
    ...client,
  };
}

describe("constraints service", () => {
  it("returns workspace courses and only editable time block kinds with course names", async () => {
    const db = createFakeDb({
      courses: [
        { id: "course-1", workspaceId: "workspace-1", name: "Robotics" },
        { id: "course-2", workspaceId: "workspace-1", name: "Linear Algebra" },
      ],
      timeBlocks: [
        {
          id: "routine-1",
          workspaceId: "workspace-1",
          title: "Sleep",
          kind: "recovery",
          startsAt: new Date("2026-06-14T14:00:00.000Z"),
          endsAt: new Date("2026-06-14T22:00:00.000Z"),
          recurrenceRule: null,
          courseId: null,
          movable: false,
        },
        {
          id: "meeting-1",
          workspaceId: "workspace-1",
          title: "Study group",
          kind: "meeting",
          startsAt: new Date("2026-06-13T03:00:00.000Z"),
          endsAt: new Date("2026-06-13T04:00:00.000Z"),
          recurrenceRule: null,
          courseId: null,
          movable: true,
        },
        {
          id: "course-block-1",
          workspaceId: "workspace-1",
          title: "Robotics lecture",
          kind: "course",
          startsAt: new Date("2026-06-12T01:00:00.000Z"),
          endsAt: new Date("2026-06-12T03:00:00.000Z"),
          recurrenceRule: "weekly",
          courseId: "course-1",
          movable: false,
        },
      ],
    });

    const result = await getConstraints(db, "workspace-1");

    expect(result.workspaceId).toBe("workspace-1");
    expect(result.courses).toEqual([
      expect.objectContaining({ id: "course-1", name: "Robotics" }),
      expect.objectContaining({ id: "course-2", name: "Linear Algebra" }),
    ]);
    expect(result.timeBlocks).toEqual([
      expect.objectContaining({
        id: "course-block-1",
        kind: "course",
        courseName: "Robotics",
        movable: false,
      }),
      expect.objectContaining({
        id: "meeting-1",
        kind: "meeting",
        courseName: null,
        movable: false,
      }),
    ]);
  });

  it("creates a course time block, reusing the current workspace course and writing a manual change log", async () => {
    const db = createFakeDb({
      courses: [{ id: "course-1", workspaceId: "workspace-1", name: "Robotics" }],
    });

    const result = await upsertTimeBlock(db, "workspace-1", {
      title: "Robotics lab",
      kind: "course",
      startsAt: new Date("2026-06-12T01:00:00.000Z"),
      endsAt: new Date("2026-06-12T03:00:00.000Z"),
      recurrenceRule: "weekly",
      courseName: "Robotics",
    });

    expect(result).toEqual({
      timeBlock: expect.objectContaining({ title: "Robotics lab", kind: "course", courseId: "course-1" }),
      course: expect.objectContaining({ id: "course-1", name: "Robotics" }),
    });
    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "time_blocks",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            title: "Robotics lab",
            kind: "course",
            courseId: "course-1",
            movable: false,
          }),
          inTransaction: true,
        }),
        expect.objectContaining({
          table: "change_logs",
          values: expect.objectContaining({
            workspaceId: "workspace-1",
            planId: "plan-1",
            source: "manual",
            summary: "Updated calendar constraint",
          }),
          inTransaction: true,
        }),
      ]),
    );
    expect(db.inserts.some((write) => write.table === "courses")).toBe(false);
  });

  it("creates a missing current workspace course before saving a course block", async () => {
    const db = createFakeDb();

    await upsertTimeBlock(db, "workspace-1", {
      title: "Robotics lab",
      kind: "course",
      startsAt: new Date("2026-06-12T01:00:00.000Z"),
      endsAt: new Date("2026-06-12T03:00:00.000Z"),
      recurrenceRule: null,
      courseName: "Robotics",
    });

    expect(db.inserts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          table: "courses",
          values: expect.objectContaining({ workspaceId: "workspace-1", name: "Robotics" }),
          inTransaction: true,
        }),
        expect.objectContaining({
          table: "time_blocks",
          values: expect.objectContaining({ courseId: "courses-1" }),
          inTransaction: true,
        }),
      ]),
    );
  });

  it("refuses to delete non-editable time block kinds", async () => {
    const db = createFakeDb({
      timeBlocks: [{ id: "block-1", workspaceId: "workspace-1", kind: "routine" }],
    });

    await expect(deleteTimeBlock(db, "workspace-1", "block-1")).rejects.toEqual(
      new ConstraintsServiceError("Time block is not editable here", 403),
    );
    expect(db.deletes).toEqual([]);
  });

  it("deletes editable blocks with the stable API response", async () => {
    const db = createFakeDb({
      timeBlocks: [{ id: "block-1", workspaceId: "workspace-1", title: "Class", kind: "course" }],
    });

    await expect(deleteTimeBlock(db, "workspace-1", "block-1")).resolves.toEqual({ deleted: true });
  });
});
