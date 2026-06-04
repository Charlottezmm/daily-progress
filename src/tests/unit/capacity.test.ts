import { describe, expect, it } from "vitest";
import { calculateRemainingCapacity } from "@/lib/planning/capacity";

describe("capacity", () => {
  it("subtracts tasks and blocks from segment capacity", () => {
    const result = calculateRemainingCapacity({
      base: { morning: 180, afternoon: 240, evening: 120 },
      tasks: [{ segment: "morning", minutes: 60 }],
      blocks: [
        { segment: "morning", minutes: 30, kind: "routine" },
        { segment: "evening", minutes: 90, kind: "recovery" },
      ],
    });

    expect(result).toEqual({ morning: 90, afternoon: 240, evening: 30 });
  });

  it("does not return negative remaining capacity", () => {
    const result = calculateRemainingCapacity({
      base: { morning: 30, afternoon: 30, evening: 30 },
      tasks: [{ segment: "morning", minutes: 45 }],
      blocks: [
        { segment: "afternoon", minutes: 60, kind: "meeting" },
        { segment: "evening", minutes: 30, kind: "unavailable" },
      ],
    });

    expect(result).toEqual({ morning: 0, afternoon: 0, evening: 0 });
  });
});
