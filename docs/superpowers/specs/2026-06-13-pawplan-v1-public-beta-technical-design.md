# PawPlan v1.0 Public Beta Technical Design

Date: 2026-06-13

## 1. Version Positioning

PawPlan v1.0 should be the first version that can be publicly shared as a controlled beta.

It should not mean PawPlan has every possible planning feature. It should mean a new user can arrive without repo context, create a safe workspace, import a plan and fixed schedule, connect Claude or Codex, and use Review to approve AI-generated planning changes.

One-sentence goal:

```text
Public beta users can start PawPlan by themselves: create a workspace, import plan and schedule data, connect Claude or Codex, and safely let AI propose daily plan changes through Review.
```

## 2. Product Goals

v1.0 must close these loops:

- Public sharing through a controlled beta entry point.
- Workspace creation, isolation, and deletion.
- Claude Custom Connector support.
- Codex hosted MCP support remains working.
- First-run onboarding from empty state to useful plan.
- Plan import through MCP and/or UI.
- Timetable import through MCP draft and Review confirmation.
- Calendar & Constraints UI for fixed schedule visibility and basic editing.
- Daily agent loop prompts for morning review and evening check-in.
- Review as the required human control surface for AI changes.
- Settings and docs sufficient for a new user.
- Safety, audit, and rate limits appropriate for hosted beta use.

## 3. Non-Goals

Do not include these in v1.0:

- Full drag-and-drop calendar editor.
- Google Calendar, Apple Calendar, or Outlook two-way sync.
- Multi-user team collaboration.
- Billing, subscriptions, or public pricing.
- Public template marketplace.
- App-owned LLM calls or embedded AI chat.
- Automatic patch apply.
- Public unauthenticated sharing of plans.

## 4. Current Baseline

As of v0.4 plus the 2026-06-13 timetable MCP patch:

- Hosted production URL exists:

```text
https://pawplan.charlottezmm.info
```

- Workspace login exists but is still simple workspace-name/password auth.
- Hosted MCP exists at:

```text
https://pawplan.charlottezmm.info/api/mcp
```

- MCP bearer tokens exist with read-only and read-write permissions.
- Codex can use bearer token env var config.
- Claude Custom Connector cannot yet authenticate because the current Claude UI expects Remote MCP plus OAuth-style connector config, not manual bearer headers.
- Plan import exists through `import_plan_bundle`.
- Timetable import exists through `propose_timetable_import`, but it is Review-first and does not directly write constraints.
- `/constraints` exists and supports course, meeting, and unavailable time blocks.
- Review persists accepted, rejected, skipped, and conflict audit.
- Template export/import and workspace delete exist.
- Hosted MCP usage audit and lightweight write limit exist.

## 5. Public Beta Access Model

v1.0 should use controlled access, not a fully open public signup.

Recommended approach:

```text
invite-code beta
```

Why:

- It is simpler than full account/email auth.
- It limits abuse while the product is still validating daily use.
- It lets the owner share PawPlan publicly without immediately building billing or team infrastructure.

Minimum requirements:

- A landing/login entry can accept an invite code.
- Invite code creates or unlocks a workspace creation flow.
- Each user gets an isolated workspace.
- A workspace owner can delete all workspace data from Settings.
- Invite codes are not exported in templates.

Future-compatible option:

- Keep the invite-code model narrow enough that email login or magic link can replace it later.
- Do not couple invite codes to MCP token secrets.

## 6. Auth And Connector Architecture

### 6.1 Web App Auth

v1.0 can keep workspace-scoped auth if the beta remains controlled.

Required improvements:

- Make workspace creation self-serve behind invite code.
- Make errors understandable for a non-developer.
- Keep session cookie signing through `APP_SECRET`.
- Keep workspace data scoped by `workspace_id`.

### 6.2 Codex MCP

Codex MCP remains bearer-token based:

