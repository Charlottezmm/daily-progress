# PawPlan v0.2 Agent Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn PawPlan from a deployed PWA with local MCP wiring into an agent-loop product where Charlotte can create a workspace-scoped MCP token, connect Codex/Claude Cowork through a hosted MCP endpoint, and import previously discussed task progress into PawPlan so day/week/month views show real tasks without manual database edits.

**Architecture:** Keep Postgres as the only source of truth. Add a hosted Streamable HTTP MCP endpoint protected by workspace-scoped bearer tokens, while keeping the existing stdio MCP server as a local fallback. Build v0.2 around a narrow loop: Settings creates/revokes tokens and shows copyable Codex/Cowork connection instructions; Codex/Cowork calls MCP tools; trusted plan imports create real PawPlan tasks through an idempotent import tool; later rescheduling still goes through `/review`.

**Tech Stack:** Next.js App Router, TypeScript, Drizzle ORM, Zod, Postgres/Neon, `@modelcontextprotocol/sdk`, Vitest, Playwright, Vercel.

---

## Context And Boundaries

### Current Verified State

- Production URL: `https://pawplan.charlottezmm.info`.
- Production Postgres exists and migrations are applied.
- Workspace `charlotte` exists with workspace id `511b7f4d-37b4-44f7-a66b-d3af972e03ce`.
- Current stdio MCP server works locally when configured with `DATABASE_URL` and `PAWPLAN_WORKSPACE_ID`.
- Current exposed tools: `get_today`, `get_week`, `get_month`, `get_checkins`, `get_tasks`, `create_inbox_item`, `create_checkin`, `update_task_status`, `propose_patch`.
- Current Plan month cards still show static placeholder progress bars when no real month model exists; v0.2 must replace or remove those placeholder percentages.
- Current Settings already supports routines and segment energy settings; Workspace/MCP is still display-only.

### Product Constraint

The browser PWA cannot safely edit the user's local `~/.codex/config.toml`. So "connect MCP from the website" cannot mean one-click local file mutation. v0.2 should instead:

- generate a revocable token in Settings;
- expose a hosted MCP URL;
- show copyable Codex config;
- optionally keep the local stdio helper for advanced/private use.

OpenAI Codex supports MCP servers through `config.toml`, including stdio servers and Streamable HTTP servers. For HTTP servers, Codex config supports `url`, `bearer_token_env_var`, and static/request headers. See official docs:

- https://developers.openai.com/codex/mcp
- https://developers.openai.com/codex/config-reference

### v0.2 Scope

1. Hosted MCP endpoint:
   - `POST /api/mcp` supports Streamable HTTP MCP requests.
   - Authorization: `Authorization: Bearer <pawplan-token>`.
   - Token resolves to one workspace and permission level.

2. MCP token management:
   - Settings lists active tokens.
   - User can generate a token once.
   - Raw token is shown once, then only hash is stored.
   - User can revoke tokens.
   - Permissions: `read_only`, `read_write`.

3. MCP permission enforcement:
   - Read tools allowed for both permissions.
   - Write tools require `read_write`.
   - `propose_patch` remains preview-only for later rescheduling.
   - `import_plan_bundle` requires `read_write` and writes real tasks.

4. Scheduled automation handoff:
   - Provide copyable prompt/config in Settings.
   - Do not implement in-app scheduler, Vercel cron, browser timer, or automatic apply.

5. Planning import workflow:
   - A single user instruction in Codex/Cowork can ask PawPlan MCP to import the already-discussed task progress into PawPlan.
   - The agent calls `import_plan_bundle` with one structured payload containing `overall_plan`, `daily_tasks`, `weekly_summary`, and `monthly_summary`.
   - PawPlan creates real rows in `tasks`, updates the active plan snapshot, and records an MCP audit changelog.
   - After import, `/today`, `/plan?tab=day`, `/plan?tab=week`, and `/plan?tab=month` show real imported data.
   - Re-running the same import with the same `import_key` is idempotent and must not duplicate tasks.

6. Inbox visibility:
   - Inbox already exists under `/inbox`, but v0.2 should make it visible in the primary workflow instead of hiding it behind More.
   - Desktop and mobile navigation should expose Inbox directly or use a first-class capture/Inbox affordance.
   - Inbox remains for unstructured capture; `import_plan_bundle` remains for structured AI imports.

7. AI-native storage:
   - Store structured AI payloads, provenance, decision context, and audit events, not only flattened todo rows.
   - Every MCP write should preserve `created_by`, `source_label`, raw structured payload, derived task ids, and changelog id.
   - Conversations and decisions should remain queryable context for future AI planning, not just display-only notes.

8. Constraint editing:
   - Keep existing routines and segment energy editing.
   - Do not add calendar/course constraint editing in v0.2.
   - Do not build drag-and-drop calendar.

9. Mobile input ergonomics:
   - Move the floating cat affordance from bottom-right to top-right on mobile.
   - It must not overlap text fields, textareas, submit buttons, or the on-screen keyboard path.

### Non-Goals

- No embedded LLM chat in the PWA.
- No server cron inside the app.
- No automatic patch apply.
- No destructive bulk overwrite of existing plans/tasks through MCP.
- No team workspace/multi-user auth.
- No full Google Calendar clone.
- No broad redesign during this feature.

---

## File Map

### Create

- `src/lib/mcp/tokens.ts`
  - Generates raw token, hashes token, verifies bearer token, lists active tokens, revokes token.

- `src/lib/mcp/http-server.ts`
  - Builds a PawPlan MCP server for a resolved workspace and permission.

- `src/lib/mcp/plan-import.ts`
  - Validates and saves structured Codex/Cowork plan imports into tasks and the active plan snapshot.

- `src/app/api/mcp/route.ts`
  - Hosted MCP Streamable HTTP route.

- `src/app/api/mcp-tokens/route.ts`
  - Authenticated PWA API for token list/create/revoke.

- `src/tests/unit/mcp-token-service.test.ts`
  - Token hashing, one-time token behavior, permission filtering.

- `src/tests/unit/mcp-http-route.test.ts`
  - Authorization failure, read-only write denial, valid tool list.

- `src/tests/unit/mcp-plan-import.test.ts`
  - Import payload validation, task creation, idempotent `import_key`, audit changelog.

- `src/tests/e2e/mcp-settings.spec.ts`
  - Settings page token creation and copyable config smoke test.

### Modify

- `src/lib/db/schema.ts`
  - Add `mcp_tokens_token_hash_idx` for token verification.
  - Add `mcp_plan_imports` for idempotent plan imports.

- `src/lib/mcp/tools.ts`
  - Add permission metadata per tool.
  - Add optional tool filtering by permission.
  - Add `import_plan_bundle`.

- `src/mcp/server.ts`
  - Reuse shared MCP server builder from `src/lib/mcp/http-server.ts` or sibling module.

- `src/app/api/settings/route.ts`
  - Include workspace status if Settings keeps using one aggregate API, or leave unchanged if token API is separate.

- `src/lib/planning/view-data.ts`
  - Add month planning view data from imported plan snapshot and task distribution.

- `src/components/plan-view.tsx`
  - Replace static month progress placeholders with real imported plan data or an honest empty state.

- `src/components/app-shell.tsx`
  - Expose Inbox in the main navigation or mobile tabbar.

- `src/components/settings-view.tsx`
  - Replace the disabled "MCP token 未开放" card with real token management and copyable config.

