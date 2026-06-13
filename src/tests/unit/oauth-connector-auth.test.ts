import { getTableName } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createWorkspaceSessionValue, workspaceSessionCookieName } from "@/lib/auth/session";

type Row = Record<string, any>;

function createFakeDb(options: { selectRows?: Row[] | Row[][]; updateRows?: Row[] | Row[][] } = {}) {
  const inserts: Array<{ table: string; values: Row }> = [];
  const updates: Array<{ table: string; values: Row }> = [];
  const selectRows = Array.isArray(options.selectRows?.[0])
    ? ([...(options.selectRows as Row[][])] as Row[][])
    : [((options.selectRows as Row[]) ?? [])];
  const updateRows = Array.isArray(options.updateRows?.[0])
    ? ([...(options.updateRows as Row[][])] as Row[][])
    : options.updateRows
      ? [options.updateRows as Row[]]
      : null;

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  function nextRows() {
    return selectRows.length > 1 ? selectRows.shift() ?? [] : selectRows[0] ?? [];
  }

  function nextUpdateRows(defaultRows: Row[]) {
    if (!updateRows) return defaultRows;
    return updateRows.length > 1 ? updateRows.shift() ?? [] : updateRows[0] ?? [];
  }

  return {
    inserts,
    updates,
    select() {
      return {
        from() {
          return {
            where() {
              const rows = nextRows();
              return {
                limit(count: number) {
                  return Promise.resolve(rows.slice(0, count));
                },
                orderBy() {
                  return Promise.resolve(rows);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Row) {
          inserts.push({ table: tableName(table), values });
          return {
            returning() {
              return Promise.resolve([{ id: `${tableName(table)}-1`, createdAt: new Date("2026-06-13T00:00:00.000Z"), ...values }]);
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Row) {
          updates.push({ table: tableName(table), values });
          return {
            where() {
              return {
                returning() {
                  return Promise.resolve(nextUpdateRows([{ id: `${tableName(table)}-1`, ...values }]));
                },
              };
            },
          };
        },
      };
    },
  };
}

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(),
}));

describe("OAuth connector auth", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    process.env.APP_SECRET = "test-secret";
  });

  it("registers a dynamic client without returning a raw client secret", async () => {
    const db = createFakeDb();
    const { registerOAuthClient } = await import("@/lib/oauth/connector-auth");

    const client = await registerOAuthClient(db, {
      clientName: "Claude",
      redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
    });

    expect(client.clientId).toMatch(/^pwp_oauth_client_/);
    expect(client.clientSecret).toBeUndefined();
    expect(db.inserts[0]).toEqual(
      expect.objectContaining({
        table: "oauth_clients",
        values: expect.objectContaining({
          clientId: client.clientId,
          clientName: "Claude",
          redirectUris: ["https://claude.ai/api/mcp/auth_callback"],
        }),
      }),
    );
  });

  it("rejects dynamic registration with non-Claude redirect uris", async () => {
    const db = createFakeDb();
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(db);
    const { POST } = await import("@/app/api/oauth/register/route");

    const response = await POST(
      new Request("https://pawplan.test/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Malicious",
          redirect_uris: ["https://evil.example/callback"],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "invalid_client_metadata", error_description: "redirect_uri is not allowed" });
    expect(db.inserts).toHaveLength(0);
  });

  it("rejects unsupported dynamic registration metadata instead of silently overriding it", async () => {
    const db = createFakeDb();
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(db);
    const { POST } = await import("@/app/api/oauth/register/route");

    const response = await POST(
      new Request("https://pawplan.test/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          grant_types: ["client_credentials"],
        }),
      }),
    );

    expect(response.status).toBe(400);
    expect(db.inserts).toHaveLength(0);
  });

  it("stores only an authorization code hash", async () => {
    const db = createFakeDb();
    const { createAuthorizationCode } = await import("@/lib/oauth/connector-auth");

    const result = await createAuthorizationCode(db, {
      workspaceId: "workspace-1",
      clientId: "client-1",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: "challenge",
      codeChallengeMethod: "S256",
      scope: "mcp",
    });

    expect(result.code).toMatch(/^pwp_oauth_code_/);
    expect(db.inserts[0].table).toBe("oauth_authorization_codes");
    expect(db.inserts[0].values.codeHash).toEqual(expect.any(String));
    expect(JSON.stringify(db.inserts[0].values)).not.toContain(result.code);
  });

  it("exchanges an authorization code only with matching PKCE, client, and redirect uri", async () => {
    const { createAuthorizationCode, exchangeAuthorizationCode } = await import("@/lib/oauth/connector-auth");
    const created = await createAuthorizationCode(createFakeDb(), {
      workspaceId: "workspace-1",
      clientId: "client-1",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      codeChallengeMethod: "S256",
      scope: "mcp",
    });
    const db = createFakeDb({
      selectRows: [
        {
          id: "code-1",
          workspaceId: "workspace-1",
          clientId: "client-1",
          redirectUri: "https://claude.ai/callback",
          codeHash: created.codeHash,
          codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          codeChallengeMethod: "S256",
          scope: "mcp",
          permission: "read_write",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        },
      ],
    });

    const result = await exchangeAuthorizationCode(db, {
      code: created.code,
      clientId: "client-1",
      redirectUri: "https://claude.ai/callback",
      codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
    });

    expect(result.accessToken).toMatch(/^pwp_oauth_access_/);
    expect(db.updates[0]).toEqual(expect.objectContaining({ table: "oauth_authorization_codes" }));
    expect(db.inserts[0]).toEqual(
      expect.objectContaining({
        table: "claude_connector_authorizations",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          clientId: "client-1",
          permission: "read_write",
          accessTokenHash: expect.any(String),
        }),
      }),
    );
    expect(JSON.stringify(db.inserts[0].values)).not.toContain(result.accessToken);
  });

  it("does not mint an access token if the consumed update races and returns no rows", async () => {
    const { createAuthorizationCode, exchangeAuthorizationCode } = await import("@/lib/oauth/connector-auth");
    const created = await createAuthorizationCode(createFakeDb(), {
      workspaceId: "workspace-1",
      clientId: "client-1",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      codeChallengeMethod: "S256",
      scope: "mcp",
    });
    const db = createFakeDb({
      selectRows: [
        {
          id: "code-1",
          workspaceId: "workspace-1",
          clientId: "client-1",
          redirectUri: "https://claude.ai/callback",
          codeHash: created.codeHash,
          codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
          codeChallengeMethod: "S256",
          scope: "mcp",
          permission: "read_write",
          expiresAt: new Date(Date.now() + 60_000),
          consumedAt: null,
        },
      ],
      updateRows: [],
    });

    await expect(
      exchangeAuthorizationCode(db, {
        code: created.code,
        clientId: "client-1",
        redirectUri: "https://claude.ai/callback",
        codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
      }),
    ).rejects.toThrow("Authorization code has already been used");

    expect(db.inserts.filter((insert) => insert.table === "claude_connector_authorizations")).toHaveLength(0);
  });

  it("rejects reused or expired authorization codes", async () => {
    const { createAuthorizationCode, exchangeAuthorizationCode } = await import("@/lib/oauth/connector-auth");
    const created = await createAuthorizationCode(createFakeDb(), {
      workspaceId: "workspace-1",
      clientId: "client-1",
      redirectUri: "https://claude.ai/callback",
      codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
      codeChallengeMethod: "S256",
      scope: "mcp",
    });

    await expect(
      exchangeAuthorizationCode(
        createFakeDb({
          selectRows: [
            {
              id: "code-1",
              workspaceId: "workspace-1",
              clientId: "client-1",
              redirectUri: "https://claude.ai/callback",
              codeHash: created.codeHash,
              codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
              codeChallengeMethod: "S256",
              scope: "mcp",
              permission: "read_write",
              expiresAt: new Date(Date.now() + 60_000),
              consumedAt: new Date(),
            },
          ],
        }),
        {
          code: created.code,
          clientId: "client-1",
          redirectUri: "https://claude.ai/callback",
          codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        },
      ),
    ).rejects.toThrow("Authorization code has already been used");

    await expect(
      exchangeAuthorizationCode(
        createFakeDb({
          selectRows: [
            {
              id: "code-1",
              workspaceId: "workspace-1",
              clientId: "client-1",
              redirectUri: "https://claude.ai/callback",
              codeHash: created.codeHash,
              codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
              codeChallengeMethod: "S256",
              scope: "mcp",
              permission: "read_write",
              expiresAt: new Date(Date.now() - 60_000),
              consumedAt: null,
            },
          ],
        }),
        {
          code: created.code,
          clientId: "client-1",
          redirectUri: "https://claude.ai/callback",
          codeVerifier: "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk",
        },
      ),
    ).rejects.toThrow("Authorization code has expired");
  });

  it("verifies and revokes connector access tokens", async () => {
    const { hashConnectorToken, verifyConnectorAccessToken, revokeConnectorAuthorization } = await import(
      "@/lib/oauth/connector-auth"
    );
    const rawToken = "pwp_oauth_access_secret";
    const db = createFakeDb({
      selectRows: [
        [
          {
            id: "authorization-1",
            workspaceId: "workspace-1",
            clientId: "client-1",
            accessTokenHash: hashConnectorToken(rawToken),
            permission: "read_write",
            scope: "mcp",
            expiresAt: new Date(Date.now() + 60_000),
            revokedAt: null,
            createdAt: new Date(),
          },
        ],
        [],
      ],
    });

    await expect(verifyConnectorAccessToken(db, rawToken)).resolves.toEqual({
      workspaceId: "workspace-1",
      permission: "read_write",
      tokenId: "authorization-1",
      kind: "oauth_connector",
    });

    await revokeConnectorAuthorization(db, "workspace-1", "authorization-1");
    await expect(verifyConnectorAccessToken(db, rawToken)).resolves.toBeNull();
  });

  it("requires an existing workspace session before issuing an authorization code", async () => {
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(createFakeDb({ selectRows: [{ clientId: "client-1", redirectUris: ["https://claude.ai/callback"] }] }));
    const { GET } = await import("@/app/api/oauth/authorize/route");

    const response = await GET(
      new Request(
        "https://pawplan.test/api/oauth/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcallback&code_challenge=challenge&code_challenge_method=S256",
      ),
    );

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/login");
  });

  it("dynamic client registration stores redirect uris and returns no client secret", async () => {
    const db = createFakeDb();
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(db);
    const { POST } = await import("@/app/api/oauth/register/route");

    const response = await POST(
      new Request("https://pawplan.test/api/oauth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.client_id).toMatch(/^pwp_oauth_client_/);
    expect(body.client_secret).toBeUndefined();
    expect(body.redirect_uris).toEqual(["https://claude.ai/api/mcp/auth_callback"]);
    expect(db.inserts[0]).toEqual(expect.objectContaining({ table: "oauth_clients" }));
  });

  it("token exchange requires a PKCE verifier", async () => {
    const { POST } = await import("@/app/api/oauth/token/route");

    const response = await POST(
      new Request("https://pawplan.test/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code: "pwp_oauth_code_secret",
          client_id: "client-1",
          redirect_uri: "https://claude.ai/callback",
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "invalid_request", error_description: "code_verifier is required" });
  });

  it("token exchange rejects unsupported or malformed request bodies as invalid_request", async () => {
    const { POST } = await import("@/app/api/oauth/token/route");

    const unsupported = await POST(
      new Request("https://pawplan.test/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "grant_type=authorization_code",
      }),
    );
    await expect(unsupported.json()).resolves.toEqual({
      error: "invalid_request",
      error_description: "Unsupported token request content type",
    });

    const malformed = await POST(
      new Request("https://pawplan.test/api/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{",
      }),
    );
    await expect(malformed.json()).resolves.toEqual({
      error: "invalid_request",
      error_description: "Malformed token request body",
    });
  });

  it("authorize rejects registered non-Claude redirects before issuing code", async () => {
    const db = createFakeDb({ selectRows: [{ clientId: "client-1", redirectUris: ["https://evil.example/callback"] }] });
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(db);
    const { GET } = await import("@/app/api/oauth/authorize/route");

    const response = await GET(
      new Request(
        "https://pawplan.test/api/oauth/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fevil.example%2Fcallback&code_challenge=challenge&code_challenge_method=S256",
        {
          headers: {
            Cookie: `${workspaceSessionCookieName}=${createWorkspaceSessionValue("workspace-1")}`,
          },
        },
      ),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({ error: "invalid_request", error_description: "redirect_uri is not allowed" });
    expect(db.inserts).toHaveLength(0);
  });

  it("redirects a signed-in workspace back with code and state", async () => {
    const db = createFakeDb({ selectRows: [{ clientId: "client-1", redirectUris: ["https://claude.ai/callback"] }] });
    const { getDb } = await import("@/lib/db/client");
    vi.mocked(getDb).mockReturnValue(db);
    const { GET } = await import("@/app/api/oauth/authorize/route");

    const response = await GET(
      new Request(
        "https://pawplan.test/api/oauth/authorize?response_type=code&client_id=client-1&redirect_uri=https%3A%2F%2Fclaude.ai%2Fcallback&code_challenge=challenge&code_challenge_method=S256&state=abc",
        {
          headers: {
            Cookie: `${workspaceSessionCookieName}=${createWorkspaceSessionValue("workspace-1")}`,
          },
        },
      ),
    );

    const location = new URL(response.headers.get("location") ?? "");
    expect(response.status).toBe(302);
    expect(location.origin + location.pathname).toBe("https://claude.ai/callback");
    expect(location.searchParams.get("code")).toMatch(/^pwp_oauth_code_/);
    expect(location.searchParams.get("state")).toBe("abc");
  });
});
