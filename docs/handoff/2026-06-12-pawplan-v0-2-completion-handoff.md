# PawPlan v0.2 Completion Handoff

Date: 2026-06-12

## Production URL

```text
https://pawplan.charlottezmm.info
```

## What v0.2 Adds

- Inbox is now a primary navigation surface on desktop and mobile.
- Settings can create and revoke workspace-scoped MCP tokens.
- Hosted MCP endpoint is available at `/api/mcp` and authenticates `Authorization: Bearer <token>`.
- MCP tools are permission-filtered: `read_only` sees read tools only; `read_write` can use write tools.
- `import_plan_bundle` imports structured Claude/Codex planning output into real PawPlan tasks.
- Plan import storage is AI-native: normalized tasks plus `mcp_plan_imports.snapshot`, `provenance_json`, `derived_task_ids`, and `change_logs.source = mcp`.
- Plan month view no longer uses static placeholder progress. It renders real task completion, weekly distribution, and imported milestones when available.
- Later plan changes still go through Review via `propose_patch`; import is not a destructive rescheduling path.
- Mobile floating capture moved to the top-right so it does not block bottom inputs or keyboard interaction.

## Codex MCP Connection

Create a `read_write` token in PawPlan Settings, then configure Codex:

```toml
[mcp_servers.pawplan]
url = "https://pawplan.charlottezmm.info/api/mcp"
bearer_token_env_var = "PAWPLAN_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

Start Codex with `PAWPLAN_MCP_TOKEN` set to the raw token. Raw tokens are shown once; revoke and regenerate if lost.

## Claude Cowork Connection

Use the same hosted MCP URL:

```text
https://pawplan.charlottezmm.info/api/mcp
```

Configure bearer auth with the Settings-generated MCP token. Prefer secret/environment storage; do not paste raw tokens into docs, plan snapshots, or git.

## AI Import Prompt

```text
用 PawPlan MCP 把我们已经讨论好的任务进度导入 PawPlan。
请整理成 import_plan_bundle payload，包含 import_key、overall_plan、daily_tasks、weekly_summary、monthly_summary。
调用 import_plan_bundle。不要重复导入同一个 import_key，不要覆盖已有任务。
导入后我应该能在 PawPlan 的日计划、周计划、月计划里直接看到这些任务。
```

Use a stable `import_key` per discussion. Reusing the same key is idempotent and does not duplicate tasks.

## Final Loop

1. Capture loose thoughts in Inbox.
2. Discuss task progress with Codex or Claude Cowork.
3. Agent connects to hosted PawPlan MCP.
4. Agent calls `import_plan_bundle` for confirmed structured imports.
5. Today and Plan day/week/month show real imported tasks.
6. User executes and checks in.
7. Agent reads today/week/month/check-ins through MCP.
8. Later rescheduling is written as a Review preview via `propose_patch`.
9. User confirms or rejects Review changes in PawPlan.

## Migration

Generated migration:

```text
drizzle/0003_thankful_roland_deschain.sql
```

It adds:

- `plan_version_source` enum value `mcp`
- `mcp_plan_imports`
- unique `(workspace_id, import_key)`
- index `(workspace_id, plan_id)`
- `mcp_tokens_token_hash_idx`

Production migration was run with Vercel production env loaded from a temp file without printing `DATABASE_URL`.

Status:

```text
migrations applied successfully
```

## Verification

Final local verification:

```bash
npm run test
npm run build
npm run test:e2e
```

Results:

```text
npm run test: 21 files / 73 tests passed
npm run build: passed
npm run test:e2e: 10 passed
```

Production deploy:

```text
deployment id: dpl_EPNs4VnQ37ZMBvjAi6B1UTaLcvy1
deployment url: https://daily-progress-mzn3axfld-charlottes-projects-f7255399.vercel.app
alias: https://pawplan.charlottezmm.info
readyState: READY
```

Production smoke:

```text
GET /login: 200
POST /api/mcp without bearer token: 401 Missing MCP bearer token
```
