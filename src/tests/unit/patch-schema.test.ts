import { describe, expect, it } from "vitest";
import { agentPatchSchema, validatePatchAgainstProtectedBlocks } from "@/lib/patches/patch-schema";

describe("agent patch schema", () => {
  it("accepts supported patch operations", () => {
    const parsed = agentPatchSchema.parse({
      operations: [
        {
          type: "move_task",
          task_id: "task-1",
          from_date: "2026-06-03",
          from_day_segment: "morning",
          to_date: "2026-06-04",
          to_day_segment: "afternoon",
          reason: "Morning capacity is full.",
        },
        {
          type: "split_task",
          task_id: "task-2",
          new_tasks: [
            {
              title: "Draft outline",
              estimated_minutes: 30,
              day_segment: "morning",
            },
          ],
          reason: "The task is too large for one block.",
        },
        {
          type: "defer_task",
          task_id: "task-3",
          target_week_or_date: "2026-W24",
          reason: "This week is overloaded.",
        },
        {
          type: "move_to_backlog",
          task_id: "task-4",
          reason: "No longer needed this week.",
        },
        {
          type: "change_priority",
          task_id: "task-5",
          from_priority: "normal",
          to_priority: "high",
          reason: "The deadline moved earlier.",
        },
        {
          type: "suggest_milestone_change",
          milestone_id: "milestone-1",
          proposed_text: "Ship MCP planning foundation.",
          reason: "Scope is now clearer.",
        },
      ],
    });

    expect(parsed.operations.map((operation) => operation.type)).toEqual([
      "move_task",
      "split_task",
      "defer_task",
      "move_to_backlog",
      "change_priority",
      "suggest_milestone_change",
    ]);
  });

  it("rejects patches that touch protected blocks", () => {
    expect(() =>
      validatePatchAgainstProtectedBlocks(
        {
          operations: [
            {
              type: "move_protected_block",
              block_id: "recovery-1",
              reason: "Make room for tasks.",
            },
          ],
        },
        ["recovery-1"],
      ),
    ).toThrow("Agent patch cannot modify routine or recovery blocks");
  });

  it("parses non-protected raw patches through the agent patch schema", () => {
    const parsed = validatePatchAgainstProtectedBlocks(
      {
        operations: [
          {
            type: "move_task",
            task_id: "task-1",
            from_date: "2026-06-03",
            from_day_segment: "morning",
            to_date: "2026-06-04",
            to_day_segment: "evening",
            reason: "Protect the recovery block.",
          },
        ],
      },
      ["recovery-1"],
    );

    expect(parsed.operations[0].type).toBe("move_task");
  });
});