- `docs/automation/pawplan-scheduled-automation.md`
  - Add hosted MCP connection instructions.

- `docs/handoff/`
  - Add post-v0.2 handoff after implementation, not during plan approval.

---

## Data And API Contracts

### Existing Table

`mcp_tokens` already exists:

```txt
mcp_tokens
- id uuid primary key
- workspace_id uuid references workspaces(id)
- token_hash text not null
- name varchar(120) not null
- permission mcp_permission default read_only
- expires_at timestamp nullable
- revoked_at timestamp nullable
- created_at timestamp default now
```

### New Table

`mcp_plan_imports` tracks idempotent direct imports from Codex/Cowork:

```txt
mcp_plan_imports
- id uuid primary key
- workspace_id uuid references workspaces(id)
- plan_id uuid references plans(id)
- import_key varchar(160) not null
- created_by varchar(40) not null
- source_label varchar(120) nullable
- task_count integer not null
- snapshot jsonb not null
- derived_task_ids jsonb not null
- provenance_json jsonb not null
- created_at timestamp default now

unique(workspace_id, import_key)
```

This table is not a replacement for user-facing tasks. It preserves the exact MCP payload, provenance, and derived row ids so future agents can understand where a plan came from and how it became PawPlan data.

### AI-Native Storage Rules

For every MCP write:

- Keep the normalized app rows needed for fast UI reads, for example `tasks`.
- Keep the structured AI payload that produced those rows, for example `mcp_plan_imports.snapshot`.
- Keep provenance fields: `created_by`, `source_label`, `import_key`, connector/client when available, and timestamp.
- Keep derived ids, for example `derived_task_ids`, so future agents can trace an imported bundle back to concrete tasks.
- Keep an append-only `change_logs` record with source `mcp`.
- Do not store secrets or raw MCP tokens in payload snapshots or logs.

This is the AI-native shape: user-facing tables for the app, plus structured provenance and context for future agents.

### MCP Import Payload

`import_plan_bundle`

```json
{
  "import_key": "claude-cowork-2026-06-12-v0-2-plan",
  "created_by": "claude",
  "source_label": "Claude Cowork task progress review",
  "overall_plan": {
    "title": "PawPlan v0.2",
    "summary": "Ship hosted MCP connection and imported planning views."
  },
  "daily_tasks": [
    {
      "title": "Implement hosted MCP endpoint",
      "date": "2026-06-12",
      "day_segment": "afternoon",
      "estimated_minutes": 90,
      "priority": "high",
      "energy_level": "high",
      "notes": "Imported from Claude/Codex planning discussion.",
      "project_name": "PawPlan",
      "track_name": "Product"
    }
  ],
  "weekly_summary": {
    "week_start": "2026-06-08",
    "focus": "Make PawPlan agent-readable and agent-writable.",
    "milestones": ["Hosted MCP", "Token UI", "Claude/Cowork connector smoke"]
  },
  "monthly_summary": {
    "month": "2026-06",
    "goal": "Move PawPlan from deployed prototype to usable personal planning loop.",
    "milestones": ["Production deploy", "MCP import", "Review workflow"]
  }
}
```

Rules:

- `import_key` is required and unique per workspace.
- If the same `import_key` already exists, return the existing import summary and create no tasks.
- Each `daily_tasks[]` row creates one `tasks` row attached to the active plan.
- `project_name` and `track_name` are optional; when present, reuse existing project/track by name or create it.
- `overall_plan`, `weekly_summary`, and `monthly_summary` are stored in the active plan snapshot so the Plan month view can render real summary cards.
- This tool is for trusted import of already-discussed planning output. Later adjustments still use Review.

### Token API

`GET /api/mcp-tokens`

Response:

```json
{
  "workspaceId": "511b7f4d-37b4-44f7-a66b-d3af972e03ce",
  "tokens": [
    {
      "id": "uuid",
      "name": "Codex local",
      "permission": "read_write",
      "expiresAt": null,
      "revokedAt": null,
      "createdAt": "2026-06-12T00:00:00.000Z"
    }
  ],
  "mcp": {
    "url": "https://pawplan.charlottezmm.info/api/mcp",
    "codexConfig": "[mcp_servers.pawplan]\\nurl = \"https://pawplan.charlottezmm.info/api/mcp\"\\nbearer_token_env_var = \"PAWPLAN_MCP_TOKEN\"\\nstartup_timeout_sec = 30\\ntool_timeout_sec = 60\\ndefault_tools_approval_mode = \"prompt\""
  }
}
```

`POST /api/mcp-tokens`

Request:

```json
{
  "name": "Codex local",
  "permission": "read_write",
  "expiresInDays": null
}
```

Response:

```json
{
  "token": {
    "id": "uuid",
    "name": "Codex local",
    "permission": "read_write",
    "expiresAt": null,
    "revokedAt": null,
    "createdAt": "2026-06-12T00:00:00.000Z"
  },
  "rawToken": "pwp_live_..."
}
```

`PATCH /api/mcp-tokens`

Request:

```json
{
  "action": "revoke",
  "id": "uuid"
}
```

Response:

```json
{ "ok": true }
```

### Hosted MCP Config

Recommended user-facing Codex config:

```toml
[mcp_servers.pawplan]
url = "https://pawplan.charlottezmm.info/api/mcp"
bearer_token_env_var = "PAWPLAN_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

User then starts Codex with `PAWPLAN_MCP_TOKEN` available in the local environment. If Desktop cannot inherit shell env reliably, Settings may also show a less preferred static header option:

```toml
[mcp_servers.pawplan]
url = "https://pawplan.charlottezmm.info/api/mcp"
http_headers = { Authorization = "Bearer pwp_live_..." }
startup_timeout_sec = 30
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

The static header option is less ideal because it stores the raw token in `config.toml`, but the token is revocable and scoped to one workspace.

---

## Implementation Tasks

### Task 1: Token Service

**Files:**
- Create: `src/lib/mcp/tokens.ts`
- Test: `src/tests/unit/mcp-token-service.test.ts`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add token service failing tests**

Create `src/tests/unit/mcp-token-service.test.ts`:

