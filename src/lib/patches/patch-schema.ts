import { z } from "zod";

const daySegmentSchema = z.enum(["morning", "afternoon", "evening"]);
const prioritySchema = z.enum(["low", "normal", "high", "urgent"]);

const moveTaskSchema = z.object({
  type: z.literal("move_task"),
  task_id: z.string(),
  from_date: z.string(),
  from_day_segment: daySegmentSchema,
  to_date: z.string(),
  to_day_segment: daySegmentSchema,
  reason: z.string(),
});

const splitTaskSchema = z.object({
  type: z.literal("split_task"),
  task_id: z.string(),
  new_tasks: z.array(
    z.object({
      title: z.string(),
      estimated_minutes: z.number().int().positive(),
      day_segment: daySegmentSchema,
    }),
  ),
  reason: z.string(),
});

const deferTaskSchema = z.object({
  type: z.literal("defer_task"),
  task_id: z.string(),
  target_week_or_date: z.string(),
  reason: z.string(),
});

const moveToBacklogSchema = z.object({
  type: z.literal("move_to_backlog"),
  task_id: z.string(),
  reason: z.string(),
});

const changePrioritySchema = z.object({
  type: z.literal("change_priority"),
  task_id: z.string(),
  from_priority: prioritySchema,
  to_priority: prioritySchema,
  reason: z.string(),
});

const suggestMilestoneChangeSchema = z.object({
  type: z.literal("suggest_milestone_change"),
  milestone_id: z.string(),
  proposed_text: z.string(),
  reason: z.string(),
});

const moveProtectedBlockSchema = z.object({
  type: z.literal("move_protected_block"),
  block_id: z.string(),
  reason: z.string(),
});

export const agentPatchSchema = z.object({
  operations: z.array(
    z.union([
      moveTaskSchema,
      splitTaskSchema,
      deferTaskSchema,
      moveToBacklogSchema,
      changePrioritySchema,
      suggestMilestoneChangeSchema,
    ]),
  ),
});

export type AgentPatch = z.infer<typeof agentPatchSchema>;

export function validatePatchAgainstProtectedBlocks(
  rawPatch: unknown,
  protectedBlockIds: string[],
): AgentPatch {
  const raw = z.object({ operations: z.array(z.unknown()) }).parse(rawPatch);

  for (const operation of raw.operations) {
    const parsed = moveProtectedBlockSchema.safeParse(operation);
    if (parsed.success && protectedBlockIds.includes(parsed.data.block_id)) {
      throw new Error("Agent patch cannot modify routine or recovery blocks");
    }
  }

  return agentPatchSchema.parse(rawPatch);
}
