import { beforeEach, describe, expect, it, vi } from "vitest";

const handleRequestMock = vi.hoisted(() => vi.fn(() => Response.json({ ok: true })));

vi.mock("@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js", () => ({
  WebStandardStreamableHTTPServerTransport: vi.fn(() => ({
    handleRequest: handleRequestMock,
  })),
}));

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

vi.mock("@/lib/oauth/connector-auth", () => ({
  verifyConnectorAccessToken: vi.fn(),
}));

vi.mock("@/lib/mcp/server-builder", () => ({
  createPawPlanMcpServer: vi.fn(() => ({
    connect: vi.fn(),
  })),
}));

vi.mock("@/lib/mcp/usage", () => ({
  McpUsageLimitError: class McpUsageLimitError extends Error {
    status = 429;
  },
  assertHostedMcpWriteAllowed: vi.fn(),
  extractMcpUsageToolName: vi.fn((payload) =>
    payload?.method === "tools/call" ? payload.params?.name ?? "tools/call" : payload?.method ?? "unknown",
  ),
  recordHostedMcpUsage: vi.fn(),
}));

describe("hosted MCP route", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    handleRequestMock.mockResolvedValue(Response.json({ ok: true }));
  });

  it("requires bearer token", async () => {
    const { POST } = await import("@/app/api/mcp/route");

    const response = await POST(new Request("https://pawplan.test/api/mcp", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body).toEqual({ error: "Missing MCP bearer token" });
    expect(response.headers.get("www-authenticate")).toContain(
      'resource_metadata="https://pawplan.test/.well-known/oauth-protected-resource/api/mcp"',
    );
  });

  it("rejects invalid bearer tokens", async () => {
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    const { verifyConnectorAccessToken } = await import("@/lib/oauth/connector-auth");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue(null);
    vi.mocked(verifyConnectorAccessToken).mockResolvedValue(null);
    const { POST } = await import("@/app/api/mcp/route");

    const response = await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_live_bad" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"');
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

  it("enforces the hosted daily write cap before write tool calls", async () => {
    const { assertHostedMcpWriteAllowed } = await import("@/lib/mcp/usage");
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
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_checkin", arguments: { completed_text: "Shipped audit." } },
        }),
      }),
    );

    expect(assertHostedMcpWriteAllowed).toHaveBeenCalledWith(
      {},
      expect.objectContaining({ workspaceId: "workspace-1", toolName: "create_checkin" }),
    );
  });

  it("records hosted MCP usage after authenticated requests", async () => {
    const { recordHostedMcpUsage } = await import("@/lib/mcp/usage");
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

    expect(recordHostedMcpUsage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workspaceId: "workspace-1",
        tokenId: "token-1",
        toolName: "tools/list",
        permission: "read_only",
        success: true,
      }),
    );
  });

  it("records JSON-RPC error responses as failed usage even when HTTP status is 200", async () => {
    const { recordHostedMcpUsage } = await import("@/lib/mcp/usage");
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue({
      workspaceId: "workspace-1",
      permission: "read_write",
      tokenId: "token-1",
    });
    handleRequestMock.mockResolvedValue(
      Response.json({
        jsonrpc: "2.0",
        id: 1,
        error: { code: -32603, message: "Tool failed" },
      }),
    );
    const { POST } = await import("@/app/api/mcp/route");

    await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_live_secret" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: { name: "create_checkin", arguments: { completed_text: "Will fail." } },
        }),
      }),
    );

    expect(recordHostedMcpUsage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workspaceId: "workspace-1",
        tokenId: "token-1",
        toolName: "create_checkin",
        permission: "read_write",
        success: false,
      }),
    );
  });

  it("accepts OAuth connector access tokens and builds the shared MCP server with workspace permission", async () => {
    const { createPawPlanMcpServer } = await import("@/lib/mcp/server-builder");
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    const { verifyConnectorAccessToken } = await import("@/lib/oauth/connector-auth");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue(null);
    vi.mocked(verifyConnectorAccessToken).mockResolvedValue({
      workspaceId: "workspace-1",
      permission: "read_write",
      tokenId: "authorization-1",
      kind: "oauth_connector",
    });
    const { POST } = await import("@/app/api/mcp/route");

    await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_oauth_access_secret" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(createPawPlanMcpServer).toHaveBeenCalledWith({ workspaceId: "workspace-1", permission: "read_write" });
  });

  it("keeps connector usage audit without writing a connector id into the MCP token foreign key", async () => {
    const { recordHostedMcpUsage } = await import("@/lib/mcp/usage");
    const { verifyMcpBearerToken } = await import("@/lib/mcp/tokens");
    const { verifyConnectorAccessToken } = await import("@/lib/oauth/connector-auth");
    vi.mocked(verifyMcpBearerToken).mockResolvedValue(null);
    vi.mocked(verifyConnectorAccessToken).mockResolvedValue({
      workspaceId: "workspace-1",
      permission: "read_only",
      tokenId: "authorization-1",
      kind: "oauth_connector",
    });
    const { POST } = await import("@/app/api/mcp/route");

    await POST(
      new Request("https://pawplan.test/api/mcp", {
        method: "POST",
        headers: { Authorization: "Bearer pwp_oauth_access_secret" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
      }),
    );

    expect(recordHostedMcpUsage).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        workspaceId: "workspace-1",
        tokenId: null,
        permission: "read_only",
        success: true,
      }),
    );
  });
});
