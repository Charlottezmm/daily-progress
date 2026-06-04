import { describe, expect, it } from "vitest";
import {
  createWorkspaceSessionValue,
  parseWorkspaceSessionValue,
  workspaceSessionCookieName,
} from "@/lib/auth/session";

describe("workspace session", () => {
  it("uses a stable cookie name", () => {
    expect(workspaceSessionCookieName).toBe("daily_progress_workspace");
  });

  it("signs and verifies workspace session values", () => {
    process.env.APP_SECRET = "test-secret";

    const value = createWorkspaceSessionValue("workspace-1");

    expect(parseWorkspaceSessionValue(value)).toBe("workspace-1");
    expect(parseWorkspaceSessionValue("workspace-2." + value.split(".")[1])).toBeNull();
  });
});
