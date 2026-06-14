import { describe, expect, it } from "vitest";
import { buildCapacityModel } from "@/lib/planning/capacity-model";

describe("shared capacity model", () => {
  it("counts protected course, unavailable, routine, and task usage while excluding backlog", () => {
    const result = buildCapacityModel({
      dates: [new Date("2026-06-12T00:00:00.000+08:00")],
      capacities: [
        {
          date: new Date("2026-06-12T00:00:00.000+08:00"),
          morningMinutes: 180,
          afternoonMinutes: 240,
          eveningMinutes: 120,
        },
      ],
      tasks: [
        {
          id: "task-1",
          title: "Build MCP read context",
          date: new Date("2026-06-12T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 90,
          status: "todo",
        },
        {
          id: "task-backlog",
          title: "Someday",
          date: new Date("2026-06-12T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 240,
          status: "backlog",
        },
      ],
      timeBlocks: [
        {
          id: "course-1",
          title: "AI class",
          kind: "course",
          startsAt: new Date("2026-06-12T09:00:00.000+08:00"),
          endsAt: new Date("2026-06-12T10:00:00.000+08:00"),
        },
        {
          id: "unavailable-1",
          title: "Dentist",
          kind: "unavailable",
          startsAt: new Date("2026-06-12T14:00:00.000+08:00"),
          endsAt: new Date("2026-06-12T15:30:00.000+08:00"),
        },
      ],
      routines: [
        {
          id: "routine-window",
          title: "Morning walk",
          defaultTimeSegment: "specific_window",
          defaultStartTime: "07:30",
          defaultEndTime: "08:00",
          estimatedMinutes: 45,
        },
        {
          id: "routine-default",
          title: "Evening review",
          defaultTimeSegment: "evening",
          defaultStartTime: null,
          defaultEndTime: null,
          estimatedMinutes: 30,
        },
      ],
    });

    expect(result.days).toHaveLength(1);
    expect(result.days[0]).toMatchObject({
      dateKey: "2026-06-12",
      segments: {
        morning: {
          availableMinutes: 180,
          taskMinutes: 90,
          protectedMinutes: 90,
          totalUsedMinutes: 180,
          remainingMinutes: 0,
          state: "full",
        },
        afternoon: {
          availableMinutes: 240,
          taskMinutes: 0,
          protectedMinutes: 90,
          totalUsedMinutes: 90,
          remainingMinutes: 150,
          state: "room",
        },
        evening: {
          availableMinutes: 120,
          taskMinutes: 0,
          protectedMinutes: 30,
          totalUsedMinutes: 30,
          remainingMinutes: 90,
          state: "room",
        },
      },
    });
    expect(result.days[0].segments.morning.blocks.map((block) => block.id)).toEqual(["task-1", "course-1", "routine-window"]);
    expect(result.days[0].segments.morning.blocks.map((block) => block.id)).not.toContain("task-backlog");
  });

  it("warns on future todo over-capacity but ignores future completed and skipped task load", () => {
    const result = buildCapacityModel({
      dates: [new Date("2026-06-13T00:00:00.000+08:00")],
      now: new Date("2026-06-12T10:00:00.000+08:00"),
      capacities: [
        {
          date: new Date("2026-06-13T00:00:00.000+08:00"),
          morningMinutes: 60,
          afternoonMinutes: 240,
          eveningMinutes: 120,
        },
      ],
      tasks: [
        {
          id: "future-done",
          title: "Already done",
          date: new Date("2026-06-13T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 120,
          status: "done",
        },
        {
          id: "future-skipped",
          title: "Skipped",
          date: new Date("2026-06-13T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 120,
          status: "skipped",
        },
        {
          id: "future-todo",
          title: "Still planned",
          date: new Date("2026-06-13T00:00:00.000+08:00"),
          daySegment: "morning",
          estimatedMinutes: 90,
          status: "todo",
        },
      ],
      timeBlocks: [],
      routines: [],
    });

    expect(result.days[0].segments.morning.taskMinutes).toBe(90);
    expect(result.warnings).toEqual([
      {
        code: "over_capacity",
        dateKey: "2026-06-13",
        segment: "morning",
        message: "2026-06-13 morning is over capacity by 30m.",
      },
    ]);
  });

  it("counts recurring time block occurrences only on matching weekdays", () => {
    const result = buildCapacityModel({
      dates: [
        new Date("2026-06-15T00:00:00.000+08:00"),
        new Date("2026-06-16T00:00:00.000+08:00"),
      ],
      capacities: [
        {
          date: new Date("2026-06-15T00:00:00.000+08:00"),
          morningMinutes: 180,
          afternoonMinutes: 240,
          eveningMinutes: 120,
        },
        {
          date: new Date("2026-06-16T00:00:00.000+08:00"),
          morningMinutes: 180,
          afternoonMinutes: 240,
          eveningMinutes: 120,
        },
      ],
      tasks: [],
      timeBlocks: [
        {
          id: "study-rule",
          title: "Study block",
          kind: "routine",
          startsAt: new Date("2026-06-15T05:00:00.000+08:00"),
          endsAt: new Date("2026-06-30T07:00:00.000+08:00"),
          recurrenceWeekdayMask: 1 << 1,
        },
      ],
      routines: [],
    });

    expect(result.days[0].segments.morning.protectedMinutes).toBe(120);
    expect(result.days[0].segments.afternoon.protectedMinutes).toBe(0);
    expect(result.days[1].segments.morning.protectedMinutes).toBe(0);
  });
});
