import { describe, expect, it } from "vitest";
import { expandRecurringBlocks } from "@/lib/planning/recurring-time-blocks";

describe("recurring time block expansion", () => {
  it("expands a weekly rule into dated occurrences inside the requested range", () => {
    const occurrences = expandRecurringBlocks(
      [
        {
          id: "block-1",
          title: "Study block",
          kind: "routine",
          startsAt: new Date("2026-06-15T05:00:00.000+08:00"),
          endsAt: new Date("2026-06-30T07:00:00.000+08:00"),
          recurrenceWeekdayMask: (1 << 1) | (1 << 3),
        },
      ],
      new Date("2026-06-15T00:00:00.000+08:00"),
      new Date("2026-06-22T00:00:00.000+08:00"),
    );

    expect(occurrences).toEqual([
      expect.objectContaining({
        id: "block-1__2026-06-15",
        startsAt: new Date("2026-06-15T05:00:00.000+08:00"),
        endsAt: new Date("2026-06-15T07:00:00.000+08:00"),
        recurrenceSourceId: "block-1",
      }),
      expect.objectContaining({
        id: "block-1__2026-06-17",
        startsAt: new Date("2026-06-17T05:00:00.000+08:00"),
        endsAt: new Date("2026-06-17T07:00:00.000+08:00"),
        recurrenceSourceId: "block-1",
      }),
    ]);
  });
});
