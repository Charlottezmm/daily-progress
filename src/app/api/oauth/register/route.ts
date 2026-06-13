import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { OAuthConnectorError, registerOAuthClient } from "@/lib/oauth/connector-auth";
import { readJsonBody } from "@/lib/validation/common";

export const dynamic = "force-dynamic";

const registerSchema = z
  .object({
    client_name: z.string().trim().min(1).max(180).optional(),
    redirect_uris: z.array(z.string().url()).min(1),
    grant_types: z.array(z.string()).optional(),
    response_types: z.array(z.string()).optional(),
    token_endpoint_auth_method: z.literal("none").optional(),
    scope: z.string().optional(),
    client_uri: z.string().url().optional(),
    logo_uri: z.string().url().optional(),
    tos_uri: z.string().url().optional(),
    policy_uri: z.string().url().optional(),
    contacts: z.array(z.string()).optional(),
    software_id: z.string().optional(),
    software_version: z.string().optional(),
  })
  .passthrough();

function isUnsupportedMetadata(input: z.infer<typeof registerSchema>) {
  return (
    (input.grant_types && (input.grant_types.length !== 1 || input.grant_types[0] !== "authorization_code")) ||
    (input.response_types && (input.response_types.length !== 1 || input.response_types[0] !== "code"))
  );
}

export async function POST(request: Request) {
  const parsed = registerSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_client_metadata" }, { status: 400 });
  }
  if (isUnsupportedMetadata(parsed.data)) {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "unsupported OAuth client metadata" },
      { status: 400 },
    );
  }

  try {
    const client = await registerOAuthClient(getDb(), {
      clientName: parsed.data.client_name,
      redirectUris: parsed.data.redirect_uris,
    });
    return NextResponse.json(
      {
        client_id: client.clientId,
        client_name: client.clientName,
        redirect_uris: client.redirectUris,
        grant_types: ["authorization_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        client_id_issued_at: Math.floor(Date.now() / 1000),
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof OAuthConnectorError) {
      return NextResponse.json({ error: error.oauthError, error_description: error.message }, { status: error.status });
    }
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}
