import { describe, expect, it } from "vitest";
import { buildMonthPlanViewData } from "@/lib/planning/view-data";

describe("month plan view data", () => {
  it("returns an honest empty state when there are no imported summaries or tasks", () => {
    const result = buildMonthPlanViewData([], {}, new Date("2026-06-12T04:00:00.000Z"));

    expect(result.cards).toEqual([]);
    expect(result.days.length).toBeGreaterThanOrEqual(35);
    expect(result.emptyText).toContain("还没有月度计划数据");
  });

  it("computes month cards from real tasks and imported plan summary", () => {
    const result = buildMonthPlanViewData(
      [
        { id: "task-1", title: "Ship MCP", status: "done", date: new Date("2026-06-12T00:00:00.000Z"), daySegment: "morning", estimatedMinutes: 90 },
        { id: "task-2", title: "Verify import", status: "todo", date: new Date("2026-06-19T00:00:00.000Z"), daySegment: "morning", estimatedMinutes: 30 },
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
    const june12 = result.days.find((day) => day.key === "2026-06-12");
    expect(june12).toEqual(expect.objectContaining({ taskCount: 1, doneCount: 1, totalMinutes: "1h 30m" }));
    expect(june12?.tasks[0]).toEqual(expect.objectContaining({ title: "Ship MCP", done: true }));
  });

  it("keeps structured task notes available for task detail drawers", () => {
    const result = buildMonthPlanViewData(
      [
        {
          id: "task-1",
          title: "SolidWorks first model",
          status: "todo",
          date: new Date("2026-06-12T00:00:00.000Z"),
          estimatedMinutes: 120,
          daySegment: "afternoon",
          notes: "目标：建出第一个可保存模型\n完成标准：能打开并保存\n- 记录 3 个不熟操作\n资源：入门视频",
        },
      ],
      {},
      new Date("2026-06-12T04:00:00.000Z"),
    );

    const task = result.days.find((day) => day.key === "2026-06-12")?.tasks[0];
    expect(task?.detail.sections).toEqual([
      { label: "目标", lines: ["建出第一个可保存模型"] },
      { label: "完成标准", lines: ["能打开并保存", "记录 3 个不熟操作"] },
      { label: "资源", lines: ["入门视频"] },
    ]);
  });
});
