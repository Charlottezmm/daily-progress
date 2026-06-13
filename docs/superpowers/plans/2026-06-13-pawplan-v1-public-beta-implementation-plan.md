# PawPlan v1 Public Beta Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship PawPlan v1.0 as a controlled public beta where a new user can create an isolated workspace, import a plan and fixed schedule, connect Claude or Codex, and approve AI-generated changes through Review.

**Architecture:** Keep PawPlan workspace-scoped and Review-first. Add invite-gated self-serve workspace creation, state-derived onboarding, an OAuth-compatible connector adapter for Claude, and stronger UI/docs around constraints, timetable drafts, MCP connection, and daily agent loops. Do not add app-owned AI calls, billing, teams, calendar sync, or automatic patch application.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle ORM, Postgres, Vitest, Playwright, MCP SDK Streamable HTTP, Vercel.

---

## Required Reading

- `docs/superpowers/specs/2026-06-13-pawplan-v1-public-beta-technical-design.md`
- `docs/handoff/2026-06-13-pawplan-v1-public-beta-handoff.md`
- `docs/handoff/2026-06-12-pawplan-v0-4-completion-handoff.md`
- `README.md`
- `docs/automation/pawplan-scheduled-automation.md`
- `src/app/api/auth/login/route.ts`
- `src/app/api/mcp/route.ts`
- `src/lib/mcp/tools.ts`
- `src/lib/planning/patch-apply.ts`
- `src/components/reschedule-preview.tsx`
- `src/components/constraints-view.tsx`
- `src/components/settings-view.tsx`

## Baseline Verification

Baseline run on 2026-06-13 before writing this plan:

```bash
git status --short --branch
# ## codex/mcp-planning-v0-1...origin/codex/mcp-planning-v0-1

npm run test
# 31 files / 115 tests passed

npm run build
# passed

npm run test:e2e
# 22 passed
```

Root `AGENTS.md` is not present in this checkout. Use the user-provided AGENTS instructions from the chat as the working rule set.

## Goals

- Controlled public beta entry with invite code.
- Self-serve workspace creation behind invite code.
- Existing workspace login remains available for existing users.
- Workspace data stays isolated by `workspace_id`.
- First-run onboarding guides a new user through real completion states.
- Codex hosted MCP bearer-token flow remains working.
- Claude Custom Connector gets an OAuth-compatible auth path without tokens in URLs or prompt text.
- Calendar & Constraints becomes a useful lightweight day/week fixed-schedule view.
- Review clearly separates task changes, timetable imports, unsupported operations, skipped operations, and conflicts.
- Daily agent loop prompts and public beta docs make the first run reproducible.
- Public beta smoke checklist covers local and production verification.

## Non-Goals

- No full drag-and-drop calendar editor.
- No drag-to-move or drag-to-resize fixed blocks.
- No Google Calendar, Apple Calendar, Outlook, or other two-way sync.
- No billing, subscriptions, pricing, or payment code.
- No team collaboration or multi-user roles.
- No app-owned LLM calls or embedded AI chat.
- No automatic patch apply.
- No MCP tool that directly edits constraints.
- No query-string bearer tokens.
- No public unauthenticated plan sharing.

## Key Risk In Current Baseline

`src/app/api/auth/login/route.ts` currently creates a new workspace whenever the workspace name does not exist. That behavior conflicts with controlled public beta access because any visitor can create a workspace by guessing a new name.

v1.0 must split:

- `POST /api/auth/login`: existing workspace login only.
- `POST /api/beta/workspaces`: invite-gated workspace creation.

Existing workspaces must still log in without an invite code.

## External Protocol Notes

- Claude remote MCP requires a public HTTPS MCP URL. Local stdio MCP is not enough for Claude-hosted connector surfaces.
- Anthropic's MCP connector API supports OAuth authorization tokens in MCP server definitions and expects API clients to obtain/refresh access tokens before calls.
- Current MCP authorization spec requires OAuth 2.0 Protected Resource Metadata discovery for protected MCP servers and OAuth 2.1 style authorization/token handling with PKCE.
- Implementation should therefore add a real connector auth adapter, not a bearer token pasted into a URL.

