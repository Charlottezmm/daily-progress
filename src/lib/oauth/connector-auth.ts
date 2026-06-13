import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import {
  claudeConnectorAuthorizations,
  oauthAuthorizationCodes,
  oauthClients,
} from "@/lib/db/schema";
import { verifyPkceS256 } from "@/lib/oauth/pkce";

type Permission = "read_only" | "read_write";

type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

type ClientRow = {
  clientId: string;
  clientName?: string;
  redirectUris: string[];
};

type AuthorizationCodeRow = {
  id: string;
  workspaceId: string;
  clientId: string;
  codeHash: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope: string;
  permission: Permission;
  expiresAt: Date | string;
  consumedAt: Date | string | null;
};

type ConnectorAuthorizationRow = {
  id: string;
  workspaceId: string;
  clientId: string;
  clientName?: string;
  accessTokenHash: string;
  refreshTokenHash: string | null;
  refreshTokenExpiresAt: Date | string | null;
  permission: Permission;
  scope: string;
  expiresAt: Date | string | null;
  revokedAt: Date | string | null;
  createdAt: Date | string;
};

export class OAuthConnectorError extends Error {
  constructor(message: string, public status = 400, public oauthError = "invalid_request") {
    super(message);
  }
}

// Claude's connector callback paths may change; v1 keeps this conservative by requiring HTTPS
// and one of Claude's first-party hosts, rather than accepting arbitrary dynamic redirects.
const allowedClaudeRedirectHosts = new Set(["claude.ai", "www.claude.ai", "claude.com", "www.claude.com"]);
export const staticClaudeOAuthClientId = "pawplan_claude_custom_connector";
const accessTokenTtlMs = 30 * 24 * 60 * 60 * 1000;
const refreshTokenTtlMs = 90 * 24 * 60 * 60 * 1000;

export function isStaticClaudeOAuthClientId(clientId: string) {
  return clientId === staticClaudeOAuthClientId;
}

