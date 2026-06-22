import { randomBytes } from "node:crypto";

export function randomInviteCode() {
  return `PAW-${randomBytes(8).toString("base64url").toUpperCase()}`;
}

export function appBaseUrl() {
  const value = process.env.PAWPLAN_APP_URL ?? process.env.NEXT_PUBLIC_APP_URL ?? "https://pawplan.charlottezmm.info";
  return value.replace(/\/+$/, "");
}

export function inviteUrlForCode(code: string) {
  return `${appBaseUrl()}/join/${encodeURIComponent(code)}`;
}
