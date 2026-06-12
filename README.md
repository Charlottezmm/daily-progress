# Daily Progress

Open-source schedule-first MCP-native planning app.

The old static May dashboard prototype is preserved at `docs/legacy/index-static-dashboard.html`.

## v0.1 Direction

- Web + PWA
- Next.js + Postgres
- Workspace password login
- MCP-native data boundary
- Agent-generated patch preview, confirmed in the app

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
- `get_checkins`
- `get_tasks`
- `create_inbox_item`
- `create_checkin`
- `update_task_status`
- `propose_patch`

`get_constraints` and `get_capacity` are read-only context tools. Agent rescheduling must be preview-first: scheduled automation reads data through MCP and writes proposed changes with `propose_patch`. Users confirm changes in `/review` before apply.

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

## Product Boundary

This stage keeps PawPlan focused on the Next.js + Postgres planning surface, MCP access, and Review-confirmed agent patches. Hosted Lite public onboarding, template gallery, OAuth, billing, team workspaces, public sharing, and conversation sediment UI are not part of this stage.

The app may expose MCP tools and Review patch application, but it must not own scheduled automation. Codex / Cowork scheduled automation triggers the agent externally; the agent reads through MCP, calls `propose_patch`, and waits for the user to confirm in `/review`.

## License

代码 MIT，内容 CC-BY 4.0。