function randomToken(prefix: string) {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function toDate(value: Date | string) {
  return value instanceof Date ? value : new Date(value);
}

function toIsoDate(value: Date | string | null) {
  if (value instanceof Date) return value.toISOString();
  return value;
}

export function hashConnectorToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export const hashAuthorizationCode = hashConnectorToken;

export function isAllowedClaudeRedirectUri(redirectUri: string) {
  try {
    const url = new URL(redirectUri);
    return url.protocol === "https:" && allowedClaudeRedirectHosts.has(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export async function registerOAuthClient(
  db: DbLike,
  input: {
    clientName?: string;
    redirectUris: string[];
  },
) {
  const redirectUris = input.redirectUris.map((uri) => uri.trim()).filter(Boolean);
  if (redirectUris.length === 0) throw new OAuthConnectorError("redirect_uris is required", 400);
  if (!redirectUris.every(isAllowedClaudeRedirectUri)) {
    throw new OAuthConnectorError("redirect_uri is not allowed", 400, "invalid_client_metadata");
  }

  const clientId = randomToken("pwp_oauth_client_");
  const clientName = input.clientName?.trim() || "Claude";
  const [client] = await db
    .insert(oauthClients)
    .values({
      clientId,
      clientName,
      redirectUris,
      grantTypes: ["authorization_code", "refresh_token"],
      responseTypes: ["code"],
      tokenEndpointAuthMethod: "none",
    })
    .returning();

  return {
    clientId: client.clientId,
    clientName: client.clientName,
    redirectUris: client.redirectUris as string[],
    clientSecret: undefined,
  };
}

export async function findOAuthClient(db: DbLike, clientId: string) {
  if (isStaticClaudeOAuthClientId(clientId)) {
    return {
      clientId: staticClaudeOAuthClientId,
      clientName: "Claude",
      redirectUris: [],
    } satisfies ClientRow;
  }

  const rows = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId)).limit(1);
  return ((rows as ClientRow[])[0] ?? null) as ClientRow | null;
}

export async function createAuthorizationCode(
  db: DbLike,
  input: {
    workspaceId: string;
    clientId: string;
    redirectUri: string;
    codeChallenge: string;
    codeChallengeMethod: "S256";
    scope?: string;
  },
) {
  if (input.codeChallengeMethod !== "S256") {
    throw new OAuthConnectorError("Only S256 PKCE is supported", 400, "invalid_request");
  }

  const code = randomToken("pwp_oauth_code_");
  const codeHash = hashAuthorizationCode(code);
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

  await db.insert(oauthAuthorizationCodes).values({
    workspaceId: input.workspaceId,
    clientId: input.clientId,
    codeHash,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope || "mcp",
    permission: "read_write",
    expiresAt,
  });

  return { code, codeHash, expiresAt };
}

export async function exchangeAuthorizationCode(
  db: DbLike,
  input: {
    code: string;
    clientId: string;
    redirectUri: string;
    codeVerifier: string;
  },
) {
  if (!input.codeVerifier) throw new OAuthConnectorError("code_verifier is required", 400, "invalid_request");

  const codeHash = hashAuthorizationCode(input.code);
  const rows = await db
    .select()
    .from(oauthAuthorizationCodes)
    .where(eq(oauthAuthorizationCodes.codeHash, codeHash))
    .limit(1);
  const codeRow = (rows as AuthorizationCodeRow[])[0];
  if (!codeRow || !safeEqual(codeRow.codeHash, codeHash)) {
    throw new OAuthConnectorError("Invalid authorization code", 400, "invalid_grant");
  }
  if (codeRow.consumedAt) {
    throw new OAuthConnectorError("Authorization code has already been used", 400, "invalid_grant");
  }
  if (toDate(codeRow.expiresAt).getTime() <= Date.now()) {
    throw new OAuthConnectorError("Authorization code has expired", 400, "invalid_grant");
  }
  if (codeRow.clientId !== input.clientId || codeRow.redirectUri !== input.redirectUri) {
    throw new OAuthConnectorError("Authorization code client or redirect_uri mismatch", 400, "invalid_grant");
  }
  if (codeRow.codeChallengeMethod !== "S256" || !verifyPkceS256(input.codeVerifier, codeRow.codeChallenge)) {
    throw new OAuthConnectorError("PKCE verification failed", 400, "invalid_grant");
  }

  const consumedRows = await db
    .update(oauthAuthorizationCodes)
    .set({ consumedAt: new Date() })
    .where(and(eq(oauthAuthorizationCodes.id, codeRow.id), isNull(oauthAuthorizationCodes.consumedAt)))
    .returning();
  if ((consumedRows as unknown[]).length === 0) {
    throw new OAuthConnectorError("Authorization code has already been used", 400, "invalid_grant");
  }

  const accessToken = randomToken("pwp_oauth_access_");
  const refreshToken = randomToken("pwp_oauth_refresh_");
  const expiresAt = new Date(Date.now() + accessTokenTtlMs);
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenTtlMs);
  const client = await findOAuthClient(db, codeRow.clientId);
  const [authorization] = await db
    .insert(claudeConnectorAuthorizations)
    .values({
      workspaceId: codeRow.workspaceId,
      clientId: codeRow.clientId,
      clientName: client?.clientName || "Claude",
      accessTokenHash: hashConnectorToken(accessToken),
      refreshTokenHash: hashConnectorToken(refreshToken),
      refreshTokenExpiresAt,
      permission: codeRow.permission,
      scope: codeRow.scope || "mcp",
      expiresAt,
    })
    .returning();

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    scope: codeRow.scope || "mcp",
    authorizationId: authorization.id as string,
  };
}