```ts
import { getTableName } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createMcpToken, hashMcpToken, listMcpTokens, revokeMcpToken, verifyMcpBearerToken } from "@/lib/mcp/tokens";

function createFakeDb(options: { tokenRows?: Array<Record<string, unknown>> } = {}) {
  const inserts: Array<{ table: string; values: Record<string, unknown> }> = [];
  const updates: Array<{ table: string; values: Record<string, unknown> }> = [];

  function tableName(table: unknown) {
    return getTableName(table as Parameters<typeof getTableName>[0]);
  }

  return {
    inserts,
    updates,
    select() {
      return {
        from(table: unknown) {
          return {
            where() {
              return {
                orderBy() {
                  return Promise.resolve(options.tokenRows ?? []);
                },
                limit(count: number) {
                  return Promise.resolve((options.tokenRows ?? []).slice(0, count));
                },
                then(resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) {
                  return Promise.resolve(options.tokenRows ?? []).then(resolve, reject);
                },
              };
            },
          };
        },
      };
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          inserts.push({ table: tableName(table), values });
          return {
            returning() {
              return Promise.resolve([{ id: "token-1", ...values }]);
            },
          };
        },
      };
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              updates.push({ table: tableName(table), values });
              return {
                returning() {
                  return Promise.resolve([{ id: "token-1", ...values }]);
                },
              };
            },
          };
        },
      };
    },
  };
}

describe("MCP token service", () => {
  it("creates a raw token once and stores only a hash", async () => {
    const db = createFakeDb();

    const result = await createMcpToken(db, "workspace-1", {
      name: "Codex local",
      permission: "read_write",
      expiresInDays: null,
    });

    expect(result.rawToken).toMatch(/^pwp_live_/);
    expect(result.token).toEqual(expect.objectContaining({ name: "Codex local", permission: "read_write" }));
    expect(db.inserts[0]).toEqual(
      expect.objectContaining({
        table: "mcp_tokens",
        values: expect.objectContaining({
          workspaceId: "workspace-1",
          name: "Codex local",
          permission: "read_write",
          tokenHash: expect.any(String),
          expiresAt: null,
        }),
      }),
    );
    expect(JSON.stringify(db.inserts[0].values)).not.toContain(result.rawToken);
  });

  it("lists active tokens without token hashes", async () => {
    const db = createFakeDb({
      tokenRows: [
        {
          id: "token-1",
          workspaceId: "workspace-1",
          tokenHash: "secret-hash",
          name: "Codex local",
          permission: "read_only",
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date("2026-06-12T00:00:00.000Z"),
        },
      ],
    });

    const result = await listMcpTokens(db, "workspace-1");

    expect(result).toEqual([
      {
        id: "token-1",
        name: "Codex local",
        permission: "read_only",
        expiresAt: null,
        revokedAt: null,
        createdAt: "2026-06-12T00:00:00.000Z",
      },
    ]);
    expect(JSON.stringify(result)).not.toContain("secret-hash");
  });

  it("revokes workspace-scoped tokens", async () => {
    const db = createFakeDb();

    await revokeMcpToken(db, "workspace-1", "token-1");

    expect(db.updates[0]).toEqual(
      expect.objectContaining({
        table: "mcp_tokens",
        values: expect.objectContaining({ revokedAt: expect.any(Date) }),
      }),
    );
  });

  it("verifies a bearer token against non-revoked rows", async () => {
    const created = await createMcpToken(createFakeDb(), "workspace-1", {
      name: "Codex local",
      permission: "read_write",
      expiresInDays: null,
    });
    const db = createFakeDb({
      tokenRows: [
        {
          id: "token-1",
          workspaceId: "workspace-1",
          tokenHash: hashMcpToken(created.rawToken),
          name: "Codex local",
          permission: "read_write",
          expiresAt: null,
          revokedAt: null,
          createdAt: new Date(),
        },
      ],
    });

    const result = await verifyMcpBearerToken(db, created.rawToken);

    expect(result).toEqual({ workspaceId: "workspace-1", permission: "read_write", tokenId: "token-1" });
  });
});
```

Expected initial failure:

```bash
npm run test -- src/tests/unit/mcp-token-service.test.ts
```

Expected: FAIL because `@/lib/mcp/tokens` does not exist.

- [ ] **Step 2: Implement token service**

Create `src/lib/mcp/tokens.ts`:

```ts
import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { mcpTokens } from "@/lib/db/schema";

type Permission = "read_only" | "read_write";

type DbLike = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  update: (...args: any[]) => any;
};

export class McpTokenError extends Error {
  constructor(message: string, public status = 400) {
    super(message);
  }
}

export function hashMcpToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function serializeToken(row: Record<string, any>) {
  return {
    id: row.id,
    name: row.name,
    permission: row.permission,
    expiresAt: row.expiresAt instanceof Date ? row.expiresAt.toISOString() : row.expiresAt,
    revokedAt: row.revokedAt instanceof Date ? row.revokedAt.toISOString() : row.revokedAt,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : row.createdAt,
  };
}

export async function createMcpToken(
  db: DbLike,
  workspaceId: string,
  input: { name: string; permission: Permission; expiresInDays: number | null },
) {
  const rawToken = `pwp_live_${randomBytes(32).toString("base64url")}`;
  const expiresAt = input.expiresInDays === null ? null : new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000);
  const [token] = await db
    .insert(mcpTokens)
    .values({
      workspaceId,
      name: input.name,
      permission: input.permission,
      tokenHash: hashMcpToken(rawToken),
      expiresAt,
    })
    .returning();

  return {
    rawToken,
    token: serializeToken(token),
  };
}

export async function listMcpTokens(db: DbLike, workspaceId: string) {
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(eq(mcpTokens.workspaceId, workspaceId))
    .orderBy(mcpTokens.createdAt);

  return rows.map(serializeToken);
}

export async function revokeMcpToken(db: DbLike, workspaceId: string, id: string) {
  const [token] = await db
    .update(mcpTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpTokens.id, id), eq(mcpTokens.workspaceId, workspaceId)))
    .returning();

  if (!token) throw new McpTokenError("MCP token not found", 404);
  return { ok: true };
}

export async function verifyMcpBearerToken(db: DbLike, rawToken: string) {
  if (!rawToken.startsWith("pwp_live_")) throw new McpTokenError("Invalid MCP token", 401);
  const tokenHash = hashMcpToken(rawToken);
  const now = new Date();
  const rows = await db
    .select()
    .from(mcpTokens)
    .where(and(isNull(mcpTokens.revokedAt), or(isNull(mcpTokens.expiresAt), gt(mcpTokens.expiresAt, now))));

  const token = rows.find((row: Record<string, any>) => safeEqual(row.tokenHash, tokenHash));
  if (!token) throw new McpTokenError("Invalid MCP token", 401);

  return {
    workspaceId: token.workspaceId as string,
    permission: token.permission as Permission,
    tokenId: token.id as string,
  };
}
```

- [ ] **Step 3: Add schema index**

Modify `src/lib/db/schema.ts` so token verification can use a narrow lookup path. Add `index` to the Drizzle imports if it is not already imported, then add this index inside the `mcpTokens` table callback:

```ts
tokenHashIndex: index("mcp_tokens_token_hash_idx").on(table.tokenHash)
```

Then run:

```bash
npm run db:generate
npm run test -- src/tests/unit/mcp-token-service.test.ts
```

