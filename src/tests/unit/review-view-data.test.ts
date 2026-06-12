import { describe, expect, it } from "vitest";
import { buildReschedulePatchItems } from "@/lib/planning/view-data";

describe("review view data", () => {
  it("exposes operation evidence and provenance for review cards", () => {
    const items = buildReschedulePatchItems({
      patches: [
        {
          id: "patch-12345678",
          createdBy: "codex",
          createdAt: new Date("2026-06-12T08:30:00.000Z"),
          patchJson: {
            operations: [
              {
                type: "move_task",
                task_id: "task-1",
                from_date: "2026-06-12",
                from_day_segment: "morning",
                to_date: "2026-06-12",
                to_day_segment: "afternoon",
                reason: "Morning is full.",
                capacity_impact: ["morning -60m", "afternoon +60m"],
                protected_evidence: ["Recovery block stays protected"],
              },
              {
                type: "change_priority",
                task_id: "task-2",
                from_priority: "normal",
                to_priority: "urgent",
                reason: "Deadline moved earlier.",
              },
            ],
          },
        },
      ],
      tasks: [
        { id: "task-1", title: "Write review brief" },
        { id: "task-2", title: "Call supplier" },
      ],
      reviews: [
        {
          patchId: "patch-12345678",
          skippedJson: [{ index: 1, type: "change_priority", reason: "Task priority changed since patch was proposed" }],
          conflictJson: [
            {
              index: 1,
              type: "change_priority",
              reason: "Task priority changed since patch was proposed",
              expected: { priority: "normal" },
              actual: { priority: "high" },
            },
          ],
        },
      ],
    });

    expect(items[0]).toEqual(
      expect.objectContaining({
        id: "patch-12345678:0",
        patchId: "patch-12345678",
        operationIndex: 0,
        operationType: "move_task",
        kind: "移动",
        title: "Write review brief",
        from: "2026-06-12 morning",
        to: "2026-06-12 afternoon",
        reason: "Morning is full.",
        impact: ["morning -60m", "afternoon +60m"],
        protectedEvidence: ["Recovery block stays protected"],
        provenance: {
          patchId: "patch-12345678",
          operationIndex: 0,
          createdBy: "codex",
          createdAt: "2026-06-12T08:30:00.000Z",
        },
      }),
    );
    expect(items[1]).toEqual(
      expect.objectContaining({
        id: "patch-12345678:1",
        operationIndex: 1,
        skipped: true,
        conflict: expect.objectContaining({
          reason: "Task priority changed since patch was proposed",
          expected: { priority: "normal" },
          actual: { priority: "high" },
        }),
      }),
    );
  });
});