```toml
[mcp_servers.pawplan]
url = "https://pawplan.charlottezmm.info/api/mcp"
bearer_token_env_var = "PAWPLAN_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

This path should remain documented and tested.

### 6.3 Claude Custom Connector

v1.0 must add a Claude-compatible connector path.

Problem:

- Claude Custom Connector asks for Remote MCP server URL and optional OAuth client fields.
- PawPlan currently requires `Authorization: Bearer <token>`.
- The Claude UI does not provide a plain bearer token field.

Required outcome:

- A user can connect Claude to PawPlan without pasting raw MCP tokens into screenshots, URLs, or prompt text.
- Claude can list and call PawPlan MCP tools.
- Revoking access in PawPlan breaks Claude access.

Preferred architecture:

```text
Claude Custom Connector
  -> PawPlan OAuth/connector auth adapter
  -> workspace-scoped MCP session/token
  -> existing MCP tool dispatch and permission checks
```

Do not weaken the existing MCP boundary by accepting tokens in query strings.

## 7. MCP Tool Contract

v1.0 should preserve the current tool categories.

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
- `propose_timetable_import`
- `import_plan_bundle`

Rules:

- `get_constraints` and `get_capacity` are read-only context.
- `propose_patch` creates Review drafts only.
- `propose_timetable_import` creates Review drafts only.
- `import_plan_bundle` can write real tasks because it represents a trusted initial import, and must remain idempotent by `import_key`.
- MCP must not directly edit constraints.
- MCP must not auto-apply Review patches.
- Read-only tokens must not see write tools.

## 8. First-Run Onboarding

v1.0 needs an onboarding flow because public users will not know the intended sequence.

Recommended onboarding steps:

1. Create workspace.
2. Import a plan.
3. Import fixed schedule or course table.
4. Connect Claude or Codex.
5. Run a morning review or evening check-in.
6. Open Review and approve or reject AI suggestions.

Implementation shape:

- Keep onboarding inside the app, not as a marketing landing page.
- Use checklist-style state based on real data presence.
- Do not mark a step complete unless the backing data exists.
- Allow skipping AI connector setup, but keep the next action visible.

Completion signals:

- Has active plan.
- Has at least one future task or imported plan bundle.
- Has at least one fixed time block or explicit skipped schedule import.
- Has at least one active MCP token or Claude connector authorization.
- Has visited Review or applied/rejected a draft.

## 9. Plan Import Loop

Current `import_plan_bundle` remains the main AI-assisted plan import path.

v1.0 requirements:

- Keep `import_key` idempotency.
- Show imported plan summary in Month.
- Ensure Today, Week, and Month show useful state immediately after import.
- Improve errors for duplicate or malformed imports.
- Document the expected payload shape with examples.

Do not make plan import depend on Claude only. Codex, Claude, or manual UI can all prepare the same structured import.

## 10. Timetable Import Loop

Current state:

- UI supports CSV preview/save.
- MCP supports `propose_timetable_import`.
- Review acceptance writes `courses` and `time_blocks`.

v1.0 requirements:

- Keep timetable import Review-first for AI-generated data.
- Show clearer Review cards for timetable import drafts.
- Show conflict count and the overlapping block names.
- Recheck conflicts at apply time.
- Add user-facing docs and example CSV/rows.

Do not allow MCP to directly write `courses` or `time_blocks`.

## 11. Calendar & Constraints UI

v1.0 should include a real calendar UI, but not a full drag-and-drop calendar editor.

Correct positioning:

```text
Calendar & Constraints View
```

Purpose:

- Let users and AI understand fixed schedule constraints.
- Show when the user is unavailable.
- Show which blocks are protected.
- Explain real capacity for Today, Week, and Review.

Required UI:

- Day or week calendar visualization.
- Visible `course`, `meeting`, `unavailable`, `routine`, and `recovery` blocks.
- Basic create/edit/delete for editable fixed blocks:
  - `course`
  - `meeting`
  - `unavailable`
- Conflict highlighting.
- Link from timetable Review draft to Calendar & Constraints.
- Responsive mobile view.

Explicitly out of scope:

- Drag to move blocks.
- Drag to resize blocks.
- Full month drag scheduling.
- Cross-calendar sync.
- Treating PawPlan as a replacement for Google Calendar.

## 12. Daily Agent Loop

v1.0 should make the agent loop usable by a normal beta user.

Morning review prompt should:

- Read today, week, constraints, capacity, and recent check-ins.
- Detect overloads and conflicts.
- Propose only Review drafts through `propose_patch`.
- Avoid changing routines, recovery, courses, meetings, or unavailable blocks.

Evening check-in prompt should:

- Read today, tasks, check-ins, constraints, and capacity.
- Create or update check-in when user provides completion notes.
- Propose tomorrow or week changes through Review only.
- Save key conversation summary and decisions when useful.

Automation remains outside PawPlan:

- Codex / Cowork / Claude triggers the agent.
- PawPlan does not own cron, scheduler UI, or browser background execution.

## 13. Review Control Surface

Review is the safety boundary for v1.0.

Required:

- Distinguish operation categories:
  - task movement
  - priority change
  - backlog/defer
  - timetable import
  - unsupported/skipped operation
  - conflict
- Show:
  - before
  - after
  - reason
  - impact
  - provenance
  - conflict
  - skipped reason
- Support:
  - accept
  - reject
  - accept all safe operations
  - reject all
- Persist per-operation review audit.
- Make apply results visible after submit.

Review must never silently apply an operation that changed since proposal.

## 14. Settings Stabilization

Settings should be a reliable control center.

Required sections:

- Workspace identity.
- Codex MCP connection.
- Claude connector connection.
- MCP token create/revoke.
- Template export/import.
- Workspace delete.
- Usage/audit status.

Settings must avoid fake connection status. Only show connected/authorized state when the backing data proves it.

## 15. Data Safety And Audit

v1.0 hosted beta must preserve these rules:

- MCP token raw value shown only once.
- Tokens are revocable.
- Read-only and read-write permissions remain enforced.
- Hosted MCP write limit remains active.
- Usage audit records tool name, permission, success/failure, and time.
- Template export excludes:
  - secrets
  - token hashes
  - check-ins
  - personal completion status
  - agent patch history
  - raw conversation history
- Workspace delete cascades all workspace data.
- Review audit remains persisted.

## 16. Documentation Requirements

v1.0 public beta needs user-facing docs, not only engineering handoffs.

Minimum docs:

- What PawPlan is.
- How to create a workspace.
- How to import a plan.
- How to import a timetable.
- How to connect Claude.
- How to connect Codex.
- What AI can do.
- What AI cannot do.
- Why Review exists.
- How to revoke access and delete data.

Docs should use screenshots or short examples only after the UI stabilizes.

## 17. Testing Strategy

Unit tests:

- Invite code and workspace creation.
- Claude connector authorization adapter.
- MCP tool permission filtering.
- `propose_timetable_import` remains draft-only.
- Review apply conflict recheck.
- Template export exclusions.
- Workspace delete cascade behavior.

E2E tests:

- New user onboarding happy path.
- Plan import happy path.
- Timetable import through Review.
- Calendar & Constraints visibility.
- Codex MCP token creation/revoke still works.
- Claude connector connection smoke if locally testable.
- Workspace delete confirmation.

Production smoke:

- `/login` or new beta entry returns 200.
- Unauthenticated `/api/mcp` returns 401.
- Authenticated MCP tools list includes expected read/write tools.
- Claude connector endpoint responds with the expected auth behavior.

## 18. Release Criteria

v1.0 is ready for public beta only when:

- A new user can create a workspace without developer help.
- A user can import a plan.
- A user can import or draft-import a fixed schedule.
- A user can connect at least Claude or Codex; for public beta, Claude should be supported.
- AI-generated changes appear in Review and require confirmation.
- Calendar & Constraints shows fixed schedule and conflicts.
- Settings can revoke access and delete workspace data.
- Docs explain the complete first-run path.
- Tests, build, e2e, and production smoke pass.

## 19. Suggested Implementation Phases

Recommended order:

1. Public beta access and onboarding.
2. Claude connector auth adapter.
3. Calendar & Constraints UI upgrade.
4. Review UI upgrade for timetable and conflict clarity.
5. Daily agent loop docs and prompts.
6. Public beta docs and smoke checklist.

Do not start with visual polish. The main risk is that a new user cannot connect AI or understand the first-run sequence.
