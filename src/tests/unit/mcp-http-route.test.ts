import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => ({})),
}));

vi.mock("@/lib/mcp/tokens", () => ({
  verifyMcpBearerToken: vi.fn(),
  McpTokenError: class McpTokenError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
}));

vi.mock("@/lib/mcp/server-builder", () => ({
  createPawPlanMcpServer: vi.fn(() => ({
    connect: vi.fn(),
  })),
}));

describe("hosted MCP route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("requires bearer token", async () => {
    const { POST } = await import("@/app/api/mcp/route");

    const response = await POST(new Request("https://pawplan.test/api/mcp", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Missing MCP bearer token" });
  });

  it("rejects invalid bearer tokens", async () => {
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue(null);
    const { POST } = await import("@/app/api/mcp/route");

    const response = await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_live_bad" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(response.status).toBe(401);
  });

  it("resolves bearer token before building MCP server", async () => {
    const { createPawPlanMcpServer } = await import("@/lib/mcp/server-builder");
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue({
      workspaceId: "workspace-1",
      permission: "read_write",
      tokenId: "token-1",
    });
    const { POST } = await import("@/app/api/mcp/route");

    await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_live_secret" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(createPawPlanMcpServer).toHaveBeenCalledWith({ workspaceId: "workspace-1", permission: "read_write" });
  });

  it("passes read-only bearer permissions to the shared MCP server builder", async () => {
    const { createPawPlanMcpServer } = await import("@/lib/mcp/server-builder");
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue({
      workspaceId: "workspace-1",
      permission: "read_only",
      tokenId: "token-1",
    });
    const { POST } = await import("@/app/api/mcp/route");

    await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_live_secret" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(createPawPlanMcpServer).toHaveBeenCalledWith({ workspaceId: "workspace-1", permission: "read_only" });
  });
});
