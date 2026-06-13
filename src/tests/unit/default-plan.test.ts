import { describe, expect, it } from "vitest";
import { buildDefaultPlanValues } from "@/lib/workspaces/default-plan";

describe("default workspace plan", () => {
  it("creates a bounded active starter plan for new workspaces", () => {
    const values = buildDefaultPlanValues("workspace-1", new Date("2026-06-06T08:00:00.000Z"));

    expect(values.plan.workspaceId).toBe("workspace-1");
    expect(values.plan.title).toBe("Starter Plan");
    expect(values.plan.status).toBe("active");
    expect(values.version.versionNumber).toBe(1);
    expect(values.version.source).toBe("baseline");
    expect(values.changeLog.source).toBe("import");
  });
});
