import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

function signedWorkspaceSession(workspaceId: string) {
  const signature = createHmac("sha256", "test-secret").update(workspaceId).digest("base64url");
  return `${workspaceId}.${signature}`;
}

test("redirects unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Daily Progress" })).toBeVisible();
  await expect(page.getByPlaceholder("Workspace name")).toBeVisible();
});

test("renders Today on desktop and mobile with a workspace session", async ({ context, page }) => {
  await context.addCookies([
    {
      name: "daily_progress_workspace",
      value: signedWorkspaceSession("00000000-0000-0000-0000-000000000001"),
      domain: "127.0.0.1",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);

  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByPlaceholder("+ Quick Capture")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily Check-in" })).toBeVisible();
  await expect(page.getByPlaceholder("完成")).toBeVisible();
  await expect(page.getByPlaceholder("卡点")).toBeVisible();
  await expect(page.getByPlaceholder("明日接")).toBeVisible();
});