Expected: token service tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/lib/mcp/tokens.ts src/tests/unit/mcp-token-service.test.ts src/lib/db/schema.ts drizzle
git commit -m "feat: add PawPlan MCP token service"
```

---

### Task 2: Token API

**Files:**
- Create: `src/app/api/mcp-tokens/route.ts`
- Test: `src/tests/unit/mcp-token-route.test.ts`

- [ ] **Step 1: Write route tests**

Create `src/tests/unit/mcp-token-route.test.ts` with module mocks for `getWorkspaceIdFromSession`, `getDb`, and token service. Required cases:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getWorkspaceIdFromSession: vi.fn() }));
vi.mock("@/lib/db/client", () => ({ getDb: vi.fn(() => ({ db: true })) }));
vi.mock("@/lib/mcp/tokens", () => ({
  createMcpToken: vi.fn(),
  listMcpTokens: vi.fn(),
  revokeMcpToken: vi.fn(),
  McpTokenError: class McpTokenError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
}));

import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { createMcpToken, listMcpTokens, revokeMcpToken } from "@/lib/mcp/tokens";
import { GET, PATCH, POST } from "@/app/api/mcp-tokens/route";

describe("MCP token route", () => {
  beforeEach(() => vi.resetAllMocks());

  it("requires a workspace session", async () => {
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
  });

  it("lists tokens and hosted MCP config", async () => {
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(listMcpTokens).mockResolvedValue([{ id: "token-1", name: "Codex", permission: "read_write" }]);

    const response = await GET();
    const json = await response.json();

    expect(json.workspaceId).toBe("workspace-1");
    expect(json.mcp.url).toBe("https://pawplan.charlottezmm.info/api/mcp");
    expect(json.mcp.codexConfig).toContain("bearer_token_env_var");
    expect(json.tokens).toHaveLength(1);
  });

  it("creates read-write tokens and returns raw token once", async () => {
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(createMcpToken).mockResolvedValue({
      rawToken: "pwp_live_secret",
      token: { id: "token-1", name: "Codex", permission: "read_write" },
    });

    const response = await POST(new Request("https://pawplan.test/api/mcp-tokens", {
      method: "POST",
      body: JSON.stringify({ name: "Codex", permission: "read_write", expiresInDays: null }),
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.rawToken).toBe("pwp_live_secret");
    expect(createMcpToken).toHaveBeenCalledWith(expect.anything(), "workspace-1", {
      name: "Codex",
      permission: "read_write",
      expiresInDays: null,
    });
  });

  it("revokes tokens", async () => {
    vi.mocked(getWorkspaceIdFromSession).mockResolvedValue("workspace-1");
    vi.mocked(revokeMcpToken).mockResolvedValue({ ok: true });

    const response = await PATCH(new Request("https://pawplan.test/api/mcp-tokens", {
      method: "PATCH",
      body: JSON.stringify({ action: "revoke", id: "00000000-0000-0000-0000-000000000001" }),
    }));

    expect(response.status).toBe(200);
    expect(revokeMcpToken).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Implement route**

Create `src/app/api/mcp-tokens/route.ts`:

```ts
import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkspaceIdFromSession } from "@/lib/auth/session";
import { getDb } from "@/lib/db/client";
import { createMcpToken, listMcpTokens, McpTokenError, revokeMcpToken } from "@/lib/mcp/tokens";
import { readJsonBody } from "@/lib/validation/common";

const tokenCreateSchema = z.object({
  name: z.string().trim().min(1).max(120),
  permission: z.enum(["read_only", "read_write"]),
  expiresInDays: z.number().int().min(1).max(365).nullable(),
});

const tokenPatchSchema = z.object({
  action: z.literal("revoke"),
  id: z.string().uuid(),
});

function hostedMcpUrl() {
  return process.env.NEXT_PUBLIC_PAWPLAN_MCP_URL ?? "https://pawplan.charlottezmm.info/api/mcp";
}

function codexConfig(url: string) {
  return [
    "[mcp_servers.pawplan]",
    `url = "${url}"`,
    'bearer_token_env_var = "PAWPLAN_MCP_TOKEN"',
    "startup_timeout_sec = 30",
    "tool_timeout_sec = 60",
    'default_tools_approval_mode = "prompt"',
  ].join("\n");
}

function tokenError(error: unknown) {
  if (error instanceof McpTokenError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  return NextResponse.json({ error: "MCP token operation failed" }, { status: 500 });
}

export async function GET() {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = hostedMcpUrl();
  return NextResponse.json({
    workspaceId,
    tokens: await listMcpTokens(getDb(), workspaceId),
    mcp: {
      url,
      codexConfig: codexConfig(url),
    },
  });
}

export async function POST(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = tokenCreateSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid MCP token payload" }, { status: 400 });

  try {
    return NextResponse.json(await createMcpToken(getDb(), workspaceId, parsed.data));
  } catch (error) {
    return tokenError(error);
  }
}

export async function PATCH(request: Request) {
  const workspaceId = await getWorkspaceIdFromSession();
  if (!workspaceId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = tokenPatchSchema.safeParse(await readJsonBody(request));
  if (!parsed.success) return NextResponse.json({ error: "Invalid MCP token action" }, { status: 400 });

  try {
    return NextResponse.json(await revokeMcpToken(getDb(), workspaceId, parsed.data.id));
  } catch (error) {
    return tokenError(error);
  }
}
```

- [ ] **Step 3: Run route tests**

```bash
npm run test -- src/tests/unit/mcp-token-route.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp-tokens/route.ts src/tests/unit/mcp-token-route.test.ts
git commit -m "feat: expose PawPlan MCP token API"
```

---

### Task 3: MCP Plan Import Service

**Files:**
- Create: `src/lib/mcp/plan-import.ts`
- Test: `src/tests/unit/mcp-plan-import.test.ts`
- Modify: `src/lib/db/schema.ts`

- [ ] **Step 1: Add import table and migration**

Add `mcpPlanImports` to `src/lib/db/schema.ts`:

```ts
export const mcpPlanImports = pgTable("mcp_plan_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  workspaceId: uuid("workspace_id").notNull().references(() => workspaces.id, { onDelete: "cascade" }),
  planId: uuid("plan_id").notNull().references(() => plans.id, { onDelete: "cascade" }),
  importKey: varchar("import_key", { length: 160 }).notNull(),
  createdBy: varchar("created_by", { length: 40 }).notNull(),
  sourceLabel: varchar("source_label", { length: 120 }),
  taskCount: integer("task_count").notNull(),
  snapshot: jsonb("snapshot").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
  uniqueWorkspaceImportKey: uniqueIndex("mcp_plan_imports_workspace_id_import_key_unique").on(table.workspaceId, table.importKey),
}));
```

Run:

```bash
npm run db:generate
```

- [ ] **Step 2: Write service tests**

Create `src/tests/unit/mcp-plan-import.test.ts` with required cases:

- creates tasks from `daily_tasks`;
- creates/reuses projects and tracks by name;
- updates active plan `baselineSnapshot.importSummary`;
- inserts one `mcp_plan_imports` row;
- inserts one `change_logs` row with source `mcp`;
- returns existing import summary and creates no tasks when `import_key` already exists.

- [ ] **Step 3: Implement `saveMcpPlanImport`**

Create `src/lib/mcp/plan-import.ts`:

```ts
export async function saveMcpPlanImport(db: PlanningDb, input: McpPlanImportInput) {
  return db.transaction(async (tx) => {
    const existing = await findImportByKey(tx, input.workspaceId, input.importKey);
    if (existing) return { imported: false, duplicate: true, tasksCreated: existing.taskCount, importId: existing.id };

    const plan = await requireActivePlan(tx, input.workspaceId);
    const projectIds = await upsertProjectsByName(tx, input.workspaceId, input.dailyTasks);
    const trackIds = await upsertTracksByName(tx, input.workspaceId, input.dailyTasks);
    const createdTasks = await insertDailyTasks(tx, { workspaceId: input.workspaceId, planId: plan.id, tasks: input.dailyTasks, projectIds, trackIds });
    const snapshot = buildImportedPlanSnapshot(plan.baselineSnapshot, input, createdTasks);
    const importRow = await insertImportRow(tx, { workspaceId: input.workspaceId, planId: plan.id, input, taskCount: createdTasks.length, snapshot });

    await updateActivePlanSnapshot(tx, plan.id, input.workspaceId, snapshot);
    await insertMcpImportChangelog(tx, { workspaceId: input.workspaceId, planId: plan.id, importRow, taskCount: createdTasks.length });

    return { imported: true, duplicate: false, importId: importRow.id, tasksCreated: createdTasks.length };
  });
}
```

Use existing date helpers from `src/lib/mcp/tools.ts` or move them into a shared date module; do not duplicate timezone parsing logic in two places.

- [ ] **Step 4: Run tests**

```bash
npm run test -- src/tests/unit/mcp-plan-import.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/plan-import.ts src/tests/unit/mcp-plan-import.test.ts src/lib/db/schema.ts drizzle
git commit -m "feat: add MCP plan import service"
```

---

### Task 4: Shared MCP Server Builder And Permission Enforcement

**Files:**
- Create: `src/lib/mcp/server-builder.ts`
- Modify: `src/lib/mcp/tools.ts`
- Modify: `src/mcp/server.ts`
- Test: `src/tests/unit/mcp-tools.test.ts`

- [ ] **Step 1: Add permission tests**

Extend `src/tests/unit/mcp-tools.test.ts`:

```ts
it("denies write MCP tools for read-only tokens", async () => {
  const db = createFakeDb({ activePlanId: "plan-1" });

  await expect(
    runPawPlanTool(db, "workspace-1", "create_inbox_item", { title: "Blocked write" }, "read_only"),
  ).rejects.toThrow("MCP token does not allow write tools");
});

