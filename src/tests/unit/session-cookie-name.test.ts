import { describe, expect, it } from "vitest";
import { workspaceSessionCookieName } from "@/lib/auth/session";

describe("workspace session", () => {
  it("uses a stable cookie name", () => {
    expect(workspaceSessionCookieName).toBe("daily_progress_workspace");
  });
});
