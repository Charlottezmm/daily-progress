import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

function signedWorkspaceSession(workspaceId: string) {
  const signature = createHmac("sha256", "test-secret").update(workspaceId).digest("base64url");
  return `${workspaceId}.${signature}`;
}

test("review route frames suggestions as user-reviewed drafts, not applied changes", async ({ context, page }) => {
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

  await page.goto("/review");

  await expect(page.getByRole("heading", { name: "审核" })).toBeVisible();
  await expect(page.getByText("这些是 Agent 提的调整建议，你点头才会生效。")).toBeVisible();
  await expect(page.getByText("Routine 和 Recovery 受保护；Agent 可以提任务调整或日程导入草稿，但只有你确认后才会写入。")).toBeVisible();
  await expect(page.getByText("已应用")).toHaveCount(0);
});
