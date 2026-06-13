import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getDb } from "@/lib/db/client";
import { createPawPlanMcpServer } from "@/lib/mcp/server-builder";
import { McpTokenError, verifyMcpBearerToken } from "@/lib/mcp/tokens";
import {
  McpUsageLimitError,
  assertHostedMcpWriteAllowed,
  extractMcpUsageToolName,
  recordHostedMcpUsage,
} from "@/lib/mcp/usage";
import { verifyConnectorAccessToken } from "@/lib/oauth/connector-auth";

export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new McpTokenError("Missing MCP bearer token", 401);

  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new McpTokenError("Missing MCP bearer token", 401);
  return token;
}

function resourceMetadataUrl(request: Request) {
  return new URL("/.well-known/oauth-protected-resource/api/mcp", request.url).toString();
}

function wwwAuthenticate(request: Request, error?: string) {
  const params = [`resource_metadata="${resourceMetadataUrl(request)}"`];
  if (error) params.push(`error="${error}"`);
  return `Bearer ${params.join(", ")}`;
}

function errorResponse(request: Request, error: unknown) {
  if (error instanceof McpTokenError) {
    return Response.json(
      { error: error.message },
      {
        status: error.status,
        headers: { "WWW-Authenticate": wwwAuthenticate(request, error.status === 401 ? "invalid_token" : undefined) },
      },
    );
  }
  if (error instanceof McpUsageLimitError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: "MCP request failed" }, { status: 500 });
}

async function resolveMcpAuth(db: ReturnType<typeof getDb>, token: string) {
  const mcpAuth = await verifyMcpBearerToken(db, token);
  if (mcpAuth) return { ...mcpAuth, kind: "mcp_token" as const };

  return verifyConnectorAccessToken(db, token);
}

async function requestToolName(request: Request) {
  if (request.method === "GET") return "GET";
  try {
    return extractMcpUsageToolName(await request.clone().json());
  } catch {
    return "unknown";
  }
}

function hasJsonRpcError(payload: unknown): boolean {
  if (Array.isArray(payload)) {
    return payload.some((item) => hasJsonRpcError(item));
  }
  return Boolean(
    payload &&
      typeof payload === "object" &&
      "error" in payload &&
      (payload as Record<string, unknown>).error,
  );
}

async function responseSucceeded(response: Response) {
  if (response.status >= 400) return false;
  try {
    return !hasJsonRpcError(await response.clone().json());
  } catch {
    return true;
  }
}

async function handle(request: Request) {
  const db = getDb();
  try {
    const auth = await resolveMcpAuth(db, bearerToken(request));
    if (!auth) throw new McpTokenError("Invalid MCP bearer token", 401);
    const toolName = await requestToolName(request);
    const usageInput = {
      workspaceId: auth.workspaceId,
      tokenId: auth.kind === "mcp_token" ? auth.tokenId : null,
      toolName,
      permission: auth.permission,
    };

    try {
      if (auth.permission === "read_write") {
        await assertHostedMcpWriteAllowed(db, { workspaceId: auth.workspaceId, toolName });
      }

      const server = createPawPlanMcpServer({ workspaceId: auth.workspaceId, permission: auth.permission });
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });

      await server.connect(transport);
      const response = await transport.handleRequest(request, {
        authInfo: {
          token: "redacted",
          scopes: [auth.permission],
          clientId: auth.tokenId,
        },
      });
      await recordHostedMcpUsage(db, { ...usageInput, success: await responseSucceeded(response) });
      return response;
    } catch (error) {
      await recordHostedMcpUsage(db, { ...usageInput, success: false });
      throw error;
    }
  } catch (error) {
    return errorResponse(request, error);
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
