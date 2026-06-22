import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({
  getWorkspaceIdFromSession: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

const inviteRow = {
  id: "invite-1",
  label: "Alice",
  codeHash: "hash",
  maxRedemptions: 1,
  redemptionCount: 0,
  expiresAt: new Date("2026-07-22T00:00:00.000Z"),
  disabledAt: null,
  createdAt: new Date("2026-06-22T00:00:00.000Z"),
};

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/admin/invites", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockAdminDb() {
  const inviteRows = [inviteRow];
  const workspaceRows = [
    {
      workspaceId: "workspace-1",
      workspaceName: "Alice Plan",
      workspaceCreatedAt: new Date("2026-06-22T01:00:00.000Z"),
      inviteLabel: "Alice",
      inviteMaxRedemptions: 1,
      inviteRedemptionCount: 1,
      inviteExpiresAt: new Date("2026-07-22T00:00:00.000Z"),
      inviteDisabledAt: null,
    },
  ];
  const orderBy = vi.fn()
    .mockResolvedValueOnce(inviteRows)
    .mockResolvedValueOnce(workspaceRows);
  const leftJoin2 = vi.fn(() => ({ orderBy }));
  const leftJoin1 = vi.fn(() => ({ leftJoin: leftJoin2 }));
  const from = vi.fn(() => ({ orderBy, leftJoin: leftJoin1 }));
  const select = vi.fn(() => ({ from }));
  const insertReturning = vi.fn().mockResolvedValue([inviteRow]);
  const values = vi.fn(() => ({ returning: insertReturning }));
  const insert = vi.fn(() => ({ values }));
  const updateReturning = vi.fn().mockResolvedValue([{ ...inviteRow, disabledAt: new Date("2026-06-22T02:00:00.000Z") }]);
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const set = vi.fn(() => ({ where: updateWhere }));
  const update = vi.fn(() => ({ set }));

  return { select, insert, update, calls: { select, insert, values, update, set } };
}

describe("admin invites route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.PAWPLAN_ADMIN_WORKSPACE_IDS = "owner-workspace";
    process.env.PAWPLAN_APP_URL = "https://pawplan.example";
  });

  it("rejects non-owner workspaces before opening the database", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("guest-workspace");
    const { GET } = await import("@/app/api/admin/invites/route");

    const response = await GET(new Request("http://localhost/api/admin/invites"));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Forbidden" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });

  it("lists invites and created workspaces for an owner workspace", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("owner-workspace");
    vi.mocked(getDb).mockReturnValue(mockAdminDb() as never);
    const { GET } = await import("@/app/api/admin/invites/route");

    const response = await GET(new Request("http://localhost/api/admin/invites"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.inviteUrlBase).toBe("https://pawplan.example/join");
    expect(body.invites[0]).toMatchObject({ id: "invite-1", label: "Alice", maxRedemptions: 1 });
    expect(body.workspaces[0]).toMatchObject({ workspaceId: "workspace-1", workspaceName: "Alice Plan", inviteLabel: "Alice" });
    expect(JSON.stringify(body)).not.toContain("hash");
  });

  it("creates a one-person invite link for an owner workspace", async () => {
    const { getWorkspaceIdFromSession } = await import("@/lib/auth/session");
    const { getDb } = await import("@/lib/db/client");
    const db = mockAdminDb();
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("owner-workspace");
    vi.mocked(getDb).mockReturnValue(db as never);
    const { POST } = await import("@/app/api/admin/invites/route");

    const response = await POST(jsonRequest({ label: "Alice", maxRedemptions: 1, expiresInDays: 30 }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.invite).toMatchObject({ id: "invite-1", label: "Alice" });
    expect(body.invite.inviteUrl).toMatch(/^https:\/\/pawplan\.example\/join\/PAW-/);
    expect(db.calls.values.mock.calls[0][0]).toMatchObject({ label: "Alice", maxRedemptions: 1 });
  });
});
