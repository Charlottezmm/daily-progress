import { describe, expect, it } from "vitest";
import {
  createWorkspaceSessionValue,
  parseWorkspaceSessionValue,
  workspaceSessionMaxAgeSeconds,
  workspaceSessionCookieName,
} from "@/lib/auth/session";

describe("workspace session", () => {
  it("uses a stable cookie name", () => {
    expect(workspaceSessionCookieName).toBe("daily_progress_workspace");
  });

  it("keeps web sessions across browser restarts for 30 days", () => {
    expect(workspaceSessionMaxAgeSeconds).toBe(60 * 60 * 24 * 30);
  });

  it("signs and verifies workspace session values", () => {
    process.env.APP_SECRET = "test-secret";

    const value = createWorkspaceSessionValue("workspace-1");

    expect(parseWorkspaceSessionValue(value)).toBe("workspace-1");
    expect(parseWorkspaceSessionValue("workspace-2." + value.split(".")[1])).toBeNull();
  });
});
