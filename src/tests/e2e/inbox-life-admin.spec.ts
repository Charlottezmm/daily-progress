import { expect, test, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";

function signedWorkspaceSession(workspaceId: string) {
  const signature = createHmac("sha256", "test-secret").update(workspaceId).digest("base64url");
  return `${workspaceId}.${signature}`;
}

async function addWorkspaceSession(context: BrowserContext) {
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
}

test("captures a chore in Inbox and promotes it with visible scheduling metadata", async ({ context, page }) => {
  await addWorkspaceSession(context);
  const inboxPatchBodies: unknown[] = [];

  await page.route("**/api/inbox", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      expect(request.postDataJSON()).toEqual({ title: "倒垃圾" });
      await route.fulfill({
        json: {
          item: {
            id: "11111111-1111-4111-8111-111111111111",
            title: "倒垃圾",
            age: "刚刚",
          },
        },
      });
      return;
    }

    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      inboxPatchBodies.push(body);
      await route.fulfill({ json: { ok: true, action: (body as { action: string }).action } });
      return;
    }

    await route.fallback();
  });

  await page.goto("/inbox");
  await expect(page.getByText("捕获缓冲区")).toBeVisible();
  await page.getByPlaceholder("记一条想法…").fill("倒垃圾");
  await page.getByRole("button", { name: "添加" }).click();
  await expect(page.getByText("倒垃圾", { exact: true })).toBeVisible();

  const row = page.locator(".paw-list-row", { hasText: "倒垃圾" });
  await row.getByLabel("任务日期").fill("2026-06-20");
  await row.getByRole("combobox", { name: /^时段$/ }).selectOption("evening");
  await row.getByLabel("分钟").first().fill("15");
  await row.getByRole("button", { name: "提升任务" }).click();

  await expect(row).toHaveCount(0);
  expect(inboxPatchBodies).toEqual([
    {
      id: "11111111-1111-4111-8111-111111111111",
      action: "task",
      date: "2026-06-20",
      daySegment: "evening",
      estimatedMinutes: 15,
      priority: "normal",
    },
  ]);
});

test("quick chore promotion sends no hidden browser-local date", async ({ context, page }) => {
  await addWorkspaceSession(context);
  const inboxPatchBodies: unknown[] = [];

  await page.route("**/api/inbox", async (route) => {
    const request = route.request();
    if (request.method() === "POST") {
      await route.fulfill({
        json: {
          item: {
            id: "22222222-2222-4222-8222-222222222222",
            title: "买纸巾",
            age: "刚刚",
          },
        },
      });
      return;
    }

    if (request.method() === "PATCH") {
      const body = request.postDataJSON();
      inboxPatchBodies.push(body);
      await route.fulfill({ json: { ok: true, action: (body as { action: string }).action } });
      return;
    }

    await route.fallback();
  });

  await page.goto("/inbox");
  await page.getByPlaceholder("记一条想法…").fill("买纸巾");
  await page.getByRole("button", { name: "添加" }).click();

  const row = page.locator(".paw-list-row", { hasText: "买纸巾" });
  await row.getByLabel("小杂事时段").selectOption("afternoon");
  await row.getByRole("button", { name: /今日下午小杂事 · 15 分钟/ }).click();

  expect(inboxPatchBodies).toEqual([
    {
      id: "22222222-2222-4222-8222-222222222222",
      action: "quick_chore_task",
      daySegment: "afternoon",
    },
  ]);
});