## File Map

### Public Beta Access And Onboarding

- Modify `src/lib/db/schema.ts`
- Add generated Drizzle migration under `drizzle/`
- Create `src/lib/beta/invites.ts`
- Create `src/lib/onboarding/state.ts`
- Create `src/app/api/beta/workspaces/route.ts`
- Create `src/app/api/onboarding/route.ts`
- Modify `src/app/api/auth/login/route.ts`
- Modify `src/components/login-form.tsx`
- Create `src/components/onboarding-checklist.tsx`
- Modify `src/app/(app)/today/page.tsx`
- Modify `src/app/(app)/layout.tsx` only if the checklist belongs globally
- Add `src/tests/unit/beta-invites.test.ts`
- Add `src/tests/unit/beta-workspace-route.test.ts`
- Add `src/tests/unit/onboarding-state.test.ts`
- Add `src/tests/e2e/onboarding-public-beta.spec.ts`

### Claude Connector Auth Adapter

- Modify `src/lib/db/schema.ts`
- Add generated Drizzle migration under `drizzle/`
- Create `src/lib/oauth/pkce.ts`
- Create `src/lib/oauth/connector-auth.ts`
- Create `src/app/.well-known/oauth-protected-resource/route.ts`
- Create `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts`
- Create `src/app/.well-known/oauth-authorization-server/route.ts`
- Create `src/app/api/oauth/register/route.ts`
- Create `src/app/api/oauth/authorize/route.ts`
- Create `src/app/api/oauth/token/route.ts`
- Create `src/app/api/oauth/revoke/route.ts`
- Modify `src/app/api/mcp/route.ts`
- Modify `src/components/settings-view.tsx`
- Add `src/tests/unit/oauth-metadata-routes.test.ts`
- Add `src/tests/unit/oauth-connector-auth.test.ts`
- Add `src/tests/unit/mcp-http-route.test.ts`
- Add `src/tests/e2e/claude-connector-settings.spec.ts`

### Calendar, Constraints, Review, Imports

- Modify `src/lib/constraints/service.ts`
- Modify `src/components/constraints-view.tsx`
- Modify `src/lib/planning/view-data.ts`
- Modify `src/components/reschedule-preview.tsx`
- Modify `src/lib/mcp/plan-import.ts`
- Modify `src/lib/mcp/timetable-import.ts`
- Modify `src/lib/planning/patch-apply.ts`
- Add `src/tests/unit/review-view-data.test.ts`
- Add `src/tests/unit/patch-apply.test.ts`
- Add `src/tests/unit/mcp-plan-import.test.ts`
- Add `src/tests/unit/mcp-timetable-import.test.ts`
- Add `src/tests/e2e/constraints-calendar.spec.ts`
- Add `src/tests/e2e/review-timetable.spec.ts`

### Daily Agent Loop And Public Docs

- Modify `docs/automation/pawplan-scheduled-automation.md`
- Create `docs/public-beta/getting-started.md`
- Create `docs/public-beta/connect-codex.md`
- Create `docs/public-beta/connect-claude.md`
- Create `docs/public-beta/import-plan.md`
- Create `docs/public-beta/import-timetable.md`
- Create `docs/public-beta/review-safety.md`
- Create `docs/public-beta/smoke-checklist.md`
- Modify `README.md`

## Data Model And Migration

Use Drizzle schema as source of truth, then run `npm run db:generate`.

### New Tables

