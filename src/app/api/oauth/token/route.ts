import { NextResponse } from "next/server";
import { getDb } from "@/lib/db/client";
import { exchangeAuthorizationCode, OAuthConnectorError } from "@/lib/oauth/connector-auth";

export const dynamic = "force-dynamic";

async function formParams(request: Request) {
  const contentType = (request.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
  if (contentType.includes("application/json")) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new OAuthConnectorError("Malformed token request body", 400, "invalid_request");
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new OAuthConnectorError("Malformed token request body", 400, "invalid_request");
    }
    return new Map(Object.entries(body as Record<string, string>));
  }
  if (contentType === "application/x-www-form-urlencoded") {
    return new Map(new URLSearchParams(await request.text()).entries());
  }
  throw new OAuthConnectorError("Unsupported token request content type", 400, "invalid_request");
}

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json({ error, error_description: description }, { status });
}

export async function POST(request: Request) {
  let params: Map<string, string>;
  try {
    params = await formParams(request);
  } catch (error) {
    if (error instanceof OAuthConnectorError) {
      return oauthError(error.oauthError, error.message, error.status);
    }
    return oauthError("invalid_request", "Malformed token request body");
  }
  const grantType = params.get("grant_type");
  const code = params.get("code");
  const clientId = params.get("client_id");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  if (grantType !== "authorization_code") return oauthError("unsupported_grant_type", "grant_type must be authorization_code");
  if (!code) return oauthError("invalid_request", "code is required");
  if (!clientId) return oauthError("invalid_request", "client_id is required");
  if (!redirectUri) return oauthError("invalid_request", "redirect_uri is required");
  if (!codeVerifier) return oauthError("invalid_request", "code_verifier is required");

  try {
    const result = await exchangeAuthorizationCode(getDb(), { code, clientId, redirectUri, codeVerifier });
    return NextResponse.json({
      access_token: result.accessToken,
      token_type: result.tokenType,
      expires_in: result.expiresIn,
      scope: result.scope,
    });
  } catch (error) {
    if (error instanceof OAuthConnectorError) {
      return oauthError(error.oauthError, error.message, error.status);
    }
    return oauthError("server_error", "Token exchange failed", 500);
  }
}
