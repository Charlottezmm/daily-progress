import { expect, test } from "@playwright/test";

test("renders Today on desktop and mobile", async ({ page }) => {
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  await expect(page.getByPlaceholder("+ Quick Capture")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Daily Check-in" })).toBeVisible();
  await expect(page.getByPlaceholder("完成")).toBeVisible();
  await expect(page.getByPlaceholder("卡点")).toBeVisible();
  await expect(page.getByPlaceholder("明日接")).toBeVisible();
});