```sql
CREATE TABLE beta_invite_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  label varchar(120) NOT NULL,
  max_redemptions integer,
  redemption_count integer NOT NULL DEFAULT 0,
  expires_at timestamptz,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX beta_invite_codes_code_hash_unique
  ON beta_invite_codes (code_hash);

CREATE TABLE workspace_beta_access (
  workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
  invite_code_id uuid REFERENCES beta_invite_codes(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE workspace_onboarding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  event_key varchar(80) NOT NULL,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX workspace_onboarding_events_workspace_event_unique
  ON workspace_onboarding_events (workspace_id, event_key);

CREATE TABLE oauth_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id varchar(240) NOT NULL,
  client_secret_hash text,
  client_name varchar(240),
  redirect_uris_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX oauth_clients_client_id_unique
  ON oauth_clients (client_id);

CREATE TABLE oauth_authorization_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code_hash text NOT NULL,
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id varchar(240) NOT NULL,
  redirect_uri text NOT NULL,
  code_challenge text NOT NULL,
  code_challenge_method varchar(20) NOT NULL,
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX oauth_authorization_codes_code_hash_unique
  ON oauth_authorization_codes (code_hash);

CREATE TABLE claude_connector_authorizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  oauth_client_id uuid REFERENCES oauth_clients(id) ON DELETE SET NULL,
  access_token_hash text NOT NULL,
  refresh_token_hash text,
  permission mcp_permission NOT NULL DEFAULT 'read_write',
  scope text NOT NULL,
  resource text NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX claude_connector_authorizations_access_token_hash_idx
  ON claude_connector_authorizations (access_token_hash);

CREATE INDEX claude_connector_authorizations_workspace_created_idx
  ON claude_connector_authorizations (workspace_id, created_at);
```

### Data Rules

- Store invite codes and OAuth tokens as hashes only.
- Show raw generated secrets only once.
- Do not include invite codes, token hashes, OAuth client secrets, authorization codes, access tokens, or refresh tokens in template export.
- `workspace_onboarding_events` is only for explicit user choices such as `schedule_import_skipped`, `connector_setup_skipped`, and `review_opened`; normal completion signals must be derived from real tables.
- OAuth access tokens map into the existing MCP permission model. For v1.0, default Claude connector permission is `read_write` because daily loops need `propose_patch`, `propose_timetable_import`, `create_checkin`, and sediment tools. Read-only connector authorization can be added as a settings option without changing MCP tools.
- Existing workspaces do not need a `workspace_beta_access` row to log in.

## API And MCP Contract

### OpenAPI Sketch

```yaml
openapi: 3.1.0
info:
  title: PawPlan v1 Public Beta API
  version: 1.0.0
paths:
  /api/auth/login:
    post:
      summary: Log in to an existing workspace.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [workspaceName, password]
              properties:
                workspaceName: { type: string, minLength: 1 }
                password: { type: string, minLength: 8 }
      responses:
        "200":
          description: Existing workspace session created.
        "401":
          description: Workspace missing or password invalid.
  /api/beta/workspaces:
    post:
      summary: Create a workspace behind an invite code.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [inviteCode, workspaceName, password]
              properties:
                inviteCode: { type: string, minLength: 1 }
                workspaceName: { type: string, minLength: 1, maxLength: 120 }
                password: { type: string, minLength: 8 }
      responses:
        "201":
          description: Workspace, starter plan, and session created.
        "400":
          description: Invalid payload or duplicate workspace.
        "403":
          description: Invite code invalid, disabled, expired, or exhausted.
  /api/onboarding:
    get:
      summary: Return state-derived onboarding checklist.
      responses:
        "200":
          description: Onboarding state.
    patch:
      summary: Record explicit skip or visit events.
      requestBody:
        required: true
        content:
          application/json:
            schema:
              type: object
              required: [eventKey]
              properties:
                eventKey:
                  type: string
                  enum: [schedule_import_skipped, connector_setup_skipped, review_opened]
                metadata:
                  type: object
                  additionalProperties: true
  /api/oauth/register:
    post:
      summary: Dynamic OAuth client registration for MCP clients that need it.
  /api/oauth/authorize:
    get:
      summary: Browser authorization screen for Claude connector.
  /api/oauth/token:
    post:
      summary: Exchange authorization code plus PKCE verifier for an MCP access token.
  /api/oauth/revoke:
    post:
      summary: Revoke a Claude connector token.
  /.well-known/oauth-protected-resource:
    get:
      summary: Protected resource metadata for MCP auth discovery.
  /.well-known/oauth-protected-resource/api/mcp:
    get:
      summary: Protected resource metadata scoped to /api/mcp.
  /.well-known/oauth-authorization-server:
    get:
      summary: Authorization server metadata.
```

