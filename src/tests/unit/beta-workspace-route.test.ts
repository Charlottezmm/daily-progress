import bcrypt from "bcryptjs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInviteCode } from "@/lib/beta/invites";

vi.mock("@/lib/auth/session", () => ({
  setWorkspaceSession: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

const workspace = {
  id: "workspace-1",
  name: "Focus Lab",
  passwordHash: "hash",
  createdAt: new Date("2026-06-13T08:00:00.000Z"),
  updatedAt: new Date("2026-06-13T08:00:00.000Z"),
};

const invite = {
  id: "invite-1",
  codeHash: hashInviteCode("BETA-123"),
  label: "Founding beta",
  maxRedemptions: 3,
  redemptionCount: 0,
  expiresAt: null,
  disabledAt: null,
  createdAt: new Date("2026-06-13T08:00:00.000Z"),
};

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockBetaDb(options: {
  existingWorkspace?: typeof workspace;
  inviteRow?: typeof invite;
  inviteRedeemed?: boolean;
  workspaceInsertError?: unknown;
} = {}) {
  const insertRows = [
    [{ ...workspace, passwordHash: "created-hash" }],
    [{ id: "plan-1" }],
    [{ id: "version-1" }],
  ];
  const selectRows = [
    options.existingWorkspace ? [options.existingWorkspace] : [],
    options.inviteRow ? [options.inviteRow] : [],
  ];
  const inserted: Array<{ table: unknown; values: unknown }> = [];
  const updates: unknown[] = [];
  const limit = vi.fn().mockImplementation(async () => selectRows.shift() ?? []);
  const where = vi.fn(() => ({ limit }));
  const from = vi.fn(() => ({ where }));
  const select = vi.fn(() => ({ from }));
  const insertReturning = vi.fn().mockImplementation(async () => {
    if (insertReturning.mock.calls.length === 1 && options.workspaceInsertError) throw options.workspaceInsertError;
    return insertRows.shift() ?? [];
  });
  const insertValues = vi.fn((values: unknown) => {
    inserted.push({ table: currentInsertTable, values });
    return { returning: insertReturning };
  });
  let currentInsertTable: unknown = null;
  const insert = vi.fn((table: unknown) => {
    currentInsertTable = table;
    return { values: insertValues };
  });
  const updateReturning = vi.fn().mockImplementation(async () => {
    if (!options.inviteRow) return [];
    return options.inviteRedeemed === false
      ? []
      : [{ ...options.inviteRow, redemptionCount: options.inviteRow.redemptionCount + 1 }];
  });
  const updateWhere = vi.fn(() => ({ returning: updateReturning }));
  const updateSet = vi.fn((values: unknown) => {
    updates.push(values);
    return { where: updateWhere };
  });
  const update = vi.fn(() => ({ set: updateSet }));
  const tx = { select, insert, update };
  const transaction = vi.fn(async (callback: (transactionDb: typeof tx) => unknown) => callback(tx));

  return {
    db: { transaction },
    calls: { transaction, select, insert, insertValues, insertReturning, update, updateSet, updateReturning },
    records: { inserted, updates },
  };
}

describe("public beta workspace route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("creates a workspace with starter plan data, redeems the invite, and never returns the raw invite code", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { setWorkspaceSession } = await import("@/lib/auth/session");
    const { db, records } = mockBetaDb({ inviteRow: invite });
    vi.mocked(getDb).mockReturnValue(db as never);
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "BETA-123",
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toEqual({ workspaceId: "workspace-1", planId: "plan-1", created: true });
    expect(JSON.stringify(body)).not.toContain("BETA-123");
    expect(records.inserted).toHaveLength(5);
    expect(records.updates).toHaveLength(2);
    expect(vi.mocked(setWorkspaceSession)).toHaveBeenCalledWith("workspace-1");
  });

  it("returns 403 for an expired invite code", async () => {
    const { getDb } = await import("@/lib/db/client");
    const hashSpy = vi.spyOn(bcrypt, "hash");
    vi.mocked(getDb).mockReturnValue(mockBetaDb({
      inviteRow: { ...invite, expiresAt: new Date("2020-01-01T00:00:00.000Z") },
    }).db as never);
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "BETA-123",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invite code expired" });
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it("returns 403 for a disabled invite code", async () => {
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(mockBetaDb({
      inviteRow: { ...invite, disabledAt: new Date("2026-06-12T00:00:00.000Z") },
    }).db as never);
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "BETA-123",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invite code disabled" });
  });

  it("returns 403 for an exhausted invite code", async () => {
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(mockBetaDb({
      inviteRow: { ...invite, maxRedemptions: 1, redemptionCount: 1 },
    }).db as never);
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "BETA-123",
    }));

    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Invite code exhausted" });
  });

  it("suffixes duplicate workspace names before creating the workspace", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { db, records } = mockBetaDb({ existingWorkspace: workspace, inviteRow: invite });
    vi.mocked(getDb).mockReturnValue(db as never);
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "BETA-123",
    }));

    expect(response.status).toBe(201);
    expect(records.inserted[0].values).toEqual(expect.objectContaining({ name: "Focus Lab 2" }));
  });

  it("rejects oversized or unsafe beta invite payloads before database or bcrypt work", async () => {
    const { getDb } = await import("@/lib/db/client");
    const hashSpy = vi.spyOn(bcrypt, "hash");
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "bad code!",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid beta workspace payload" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
    expect(hashSpy).not.toHaveBeenCalled();
  });

  it("maps a raced workspace unique violation to duplicate workspace instead of 500", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { setWorkspaceSession } = await import("@/lib/auth/session");
    const uniqueError = Object.assign(new Error("duplicate key value violates unique constraint"), {
      code: "23505",
      constraint: "workspaces_name_unique",
    });
    const { db } = mockBetaDb({ inviteRow: invite, workspaceInsertError: uniqueError });
    vi.mocked(getDb).mockReturnValue(db as never);
    const { POST } = await import("@/app/api/beta/workspaces/route");

    const response = await POST(jsonRequest("http://localhost/api/beta/workspaces", {
      workspaceName: "Focus Lab",
      password: "correct horse",
      inviteCode: "BETA-123",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Workspace name is unavailable; try again" });
    expect(vi.mocked(setWorkspaceSession)).not.toHaveBeenCalled();
  });
});

