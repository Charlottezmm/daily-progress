# PawPlan v0.4 Completion Handoff

Date: 2026-06-12

## Production URL

```text
https://pawplan.charlottezmm.info
```

## v0.3 Closed Loops

- Opened `/constraints` from More as `日历与课程`.
- Added `GET /api/constraints`, `POST /api/constraints`, and `PATCH /api/constraints`.
- Constraint writes reuse `courses` and `time_blocks`; editable kinds are only `course`, `meeting`, and `unavailable`.
- Added shared capacity model for tasks, protected time blocks, routines, day capacity, Today, Week, and MCP context.
- Added Review trust evidence: before, after, reason, impact, protected evidence, provenance, skipped, and conflict state.
- Added `agent_patch_reviews` to persist accepted, rejected, skipped, and conflict audit per patch apply.
- Added MCP read tools `get_constraints` and `get_capacity`.
- Updated scheduled automation prompts to read constraints and capacity and keep Review-only changes.

## v0.4 Closed Loops

- Added MCP sediment tools for structured conversation summaries and decisions.
- Added safe workspace template export/import.
- Template export excludes MCP tokens, check-ins, task completion status, agent patch history, conversations, and decisions.
- Added Settings workspace delete with typed confirmation and session clearing.
- Added hosted MCP usage audit and lightweight per-workspace daily write limit.

## MCP Tools

Read tools:

- `get_today`
- `get_week`
- `get_month`
- `get_constraints`
- `get_capacity`
- `get_decisions`
- `get_conversations`
- `get_checkins`
- `get_tasks`

Write tools:

- `create_inbox_item`
- `create_checkin`
- `update_task_status`
- `save_conversation_summary`
- `record_decision`
- `propose_patch`
- `import_plan_bundle`

## Migrations

Generated migrations:

- `drizzle/0004_talented_changeling.sql`
  - Adds `agent_patch_reviews`.
  - Additive only.
- `drizzle/0005_fixed_dark_beast.sql`
  - Adds `mcp_usage_events`.
  - Additive only.

Production migration was run using Vercel production env without printing `DATABASE_URL`.

Status:

```text
migrations applied successfully
```

## Verification

Final local verification before deploy:

```text
npm run test: 31 files / 112 tests passed
npm run build: passed
npm run test:e2e: 22 passed
```

## Residual Notes

- Hosted MCP usage audit records success from HTTP response status; JSON-RPC errors inside HTTP 200 are not deeply parsed yet.
- Template import `mode: new_plan` creates a new active plan from the imported template.