### MCP Contract

Keep tool names unchanged:

```text
Read:
get_today
get_week
get_month
get_constraints
get_capacity
get_decisions
get_conversations
get_checkins
get_tasks

Write:
create_inbox_item
create_checkin
update_task_status
save_conversation_summary
record_decision
propose_patch
propose_timetable_import
import_plan_bundle
```

Rules to preserve:

- `get_constraints` and `get_capacity` are read-only context.
- `propose_patch` creates Review drafts only.
- `propose_timetable_import` creates Review drafts only.
- `import_plan_bundle` can write tasks and must stay idempotent by `import_key`.
- MCP must not directly edit `courses` or `time_blocks`.
- MCP must not call or expose Review apply.
- Read-only bearer/OAuth tokens must not see write tools.
- Hosted write limit and usage audit still run before/after authenticated hosted MCP calls.

## UI Pages And States

### `/login`

States:

- Existing workspace login.
- Invite-code workspace creation.
- Invalid invite code.
- Duplicate workspace name.
- Password too short.
- Existing user wrong password.

Required copy change:

- Remove "new name auto creates workspace".
- Make the beta gate explicit.

### First-Run Onboarding

Render as an in-app checklist, not a marketing landing page.

Completion signals:

- `workspace_created`: session workspace exists.
- `plan_imported`: at least one `mcp_plan_imports` row or future task exists beyond starter plan.
- `schedule_ready`: at least one future `time_blocks` row or event `schedule_import_skipped`.
- `connector_ready`: active MCP token or active Claude connector authorization exists, or event `connector_setup_skipped`.
- `review_ready`: event `review_opened` exists or at least one `agent_patch_reviews` row exists.

Display states:

- Complete.
- Current next action.
- Skipped but reversible.
- Blocked by missing data source.

### `/settings`

Add sections without fake status:

- Public beta workspace identity.
- Codex MCP connection.
- Claude connector connection.
- Active Claude authorizations with revoke buttons.
- MCP token create/revoke remains unchanged.
- Usage/audit status remains visible.
- Workspace delete remains visible.

### `/constraints`

Upgrade from list/form to lightweight calendar:

- Week strip with fixed blocks grouped by day.
- Day detail for selected date.
- Block type swatches for `course`, `meeting`, `unavailable`, `routine`, and `recovery`.
- Basic create/edit/delete only for `course`, `meeting`, `unavailable`.
- Read-only display for `routine` and `recovery`.
- Conflict summary and overlapping block names.
- Link from timetable Review draft to `/constraints`.
- Mobile layout uses stacked day cards, not a horizontal-only calendar.

### `/review`

Group Review cards by category:

- Task changes.
- Timetable imports.
- Unsupported or skipped operations.
- Conflicts.

Each card must show:

- Before.
- After.
- Reason.
- Impact.
- Provenance.
- Conflict details.
- Skipped reason.
- Apply result after submit.

Controls:

- Accept operation.
- Reject operation.
- Accept all safe operations.
- Reject all.
- Submit disabled until every actionable operation has a decision.

## Phased Implementation

### Phase 1: Public Beta Access And Workspace Creation

**Purpose:** Stop open workspace creation and add invite-gated self-serve beta entry.

**Files:**

