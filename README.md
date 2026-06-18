# PawPlan

PawPlan is an invite-gated, schedule-first planning app for turning external agent work into safe, reviewable plans.

It is built around one product boundary: agents can read context and draft changes, but PawPlan owns validation, persistence, Review, audit trails, and readback. A task move is not real until the user reviews and applies it in the app.

The old static May dashboard prototype is preserved at `docs/legacy/index-static-dashboard.html`.

## Current Stage

PawPlan v1 formal is a controlled beta, not public GA.

Included:

- Web + PWA planning surface.
- Next.js + Postgres data layer.
- Invite-code workspace creation.
- Workspace password login for existing workspaces.
- Hosted MCP for Codex bearer-token clients.
- Claude Custom Connector OAuth adapter.
- Inbox capture for life-admin items and later promotion into planned work.
- Agent run status, idempotency, failure visibility, and draft readback.
- Review-confirmed task changes, daily rebalance drafts, weekly rebalance drafts, and timetable imports.

Not included:

- App-owned LLM calls or embedded AI chat.
- App-owned scheduler, server cron, browser timer, or PWA background rescheduler.
- Automatic patch apply.
- Billing.
- Team collaboration.
- Public open signup.
- Google/Apple/Outlook Calendar sync.
- Full drag-and-drop calendar editing.

## Development

```bash
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL`
- `APP_SECRET`
- `NEXT_PUBLIC_APP_NAME`

`NEXT_PUBLIC_APP_NAME` should be `PawPlan` for the current product.

## MCP Server

PawPlan exposes both a local stdio MCP server and a hosted MCP endpoint.

Local stdio server:

```bash
npm run mcp
```

Required local MCP environment:

- `DATABASE_URL`
- `PAWPLAN_WORKSPACE_ID`

Hosted MCP endpoint:

```text
https://pawplan.charlottezmm.info/api/mcp
```

The MCP surface is intentionally narrow. Agents read context, write audited low-risk records, or create Review drafts. They do not directly edit protected constraints, apply drafts, or own scheduled automation.

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

Write and draft tools:

- `create_inbox_item`
- `create_checkin`
- `update_task_status`
- `update_task_schedule`
- `update_task_notes`
- `save_conversation_summary`
- `record_decision`
- `propose_patch`
- `propose_daily_rebalance`
- `propose_week_rebalance`
- `propose_timetable_import`
- `import_plan_bundle`

Daily and weekly automation is configured outside PawPlan in Codex / Cowork / Claude. The external agent reads through MCP, proposes changes with Review-safe tools, and waits for the user to confirm in `/review`.

See `docs/automation/pawplan-scheduled-automation.md`.

## Verification

```bash
npm run test
npm run build
npm run test:e2e
```

## Beta Smoke

Before sharing an invite, run the smoke checklist:

```text
docs/public-beta/2026-06-13-public-beta-smoke-checklist.md
```

Daily Claude/Codex agent loop prompts live at:

```text
docs/public-beta/2026-06-13-daily-agent-loop-prompts.md
```

## License

Code is MIT. Content is CC-BY 4.0.
