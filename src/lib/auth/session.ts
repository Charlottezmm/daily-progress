import { cookies } from "next/headers";

export const workspaceSessionCookieName = "daily_progress_workspace";

export async function setWorkspaceSession(workspaceId: string) {
  const store = cookies();
  store.set(workspaceSessionCookieName, workspaceId, {
    httpOnly: true,
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
  return store.get(workspaceSessionCookieName)?.value ?? null;
}
