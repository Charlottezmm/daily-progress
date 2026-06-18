# PawPlan v1 Formal Technical Design

Date: 2026-06-17

## 1. Positioning

PawPlan v1 formal is not a full SaaS launch. It is the first version that is reliable enough for the owner to use daily as a real product and to share with invited users without developer supervision.

The release goal:

```text
PawPlan v1 lets an invited user create a workspace, import planning data, connect Claude or Codex, run scheduled agent reviews, receive reliable Review drafts, approve changes manually, and recover from common failures without direct database edits.
```

The main correction from the current beta is the daily agent loop. External schedulers from Codex, Claude Cowork, or Claude can continue to trigger the work. PawPlan must own the reliable planning interface that turns agent intent into valid Review drafts.

## 2. Definition Of Done

v1 formal is complete only when all of these are true:

- The owner can use PawPlan for one full week without direct database edits.
- An invited user can complete onboarding without repo context.
- Claude and Codex can both connect to the hosted MCP endpoint.
- Scheduled morning and weekly agent runs can create Review drafts through high-level rebalance tools.
- Failed agent runs are visible and explainable; they cannot silently disappear.
- Duplicate scheduled retries do not create duplicate Review drafts.
- Inbox supports low-friction life-admin capture without polluting Today or project plans.
- Review remains the only path that applies planning changes.
- Workspace deletion, token revocation, and export still work.
- Unit tests, integration tests, e2e tests, production build, and production smoke checks pass.

## 3. Non-Goals

Do not include these in v1 formal:

- App-owned AI calls.
- Built-in cron, scheduler UI, or background worker.
- Automatic patch apply.
- Billing, plans, or pricing.
- Teams or multi-user permissions.
- Public open signup.
- Calendar two-way sync.
- Full drag-and-drop calendar scheduling.
- Public template marketplace.

### What "app-owned AI" Means

App-owned AI means PawPlan itself stores an LLM API key, calls an LLM provider from the app backend, owns prompts internally, and decides when to generate recommendations without an external agent client.

That is out of scope for v1. In v1, Claude, Codex, or Claude Cowork owns the model call and scheduled trigger. PawPlan owns the data, MCP contract, validation, Review draft creation, audit, and safety boundary.

## 4. Current Constraints

Current architecture already has these usable pieces:

- Next.js app with workspace-scoped auth.
- Hosted MCP endpoint at `/api/mcp`.
- MCP bearer tokens and OAuth-style Claude connector support.
- Review-first agent patches through `agent_patches`.
- Per-operation Review audit through `agent_patch_reviews`.
- Fixed blocks and capacity model.
- Public beta invite model.
- Template export/import and workspace delete.

Current reliability gap:

- `propose_patch` is a low-level primitive.
- For `move_task`, agents must provide `from_date` and `from_day_segment`.
- Date serialization crosses UTC and Asia/Shanghai local calendar boundaries.
- Scheduled agents can fail once, stop, and still claim success.
- PawPlan has no first-class record of a scheduled agent run.
- Duplicate scheduled retries can create duplicate drafts unless the external agent prevents it.
- Inbox currently has only title/source/processed state, so agents can misuse it as a project-task dump and users cannot schedule small chores with date, segment, or estimate when promoting them.

## 5. Architecture

Keep the external scheduler model:

```text
Codex / Claude Cowork / Claude scheduled task
  -> hosted PawPlan MCP
  -> high-level rebalance tool
  -> PawPlan validates and creates Review draft
  -> user manually applies selected operations in /review
```

Add a reliability layer inside PawPlan:

```text
MCP high-level tool
  -> agent run service
  -> rebalance proposal service
  -> existing patch validation
  -> existing Review draft storage
  -> structured result and run audit
```

The high-level tools are facades over existing Review-first primitives. They should not bypass Review, write task dates directly, or apply patches.

## 6. Data Model

Add one table and supporting enums. Keep existing `agent_patches` and `agent_patch_reviews`.