it("allows read MCP tools for read-only tokens", async () => {
  const db = createFakeDb({ selectRows: { tasks: [] } });

  const result = await runPawPlanTool(db, "workspace-1", "get_tasks", {}, "read_only");

  expect(result).toEqual({ workspaceId: "workspace-1", filters: {}, tasks: [] });
});
```

- [ ] **Step 2: Add permission metadata**

Modify `src/lib/mcp/tools.ts`:

```ts
type McpPermission = "read_only" | "read_write";

const toolPermissions: Record<PawPlanToolName, "read" | "write"> = {
  get_today: "read",
  get_week: "read",
  get_month: "read",
  get_checkins: "read",
  get_tasks: "read",
  create_inbox_item: "write",
  create_checkin: "write",
  update_task_status: "write",
  import_plan_bundle: "write",
  propose_patch: "write",
};

export function allowedPawPlanToolNames(permission: McpPermission) {
  return pawPlanToolNames.filter((name) => permission === "read_write" || toolPermissions[name] === "read");
}
```

- [ ] **Step 3: Add direct plan import tool**

Modify `src/lib/mcp/tools.ts` to add `import_plan_bundle`. The schema should accept the MCP import payload defined above:

```ts
import_plan_bundle: z
  .object({
    import_key: z.string().trim().min(1).max(160),
    created_by: z.enum(["codex", "claude", "user"]).optional(),
    source_label: z.string().trim().max(120).optional(),
    overall_plan: z.object({
      title: z.string().trim().min(1).max(180),
      summary: z.string().trim().min(1).max(2000),
    }),
    daily_tasks: z.array(z.object({
      title: z.string().trim().min(1).max(240),
      date: dateStringSchema,
      day_segment: daySegmentSchema,
      estimated_minutes: z.number().int().min(5).max(480),
      priority: prioritySchema.optional(),
      energy_level: z.enum(["low", "medium", "high"]).optional(),
      notes: z.string().max(2000).optional(),
      project_name: z.string().trim().max(120).optional(),
      track_name: z.string().trim().max(120).optional(),
    })).min(1).max(200),
    weekly_summary: z.object({
      week_start: dateStringSchema,
      focus: z.string().trim().min(1).max(2000),
      milestones: z.array(z.string().trim().min(1).max(240)).max(20),
    }),
    monthly_summary: z.object({
      month: z.string().regex(/^\d{4}-\d{2}$/),
      goal: z.string().trim().min(1).max(2000),
      milestones: z.array(z.string().trim().min(1).max(240)).max(30),
    }),
  })
  .strict(),
```

Add a unit test in `src/tests/unit/mcp-tools.test.ts`:

```ts
it("imports a bundled plan into real PawPlan tasks", async () => {
  const db = createFakeDb({ activePlanId: "plan-1" });

  const result = await runPawPlanTool(db, "workspace-1", "import_plan_bundle", {
    import_key: "claude-cowork-2026-06-12",
    created_by: "claude",
    overall_plan: { title: "PawPlan v0.2", summary: "Ship hosted MCP and direct plan import." },
    daily_tasks: [{
      title: "Implement hosted MCP endpoint",
      date: "2026-06-12",
      day_segment: "afternoon",
      estimated_minutes: 90,
      priority: "high",
      energy_level: "high",
      project_name: "PawPlan",
      track_name: "Product",
    }],
    weekly_summary: { week_start: "2026-06-08", focus: "MCP import loop", milestones: ["Hosted MCP"] },
    monthly_summary: { month: "2026-06", goal: "Usable personal planning loop", milestones: ["MCP import"] },
  });

  expect(result).toEqual(expect.objectContaining({ imported: true, tasksCreated: 1 }));
});
```

`import_plan_bundle` must call `saveMcpPlanImport` from `src/lib/mcp/plan-import.ts`. It writes real tasks, updates the active plan snapshot, and records a changelog. It must not call `proposeAgentPatch`.

Update `runPawPlanTool` signature:

```ts
export async function runPawPlanTool(
  db: PlanningDb,
  workspaceId: string,
  name: string,
  args: unknown = {},
  permission: McpPermission = "read_write",
) {
  if (!workspaceId) throw new Error("PAWPLAN_WORKSPACE_ID is required");
  if (!Object.hasOwn(pawPlanToolSchemas, name)) throw new Error(`Unknown PawPlan MCP tool: ${name}`);

  const toolName = name as PawPlanToolName;
  if (permission !== "read_write" && toolPermissions[toolName] === "write") {
    throw new Error("MCP token does not allow write tools");
  }

  // keep existing tool dispatch below
}
```

- [ ] **Step 4: Create server builder**

Create `src/lib/mcp/server-builder.ts`:

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDb } from "@/lib/db/client";
import {
  allowedPawPlanToolNames,
  pawPlanToolDescriptions,
  pawPlanToolSchemas,
  runPawPlanTool,
  type PawPlanToolName,
} from "@/lib/mcp/tools";

type McpPermission = "read_only" | "read_write";

function jsonToolResult(value: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(value, null, 2),
      },
    ],
    structuredContent: value as Record<string, unknown>,
  };
}

export function createPawPlanMcpServer(input: { workspaceId: string; permission: McpPermission }) {
  const db = getDb();
  const server = new McpServer({ name: "pawplan", version: "0.2.0" });

  for (const name of allowedPawPlanToolNames(input.permission)) {
    const toolName: PawPlanToolName = name;
    server.registerTool(
      toolName,
      {
        description: pawPlanToolDescriptions[toolName],
        inputSchema: pawPlanToolSchemas[toolName].shape,
      },
      async (args: unknown) =>
        jsonToolResult(await runPawPlanTool(db, input.workspaceId, toolName, args, input.permission)),
    );
  }

  return server;
}
```

- [ ] **Step 5: Refactor stdio server to use builder**

Modify `src/mcp/server.ts`:

```ts
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPawPlanMcpServer } from "@/lib/mcp/server-builder";

function requiredWorkspaceId() {
  const workspaceId = process.env.PAWPLAN_WORKSPACE_ID;
  if (!workspaceId) throw new Error("PAWPLAN_WORKSPACE_ID is required");
  return workspaceId;
}

async function main() {
  const permission = process.env.PAWPLAN_MCP_PERMISSION === "read_only" ? "read_only" : "read_write";
  const server = createPawPlanMcpServer({ workspaceId: requiredWorkspaceId(), permission });
  await server.connect(new StdioServerTransport());
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
```