- Modify `src/lib/db/schema.ts`
- Add generated migration under `drizzle/`
- Create `src/lib/beta/invites.ts`
- Create `src/app/api/beta/workspaces/route.ts`
- Modify `src/app/api/auth/login/route.ts`
- Modify `src/components/login-form.tsx`
- Add `src/tests/unit/beta-invites.test.ts`
- Add `src/tests/unit/beta-workspace-route.test.ts`
- Modify `src/tests/unit/workspace-route.test.ts` only if route expectations need the new login/create split
- Add `src/tests/e2e/onboarding-public-beta.spec.ts`

- [ ] Write unit tests for invite validation:
  - valid code creates workspace and increments redemption count.
  - expired code returns 403.
  - disabled code returns 403.
  - exhausted code returns 403.
  - duplicate workspace name returns 400.
  - raw invite code is never returned.

- [ ] Change `POST /api/auth/login` so missing workspace returns 401 instead of creating one.

- [ ] Add `POST /api/beta/workspaces` that reuses the existing starter workspace creation sequence:
  - insert `workspaces`.
  - insert starter `plans`.
  - insert initial `plan_versions`.
  - update `plans.currentVersionId`.
  - insert starter `change_logs`.
  - insert `workspace_beta_access`.
  - set signed workspace session.

- [ ] Update login UI to expose two modes:
  - "登录已有 workspace".
  - "使用 invite code 创建 workspace".

- [ ] Keep existing user path compatible:
  - existing workspace + correct password still redirects to `/today`.
  - existing workspace + wrong password returns 401.

**Verification:**

```bash
npm run test -- src/tests/unit/beta-invites.test.ts src/tests/unit/beta-workspace-route.test.ts src/tests/unit/workspace-route.test.ts
npm run test:e2e -- src/tests/e2e/onboarding-public-beta.spec.ts
npm run test
npm run build
npm run test:e2e
```

### Phase 2: First-Run Onboarding

**Purpose:** Give new beta users a real next-action path based on stored data, not fake progress.

**Files:**

- Modify `src/lib/db/schema.ts`
- Add generated migration under `drizzle/`
- Create `src/lib/onboarding/state.ts`
- Create `src/app/api/onboarding/route.ts`
- Create `src/components/onboarding-checklist.tsx`
- Modify `src/app/(app)/today/page.tsx`
- Modify `src/app/(app)/layout.tsx` only if the checklist should appear across pages
- Add `src/tests/unit/onboarding-state.test.ts`
- Add `src/tests/e2e/onboarding-public-beta.spec.ts`

- [ ] Write unit tests for state derivation:
  - empty starter workspace shows plan import as next action.
  - future tasks or `mcp_plan_imports` completes plan import.
  - time blocks complete schedule import.
  - `schedule_import_skipped` completes schedule step with skipped state.
  - active MCP token completes connector step.
  - active Claude connector authorization completes connector step.
  - revoked tokens and revoked Claude authorizations do not complete connector step.
  - review visit event completes Review step.

- [ ] Implement `getOnboardingState(db, workspaceId)` in `src/lib/onboarding/state.ts`.

- [ ] Implement `GET /api/onboarding` and `PATCH /api/onboarding`.

- [ ] Render checklist in-app with direct links:
  - `/import`
  - `/constraints`
  - `/settings`
  - `/review`

- [ ] Record `review_opened` when `/review` loads.

**Verification:**

```bash
npm run test -- src/tests/unit/onboarding-state.test.ts
npm run test:e2e -- src/tests/e2e/onboarding-public-beta.spec.ts
npm run test
npm run build
npm run test:e2e
```

### Phase 3: Claude Custom Connector Auth Adapter

**Purpose:** Let Claude connect through OAuth-compatible MCP auth while keeping Codex bearer tokens working.

**Files:**

