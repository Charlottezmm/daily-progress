# PawPlan v1.0 Public Beta Handoff

Date: 2026-06-13

## Goal

Build PawPlan v1.0 as a controlled public beta.

v1.0 should let a new user create a workspace, import a plan and fixed schedule, connect Claude or Codex, and safely approve AI-generated daily planning changes through Review.

## Source Design

Primary technical design:

```text
docs/superpowers/specs/2026-06-13-pawplan-v1-public-beta-technical-design.md
```

Previous completion context:

```text
docs/handoff/2026-06-12-pawplan-v0-4-completion-handoff.md
```

## Current Production

Production URL:

```text
https://pawplan.charlottezmm.info
```

Hosted MCP URL:

```text
https://pawplan.charlottezmm.info/api/mcp
```

Current branch:

```text
codex/mcp-planning-v0-1
```

## Current Capabilities

Already implemented:

- Workspace login and active workspace sessions.
- Hosted MCP endpoint.
- MCP bearer tokens with read-only/read-write permission.
- `import_plan_bundle` for trusted task import.
- `propose_patch` for Review-only task changes.
- `propose_timetable_import` for Review-only timetable import drafts.
- `/constraints` basic Calendar & Courses flow using `courses` and `time_blocks`.
- Review apply audit through `agent_patch_reviews`.
- Conversation and decision sediment MCP tools.
- Template export/import.
- Workspace delete.
- Hosted MCP usage audit and lightweight write limit.

Current MCP tools:

Read:

- `get_today`
- `get_week`
- `get_month`
- `get_constraints`
- `get_capacity`
- `get_decisions`
- `get_conversations`
- `get_checkins`
- `get_tasks`

Write:

- `create_inbox_item`
- `create_checkin`
- `update_task_status`
- `save_conversation_summary`
- `record_decision`
- `propose_patch`
- `propose_timetable_import`
- `import_plan_bundle`

## Important Product Decision

v1.0 is not a full calendar app.

It should include a Calendar & Constraints UI, but should not include drag-and-drop full calendar editing.

Do:

- Show day/week fixed schedule.
- Show courses, meetings, unavailable, routines, and recovery blocks.
- Allow basic create/edit/delete for course, meeting, and unavailable blocks.
- Show conflicts.
- Connect timetable import drafts to Review.

Do not:

- Implement drag-to-move.
- Implement drag-to-resize.
- Build Google Calendar replacement behavior.
- Add calendar sync.

## Biggest Open Blocker

Claude Custom Connector does not yet work with PawPlan hosted MCP.

Reason:

- PawPlan hosted MCP currently uses bearer token auth.
- Claude Custom Connector UI accepts Remote MCP URL and optional OAuth client fields.
- It does not expose a plain bearer token header field.

v1.0 must add a Claude-compatible connector/auth adapter.

Do not solve this by putting tokens in query strings.

## v1.0 Required Scope

### 1. Public Beta Access

Add controlled public sharing:

- Invite code or beta access gate.
- Self-serve workspace creation.
- Workspace data isolation.
- Workspace delete remains available.

Keep this simpler than full email auth unless the implementation proves invite codes are insufficient.

### 2. Claude Custom Connector

Add Claude-compatible connection flow:

- Claude can add PawPlan as a custom connector.
- User does not paste raw bearer token into Claude connector UI.
- PawPlan can revoke Claude access.
- Existing Codex bearer token flow remains working.

### 3. First-Run Onboarding

Add an in-app onboarding checklist based on real state:

- Workspace created.
- Plan imported.
- Fixed schedule imported or skipped.
- Claude/Codex connected or skipped.
- Review opened or used.

Do not use fake completion state.

### 4. Plan Import

Harden `import_plan_bundle`:

- Keep idempotency by `import_key`.
- Improve duplicate/malformed errors.
- Ensure Today/Week/Month show imported state clearly.
- Document payload examples.

### 5. Timetable Import

Harden `propose_timetable_import`:

- Keep Review-first.
- Recheck conflicts at apply.
- Make Review cards clearer for timetable import operations.
- Document CSV and structured rows examples.

### 6. Calendar & Constraints UI

Upgrade `/constraints` from basic list/form into a useful lightweight calendar view:

- Day/week visualization.
- Fixed blocks by type.
- Basic edit controls.
- Conflict display.
- Mobile-safe layout.

### 7. Daily Agent Loop

Document and test morning/evening flows:

- Morning review reads today/week/constraints/capacity/check-ins.
- Evening check-in reads today/tasks/check-ins/constraints/capacity.
- Agent writes check-in when instructed.
- Agent proposes Review drafts only.
- Agent can save conversation summaries and decisions.

### 8. Review Upgrade

Improve Review as the main control surface:

- Separate task changes from timetable imports.
- Show before/after/reason/impact/provenance/conflict/skipped state.
- Make accepted/rejected/applied states obvious.
- Keep per-operation audit.

### 9. Settings And Safety

Stabilize:

- Codex connection instructions.
- Claude connector instructions.
- MCP token management.
- Template export/import.
- Workspace delete.
- Usage/audit visibility.

Keep:

- MCP write limit.
- Usage audit.
- Token revoke.
- No secrets in exports.
- No automatic apply.

### 10. Public Docs

Write docs for users:

- Create workspace.
- Import plan.
- Import timetable.
- Connect Claude.
- Connect Codex.
- Use Review.
- Revoke access.
- Delete workspace.

## Suggested Build Order

Recommended order:

1. Public beta access and onboarding.
2. Claude connector/auth adapter.
3. Calendar & Constraints UI upgrade.
4. Review timetable/conflict clarity.
5. Daily agent loop prompts and docs.
6. Public beta docs and production smoke.

Reason:

- Public users will fail first at entry, connection, and first-run confusion.
- Visual calendar polish matters, but it should not precede connection and onboarding.

## Verification Expectations

Every implementation phase should run:

```bash
npm run test
npm run build
npm run test:e2e
```

If schema changes:

- Generate migration.
- Review migration SQL.
- Apply production migration using Vercel production env.
- Do not print `DATABASE_URL`.

Before public beta release:

- Deploy to Vercel production.
- Smoke `/login` or new beta entry.
- Smoke unauthenticated `/api/mcp` returns 401.
- Smoke authenticated MCP tools list.
- Smoke Claude connector auth behavior.

## Non-Goals To Protect

Keep these out of v1.0:

- Full drag-and-drop calendar.
- Calendar sync.
- Billing.
- Team workspaces.
- Public template marketplace.
- Embedded AI chat.
- App-owned cron or scheduler.
- Automatic apply.

## Handoff Note For Next Agent

Do not start by designing a landing page or a drag calendar.

Start by making a new user able to:

1. Get access.
2. Create workspace.
3. Import useful data.
4. Connect Claude/Codex.
5. Use Review safely.

The product already has many core internals. v1.0 should make them understandable and safe for someone outside the repo.