- [ ] **Step 6: Run MCP tests**

```bash
npm run test -- src/tests/unit/mcp-tools.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/mcp/tools.ts src/lib/mcp/server-builder.ts src/mcp/server.ts src/tests/unit/mcp-tools.test.ts
git commit -m "feat: enforce PawPlan MCP permissions"
```

---

### Task 5: Hosted Streamable HTTP MCP Route

**Files:**
- Create: `src/app/api/mcp/route.ts`
- Test: `src/tests/unit/mcp-http-route.test.ts`

- [ ] **Step 1: Write route tests**

Create `src/tests/unit/mcp-http-route.test.ts`. Test at minimum:

```ts
import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/db/client", () => ({ getDb: vi.fn(() => ({ select: vi.fn() })) }));
vi.mock("@/lib/mcp/tokens", () => ({
  verifyMcpBearerToken: vi.fn(),
  McpTokenError: class McpTokenError extends Error {
    constructor(message: string, public status = 400) {
      super(message);
    }
  },
}));
vi.mock("@/lib/mcp/server-builder", () => ({
  createPawPlanMcpServer: vi.fn(() => ({
    connect: vi.fn(),
  })),
}));

import { createPawPlanMcpServer } from "@/lib/mcp/server-builder";
import { verifyMcpBearerToken } from "@/lib/mcp/tokens";
import { POST } from "@/app/api/mcp/route";

describe("hosted MCP route", () => {
  it("requires bearer token", async () => {
    const response = await POST(new Request("https://pawplan.test/api/mcp", { method: "POST" }));
    expect(response.status).toBe(401);
  });

  it("resolves bearer token before building MCP server", async () => {
    vi.mocked(verifyMcpBearerToken).mockResolvedValue({
      workspaceId: "workspace-1",
      permission: "read_write",
      tokenId: "token-1",
    });

    await POST(new Request("https://pawplan.test/api/mcp", {
      method: "POST",
      headers: { Authorization: "Bearer pwp_live_secret" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} }),
    }));

    expect(createPawPlanMcpServer).toHaveBeenCalledWith({ workspaceId: "workspace-1", permission: "read_write" });
  });
});
```

- [ ] **Step 2: Implement route**

Create `src/app/api/mcp/route.ts` using the web-standard streamable transport supported by the installed MCP SDK:

```ts
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { getDb } from "@/lib/db/client";
import { createPawPlanMcpServer } from "@/lib/mcp/server-builder";
import { McpTokenError, verifyMcpBearerToken } from "@/lib/mcp/tokens";

export const dynamic = "force-dynamic";

function bearerToken(request: Request) {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) throw new McpTokenError("Missing MCP bearer token", 401);
  return header.slice("Bearer ".length).trim();
}

function errorResponse(error: unknown) {
  if (error instanceof McpTokenError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "MCP request failed" }, { status: 500 });
}

async function handle(request: Request) {
  try {
    const auth = await verifyMcpBearerToken(getDb(), bearerToken(request));
    const server = createPawPlanMcpServer({ workspaceId: auth.workspaceId, permission: auth.permission });
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    return transport.handleRequest(request);
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  return handle(request);
}

export async function GET(request: Request) {
  return handle(request);
}
```

If TypeScript reports an exact option mismatch for `WebStandardStreamableHTTPServerTransport`, inspect `node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.d.ts` and keep stateless mode; do not switch to a global singleton transport unless the SDK requires it.

- [ ] **Step 3: Run HTTP route tests and build**

```bash
npm run test -- src/tests/unit/mcp-http-route.test.ts
npm run build
```

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/mcp/route.ts src/tests/unit/mcp-http-route.test.ts
git commit -m "feat: add hosted PawPlan MCP endpoint"
```

---

### Task 6: Plan View Uses Imported Data

**Files:**
- Modify: `src/lib/planning/view-data.ts`
- Modify: `src/components/plan-view.tsx`
- Test: existing view-data tests or add `src/tests/unit/plan-view-data.test.ts`

- [ ] **Step 1: Add month view data**

Expose imported plan summary and monthly task distribution from `getWeekPageData` or a new `getPlanPageData` helper:

```ts
type MonthPlanViewData = {
  overallPlan: { title: string; summary: string } | null;
  weeklySummary: { weekStart: string; focus: string; milestones: string[] } | null;
  monthlySummary: { month: string; goal: string; milestones: string[] } | null;
  progressCards: Array<{
    title: string;
    text: string;
    tag: string;
    percent: number | null;
  }>;
};
```

Progress rules:

- `本月目标` percent = completed tasks this month / total tasks this month.
- `每周拆分` percent = number of weeks with at least one task / number of weeks in current month.
- `重要节点` percent = milestones represented in dated tasks / total imported milestones, or `null` if not computable.
- If `percent` is `null`, do not render a progress bar.

- [ ] **Step 2: Remove static placeholder bars**

In `src/components/plan-view.tsx`, remove these hard-coded widths:

```tsx
title === "本月目标" ? "60%" : title === "每周拆分" ? "45%" : "72%"
```

Render real `progressCards`. If no import exists, show a clear empty state:

```txt
还没有通过 MCP 导入计划。连接 Codex/Cowork 后，可以把讨论好的任务进度导入到 PawPlan。
```

- [ ] **Step 3: Verify UI**

```bash
npm run test
npm run build
npm run test:e2e -- src/tests/e2e/mcp-settings.spec.ts --project=mobile-safari
```

Expected:

- Month tab no longer shows fake progress bars.
- After MCP import, day/week/month tabs show imported tasks and summaries.

---

### Task 7: Inbox As First-Class Capture Surface

**Files:**
- Modify: `src/components/app-shell.tsx`
- Modify: `src/components/more-view.tsx`
- Test: `src/tests/e2e/inbox-navigation.spec.ts`

- [ ] **Step 1: Expose Inbox in primary navigation**

Current state:

- `/inbox` exists.
- `InboxView` exists.
- API routes exist.
- More links to Inbox as "暂存池".
- Main desktop/mobile navigation only shows Today, Plan, Review, More.

v0.2 should expose Inbox as a first-class workflow entry:

```ts
const navItems = [
  { href: "/today", label: "Today" },
  { href: "/plan", label: "Plan" },
  { href: "/inbox", label: "Inbox" },
  { href: "/review", label: "Review" },
  { href: "/more", label: "More" },
];
```

Use a lucide icon such as `Archive` or `Inbox` for the mobile tabbar. Keep More's Inbox card as a secondary route, but the main path should be visible.

- [ ] **Step 2: Add e2e navigation smoke**

Create `src/tests/e2e/inbox-navigation.spec.ts`:

```ts
import { expect, test } from "@playwright/test";