- Modify `src/lib/db/schema.ts`
- Add generated migration under `drizzle/`
- Create `src/lib/oauth/pkce.ts`
- Create `src/lib/oauth/connector-auth.ts`
- Create `src/app/.well-known/oauth-protected-resource/route.ts`
- Create `src/app/.well-known/oauth-protected-resource/api/mcp/route.ts`
- Create `src/app/.well-known/oauth-authorization-server/route.ts`
- Create `src/app/api/oauth/register/route.ts`
- Create `src/app/api/oauth/authorize/route.ts`
- Create `src/app/api/oauth/token/route.ts`
- Create `src/app/api/oauth/revoke/route.ts`
- Modify `src/app/api/mcp/route.ts`
- Modify `src/components/settings-view.tsx`
- Add `src/tests/unit/oauth-metadata-routes.test.ts`
- Add `src/tests/unit/oauth-connector-auth.test.ts`
- Update `src/tests/unit/mcp-http-route.test.ts`
- Add `src/tests/e2e/claude-connector-settings.spec.ts`

- [ ] Write metadata route tests:
  - protected resource metadata includes `resource` and `authorization_servers`.
  - authorization server metadata includes `authorization_endpoint`, `token_endpoint`, `revocation_endpoint`, `registration_endpoint`, `code_challenge_methods_supported: ["S256"]`, and supported scopes.
  - unauthenticated `/api/mcp` 401 includes `WWW-Authenticate` with `resource_metadata`.

- [ ] Write OAuth service tests:
  - authorization code requires signed-in workspace session.
  - authorization code stores only hash.
  - token exchange requires matching PKCE verifier.
  - authorization code cannot be reused.
  - expired authorization code is rejected.
  - access token verifies to `{ workspaceId, permission, tokenId }` shape usable by `createPawPlanMcpServer`.
  - revoking connector authorization makes access token invalid.

- [ ] Implement token verification path in `/api/mcp`:
  - first try existing `verifyMcpBearerToken`.
  - then try `verifyConnectorAccessToken`.
  - preserve permission filtering.
  - preserve usage audit and write limit.

- [ ] Add Settings UI:
  - Claude Connector URL: `https://pawplan.charlottezmm.info/api/mcp`.
  - OAuth discovery status from real metadata endpoint.
  - active connector authorizations with revoke action.
  - no fake "connected" state before active authorization exists.

- [ ] Keep Codex token UI unchanged except copy separation between Codex bearer token and Claude OAuth connector.

**Verification:**

```bash
npm run test -- src/tests/unit/oauth-metadata-routes.test.ts src/tests/unit/oauth-connector-auth.test.ts src/tests/unit/mcp-http-route.test.ts
npm run test:e2e -- src/tests/e2e/claude-connector-settings.spec.ts
npm run test
npm run build
npm run test:e2e
```

### Phase 4: Plan Import And Timetable Import Hardening

**Purpose:** Make import loops understandable and safe for public beta users.

**Files:**

- Modify `src/lib/mcp/plan-import.ts`
- Modify `src/lib/mcp/timetable-import.ts`
- Modify `src/lib/imports/timetable-csv.ts`
- Modify `src/components/import-view.tsx`
- Add `src/tests/unit/mcp-plan-import.test.ts`
- Add `src/tests/unit/mcp-timetable-import.test.ts`
- Add `src/tests/e2e/review-timetable.spec.ts`

- [ ] Expand plan import tests:
  - duplicate `import_key` returns existing import summary without duplicating tasks.
  - malformed date returns stable error.
  - empty task list remains rejected.
  - Month summary reads imported plan after import.

- [ ] Expand timetable draft tests:
  - `propose_timetable_import` accepts CSV or rows, not both.
  - draft creates `agent_patches` only.
  - draft does not write `courses`.
  - draft does not write `time_blocks`.
  - conflict list contains overlapping block names.

- [ ] Improve user-facing errors in import services and routes.

- [ ] Add example payloads to docs created in Phase 7.

**Verification:**