```sql
CREATE TYPE agent_run_kind AS ENUM (
  'morning_rebalance',
  'evening_review',
  'weekly_rebalance'
);

CREATE TYPE agent_run_status AS ENUM (
  'started',
  'draft_created',
  'no_change',
  'duplicate',
  'failed'
);

CREATE TABLE agent_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  plan_id uuid REFERENCES plans(id) ON DELETE SET NULL,
  patch_id uuid REFERENCES agent_patches(id) ON DELETE SET NULL,
  kind agent_run_kind NOT NULL,
  idempotency_key varchar(200) NOT NULL,
  status agent_run_status NOT NULL,
  reason text NOT NULL,
  input_json jsonb NOT NULL,
  result_json jsonb NOT NULL,
  warnings_json jsonb NOT NULL DEFAULT '[]'::jsonb,
  error_json jsonb,
  created_by varchar(40) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX agent_runs_workspace_idempotency_unique
  ON agent_runs (workspace_id, idempotency_key);

CREATE INDEX agent_runs_workspace_created_idx
  ON agent_runs (workspace_id, created_at DESC);

CREATE INDEX agent_runs_workspace_status_idx
  ON agent_runs (workspace_id, status);
```

Rollback:

- Drop `agent_runs`.
- Drop `agent_run_status`.
- Drop `agent_run_kind`.
- Remove high-level MCP tools from the schema registry.
- Existing Review drafts and task data remain valid.

## 7. MCP Tool Contracts

### 7.1 `propose_daily_rebalance`

Purpose:

Create a Review draft for moving tasks within the visible daily/weekly planning horizon without making the agent provide old task positions.

Input JSON Schema:

```json
{
  "type": "object",
  "additionalProperties": false,
  "required": ["idempotency_key", "reason", "moves"],
  "properties": {
    "idempotency_key": {
      "type": "string",
      "minLength": 8,
      "maxLength": 200
    },
    "reason": {
      "type": "string",
      "minLength": 1,
      "maxLength": 4000
    },
    "moves": {
      "type": "array",
      "minItems": 1,
      "maxItems": 50,
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["task_id", "to_date", "to_day_segment", "reason"],
        "properties": {
          "task_id": { "type": "string", "minLength": 1 },
          "to_date": {
            "type": "string",
            "pattern": "^\\d{4}-\\d{2}-\\d{2}$"
          },
          "to_day_segment": {
            "type": "string",
            "enum": ["morning", "afternoon", "evening"]
          },
          "reason": {
            "type": "string",
            "minLength": 1,
            "maxLength": 1000
          }
        }
      }
    },
    "created_by": {
      "type": "string",
      "enum": ["codex", "claude", "user"]
    }
  }
}
```

Output:

```json
{
  "runId": "uuid",
  "status": "draft_created",
  "patchId": "uuid",
  "reviewUrl": "/review",
  "operationCount": 2,
  "skipped": [],
  "warnings": [],
  "idempotencyKey": "morning-rebalance:2026-06-17"
}
```

Allowed statuses:

- `draft_created`: a new Review draft was created.
- `duplicate`: an earlier run with the same workspace and idempotency key already exists.
- `no_change`: all proposed moves were no-ops or invalid to propose.
- `failed`: PawPlan could not create a reliable result.

### 7.2 `propose_week_rebalance`

Use the same input and output shape as `propose_daily_rebalance`, but set:

```text
kind = weekly_rebalance
mode = week
```

The weekly tool can move tasks across the next visible week. It still cannot apply changes.

## 8. Rebalance Semantics

For each requested move:

1. Load the task by `workspace_id` and `task_id`.
2. Skip if the task does not exist.
3. Skip if `status` is `done` or `skipped`.
4. Skip if `movable` is false.
5. Normalize `to_date` as an Asia/Shanghai local calendar date.
6. Compare the current task local date and segment with the requested target.
7. Skip no-op moves.
8. Generate a full `move_task` operation with:
   - `from_date`
   - `from_day_segment`
   - `to_date`
   - `to_day_segment`
   - `reason`
9. Validate the generated patch through the same protected-block and Review validation paths as `propose_patch`.
10. Create an `agent_patches` draft only if at least one operation is valid.
11. Record the run result.

Skipped operations are returned as structured warnings and persisted in `agent_runs.result_json`.

Example skipped item:

```json
{
  "taskId": "task-123",
  "code": "task_already_done",
  "message": "Task is already done and was not moved."
}
```

## 9. Idempotency

The caller must provide `idempotency_key`.

Recommended key formats:

```text
morning-rebalance:YYYY-MM-DD
evening-review:YYYY-MM-DD
weekly-rebalance:YYYY-WW
```

