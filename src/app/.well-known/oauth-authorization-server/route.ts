export const dynamic = "force-dynamic";

function originFrom(request: Request) {
  return new URL(request.url).origin;
}

export async function GET(request: Request) {
  const origin = originFrom(request);
  return Response.json({
    issuer: origin,
    authorization_endpoint: new URL("/api/oauth/authorize", origin).toString(),
    token_endpoint: new URL("/api/oauth/token", origin).toString(),
    registration_endpoint: new URL("/api/oauth/register", origin).toString(),
    revocation_endpoint: new URL("/api/oauth/revoke", origin).toString(),
    scopes_supported: ["mcp"],
    code_challenge_methods_supported: ["S256"],
    grant_types_supported: ["authorization_code"],
    response_types_supported: ["code"],
    token_endpoint_auth_methods_supported: ["none"],
  });
}
