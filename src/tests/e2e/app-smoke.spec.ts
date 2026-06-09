import { expect, test } from "@playwright/test";
import { createHmac } from "node:crypto";

function signedWorkspaceSession(workspaceId: string) {
  const signature = createHmac("sha256", "test-secret").update(workspaceId).digest("base64url");
  return `${workspaceId}.${signature}`;
}

test("redirects unauthenticated visitors to login", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "PawPlan" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "今日执行" })).toBeVisible();
  await expect(page.getByText("Agent 今天排了")).toBeVisible();
  await expect(page.getByText("今日任务")).toBeVisible();
  await expect(page.getByRole("heading", { name: "收工反馈" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Today", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Plan", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "More", exact: true })).toBeVisible();
});

test("renders real settings surfaces without fake recovery saves", async ({ context, page }) => {
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

  await page.goto("/settings");
  await expect(page.getByRole("heading", { name: "设置" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "恢复目标" })).toBeVisible();
  await expect(page.getByText("系统默认 8 小时", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "日常事项", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "能量规则", exact: true })).toBeVisible();
  await expect(page.getByText("Workspace / MCP 还未开放", { exact: true })).toBeVisible();
});