PawPlan scopes idempotency by workspace:

```text
(workspace_id, idempotency_key)
```

If a duplicate key is received:

- Return the existing run.
- Do not create another Review draft.
- If the existing run has a patch, return that `patchId`.
- If the existing run failed, return `duplicate` with the existing error and tell the caller to use a new idempotency key only after intentional manual retry.

This prevents scheduled task retries from duplicating drafts.

## 10. Error Handling

The high-level tools must never silently swallow failures.

Validation errors:

- Missing required fields return a normal MCP tool error before writing a run.
- Invalid date format returns a normal MCP tool error before writing a run.

Runtime failures after idempotency begins:

- Record `agent_runs.status = failed`.
- Store a compact `error_json`:

```json
{
  "code": "patch_validation_failed",
  "message": "Agent patch cannot modify routine or recovery blocks"
}
```

- Return `status: "failed"` with the same error object.

No-change behavior:

- If every requested move is skipped or a no-op, create an `agent_runs` row with `status = no_change`.
- Do not create an `agent_patches` row.
- Return skipped details so the scheduled agent can report truthfully.

## 11. Review Requirements

`/review` remains the only apply surface.

Minimum v1 Review changes:

- Show the source for rebalance-created patches.
- Show a link or metadata for the associated run when available.
- Preserve existing accept/reject/apply behavior.
- Preserve conflict recheck during apply.
- Do not apply skipped operations.

Do not add auto-apply.

## 12. Settings Requirements

Settings should make agent reliability observable enough for real use.

Minimum v1 Settings changes:

- Show Claude connector configuration.
- Show Codex MCP configuration.
- Show MCP token create/revoke.
- Show latest agent run summary:
  - kind
  - status
  - created time
  - patch link if present
  - error summary if failed
- Avoid fake connection status. Only show connected states when backed by persisted authorization, token, or run data.

## 13. Inbox And Life Admin Capture

Inbox should be a low-friction capture buffer, not a hidden task list and not a replacement for project import.

Definitions:

- Inbox item: an unscheduled captured thought, chore, errand, or project seed.
- Today task: a committed task with date, day segment, and estimate.
- Routine: a repeated life-admin or recovery behavior.
- Project plan: a structured set of related tasks that belongs in `import_plan_bundle` or Review drafts, not raw Inbox.

Rules:

- Inbox items do not count against Today capacity.
- Inbox items should not require time metadata at capture time.
- Promoting an Inbox item to Today must require or default visible scheduling metadata:
  - `date`
  - `day_segment`
  - `estimated_minutes`
  - optional `priority`
- Promoting an Inbox item to Routine must require or default visible routine metadata:
  - weekday pattern
  - default segment or specific time window
  - estimated minutes
- Project discussions should not be dumped into Inbox as many task rows. If the agent has enough structure, it should call `import_plan_bundle` or create Review drafts. If the project is not ready, create one Inbox project seed such as "Clarify hardware sourcing project", not many unscheduled tasks.
- Small chores should flow through Inbox first unless the user explicitly says they are doing them today.

Recommended user flow for life-admin chores:

```text
quick capture: "倒垃圾 / 洗衣服 / 买纸巾"
  -> Inbox
  -> user promotes one item to Today with estimate and segment
  -> recurring chores become Routine instead of repeated Inbox items
```

Recommended agent behavior:

- Use `create_inbox_item` for low-commitment captures, errands, chores, or unclear project seeds.
- Use `import_plan_bundle` for a discussed project with multiple concrete tasks and dates.
- Use high-level rebalance tools for moving already planned tasks.
- Do not create many Inbox items from a structured project conversation unless the user explicitly asks for a brain dump.

Minimum v1 product changes:

- Rename or clarify Inbox UI copy so it says "capture buffer" and "not scheduled".
- Add a Promote to Today flow that lets the user choose date, day segment, and estimate before creating the task.
- Keep a one-tap default for chores: Today, next available segment, 15 minutes.
- Add a Promote to Routine flow for recurring chores.
- Keep Delete for stale or accidental captures.
- Update MCP tool descriptions so external agents know when Inbox is appropriate.

Testing requirements:

- Capturing an item does not create a task or affect capacity.
- Promoting to Today creates a task with the selected date, segment, and estimate.
- Promoting to Routine creates a routine and marks the Inbox item processed.
- A project-like batch import path uses `import_plan_bundle`, not Inbox.

## 14. Onboarding Requirements

The current invite-gated model remains.

The first-run flow must guide users through:

1. Create workspace with invite code.
2. Import plan or start from default plan.
3. Import timetable or skip intentionally.
4. Create MCP token or connect Claude.
5. Run a test read.
6. Run a test Review draft through a high-level rebalance tool.
7. Open `/review`.
8. Capture one small chore in Inbox and promote it to Today or Routine.

Onboarding does not need app-owned AI.

## 15. Documentation Requirements

Update user-facing docs so a new invited user can copy a working setup:

- Getting started.
- Connect Claude.
- Connect Codex.
- Morning scheduled prompt.
- Weekly scheduled prompt.
- Inbox and life-admin capture.
- Review safety.
- Troubleshooting failed agent runs.

The prompts must instruct the agent:

- Use high-level rebalance tools for moves.
- Inspect the returned `status`.
- Only claim success when `status = draft_created` or `duplicate` with an existing `patchId`.
- Report `failed` and `no_change` truthfully.
- Avoid using Inbox as a project task dump.

## 16. Testing Strategy

Unit tests:

- High-level tool schema is narrow and JSON-schema friendly.
- Read-only MCP tokens cannot access rebalance tools.
- `propose_daily_rebalance` creates a full `move_task` patch from task intent.
- Date keys are normalized as Asia/Shanghai local dates.
- Completed tasks are skipped.
- No-op moves return `no_change`.
- Duplicate idempotency returns the prior run and does not insert a new patch.
- Failed patch validation records a failed run.
- Inbox promotion requires or supplies visible schedule metadata.
- Inbox capture does not create Today tasks.

Integration tests:

- Migration creates `agent_runs`.
- `agent_runs` cascade or set-null behavior works with workspace delete and patch delete.
- Review apply still works for patches created by rebalance tools.
- Inbox promote-to-task and promote-to-routine mark the source Inbox item processed.

E2E tests:

- User creates a workspace, imports plan data, creates token, calls rebalance through MCP, sees Review draft.
- Duplicate scheduled call does not create a second Review draft.
- Failed or no-change run appears in Settings.
- User captures a chore in Inbox and promotes it to Today with date, segment, and estimate.

Production smoke:

```bash
npm run test
npm run build
npm run test:e2e
curl -i https://pawplan.charlottezmm.info/login
curl -i https://pawplan.charlottezmm.info/api/mcp
```

Authenticated MCP smoke should verify:

- `tools/list` includes `propose_daily_rebalance` and `propose_week_rebalance` for read-write tokens.
- `tools/list` excludes those tools for read-only tokens.
- A real rebalance call returns `draft_created`, `duplicate`, or `no_change`.
- If it returns `draft_created`, `/review` can read the draft.

## 17. Release Risks

Risk: Duplicate drafts from scheduled retries.

Mitigation: enforce `(workspace_id, idempotency_key)` uniqueness.

Risk: New high-level tools bypass existing Review validation.

Mitigation: build generated patches through the existing `proposeAgentPatch` path.

Risk: Date conversion remains wrong.

Mitigation: centralize Asia/Shanghai date-key helpers and test UTC-boundary cases.

Risk: Agent run recording creates partial rows.

Mitigation: wrap run creation and patch creation in a transaction where possible; if patch creation fails, update the run to `failed`.

Risk: Scope creeps into app-owned AI or scheduler work.

Mitigation: keep external schedulers; only improve the MCP contract and app observability.

Risk: Inbox becomes a dumping ground for project tasks.

Mitigation: keep Inbox as capture-only, add explicit promotion metadata, and update agent prompts to use `import_plan_bundle` for structured projects.

Risk: Small chores pollute Today capacity.

Mitigation: captures do not count against capacity until promoted; recurring chores become Routine.

## 18. Release Gate

Do not call this v1 formal until all gates pass:

- `npm run test`
- `npm run build`
- `npm run test:e2e`
- migration applied to production
- production MCP unauthenticated 401 smoke
- production authenticated tools/list smoke
- production rebalance draft smoke with readback from `/review`
- workspace delete smoke on a test workspace
- token revoke smoke
- final git status clean after commit and push
