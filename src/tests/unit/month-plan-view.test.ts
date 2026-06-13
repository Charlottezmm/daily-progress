import { describe, expect, it } from "vitest";
import { buildMonthPlanViewData } from "@/lib/planning/view-data";

describe("month plan view data", () => {
  it("returns an honest empty state when there are no imported summaries or tasks", () => {
    const result = buildMonthPlanViewData([], {}, new Date("2026-06-12T04:00:00.000Z"));

    expect(result.cards).toEqual([]);
    expect(result.emptyText).toContain("还没有月度计划数据");
  });

  it("computes month cards from real tasks and imported plan summary", () => {
    const result = buildMonthPlanViewData(
      [
        { id: "task-1", title: "Ship MCP", status: "done", date: new Date("2026-06-12T00:00:00.000Z"), estimatedMinutes: 90 },
        { id: "task-2", title: "Verify import", status: "todo", date: new Date("2026-06-19T00:00:00.000Z"), estimatedMinutes: 30 },
      ],
      {
        overall_plan: { title: "PawPlan v0.2", summary: "Ship hosted MCP." },
        weekly_summary: { focus: "Make PawPlan agent-readable.", milestones: ["Hosted MCP"] },
        monthly_summary: { month: "2026-06", goal: "Usable planning loop.", milestones: ["Production deploy", "MCP import"] },
      },
      new Date("2026-06-12T04:00:00.000Z"),
    );

    expect(result.cards).toEqual([
      expect.objectContaining({
        title: "PawPlan v0.2",
        text: "Usable planning loop.",
        tag: "已完成 1/2",
        progress: 50,
      }),
      expect.objectContaining({
        title: "每周拆分",
        text: "Make PawPlan agent-readable.",
        tag: "2 周有任务",
        progress: null,
      }),
      expect.objectContaining({
        title: "重要节点",
        text: "Production deploy；MCP import；Hosted MCP",
        progress: null,
      }),
    ]);
  });
});
