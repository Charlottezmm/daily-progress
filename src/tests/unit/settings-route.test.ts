import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getWorkspaceIdFromSession: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

describe("settings route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("rejects recovery target updates instead of pretending to save them", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    const { PATCH } = await import("@/app/api/settings/route");

    const response = await PATCH(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_recovery_target", minutes: 420 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "Recovery target is not configurable yet" });
  });

  it("rejects recovery target updates before opening a database connection", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockImplementation(() => {
      throw new Error("DATABASE_URL is required");
    });
    const { PATCH } = await import("@/app/api/settings/route");

    const response = await PATCH(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "set_recovery_target", minutes: 420 }),
      }),
    );

    expect(response.status).toBe(400);
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });
});
