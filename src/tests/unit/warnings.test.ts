import { describe, expect, it } from "vitest";
import { buildWarnings } from "@/lib/planning/warnings";

describe("warnings", () => {
  it("returns inbox, checkin, and recovery warnings in priority order", () => {
    const warnings = buildWarnings({
      inboxCount: 11,
      hadYesterdayCheckin: false,
      recoveryMinutesThisWeek: 60,
      recoveryTargetMinutes: 180,
    });

    expect(warnings.map((warning) => warning.code)).toEqual([
      "inbox_pileup",
      "missing_checkin",
      "low_recovery",
    ]);
  });

  it("does not warn when inputs are within thresholds", () => {
    const warnings = buildWarnings({
      inboxCount: 10,
      hadYesterdayCheckin: true,
      recoveryMinutesThisWeek: 180,
      recoveryTargetMinutes: 180,
    });

    expect(warnings).toEqual([]);
  });
});
