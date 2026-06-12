import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getDb } from "@/lib/db/client";
import { createPawPlanMcpServer } from "@/lib/mcp/server-builder";
import { McpTokenError, verifyMcpBearerToken } from "@/lib/mcp/tokens";

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

  return Response.json({ error: "MCP request failed" }, { status: 500 });
}

async function handle(request: Request) {
  try {
    const auth = await verifyMcpBearerToken(getDb(), bearerToken(request));
    if (!auth) throw new McpTokenError("Invalid MCP bearer token", 401);

    const server = createPawPlanMcpServer({ workspaceId: auth.workspaceId, permission: auth.permission });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    await server.connect(transport);
    return transport.handleRequest(request, {
      authInfo: {
        token: "redacted",
        scopes: [auth.permission],
        clientId: auth.tokenId,
      },
    });
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