export async function refreshConnectorAccessToken(
  db: DbLike,
  input: {
    refreshToken: string;
    clientId: string;
  },
) {
  if (!input.refreshToken.startsWith("pwp_oauth_refresh_")) {
    throw new OAuthConnectorError("Invalid refresh token", 400, "invalid_grant");
  }

  const refreshTokenHash = hashConnectorToken(input.refreshToken);
  const rows = await db
    .select()
    .from(claudeConnectorAuthorizations)
    .where(
      and(
        eq(claudeConnectorAuthorizations.refreshTokenHash, refreshTokenHash),
        isNull(claudeConnectorAuthorizations.revokedAt),
        gt(claudeConnectorAuthorizations.refreshTokenExpiresAt, new Date()),
      ),
    )
    .limit(1);
  const row = (rows as ConnectorAuthorizationRow[])[0];
  if (!row?.refreshTokenHash || !safeEqual(row.refreshTokenHash, refreshTokenHash)) {
    throw new OAuthConnectorError("Invalid refresh token", 400, "invalid_grant");
  }
  if (row.clientId !== input.clientId) {
    throw new OAuthConnectorError("Refresh token client mismatch", 400, "invalid_grant");
  }

  const accessToken = randomToken("pwp_oauth_access_");
  const refreshToken = randomToken("pwp_oauth_refresh_");
  const expiresAt = new Date(Date.now() + accessTokenTtlMs);
  const refreshTokenExpiresAt = new Date(Date.now() + refreshTokenTtlMs);
  const [authorization] = await db
    .update(claudeConnectorAuthorizations)
    .set({
      accessTokenHash: hashConnectorToken(accessToken),
      refreshTokenHash: hashConnectorToken(refreshToken),
      expiresAt,
      refreshTokenExpiresAt,
      lastUsedAt: new Date(),
    })
    .where(
      and(
        eq(claudeConnectorAuthorizations.id, row.id),
        eq(claudeConnectorAuthorizations.refreshTokenHash, refreshTokenHash),
        isNull(claudeConnectorAuthorizations.revokedAt),
      ),
    )
    .returning();

  if (!authorization) throw new OAuthConnectorError("Invalid refresh token", 400, "invalid_grant");

  return {
    accessToken,
    refreshToken,
    tokenType: "Bearer",
    expiresIn: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)),
    scope: row.scope || "mcp",
    authorizationId: row.id,
  };
}

export async function verifyConnectorAccessToken(db: DbLike, rawToken: string) {
  if (!rawToken.startsWith("pwp_oauth_access_")) return null;

  const accessTokenHash = hashConnectorToken(rawToken);
  const rows = await db
    .select()
    .from(claudeConnectorAuthorizations)
    .where(
      and(
        eq(claudeConnectorAuthorizations.accessTokenHash, accessTokenHash),
        isNull(claudeConnectorAuthorizations.revokedAt),
        or(isNull(claudeConnectorAuthorizations.expiresAt), gt(claudeConnectorAuthorizations.expiresAt, new Date())),
      ),
    )
    .limit(1);
  const row = (rows as ConnectorAuthorizationRow[])[0];
  if (!row || !safeEqual(row.accessTokenHash, accessTokenHash)) return null;

  await db
    .update(claudeConnectorAuthorizations)
    .set({ lastUsedAt: new Date() })
    .where(eq(claudeConnectorAuthorizations.id, row.id));

  return {
    workspaceId: row.workspaceId,
    permission: row.permission,
    tokenId: row.id,
    kind: "oauth_connector" as const,
  };
}

export async function listConnectorAuthorizations(db: DbLike, workspaceId: string) {
  const rows = await db
    .select()
    .from(claudeConnectorAuthorizations)
    .where(eq(claudeConnectorAuthorizations.workspaceId, workspaceId))
    .orderBy(claudeConnectorAuthorizations.createdAt);

  return (rows as ConnectorAuthorizationRow[]).map((row) => ({
    id: row.id,
    clientName: row.clientName || "Claude",
    permission: row.permission,
    scope: row.scope,
    expiresAt: toIsoDate(row.expiresAt),
    revokedAt: toIsoDate(row.revokedAt),
    createdAt: toIsoDate(row.createdAt),
  }));
}

export async function revokeConnectorAuthorization(db: DbLike, workspaceId: string, authorizationId: string) {
  const [authorization] = await db
    .update(claudeConnectorAuthorizations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(claudeConnectorAuthorizations.id, authorizationId),
        eq(claudeConnectorAuthorizations.workspaceId, workspaceId),
        isNull(claudeConnectorAuthorizations.revokedAt),
      ),
    )
    .returning();

  return authorization ? { id: authorization.id as string } : null;
}

export async function revokeConnectorAccessToken(db: DbLike, rawToken: string) {
  const accessTokenHash = hashConnectorToken(rawToken);
  const [authorization] = await db
    .update(claudeConnectorAuthorizations)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(claudeConnectorAuthorizations.accessTokenHash, accessTokenHash),
        isNull(claudeConnectorAuthorizations.revokedAt),
      ),
    )
    .returning();

  return authorization ? { id: authorization.id as string } : null;
}