```bash
npm run test -- src/tests/unit/mcp-plan-import.test.ts src/tests/unit/mcp-timetable-import.test.ts src/tests/unit/timetable-csv.test.ts
npm run test:e2e -- src/tests/e2e/review-timetable.spec.ts
npm run test
npm run build
npm run test:e2e
```

### Phase 5: Calendar And Constraints UI Upgrade

**Purpose:** Show fixed schedule and conflicts without building a full calendar app.

**Files:**

- Modify `src/lib/constraints/service.ts`
- Modify `src/components/constraints-view.tsx`
- Modify `src/app/(app)/constraints/page.tsx` only if server-side data loading is added
- Add `src/tests/unit/constraints-service.test.ts`
- Add `src/tests/e2e/constraints-calendar.spec.ts`

- [ ] Add service tests for conflict detection:
  - overlapping editable blocks return conflict labels.
  - routine/recovery blocks appear in read-only calendar output.
  - create/edit/delete still only allows `course`, `meeting`, `unavailable`.

- [ ] Extend constraints API response to include:
  - editable blocks.
  - read-only routine/recovery blocks.
  - conflict summaries.
  - selected week range.

- [ ] Replace single sorted list with lightweight week/day layout:
  - day columns on desktop.
  - stacked day cards on mobile.
  - type labels and color swatches.
  - edit/delete controls only for editable blocks.

- [ ] Add link target from Review timetable import cards to `/constraints`.

**Verification:**

```bash
npm run test -- src/tests/unit/constraints-service.test.ts src/tests/unit/constraints-route.test.ts
npm run test:e2e -- src/tests/e2e/constraints.spec.ts src/tests/e2e/constraints-calendar.spec.ts
npm run test
npm run build
npm run test:e2e
```

### Phase 6: Review UI Upgrade

**Purpose:** Make Review the obvious safety control surface for task changes, timetable imports, skipped operations, and conflicts.

**Files:**

- Modify `src/lib/planning/view-data.ts`
- Modify `src/components/reschedule-preview.tsx`
- Modify `src/lib/planning/patch-apply.ts`
- Modify `src/app/api/patches/apply/route.ts` only if response shape needs additive metadata
- Add `src/tests/unit/review-view-data.test.ts`
- Add `src/tests/unit/patch-apply.test.ts`
- Add `src/tests/e2e/review-trust.spec.ts`
- Add `src/tests/e2e/review-timetable.spec.ts`

- [ ] Add view-data tests:
  - `move_task` maps to task changes group.
  - `change_priority` maps to task changes group.
  - `import_timetable` maps to timetable imports group.
  - unknown supported-but-unapplied operation maps to skipped/unsupported group.
  - conflict audit appears on the matching operation.
  - timetable import shows row count, block count, conflict count, and source label.

- [ ] Update `RescheduleViewData` to expose grouped sections while keeping operation IDs stable as `${patchId}:${operationIndex}`.

- [ ] Update UI controls:
  - `Accept all safe operations` only selects actionable operations without conflicts/skips/protection.
  - `Reject all` marks all actionable operations rejected.
  - submit remains disabled while actionable operations are undecided.

- [ ] Keep apply semantics unchanged:
  - no auto apply.
  - recheck conflicts at apply time.
  - persist `agent_patch_reviews`.
  - do not mark conflicted operations as applied.

**Verification:**

```bash
npm run test -- src/tests/unit/review-view-data.test.ts src/tests/unit/patch-apply.test.ts
npm run test:e2e -- src/tests/e2e/review-trust.spec.ts src/tests/e2e/review-timetable.spec.ts
npm run test
npm run build
npm run test:e2e
```

### Phase 7: Daily Agent Loop Prompts, Public Docs, Smoke Checklist

**Purpose:** Make public beta onboarding reproducible without repo context.

**Files:**

