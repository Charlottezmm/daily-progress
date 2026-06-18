import { describe, expect, it } from "vitest";
import { formatTodayGreeting } from "@/components/today-view";

describe("today greeting date label", () => {
  it("uses deterministic spacing across server and WebKit hydration", () => {
    expect(formatTodayGreeting(new Date("2026-06-18T04:00:00.000Z"))).toBe("6月18日 星期四");
  });
});
