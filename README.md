# Daily Progress

Open-source schedule-first MCP-native planning app.

The old static May dashboard prototype is preserved at `docs/legacy/index-static-dashboard.html`.

## v1.0 Public Beta Direction

- Web + PWA
- Next.js + Postgres
- Controlled public beta with invite-code workspace creation
- Workspace password login for existing workspaces
- MCP-native data boundary
- Codex bearer-token MCP and Claude Custom Connector OAuth adapter
- Agent-generated Review drafts, confirmed in the app before apply

## Development

```bash
npm install
npm run dev
```

## PawPlan MCP Server

PawPlan exposes a local stdio MCP server for Codex / Cowork / Claude agents:

```bash
npm run mcp
```

Required MCP environment:

- `DATABASE_URL`
- `PAWPLAN_WORKSPACE_ID`

Run the server from this repo root (`/Users/charlotte/daily-progress`). The MCP server currently exposes:

- `get_today`
- `get_week`
- `get_month`
- `get_constraints`
- `get_capacity`
- `get_decisions`
- `get_conversations`
- `get_checkins`
- `get_tasks`
- `create_inbox_item`
- `create_checkin`
- `update_task_status`
- `save_conversation_summary`
- `record_decision`
- `propose_patch`
- `propose_timetable_import`
- `import_plan_bundle`

`get_constraints` and `get_capacity` are read-only context tools. Agent rescheduling and timetable imports must be preview-first: scheduled automation reads data through MCP and writes proposed changes with `propose_patch` or `propose_timetable_import`. Users confirm changes in `/review` before apply. MCP must not directly edit constraints.

Scheduled automation is configured outside PawPlan in Codex / Cowork. PawPlan does not implement an app-owned scheduler, server cron, browser timer, or PWA background rescheduler. See `docs/automation/pawplan-scheduled-automation.md`.

## Environment

Copy `.env.example` to `.env.local` and set values for:

- `DATABASE_URL`
- `APP_SECRET`
- `NEXT_PUBLIC_APP_NAME`

## Verification

```bash
npm run test
npm run build
npm run test:e2e
```

## Public Beta Smoke

Before sharing an invite, run the local gate and manual smoke checklist:

```text
docs/public-beta/2026-06-13-public-beta-smoke-checklist.md
```

Daily Claude/Codex agent loop prompts live at:

```text
docs/public-beta/2026-06-13-daily-agent-loop-prompts.md
```

## Product Boundary

This stage keeps PawPlan focused on the Next.js + Postgres planning surface, controlled public beta access, MCP access, and Review-confirmed agent patches.

Included:

- Invite-code workspace creation.
- First-run onboarding.
- Hosted MCP for Codex bearer tokens.
- Claude Custom Connector OAuth adapter.
- Plan and timetable import.
- Lightweight Calendar & Constraints UI.
- Review-confirmed task changes and timetable imports.

Not included:

- Billing.
- Team collaboration.
- Full drag-and-drop calendar editing.
- Google/Apple/Outlook Calendar two-way sync.
- App-owned LLM calls or embedded AI chat.
- Automatic patch apply.

The app may expose MCP tools and Review patch application, but it must not own scheduled automation. Codex / Cowork / Claude scheduled automation triggers the agent externally; the agent reads through MCP, calls `propose_patch` or `propose_timetable_import`, and waits for the user to confirm in `/review`.

## License

代码 MIT，内容 CC-BY 4.0。
