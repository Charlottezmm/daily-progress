import { describe, expect, it } from "vitest";
import { buildRescheduleGroups, type Task } from "@/components/reschedule-list";

describe("reschedule list grouping", () => {
  it("excludes backlog tasks with dates from reschedule groups", () => {
    const tasks: Task[] = [
      {
        id: "todo-1",
        title: "Final reviewed task",
        date: "2026-06-29T00:00:00.000+08:00",
        daySegment: "morning",
        status: "todo",
        estimatedMinutes: 120,
      },
      {
        id: "backlog-1",
        title: "Old candidate task",
        date: "2026-06-29T00:00:00.000+08:00",
        daySegment: "afternoon",
        status: "backlog",
        estimatedMinutes: 300,
      },
    ];

    const groups = buildRescheduleGroups(tasks, "2026-06-29");

    expect(groups).toHaveLength(1);
    expect(groups[0][0]).toBe("2026-06-29");
    expect(groups[0][1].map((task) => task.title)).toEqual(["Final reviewed task"]);
  });
});