test("Inbox is reachable from primary navigation", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Workspace 名称").fill(`inbox-nav-${Date.now()}`);
  await page.getByPlaceholder("密码").fill("password-1234");
  await page.getByRole("button", { name: "进入" }).click();

  await page.getByRole("link", { name: /Inbox/i }).click();
  await expect(page.getByRole("heading", { name: "暂存池" })).toBeVisible();
});
```

- [ ] **Step 3: Verify mobile**

```bash
npm run test:e2e -- src/tests/e2e/inbox-navigation.spec.ts --project=mobile-safari
```

Expected: Inbox appears in mobile navigation without crowding labels or overlapping the floating cat.

---

### Task 8: Settings UI For MCP Connection

**Files:**
- Modify: `src/components/settings-view.tsx`
- Modify: current floating cat component/style if it lives outside Settings.
- Test: `src/tests/e2e/mcp-settings.spec.ts`

- [ ] **Step 1: Add UI state types**

In `src/components/settings-view.tsx`, add:

```ts
type McpToken = {
  id: string;
  name: string;
  permission: "read_only" | "read_write";
  expiresAt: string | null;
  revokedAt: string | null;
  createdAt: string;
};

type McpTokenResponse = {
  workspaceId: string;
  tokens: McpToken[];
  mcp: {
    url: string;
    codexConfig: string;
  };
};
```

Add state:

```ts
const [workspaceId, setWorkspaceId] = useState<string | null>(null);
const [mcpUrl, setMcpUrl] = useState("");
const [codexConfig, setCodexConfig] = useState("");
const [mcpTokens, setMcpTokens] = useState<McpToken[]>([]);
const [newMcpToken, setNewMcpToken] = useState<string | null>(null);
const [mcpTokenName, setMcpTokenName] = useState("Codex local");
const [mcpPermission, setMcpPermission] = useState<"read_only" | "read_write">("read_write");
```

- [ ] **Step 2: Add API helpers**

Add helpers inside `SettingsView`:

```ts
async function loadMcpTokens() {
  const response = await fetch("/api/mcp-tokens");
  if (!response.ok) {
    setMessage("MCP 连接状态读取失败。");
    return;
  }
  const data = (await response.json()) as McpTokenResponse;
  setWorkspaceId(data.workspaceId);
  setMcpUrl(data.mcp.url);
  setCodexConfig(data.mcp.codexConfig);
  setMcpTokens(data.tokens);
}

async function createToken() {
  setPending("mcp-token");
  const response = await fetch("/api/mcp-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: mcpTokenName, permission: mcpPermission, expiresInDays: null }),
  });
  const data = (await response.json()) as { rawToken?: string; token?: McpToken; error?: string };
  setPending(null);

  if (!response.ok || !data.rawToken || !data.token) {
    setMessage(data.error ?? "MCP token 创建失败。");
    return;
  }

  setNewMcpToken(data.rawToken);
  setMcpTokens((current) => [data.token as McpToken, ...current]);
  setMessage("MCP token 已创建，只会显示这一次。");
}

async function revokeToken(id: string) {
  setPending(id);
  const response = await fetch("/api/mcp-tokens", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action: "revoke", id }),
  });
  setPending(null);

  if (!response.ok) {
    setMessage("MCP token 撤销失败。");
    return;
  }

  setMcpTokens((current) => current.filter((token) => token.id !== id));
  setMessage("MCP token 已撤销。");
}
```

Call `loadMcpTokens()` in the existing `useEffect` next to `loadSettings()`.

- [ ] **Step 3: Replace disabled MCP card**

Replace the current "Workspace / MCP 还未开放" card with:

```tsx
<section className="paw-list-card mb-4">
  <div className="paw-list-header">
    <div>
      <h2 className="paw-list-title">Workspace / MCP</h2>
      <p className="paw-list-subtitle">生成 workspace-scoped token，把 Codex 连接到 PawPlan 的 hosted MCP endpoint。</p>
    </div>
    <span className="paw-more-icon">
      <KeyRound size={18} />
    </span>
  </div>

  <div className="paw-settings-grid mt-4">
    <div className="paw-settings-field">
      <label>Workspace ID</label>
      <input className="paw-input" readOnly value={workspaceId ?? "未加载"} />
    </div>
    <div className="paw-settings-field">
      <label>MCP URL</label>
      <input className="paw-input" readOnly value={mcpUrl} />
    </div>
  </div>

  <div className="paw-settings-field mt-4">
    <label>Codex / Claude Cowork 连接配置</label>
    <textarea className="paw-textarea" readOnly value={codexConfig} rows={6} />
  </div>

  {newMcpToken ? (
    <div className="paw-agent-row mt-4">
      <CatIcon size={32} mood="alert" />
      <div>
        <p className="paw-agent-msg">新 token 只显示一次。保存到本机环境变量、Codex config 或 Claude Cowork custom connector 后再关闭页面。</p>
        <code className="paw-code-block">{newMcpToken}</code>
      </div>
    </div>
  ) : null}

  <div className="paw-settings-grid mt-4">
    <input className="paw-input" value={mcpTokenName} onChange={(event) => setMcpTokenName(event.target.value)} />
    <select className="paw-input" value={mcpPermission} onChange={(event) => setMcpPermission(event.target.value as "read_only" | "read_write")}>
      <option value="read_write">read_write</option>
      <option value="read_only">read_only</option>
    </select>
    <button className="paw-primary-btn" disabled={pending === "mcp-token"} onClick={createToken}>
      {pending === "mcp-token" ? "生成中..." : "生成 MCP token"}
    </button>
  </div>

  <div className="paw-list-stack mt-4">
    {mcpTokens.map((token) => (
      <div className="paw-list-row" key={token.id}>
        <div>
          <h3>{token.name}</h3>
          <p>{token.permission} / {new Date(token.createdAt).toLocaleString()}</p>
        </div>
        <button className="paw-icon-btn danger" disabled={pending === token.id} onClick={() => revokeToken(token.id)}>
          <Trash2 size={16} />
        </button>
      </div>
    ))}
  </div>
</section>
```

If class names do not exist after the UI redesign, reuse existing PawPlan classes in `src/app/globals.css`; do not introduce a new design system.

- [ ] **Step 4: Add E2E smoke**

Create `src/tests/e2e/mcp-settings.spec.ts`:

```ts
import { test, expect } from "@playwright/test";

test("settings exposes MCP connection controls", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder("Workspace 名称").fill(`mcp-settings-${Date.now()}`);
  await page.getByPlaceholder("密码").fill("password-1234");
  await page.getByRole("button", { name: "进入" }).click();
  await page.goto("/settings");

  await expect(page.getByText("Workspace / MCP")).toBeVisible();
  await expect(page.getByText("Codex / Claude Cowork 连接配置")).toBeVisible();
  await expect(page.getByRole("button", { name: "生成 MCP token" })).toBeVisible();
});
```

- [ ] **Step 5: Run UI tests**

```bash
npm run test
npm run build
npm run test:e2e -- src/tests/e2e/mcp-settings.spec.ts
```

Expected: all PASS.

- [ ] **Step 6: Verify mobile cat placement**

Use Playwright mobile viewport or the in-app browser device emulation:

```bash
npm run test:e2e -- src/tests/e2e/mcp-settings.spec.ts --project=mobile-safari
```

Expected:

- The floating cat sits in the top-right safe area on mobile.
- It does not cover login inputs, Settings token inputs, MCP config textarea, or primary action buttons.
- Opening the on-screen keyboard path does not hide the active text field behind the cat affordance.

- [ ] **Step 7: Commit**

```bash
git add src/components/settings-view.tsx src/app/globals.css src/tests/e2e/mcp-settings.spec.ts
git commit -m "feat: add MCP connection controls to settings"
```

---

### Task 9: Hosted MCP Integration Verification

**Files:**
- Modify: `docs/automation/pawplan-scheduled-automation.md`

- [ ] **Step 1: Add hosted MCP docs**

Append to `docs/automation/pawplan-scheduled-automation.md`:

````md
## Hosted MCP Endpoint

PawPlan v0.2 exposes a hosted MCP endpoint:

```toml
[mcp_servers.pawplan]
url = "https://pawplan.charlottezmm.info/api/mcp"
bearer_token_env_var = "PAWPLAN_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

