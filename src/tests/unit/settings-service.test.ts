import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import {
  getSettings,
  rejectRecoveryTargetUpdate,
  SettingsServiceError,
  upsertRoutine,
  upsertSegmentEnergySettings,
} from "@/lib/settings/settings-service";

type FakeDbOptions = {
  routineRows?: Array<Record<string, unknown>>;
  energyRows?: Array<Record<string, unknown>>;
  routineUpdateResult?: Array<Record<string, unknown>>;
};

function createFakeDb(options: FakeDbOptions = {}) {
  const inserts: Array<{ table: string; values: unknown; conflict?: unknown }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function rowsFor(table: unknown) {
    const name = tableName(table);
    if (name === "routines") return options.routineRows ?? [];
    if (name === "segment_energy_settings") return options.energyRows ?? [];
    return [];
  }

  function selectableRows(table: unknown) {
    const rows = rowsFor(table);
    return {
      orderBy() {
        return Promise.resolve(rows);
      },
      then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
        return Promise.resolve(rows).then(resolve, reject);
      },
    };
  }

  return {
    inserts,
    updates,
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
        values(values: unknown) {
          inserts.push({ table: tableName(table), values });
          return {
            onConflictDoUpdate(config: unknown) {
              inserts[inserts.length - 1].conflict = config;
              return Promise.resolve();
            },
            returning() {
              return Promise.resolve([{ id: `${tableName(table)}-1`, ...(values as Record<string, unknown>) }]);
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
              updates.push({ table: tableName(table), values });
              return {
                returning() {
                  return Promise.resolve(options.routineUpdateResult ?? []);
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("settings service", () => {
  it("reads routines and segment energy settings with a non-editable system recovery target", async () => {
    const db = createFakeDb({
      routineRows: [
        {
          id: "routine-1",
          workspaceId: "workspace-1",
          title: "Morning walk",
          defaultTimeSegment: "morning",
          defaultStartTime: null,
          defaultEndTime: null,
          weekdayPattern: "mon,tue,wed,thu,fri",
          estimatedMinutes: 30,
          energyLevel: "low",
        },
      ],
      energyRows: [
        { id: "energy-1", workspaceId: "workspace-1", segment: "morning", energyLevel: "high" },
        { id: "energy-2", workspaceId: "workspace-1", segment: "afternoon", energyLevel: "medium" },
      ],
    });

    const settings = await getSettings(db, "workspace-1");

    expect(settings.routines).toHaveLength(1);
    expect(settings.routines[0]).toEqual(expect.objectContaining({ id: "routine-1", title: "Morning walk" }));
    expect(settings.segmentEnergySettings).toEqual([
      { segment: "morning", energyLevel: "high" },
      { segment: "afternoon", energyLevel: "medium" },
      { segment: "evening", energyLevel: "low" },
    ]);
    expect(settings.recoveryTarget).toEqual({
      minutes: 480,
      editable: false,
      source: "system_default",
    });
  });

  it("upserts segment energy settings without duplicating existing workspace rows", async () => {
    const db = createFakeDb();

    await upsertSegmentEnergySettings(db, "workspace-1", [
      { segment: "morning", energyLevel: "high" },
      { segment: "afternoon", energyLevel: "medium" },
      { segment: "evening", energyLevel: "low" },
    ]);

    expect(db.inserts).toHaveLength(1);
    expect(db.inserts[0]).toEqual(
      expect.objectContaining({
        table: "segment_energy_settings",
        values: [
          expect.objectContaining({ workspaceId: "workspace-1", segment: "morning", energyLevel: "high" }),
          expect.objectContaining({ workspaceId: "workspace-1", segment: "afternoon", energyLevel: "medium" }),
          expect.objectContaining({ workspaceId: "workspace-1", segment: "evening", energyLevel: "low" }),
        ],
        conflict: expect.objectContaining({
          set: expect.objectContaining({ energyLevel: expect.anything(), updatedAt: expect.any(Date) }),
        }),
      }),
    );
  });

  it("returns 404 when a workspace-scoped routine update finds no row", async () => {
    const db = createFakeDb({ routineUpdateResult: [] });

    await expect(
      upsertRoutine(db, "workspace-1", {
        id: "00000000-0000-0000-0000-000000000010",
        title: "Walk",
        defaultTimeSegment: "morning",
        defaultStartTime: null,
        defaultEndTime: null,
        weekdayPattern: "daily",
        estimatedMinutes: 20,
        energyLevel: "low",
      }),
    ).rejects.toMatchObject(new SettingsServiceError("Routine not found", 404));
  });

  it("does not allow recovery target updates", () => {
    expect(() => rejectRecoveryTargetUpdate()).toThrow(new SettingsServiceError("Recovery target is not configurable yet", 400));
  });
});