describe("login route after public beta split", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it("returns 401 when the workspace does not exist", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { setWorkspaceSession } = await import("@/lib/auth/session");
    const limit = vi.fn().mockResolvedValue([]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    vi.mocked(getDb).mockReturnValue({ select } as never);
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(jsonRequest("http://localhost/api/auth/login", {
      workspaceName: "Missing Lab",
      password: "correct horse",
    }));

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Workspace not found" });
    expect(vi.mocked(setWorkspaceSession)).not.toHaveBeenCalled();
  });

  it("keeps existing workspace login working with the correct password", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { setWorkspaceSession } = await import("@/lib/auth/session");
    const passwordHash = await bcrypt.hash("correct horse", 4);
    const limit = vi.fn().mockResolvedValue([{ ...workspace, passwordHash }]);
    const where = vi.fn(() => ({ limit }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    vi.mocked(getDb).mockReturnValue({ select } as never);
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(jsonRequest("http://localhost/api/auth/login", {
      workspaceName: "Focus Lab",
      password: "correct horse",
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ workspaceId: "workspace-1", created: false });
    expect(vi.mocked(setWorkspaceSession)).toHaveBeenCalledWith("workspace-1");
  });

  it("rejects oversized login payloads before opening a database connection", async () => {
    const { getDb } = await import("@/lib/db/client");
    const { POST } = await import("@/app/api/auth/login/route");

    const response = await POST(jsonRequest("http://localhost/api/auth/login", {
      workspaceName: "a".repeat(121),
      password: "correct horse",
    }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Invalid login payload" });
    expect(vi.mocked(getDb)).not.toHaveBeenCalled();
  });
});
