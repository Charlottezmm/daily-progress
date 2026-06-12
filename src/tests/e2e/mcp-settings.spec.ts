import { expect, test, type BrowserContext } from "@playwright/test";
import { createHmac } from "node:crypto";

type TokenRow = {
  id: string;
  name: string;
  permission: "read_only" | "read_write";
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

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

test("creates, shows once, and revokes a hosted MCP token from Settings", async ({ context, page }) => {
  await addWorkspaceSession(context);

  const workspaceId = "00000000-0000-0000-0000-000000000001";
  const mcpUrl = "https://pawplan.example/api/mcp";
  const codexConfig = [
    "[mcp_servers.pawplan]",
    `url = "${mcpUrl}"`,
    'bearer_token_env_var = "PAWPLAN_MCP_TOKEN"',
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 60",
    'default_tools_approval_mode = "prompt"',
  ].join("\n");
  const tokens: TokenRow[] = [];

  await page.route("**/api/settings", async (route) => {
    await route.fulfill({
      json: {
        routines: [],
        segmentEnergySettings: [
          { segment: "morning", energyLevel: "high" },
          { segment: "afternoon", energyLevel: "medium" },
          { segment: "evening", energyLevel: "low" },
        ],
        recoveryTarget: { minutes: 480, editable: false, source: "system_default" },
      },
    });
  });

  await page.route("**/api/mcp-tokens", async (route) => {
    const request = route.request();
    if (request.method() === "GET") {
      await route.fulfill({ json: { workspaceId, tokens, mcp: { url: mcpUrl, codexConfig } } });
      return;
    }

    if (request.method() === "POST") {
      const body = request.postDataJSON() as { name: string; permission: "read_only" | "read_write"; expiresInDays: number | null };
      const token = {
        id: "token-1",
        name: body.name,
        permission: body.permission,
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-06-12T00:00:00.000Z",
      };
      tokens.push(token);
      await route.fulfill({ json: { token, rawToken: "pwp_live_test_secret" } });
      return;
    }

    if (request.method() === "PATCH") {
      const body = request.postDataJSON() as { action: "revoke"; id: string };
      const token = tokens.find((item) => item.id === body.id);
      if (token) token.revokedAt = "2026-06-12T01:00:00.000Z";
      await route.fulfill({ json: { ok: true } });
      return;
    }

    await route.fallback();
  });

  await page.goto("/settings");

  await expect(page.getByRole("heading", { name: "Codex / Claude Cowork 连接配置" })).toBeVisible();
  await expect(page.getByText(workspaceId)).toBeVisible();
  await expect(page.getByText(mcpUrl, { exact: true })).toBeVisible();
  await expect(page.getByText("[mcp_servers.pawplan]")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Claude Cowork 说明" })).toBeVisible();

  await page.getByLabel("Token 名称").fill("Codex e2e");
  await page.getByLabel("权限").selectOption("read_write");
  await page.getByRole("button", { name: "创建 token" }).click();

  await expect(page.getByText("pwp_live_test_secret")).toBeVisible();
  await expect(page.getByText("Codex e2e")).toBeVisible();

  await page.reload();
  await expect(page.getByText("pwp_live_test_secret")).toHaveCount(0);
  await page.getByRole("button", { name: "撤销 Codex e2e" }).click();
  await expect(page.getByText("已撤销", { exact: true })).toBeVisible();
});
