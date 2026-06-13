import { NextResponse } from "next/server";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { listConnectorAuthorizations } from "@/lib/oauth/connector-auth";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const origin = new URL(request.url).origin;
  const authorizations = await listConnectorAuthorizations(getDb(), workspaceId);
  return NextResponse.json({
    mcpUrl: new URL("/api/mcp", origin).toString(),
    protectedResourceMetadataUrl: new URL("/.well-known/oauth-protected-resource/api/mcp", origin).toString(),
    authorizationServerMetadataUrl: new URL("/.well-known/oauth-authorization-server", origin).toString(),
    authorizations,
  });
}
