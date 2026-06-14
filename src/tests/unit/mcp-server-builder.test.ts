import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({
  getDb: vi.fn(() => ({})),
}));

describe("PawPlan MCP server builder", () => {
  it("publishes a concrete propose_patch patch schema through tools/list", async () => {
    const { createPawPlanMcpServer } = await import("@/lib/mcp/server-builder");
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const server = createPawPlanMcpServer({ workspaceId: "workspace-1", permission: "read_write" });
    const client = new Client({ name: "schema-check", version: "0.0.0" });

    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    try {
      expect(client.getServerVersion()).toEqual({ name: "pawplan", version: "0.2.1" });

      const result = await client.listTools();
      const tool = result.tools.find((candidate) => candidate.name === "propose_patch");
      const patchSchema = tool?.inputSchema.properties?.patch as any;

      expect(patchSchema).toMatchObject({
        type: "object",
        properties: {
          operations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { type: "string" },
                task_id: { type: "string" },
              },
              required: ["type"],
              additionalProperties: true,
            },
          },
        },
        required: ["operations"],
      });
    } finally {
      await client.close();
      await server.close();
    }
  });
});
