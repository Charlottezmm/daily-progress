# PawPlan v0.2 Implementation Handoff

Date: 2026-06-12

## Purpose

This handoff is for the next Codex chat window. The goal is to finish PawPlan v0.2 end-to-end, not reopen the product discussion.

v0.2 turns PawPlan into an AI-native planning loop:

1. Charlotte captures loose thoughts in Inbox.
2. Charlotte discusses real task progress with Claude Desktop Cowork or Codex.
3. The agent connects to PawPlan through hosted MCP.
4. The agent imports the confirmed plan through `import_plan_bundle`.
5. PawPlan shows real day/week/month tasks.
6. Charlotte executes and checks in.
7. Later rescheduling goes through Review, not direct overwrite.

## Required Reading

Read these first, in order:

1. `docs/superpowers/plans/2026-06-12-pawplan-v0-2-agent-loop.md`
2. `docs/automation/pawplan-scheduled-automation.md`
3. `docs/handoff/2026-06-11-pawplan-deploy-domain-handoff.md`
4. `src/lib/mcp/tools.ts`
5. `src/lib/db/schema.ts`
6. `src/components/app-shell.tsx`
7. `src/components/plan-view.tsx`
8. `src/components/settings-view.tsx`
9. `src/components/inbox-view.tsx`

Do not reimplement PawPlan from scratch. Preserve the current UI direction and existing app structure.

## Current Production State

- Production URL: `https://pawplan.charlottezmm.info`
- Production workspace: `charlotte`
- Production workspace id: `511b7f4d-37b4-44f7-a66b-d3af972e03ce`
- Production database: Vercel Neon integration `pawplan-db`
- Current branch: `codex/mcp-planning-v0-1`
- Current local v0.2 planning doc is untracked unless already committed by the time you start:
  - `docs/superpowers/plans/2026-06-12-pawplan-v0-2-agent-loop.md`

## Product Decisions Already Made

Do not relitigate these unless code proves them impossible:

- PawPlan browser UI must not edit local `~/.codex/config.toml`.
- Settings should generate/revoke workspace-scoped MCP tokens and show connection instructions.
- Codex and Claude Cowork should connect through hosted HTTPS MCP.
- Claude/Codex direct initial import should use `import_plan_bundle`.
- `import_plan_bundle` writes real `tasks` rows and active plan snapshot metadata.
- Later rescheduling, deferring, priority changes, and split suggestions still go through Review.
- Inbox should be visible as a first-class workflow surface, not hidden only under More.
- Month progress bars must not be fake static values.
- Mobile floating cat should move from bottom-right to top-right so it does not block typing.
- Data storage must be AI-native: normalized rows plus provenance, original structured payload, derived ids, and changelog.

## Functional Closure

The finished user loop should be:

1. User logs into PawPlan.
2. User can open Inbox directly from primary navigation.
3. User can capture loose items into Inbox.
4. User opens Settings and creates a `read_write` MCP token.
5. User connects Codex or Claude Desktop Cowork to PawPlan MCP.
6. User asks the agent to import discussed task progress.
7. Agent calls `import_plan_bundle`.
8. PawPlan stores the import with idempotency and provenance.
9. PawPlan creates real tasks for day/week/month display.
10. User sees imported tasks in Today and Plan.
11. User executes tasks and writes check-ins.
12. Agent reads execution state through MCP.
13. Agent proposes later adjustments through Review.
14. User confirms or rejects Review patches.

## Implementation Stages

### Stage 0: Baseline Check

Run:

```bash
git status --short --branch
npm run test
npm run build
```

Expected:

- Worktree state is understood before edits.
- Existing tests/build pass before v0.2 work begins.

If tests fail before edits, investigate and document the pre-existing failure.

### Stage 1: MCP Token Service

Implement:

- `src/lib/mcp/tokens.ts`
- `src/tests/unit/mcp-token-service.test.ts`
- token hash index in `src/lib/db/schema.ts`

Requirements:

- Raw token is shown once.
- Only token hash is stored.
- Token verification returns `{ workspaceId, permission, tokenId }`.
- Revocation works.
- No raw token in logs, snapshots, or changelogs.

Verify:

```bash
npm run test -- src/tests/unit/mcp-token-service.test.ts
```

### Stage 2: MCP Token API

Implement:

- `src/app/api/mcp-tokens/route.ts`
- `src/tests/unit/mcp-token-route.test.ts`

Endpoints:

- `GET /api/mcp-tokens`
- `POST /api/mcp-tokens`
- `PATCH /api/mcp-tokens`

Requirements:

- Requires workspace session.
- Lists token metadata without hashes.
- Creates token and returns raw token once.
- Revokes token.
- Returns hosted MCP URL and connection config.

Verify:

```bash
npm run test -- src/tests/unit/mcp-token-route.test.ts
```

### Stage 3: AI-Native Plan Import Storage

Implement:

- `mcp_plan_imports` table in `src/lib/db/schema.ts`
- migration via `npm run db:generate`
- `src/lib/mcp/plan-import.ts`
- `src/tests/unit/mcp-plan-import.test.ts`

Table must include:

- `workspace_id`
- `plan_id`
- `import_key`
- `created_by`
- `source_label`
- `task_count`
- `snapshot`
- `derived_task_ids`
- `provenance_json`
- `created_at`
- unique `(workspace_id, import_key)`

Requirements:

- Same `import_key` never duplicates tasks.
- Import creates real `tasks`.
- Optional `project_name` and `track_name` are reused or created.
- Active plan snapshot stores `overall_plan`, `weekly_summary`, `monthly_summary`.
- `change_logs.source = mcp`.
- Payload provenance is preserved.

Verify:

```bash
npm run test -- src/tests/unit/mcp-plan-import.test.ts
```

### Stage 4: MCP Tool Permissions And `import_plan_bundle`

Modify:

- `src/lib/mcp/tools.ts`
- `src/tests/unit/mcp-tools.test.ts`

Add:

- Tool permission metadata.
- `read_only` only sees/uses read tools.
- `read_write` can use write tools.
- `import_plan_bundle` schema and dispatch.

`import_plan_bundle` payload shape:

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

Verify:

```bash
npm run test -- src/tests/unit/mcp-tools.test.ts
```

### Stage 5: Shared MCP Server Builder And Hosted Endpoint

Implement:

- `src/lib/mcp/server-builder.ts`
- `src/app/api/mcp/route.ts`
- refactor `src/mcp/server.ts`
- `src/tests/unit/mcp-http-route.test.ts`

Requirements:

- Existing stdio MCP still works.
- Hosted MCP endpoint works with bearer token.
- Invalid/missing token returns 401.
- `read_only` token cannot write.
- Server is created per resolved workspace and permission.

Verify:

```bash
npm run test -- src/tests/unit/mcp-http-route.test.ts
npm run test -- src/tests/unit/mcp-tools.test.ts
npm run build
```

### Stage 6: Plan Views Use Real Imported Data

Modify:

- `src/lib/planning/view-data.ts`
- `src/components/plan-view.tsx`
- tests as needed

Requirements:

- Month tab no longer uses hard-coded `60%`, `45%`, `72%`.
- If no import exists, show honest empty state.
- If import exists, show imported summary and task-based progress.
- Today/day/week/month views use real `tasks`.

Progress rules:

- Monthly goal progress = completed tasks this month / total tasks this month.
- Weekly split progress = weeks with at least one task / weeks in current month.
- Important nodes progress = computed only if there is enough milestone/task data; otherwise no progress bar.

Verify:

```bash
npm run test
npm run build
```

### Stage 7: Inbox As First-Class Surface

Modify:

- `src/components/app-shell.tsx`
- `src/components/more-view.tsx`
- `src/tests/e2e/inbox-navigation.spec.ts`

Requirements:

- Inbox appears in primary desktop/mobile navigation.
- More may still link to Inbox as a secondary entry.
- Inbox label can remain user-facing Chinese as `暂存池`, but nav can use `Inbox` if that matches current UI.
- Mobile nav must not crowd badly.

Verify:

```bash
npm run test:e2e -- src/tests/e2e/inbox-navigation.spec.ts
npm run test:e2e -- src/tests/e2e/inbox-navigation.spec.ts --project=mobile-safari
```

### Stage 8: Settings MCP UI

Modify:

- `src/components/settings-view.tsx`
- `src/tests/e2e/mcp-settings.spec.ts`

Requirements:

- Settings shows workspace id.
- Settings shows hosted MCP URL.
- Settings shows Codex config.
- Settings explains Claude Cowork custom connector path.
- User can create token.
- Raw token appears once.
- User can revoke token.
- UI says `Codex / Claude Cowork 连接配置`, not only Codex.

Verify:

```bash
npm run test:e2e -- src/tests/e2e/mcp-settings.spec.ts
```

### Stage 9: Mobile Floating Cat

Modify:

- current floating cat component/style, likely `src/components/floating-cat.tsx` and `src/app/globals.css`

Requirements:

- On mobile, floating cat is top-right.
- It does not cover inputs, textarea, buttons, or keyboard interaction path.
- Desktop behavior can stay close to current UI if not problematic.

Verify:

```bash
npm run test:e2e -- src/tests/e2e/mcp-settings.spec.ts --project=mobile-safari
```

Also inspect with browser screenshot if possible.

### Stage 10: Docs And Automation Handoff

Modify:

- `docs/automation/pawplan-scheduled-automation.md`
- create final post-implementation handoff under `docs/handoff/`

Docs must include:

- Hosted MCP URL.
- Codex config example.
- Claude Cowork connector instructions.
- Direct import prompt.
- Review prompt for later rescheduling.
- Security notes about tokens.
- Production verification result.

### Stage 11: Full Verification

Run:

```bash
npm run test
npm run build
npm run test:e2e
```

If schema changed, also run local migration generation and inspect SQL:

```bash
npm run db:generate
```

### Stage 12: Production Migration And Deploy

Only after tests/build pass.

Pull production env without printing secrets:

```bash
tmp_env=$(mktemp /tmp/pawplan-prod-env.XXXXXX)
npm_config_cache=/tmp/pawplan-npm-cache-envpull npx vercel env pull "$tmp_env" --environment=production --scope charlottes-projects-f7255399 --yes
set -a
. "$tmp_env"
set +a
npm run db:migrate
rm -f "$tmp_env"
```

Deploy:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399
```

Smoke:

```bash
curl -I https://pawplan.charlottezmm.info/login
```

Manual smoke:

- Login as `charlotte`.
- Open Inbox from main navigation.
- Open Settings.
- Create test MCP token.
- Connect with Codex or Claude Cowork if available.
- Call `import_plan_bundle`.
- Confirm Today/Plan day/week/month show imported tasks.
- Re-run same import and confirm no duplicates.
- Revoke test token.

## Prompts For Next Chat Window

Use this as the first message in the next Codex chat:

```text
你在 /Users/charlotte/daily-progress 继续完成 PawPlan v0.2。

先阅读：
1. docs/handoff/2026-06-12-pawplan-v0-2-implementation-handoff.md
2. docs/superpowers/plans/2026-06-12-pawplan-v0-2-agent-loop.md
3. docs/automation/pawplan-scheduled-automation.md
4. docs/handoff/2026-06-11-pawplan-deploy-domain-handoff.md

然后先跑：
git status --short --branch
npm run test
npm run build

目标：把 v0.2 全部实现、验证、部署到生产。

功能闭环必须是：
- Inbox 是主流程入口，不只藏在 More。
- Settings 能生成/撤销 MCP token。
- Hosted MCP endpoint 可被 Codex / Claude Desktop Cowork 连接。
- 新 MCP tool `import_plan_bundle` 能把 Claude/Codex 讨论好的任务进度导入 PawPlan。
- 导入后 Today / Plan 日视图 / 周视图 / 月视图显示真实任务。
- 月视图不能再显示写死的假进度条。
- 数据存储必须 AI-native：保留结构化 payload、provenance、derived task ids、change_logs。
- 后续重排和修改走 Review，不要让 AI 直接破坏性覆盖计划。
- 移动端右下角小猫改到右上角，不能挡输入。

每个阶段后跑对应测试。最终跑：
npm run test
npm run build
npm run test:e2e

如果 schema 改了，生成并审查 migration，然后用 Vercel production env 跑 production migration，不要打印 DATABASE_URL。

最后部署：
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399

完成后告诉我：
- 生产 URL
- Codex / Claude Cowork 怎么连接 MCP
- 如何让 AI 导入任务
- Inbox / Today / Plan / Review 的最终闭环
- 数据库 migration 状态
- 测试结果
- git status
```

Prompt to test the finished MCP import from Codex or Claude Cowork:

```text
用 PawPlan MCP 把我们已经讨论好的任务进度导入 PawPlan。
请整理成 import_plan_bundle payload，包含 import_key、overall_plan、daily_tasks、weekly_summary、monthly_summary。
调用 import_plan_bundle。不要重复导入同一个 import_key，不要覆盖已有任务。
导入后我应该能在 PawPlan 的日计划、周计划、月计划里直接看到这些任务。
```

Prompt for later rescheduling after the import:

```text
用 PawPlan MCP 读取 today、week、month 和最近 check-ins。
判断当前计划是否需要重排。如果需要，只生成 Review patch，不要直接 apply。
说明为什么调、影响哪些任务、对本周和本月目标有什么影响。
```

## Completion Criteria

v0.2 is complete only when all are true:

- Production deploy succeeds.
- Production migration succeeds if schema changed.
- `npm run test` passes.
- `npm run build` passes.
- `npm run test:e2e` passes or any failure is clearly documented as unrelated/pre-existing.
- Inbox is visible in main workflow.
- Settings token flow works.
- Hosted MCP endpoint authenticates token.
- `import_plan_bundle` creates real tasks.
- Same `import_key` does not duplicate tasks.
- Day/week/month views show imported data.
- Month page has no fake progress bars.
- Mobile floating cat no longer blocks typing.
- Final handoff is written.

