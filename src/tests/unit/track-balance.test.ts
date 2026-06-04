import { describe, expect, it } from "vitest";
import { calculateTrackBalance } from "@/lib/planning/track-balance";

describe("track balance", () => {
  it("aggregates minutes by track and rounds percent", () => {
    const result = calculateTrackBalance([
      { trackId: "main", minutes: 120 },
      { trackId: "work", minutes: 60 },
      { trackId: "main", minutes: 60 },
    ]);

    expect(result).toEqual([
      { trackId: "main", minutes: 180, percent: 75 },
      { trackId: "work", minutes: 60, percent: 25 },
    ]);
  });

  it("returns zero percent when total minutes is zero", () => {
    const result = calculateTrackBalance([
      { trackId: "main", minutes: 0 },
      { trackId: "work", minutes: 0 },
    ]);

    expect(result).toEqual([
      { trackId: "main", minutes: 0, percent: 0 },
      { trackId: "work", minutes: 0, percent: 0 },
    ]);
  });
});
