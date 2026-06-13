import { describe, expect, it } from "vitest";

describe("OAuth metadata routes", () => {
  it("returns protected resource metadata for the MCP resource", async () => {
    const { GET } = await import("@/app/.well-known/oauth-protected-resource/api/mcp/route");

    const response = await GET(new Request("https://pawplan.test/.well-known/oauth-protected-resource/api/mcp"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        resource: "https://pawplan.test/api/mcp",
        authorization_servers: ["https://pawplan.test"],
        bearer_methods_supported: ["header"],
      }),
    );
  });

  it("returns authorization server metadata with PKCE S256 support", async () => {
    const { GET } = await import("@/app/.well-known/oauth-authorization-server/route");

    const response = await GET(new Request("https://pawplan.test/.well-known/oauth-authorization-server"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toEqual(
      expect.objectContaining({
        issuer: "https://pawplan.test",
        authorization_endpoint: "https://pawplan.test/api/oauth/authorize",
        token_endpoint: "https://pawplan.test/api/oauth/token",
        registration_endpoint: "https://pawplan.test/api/oauth/register",
        revocation_endpoint: "https://pawplan.test/api/oauth/revoke",
        scopes_supported: ["mcp"],
        code_challenge_methods_supported: ["S256"],
        grant_types_supported: ["authorization_code"],
        response_types_supported: ["code"],
        token_endpoint_auth_methods_supported: ["none"],
      }),
    );
  });
});
