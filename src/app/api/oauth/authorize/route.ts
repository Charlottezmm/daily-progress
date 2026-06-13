import { NextResponse } from "next/server";
import { parseWorkspaceSessionValue, workspaceSessionCookieName } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import {
  createAuthorizationCode,
  findOAuthClient,
  isAllowedClaudeRedirectUri,
  OAuthConnectorError,
} from "@/lib/oauth/connector-auth";

export const dynamic = "force-dynamic";

function workspaceIdFromRequest(request: Request) {
  const cookie = request.headers
    .get("cookie")
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${workspaceSessionCookieName}=`));
  if (!cookie) return null;
  return parseWorkspaceSessionValue(decodeURIComponent(cookie.slice(workspaceSessionCookieName.length + 1)));
}

function oauthRedirect(redirectUri: string, params: Record<string, string | undefined>) {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, { status: 302 });
}

function invalidRequest(message: string) {
  return NextResponse.json({ error: "invalid_request", error_description: message }, { status: 400 });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod = url.searchParams.get("code_challenge_method");
  const scope = url.searchParams.get("scope") || "mcp";
  const state = url.searchParams.get("state") ?? undefined;

  if (responseType !== "code") return invalidRequest("response_type must be code");
  if (!clientId) return invalidRequest("client_id is required");
  if (!redirectUri) return invalidRequest("redirect_uri is required");
  if (!codeChallenge) return invalidRequest("code_challenge is required");
  if (codeChallengeMethod !== "S256") return invalidRequest("code_challenge_method must be S256");

  const workspaceId = workspaceIdFromRequest(request);
  if (!workspaceId) {
    const loginUrl = new URL("/login", url.origin);
    loginUrl.searchParams.set("next", `${url.pathname}${url.search}`);
    return NextResponse.redirect(loginUrl, { status: 302 });
  }

  const db = getDb();
  const client = await findOAuthClient(db, clientId);
  if (!client) return invalidRequest("Unknown client_id");
  if (!isAllowedClaudeRedirectUri(redirectUri)) return invalidRequest("redirect_uri is not allowed");
  if (!client.redirectUris.includes(redirectUri)) {
    return invalidRequest("redirect_uri is not registered");
  }

  try {
    const { code } = await createAuthorizationCode(db, {
      workspaceId,
      clientId,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      scope,
    });
    return oauthRedirect(redirectUri, { code, state });
  } catch (error) {
    if (error instanceof OAuthConnectorError) {
      return oauthRedirect(redirectUri, { error: error.oauthError, error_description: error.message, state });
    }
    return oauthRedirect(redirectUri, { error: "server_error", state });
  }
}
