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

export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new McpTokenError("Missing MCP bearer token", 401);

  const token = header.slice("Bearer ".length).trim();
  if (!token) throw new McpTokenError("Missing MCP bearer token", 401);
  return token;
}

function errorResponse(error: unknown) {
  if (error instanceof McpTokenError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  if (error instanceof McpUsageLimitError) {
    return Response.json({ error: error.message }, { status: error.status });
  }

  return Response.json({ error: "MCP request failed" }, { status: 500 });
}

async function requestToolName(request: Request) {
  if (request.method === "GET") return "GET";
  try {
    return extractMcpUsageToolName(await request.clone().json());
  } catch {
    return "unknown";
  }
}

async function handle(request: Request) {
  const db = getDb();
  try {
    const auth = await verifyMcpBearerToken(db, bearerToken(request));
    if (!auth) throw new McpTokenError("Invalid MCP bearer token", 401);
    const toolName = await requestToolName(request);
    const usageInput = {
      workspaceId: auth.workspaceId,
      tokenId: auth.tokenId,
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
      await recordHostedMcpUsage(db, { ...usageInput, success: response.status < 400 });
      return response;
    } catch (error) {
      await recordHostedMcpUsage(db, { ...usageInput, success: false });
      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
