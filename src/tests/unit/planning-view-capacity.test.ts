import { describe, expect, it } from "vitest";
import { buildWeekCapacityDays } from "@/lib/planning/view-data";

describe("planning view shared capacity", () => {
  it("builds week day load from the shared capacity model", () => {
    const weekDates = [
      new Date("2026-06-12T00:00:00.000+08:00"),
      new Date("2026-06-13T00:00:00.000+08:00"),
    ];

    const days = buildWeekCapacityDays({
      weekDates,
      today: new Date("2026-06-12T00:00:00.000+08:00"),
      taskRows: [
        {
          id: "task-1",
          title: "Morning implementation",
          date: new Date("2026-06-12T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 90,
          status: "todo",
        },
        {
          id: "task-backlog",
          title: "Later idea",
          date: new Date("2026-06-12T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 300,
          status: "backlog",
        },
      ],
      blockRows: [
        {
          id: "course-1",
          title: "Course block",
          kind: "course",
          startsAt: new Date("2026-06-12T09:00:00.000+08:00"),
          endsAt: new Date("2026-06-12T10:00:00.000+08:00"),
        },
      ],
      routineRows: [],
      capacityRows: [
        {
          date: new Date("2026-06-12T00:00:00.000+08:00"),
          morningMinutes: 180,
          afternoonMinutes: 240,
          eveningMinutes: 120,
        },
        {
          date: new Date("2026-06-13T00:00:00.000+08:00"),
          morningMinutes: 60,
          afternoonMinutes: 0,
          eveningMinutes: 0,
        },
      ],
    });

    expect(days[0]).toEqual(
      expect.objectContaining({
        load: 28,
        capacity: "2h 30m",
        state: "today",
        items: ["Morning implementation", "Course block"],
      }),
    );
    expect(days[1]).toEqual(expect.objectContaining({ load: 0, capacity: "0h", state: "room", items: [] }));
  });
});
