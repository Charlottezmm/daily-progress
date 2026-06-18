import { cookies } from "next/headers";
import { createHmac, timingSafeEqual } from "node:crypto";

export const workspaceSessionCookieName = "daily_progress_workspace";
export const workspaceSessionMaxAgeSeconds = 60 * 60 * 24 * 30;

function appSecret() {
  const secret = process.env.APP_SECRET;
  if (!secret) {
    throw new Error("APP_SECRET is required");
  }
  return secret;
}

function signWorkspaceId(workspaceId: string) {
  return createHmac("sha256", appSecret()).update(workspaceId).digest("base64url");
}

export function createWorkspaceSessionValue(workspaceId: string) {
  return `${workspaceId}.${signWorkspaceId(workspaceId)}`;
}

export function parseWorkspaceSessionValue(value: string | undefined) {
  if (!value) return null;
  const [workspaceId, signature] = value.split(".");
  if (!workspaceId || !signature) return null;

  const expected = signWorkspaceId(workspaceId);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length) return null;
  return timingSafeEqual(actualBuffer, expectedBuffer) ? workspaceId : null;
}

export async function setWorkspaceSession(workspaceId: string) {
  const store = cookies();
  store.set(workspaceSessionCookieName, createWorkspaceSessionValue(workspaceId), {
    httpOnly: true,
    maxAge: workspaceSessionMaxAgeSeconds,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
}

export async function clearWorkspaceSession() {
  const store = cookies();
  store.delete(workspaceSessionCookieName);
}

export async function getWorkspaceIdFromSession() {
  const store = cookies();
  return parseWorkspaceSessionValue(store.get(workspaceSessionCookieName)?.value);
}
