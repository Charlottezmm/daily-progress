# PawPlan v1.0 Public Beta Smoke Checklist

Date: 2026-06-13

Run this before sharing a beta invite.

## Local Gate

```bash
git status --short --branch
npm run test
npm run build
npm run test:e2e
```

Expected:

- Unit tests pass.
- Production build passes.
- Playwright e2e passes on desktop and mobile projects.
- No unexpected untracked files except intended docs, migrations, source, and tests.

## Database And Migration

- Apply migrations through the deployment path.
- Confirm these tables exist in the target database:
  - `beta_invite_codes`
  - `workspace_onboarding_events`
  - `oauth_clients`
  - `oauth_authorization_codes`
  - `claude_connector_authorizations`
- Confirm existing workspaces can still log in.
- Confirm new workspace creation creates active starter plan state.

## Public Beta Access

1. Open `/login`.
2. Confirm existing workspace login is separate from public beta creation.
3. Create a workspace with a valid invite code.
4. Confirm an invalid, expired, or reused invite code fails before password hashing.
5. Confirm successful creation redirects to `/today`.

## First-Run Onboarding

1. Open `/today` in a new workspace.
2. Confirm onboarding checklist is visible.
3. Import or skip fixed schedule.
4. Connect or skip connector setup.
5. Open `/review`.
6. Confirm checklist state changes only from real data or explicit skip events.

## Import

Plan:

1. Open `/import`.
2. Preview `plan.md`.
3. Confirm warnings/conflicts render.
4. Save only after preview.
5. Confirm direct save with only static confirmation is rejected.

Timetable:

1. Preview `timetable.csv`.
2. Confirm `Asia/Shanghai`, row count, block count, warnings, and conflicts render.
3. Confirm conflict lookup failure does not block preview.
4. Confirm oversized date ranges, too many rows, and too many generated blocks are rejected.
5. Save only after matching preview token.

## Calendar And Constraints

1. Open `/constraints`.
2. Confirm course count, fixed block count, conflict count, and next fixed block render.
3. Confirm `导入 timetable.csv` links to `/import`.
4. Create a course block.
5. Edit the block.
6. Delete a block.
7. Confirm no drag-and-drop calendar behavior exists.

## Connector Setup

Codex:

1. Open `/settings`.
2. Create a read-write MCP token.
3. Copy raw token once.
4. Configure Codex with `PAWPLAN_MCP_TOKEN`.
5. Revoke the token.
6. Confirm revoked token cannot call MCP.

Claude:

1. Open `/settings`.
2. Confirm protected resource metadata verifies.
3. Confirm authorization server metadata verifies and includes `mcp` scope.
4. Add PawPlan MCP URL in Claude Custom Connector.
5. Complete browser authorization.
6. Confirm authorization appears in Settings.
7. Revoke authorization.
8. Confirm Claude access stops.

## Review

1. Create a task-change draft through `propose_patch`.
2. Create a timetable draft through `propose_timetable_import`.
3. Open `/review`.
4. Confirm queue shows task changes, timetable imports, and conflict/blocked counts.
5. Accept one operation and reject another.
6. Confirm apply writes only accepted operations.
7. Confirm timetable apply rechecks conflicts before writing `time_blocks`.
8. Confirm skipped/conflicted operations remain visible and audited.

## Safety Checks

- MCP read-only tokens do not expose write tools.
- MCP cannot directly edit constraints.
- `propose_patch` and `propose_timetable_import` create Review drafts only.
- No automatic apply path exists.
- Template export does not include passwords, invite codes, raw tokens, token hashes, or connector access token hashes.
- Workspace delete requires exact typed confirmation.