Generate `PAWPLAN_MCP_TOKEN` in PawPlan Settings. Tokens are workspace-scoped and revocable. Use `read_only` for inspection-only automations and `read_write` when the agent should create check-ins, inbox items, task status updates, patch previews, or direct trusted plan imports.

The existing stdio MCP server remains available for local development:

```bash
DATABASE_URL="..." PAWPLAN_WORKSPACE_ID="..." npm run mcp
```

## Direct Plan Import Prompt

After MCP is connected, Codex or Claude/Cowork can import the already-discussed plan into PawPlan:

```text
用 PawPlan MCP 把我们已经讨论好的任务进度导入 PawPlan。
请整理成一个 import_plan_bundle payload，包含 import_key、overall_plan、daily_tasks、weekly_summary、monthly_summary。
调用 import_plan_bundle。不要重复导入同一个 import_key，不要覆盖已有任务。
导入后我应该能在 PawPlan 的日计划、周计划、月计划里直接看到这些任务。
```
````

- [ ] **Step 2: Verify with Codex config**

In a fresh Codex session after implementation:

```text
/mcp
```

Expected: `pawplan` appears as enabled.

Then ask:

```text
用 PawPlan MCP 读取今天计划。
```

Expected: agent calls `get_today` and receives the current workspace id.

- [ ] **Step 3: Verify write permission**

Using a `read_write` token, ask:

```text
用 PawPlan MCP 创建一个 inbox item：v0.2 hosted MCP smoke。
```

Expected:

- MCP call succeeds.
- PawPlan `/inbox` shows the item.
- `change_logs.source = mcp` for the write.

Using a `read_only` token, ask the same.

Expected:

- MCP write tool is unavailable or fails with `MCP token does not allow write tools`.

- [ ] **Step 4: Verify direct bundled plan import**

Using a `read_write` token in Codex or Claude/Cowork, ask:

```text
用 PawPlan MCP 把我们已经讨论好的任务进度导入 PawPlan。
请整理成 import_plan_bundle payload，包含 overall_plan、daily_tasks、weekly_summary、monthly_summary。
导入后我应该能在 PawPlan 的日计划、周计划、月计划里直接看到这些任务。
```

Expected:

- Agent calls `import_plan_bundle` once with a stable `import_key`.
- PawPlan creates real `tasks` rows and records `change_logs.source = mcp`.
- Re-running the same prompt with the same `import_key` does not duplicate tasks.
- PawPlan `/plan` day/week/month tabs show the imported tasks and summaries.
- PawPlan `/review` is not required for this initial trusted import; Review remains for later rescheduling.

- [ ] **Step 5: Commit docs**

```bash
git add docs/automation/pawplan-scheduled-automation.md
git commit -m "docs: document hosted PawPlan MCP setup"
```

---

### Task 10: Production Deploy And Handoff

**Files:**
- Create: `docs/handoff/2026-06-12-pawplan-v0-2-handoff.md`

- [ ] **Step 1: Run full verification**

```bash
npm run test
npm run build
npm run test:e2e
```

Expected:

- Unit tests pass.
- Next production build passes.
- Playwright smoke passes.

- [ ] **Step 2: Generate and run migration if schema changed**

If `src/lib/db/schema.ts` changed:

```bash
npm run db:generate
```

Review the generated SQL. Then production migration:

```bash
tmp_env=$(mktemp /tmp/pawplan-prod-env.XXXXXX)
npm_config_cache=/tmp/pawplan-npm-cache-envpull npx vercel env pull "$tmp_env" --environment=production --scope charlottes-projects-f7255399 --yes
set -a
. "$tmp_env"
set +a
npm run db:migrate
rm -f "$tmp_env"
```

Expected: migrations applied successfully. Do not print `DATABASE_URL`.

- [ ] **Step 3: Deploy production**

```bash
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399
```

Expected:

- Vercel deployment ready.
- Alias points to `https://pawplan.charlottezmm.info`.

- [ ] **Step 4: Production smoke**

```bash
curl -I https://pawplan.charlottezmm.info/login
```

Expected: HTTP 200.

Manual browser checks:

- Login with `charlotte`.
- Open `/settings`.
- Generate a `read_write` MCP token.
- Confirm raw token appears once.
- Revoke a test token.
- Open `/review` to confirm patch preview still renders.

- [ ] **Step 5: Handoff**

Create `docs/handoff/2026-06-12-pawplan-v0-2-handoff.md` with:

```md
# PawPlan v0.2 Handoff

## Shipped

- Hosted MCP endpoint:
- MCP token API:
- Settings MCP controls:
- Permission enforcement:
- Scheduled automation docs:

## Production

- URL:
- Deployment:
- Database migration:

## Verification

- npm run test:
- npm run build:
- npm run test:e2e:
- Production smoke:

## Remaining Risks

- Browser cannot automatically edit local Codex config.
- Static token in config.toml is less safe than bearer env var.
- Scheduled automation still lives outside PawPlan app.
- Claude/Cowork connector setup may require account-level Custom Connector access.
- Direct MCP import can create many tasks, so `import_key` idempotency and changelog audit are mandatory.
```

- [ ] **Step 6: Commit and push**

```bash
git add docs/handoff/2026-06-12-pawplan-v0-2-handoff.md
git commit -m "docs: add PawPlan v0.2 handoff"
git status --short --branch
git push
```

Expected:

- Working tree clean.
- Branch pushed.

---

## Risk Notes

- **Secret handling:** Raw MCP tokens must only be shown once. Never write raw tokens into repo files. If a static `http_headers` config is used, remind the user that it is local-machine secret storage and token can be revoked.
- **Hosted MCP on Vercel:** Streamable HTTP over serverless functions may need SDK-specific tuning. If long-lived SSE is unstable, keep endpoint stateless and rely on direct HTTP responses for standard tool calls.
- **Permissions:** Do not expose write tools for `read_only` tokens. Tool filtering is better than letting tools appear and fail later.
- **Automation:** Do not implement app cron. Scheduled automation remains a Codex/Cowork responsibility.
- **UI scope:** Keep Settings practical. No landing page, no extra marketing copy, no fake "connected" status if Codex has not actually called MCP. On mobile, keep the floating cat in the top-right safe area so it never blocks typing.

## Review Checklist

- [ ] Can a user create a token from Settings?
- [ ] Is the raw token shown once and never stored client-side after refresh?
- [ ] Can Codex connect through hosted MCP using official `config.toml` fields?
- [ ] Does `read_only` prevent write tools?
- [ ] Does `read_write` create Review patch previews but never auto-apply?
- [ ] Does `/review` remain the only patch apply surface?
- [ ] Can one Codex/Cowork instruction call `import_plan_bundle` and make PawPlan day/week/month views show real imported tasks?
- [ ] On mobile, is the floating cat in the top-right and clear of inputs, textareas, and keyboard interaction?
- [ ] Are tests and production smoke documented in handoff?