- Modify `docs/automation/pawplan-scheduled-automation.md`
- Create `docs/public-beta/getting-started.md`
- Create `docs/public-beta/connect-codex.md`
- Create `docs/public-beta/connect-claude.md`
- Create `docs/public-beta/import-plan.md`
- Create `docs/public-beta/import-timetable.md`
- Create `docs/public-beta/review-safety.md`
- Create `docs/public-beta/smoke-checklist.md`
- Modify `README.md`

- [ ] Update daily loop prompts:
  - morning review reads `get_today`, `get_week`, `get_constraints`, `get_capacity`, and recent check-ins.
  - evening check-in reads `get_today`, `get_tasks`, `get_checkins`, `get_constraints`, and `get_capacity`.
  - both prompts state that changes must be `propose_patch` or `propose_timetable_import` drafts only.
  - both prompts forbid direct constraint edits and automatic apply.

- [ ] Write public beta docs:
  - create workspace.
  - import plan.
  - import timetable.
  - connect Codex.
  - connect Claude.
  - use Review.
  - revoke access.
  - delete workspace.

- [ ] Write smoke checklist:
  - `/login` returns 200.
  - invite-gated workspace creation succeeds.
  - existing workspace login succeeds.
  - unauthenticated `/api/mcp` returns 401 with auth discovery metadata.
  - authenticated Codex bearer token lists expected tools.
  - Claude OAuth metadata endpoints return expected JSON.
  - Review draft can be accepted/rejected and audit persists.
  - workspace delete removes session and data.

**Verification:**

```bash
npm run test
npm run build
npm run test:e2e
```

Manual production smoke after deploy:

```bash
curl -I https://pawplan.charlottezmm.info/login
curl -i https://pawplan.charlottezmm.info/api/mcp
curl -s https://pawplan.charlottezmm.info/.well-known/oauth-protected-resource
curl -s https://pawplan.charlottezmm.info/.well-known/oauth-authorization-server
```

## Release Criteria

v1.0 public beta is complete only when:

- New user can create a workspace with invite code and no developer help.
- Existing users can still log in.
- User can import a structured plan.
- User can import or draft-import fixed schedule data.
- Codex hosted MCP bearer-token flow still works.
- Claude connector flow works through OAuth-compatible auth and can be revoked.
- AI-generated task changes and timetable imports appear as Review drafts.
- User confirmation is required before any Review draft writes changes.
- Calendar & Constraints shows fixed schedule, read-only protected blocks, and conflicts.
- Settings can revoke MCP tokens, revoke Claude connector access, export/import safe templates, and delete workspace.
- Public docs cover the first-run path.
- `npm run test`, `npm run build`, `npm run test:e2e`, and production smoke pass.

## Implementation Guidance

- Prefer one PR or commit per phase.
- Use subagents for Phase 1, Phase 3, Phase 5, and Phase 6 because they touch independent surfaces.
- Run the phase-specific tests before the full verification trio.
- Keep OAuth adapter small and PawPlan-owned; do not introduce a full external auth provider unless the connector test proves the local adapter cannot satisfy Claude.
- Keep invite code beta narrow. Do not add email auth, magic links, roles, teams, or billing.
- Do not change MCP tool names unless a test proves a connector compatibility issue.
- Do not remove local stdio MCP fallback.
- Do not change `import_plan_bundle` into a destructive sync operation.
- Do not broaden constraint writes beyond `course`, `meeting`, and `unavailable`.

## Self-Review

- Spec coverage: all required v1.0 sections map to a phase above.
- Boundary check: excluded calendar sync, billing, teams, app-owned AI, automatic apply, direct MCP constraint edits, and query-string tokens.
- Test coverage: each phase has focused unit/e2e verification plus full `test`, `build`, and `test:e2e`.
- Migration coverage: invite access, onboarding events, OAuth client/code/token state require additive migrations.
- Main open engineering risk: exact Claude Custom Connector UI behavior may require one manual connector smoke test after OAuth metadata and token routes are implemented.
