import { NextResponse } from "next/server";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { revokeConnectorAccessToken, revokeConnectorAuthorization } from "@/lib/oauth/connector-auth";
import { readJsonBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const body = (await readJsonBody(request)) as { token?: string; authorizationId?: string } | null;

  if (body?.authorizationId) {
    const workspaceId = await getWorkspaceIdFromSession();
    if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    await revokeConnectorAuthorization(getDb(), workspaceId, body.authorizationId);
    return NextResponse.json({ ok: true });
  }

  if (!body?.token) return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  await revokeConnectorAccessToken(getDb(), body.token);
  return NextResponse.json({ ok: true });
}
