import { beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("@/lib/auth/session", () => ({
  clearWorkspaceSession: vi.fn(),
  getWorkspaceIdFromSession: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

function deleteRequest(confirmation: string) {
  return new Request("http://localhost/api/workspace", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmation }),
  });
}

function mockDb(workspace: { id: string; name: string } | undefined) {
  const limit = vi.fn().mockResolvedValue(workspace ? [workspace] : []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const deleteWhere = vi.fn().mockResolvedValue(undefined);
  const deleteFn = vi.fn(() => ({ where: deleteWhere }));

  return {
    db: { select, delete: deleteFn },
    calls: { select, from, where, limit, deleteFn, deleteWhere },
  };
}

describe("workspace route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires a workspace session", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue(null);
    const { DELETE } = await import("@/app/api/workspace/route");

    const response = await DELETE(deleteRequest("DELETE Focus Lab"));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });

  it("rejects malformed confirmation before opening a database connection", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    const { DELETE } = await import("@/app/api/workspace/route");

    const response = await DELETE(deleteRequest("Focus Lab"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Type DELETE <workspace name> to confirm deletion" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });

  it("rejects confirmation that does not match the current workspace name", async () => {
    const { getWorkspaceIdFromSession, clearWorkspaceSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const { db, calls } = mockDb({ id: "workspace-1", name: "Focus Lab" });
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db as never);
    const { DELETE } = await import("@/app/api/workspace/route");

    const response = await DELETE(deleteRequest("DELETE Other Lab"));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Workspace confirmation does not match" });
    expect(calls.deleteFn).not.toHaveBeenCalled();
    expect(vi.mocked(clearWorkspaceSession)).not.toHaveBeenCalled();
  });

  it("returns not found for a stale workspace session", async () => {
    const { getWorkspaceIdFromSession, clearWorkspaceSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const { db, calls } = mockDb(undefined);
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db as never);
    const { DELETE } = await import("@/app/api/workspace/route");

    const response = await DELETE(deleteRequest("DELETE Focus Lab"));

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "Workspace not found" });
    expect(calls.deleteFn).not.toHaveBeenCalled();
    expect(vi.mocked(clearWorkspaceSession)).not.toHaveBeenCalled();
  });

  it("deletes the current workspace, relies on cascade data cleanup, and clears the session", async () => {
    const { getWorkspaceIdFromSession, clearWorkspaceSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const { db, calls } = mockDb({ id: "workspace-1", name: "Focus Lab" });
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(getDb).mockReturnValue(db as never);
    const { DELETE } = await import("@/app/api/workspace/route");

    const response = await DELETE(deleteRequest("DELETE Focus Lab"));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ deleted: true });
    expect(calls.deleteFn).toHaveBeenCalledTimes(1);
    expect(calls.deleteWhere).toHaveBeenCalledTimes(1);
    expect(vi.mocked(clearWorkspaceSession)).toHaveBeenCalledTimes(1);
  });
});
