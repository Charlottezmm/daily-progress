# PawPlan v1 Formal Invite Smoke Checklist

Date: 2026-06-13

Run this before sharing a v1 formal invite link.

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

## Invite Access

1. Confirm production has `PAWPLAN_ADMIN_WORKSPACE_IDS` set to the owner workspace id.
2. Open `More -> 邀请管理` as the owner workspace.
3. Create a one-person invite link.
4. Open `/login`.
5. Confirm existing workspace login is separate from invite-link creation.
6. Open `/join/<invite-token>`.
7. Confirm the user can create a workspace without manually entering the invite token.
8. Confirm an invalid, expired, or reused invite token fails before password hashing.
9. Confirm successful creation redirects to `/today`.
10. Confirm a non-owner workspace cannot open `/admin/invites` or call `/api/admin/invites`.

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
5. Confirm read-write tools include `propose_daily_rebalance` and `propose_week_rebalance`.
6. Revoke the token.
7. Confirm revoked token cannot call MCP.

Claude:

1. Open `/settings`.
2. Confirm protected resource metadata verifies.
3. Confirm authorization server metadata verifies and includes `mcp` scope.
4. Add PawPlan MCP URL in Claude Custom Connector.
5. Complete browser authorization.
6. Confirm authorization appears in Settings.
7. Confirm Claude can see high-level rebalance tools but cannot auto-apply Review drafts.
8. Revoke authorization.
9. Confirm Claude access stops.

## Review

1. Create a task-change draft through `propose_patch`.
2. Create a timetable draft through `propose_timetable_import`.
3. Open `/review`.
4. Confirm queue shows task changes, timetable imports, and conflict/blocked counts.
5. Accept one operation and reject another.
6. Confirm apply writes only accepted operations.
7. Confirm timetable apply rechecks conflicts before writing `time_blocks`.
8. Confirm skipped/conflicted operations remain visible and audited.

## Agent Runs

1. Create a daily rebalance draft through `propose_daily_rebalance`.
2. Confirm the returned status is `draft_created` before claiming a new Review draft exists.
3. Repeat the same call with the same idempotency key.
4. Confirm the returned status is `duplicate` and points to the existing draft.
5. Try a no-op or skipped move.
6. Confirm the returned status is `no_change` and no Review draft is claimed.
7. Force or observe a failed run in a non-production test workspace.
8. Confirm the returned status is `failed`, includes an error, and does not claim success.

## Safety Checks

- MCP read-only tokens do not expose write tools.
- MCP cannot directly edit constraints.
- `propose_patch` and `propose_timetable_import` create Review drafts only.
- `propose_daily_rebalance` and `propose_week_rebalance` create Review drafts only.
- No automatic apply path exists.
- Review remains required for every draft, including duplicate or retried agent runs.
- Template export does not include passwords, invite codes, raw tokens, token hashes, or connector access token hashes.
- Workspace delete requires exact typed confirmation.
