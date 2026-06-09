import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getDb } from "@/lib/db/client";
import {
  pawPlanToolDescriptions,
  pawPlanToolNames,
  pawPlanToolSchemas,
  runPawPlanTool,
  type PawPlanToolName,
} from "@/lib/mcp/tools";

function requiredWorkspaceId() {
  const workspaceId = process.env.PAWPLAN_WORKSPACE_ID;
  if (!workspaceId) throw new Error("PAWPLAN_WORKSPACE_ID is required");
  return workspaceId;
}

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value as Record<string, unknown>,
  };
}

async function main() {
  const workspaceId = requiredWorkspaceId();
  const db = getDb();
  const server = new McpServer({
    name: "pawplan",
    version: "0.1.0",
  });

  for (const name of pawPlanToolNames) {
    const toolName: PawPlanToolName = name;
    server.registerTool(
      toolName,
      {
        description: pawPlanToolDescriptions[toolName],
        inputSchema: pawPlanToolSchemas[toolName].shape,
      },
      async (args: unknown) => jsonToolResult(await runPawPlanTool(db, workspaceId, toolName, args)),
    );
  }

  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
