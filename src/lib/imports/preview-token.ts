import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type ImportPreviewKind = "plan" | "timetable";

const tokenTtlMs = 30 * 60 * 1000;

function appSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) throw new Error("APP_SECRET is required");
  return secret;
}

function contentHash(content: string) {
  return createHash("sha256").update(content).digest("hex");
}

function sign(payload: string) {
  return createHmac("sha256", appSecret()).update(payload).digest("base64url");
}

function equalSignatures(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function createImportPreviewToken(input: {
  kind: ImportPreviewKind;
  workspaceId: string;
  content: string;
  now?: Date;
}) {
  const now = input.now ?? new Date();
  const payload = Buffer.from(
    JSON.stringify({
      kind: input.kind,
      workspaceId: input.workspaceId,
      contentHash: contentHash(input.content),
      expiresAt: new Date(now.getTime() + tokenTtlMs).toISOString(),
    }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyImportPreviewToken(input: {
  token: string | undefined;
  kind: ImportPreviewKind;
  workspaceId: string;
  content: string;
  now?: Date;
}) {
  if (!input.token) return { ok: false as const, reason: "Import preview token required" };
  const [payload, signature] = input.token.split(".");
  if (!payload || !signature || !equalSignatures(signature, sign(payload))) {
    return { ok: false as const, reason: "Invalid import preview token" };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return { ok: false as const, reason: "Invalid import preview token" };
  }

  if (!parsed || typeof parsed !== "object") return { ok: false as const, reason: "Invalid import preview token" };
  const body = parsed as Record<string, unknown>;
  if (
    body.kind !== input.kind ||
    body.workspaceId !== input.workspaceId ||
    body.contentHash !== contentHash(input.content)
  ) {
    return { ok: false as const, reason: "Import preview token does not match this import" };
  }

  const expiresAt = typeof body.expiresAt === "string" ? new Date(body.expiresAt) : null;
  if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt <= (input.now ?? new Date())) {
    return { ok: false as const, reason: "Import preview token expired" };
  }

  return { ok: true as const };
}
