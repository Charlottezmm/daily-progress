# PawPlan v0.3 + v0.4 Technical Design

Date: 2026-06-12

## 1. Version Decision

The next stage should be `v0.3`, not `v1.0`.

`v0.2` proves the agent loop can connect: hosted MCP works, MCP tokens can be created and revoked, `import_plan_bundle` can create real tasks, and later changes remain Review-first. It does not yet prove the product is stable for daily use by someone who is not sitting inside the repo with context.

`v1.0` should mean PawPlan is reliable enough for a normal hosted user to create a workspace, connect Codex or Claude Cowork, import a plan, complete daily work, review agent suggestions, and recover from common mistakes without developer help. That requires at least one more daily-use hardening cycle.

## 2. v0.3 Goal

Make PawPlan a dependable daily agent-loop planner:

- Calendar/course/unavailable constraints are editable and visible.
- Today, Plan day/week/month, and Review all reason from the same constraint/capacity layer.
- Codex or Claude Cowork can run the morning/evening loop through hosted MCP and write Review-only suggestions.
- Review shows enough evidence for the user to trust or reject each operation.

## 3. v0.4 Goal

Make PawPlan durable for repeated use:

- Save structured conversation summaries and decisions through MCP.
- Export/import templates without secrets or personal progress history.
- Add workspace data management and hosted safety limits.
- Update docs so another user can operate the app without reading handoff files.

## 4. Non-Goals

These remain out of scope for v0.3 and v0.4:

- OAuth, email login, billing, teams, public sharing, template gallery.
- App-owned scheduler, server cron, browser timer, or PWA background rescheduler.
- Embedded LLM chat UI or storing full raw conversations by default.
- Calendar sync with Google/Apple/Outlook.
- Drag-and-drop day calendar or minute-perfect time scheduling for normal tasks.
- Automatic application of agent patches.

## 5. Current State

Relevant existing surfaces:

- `src/lib/db/schema.ts`
  - Already has `courses`, `time_blocks`, `routines`, `routine_completions`, `day_capacities`, `agent_patches`, `change_logs`, `conversations`, `decisions`, `mcp_tokens`, `mcp_plan_imports`.
- `src/lib/imports/timetable-save.ts`
  - Can materialize CSV timetable rows into `courses` and `time_blocks`.
  - It intentionally notes duplicate imports are not deduplicated.
- `src/lib/planning/view-data.ts`
  - Builds Today, Week, Month, and Review data.
  - Reads `time_blocks` in some flows but does not yet provide a unified constraint/capacity model.
- `src/lib/patches/patch-schema.ts`
  - Supports task patch operations.
  - Rejects attempts to move protected blocks only for explicit `move_protected_block`.
- `src/lib/planning/patch-apply.ts`
  - Applies selected operations transactionally and creates `plan_versions` and `change_logs`.
  - Does not yet persist per-operation review decisions or conflict metadata.
- `src/lib/mcp/tools.ts`
  - Exposes read tools, write tools, `propose_patch`, and `import_plan_bundle`.
  - Does not yet expose constraints, conversations, decisions, or template export/import.
- `src/components/more-view.tsx`
  - `日历与课程` remains disabled.
  - `日常事项` links to Settings.

## 6. v0.3 Architecture

### 6.1 Constraint Layer

Use `courses` and `time_blocks` as the source of truth. Do not introduce a separate calendar model in v0.3.

Create a focused constraints module:

```text
src/lib/constraints/service.ts
src/lib/constraints/schema.ts
src/app/api/constraints/route.ts
src/app/(app)/constraints/page.tsx
src/components/constraints-view.tsx
```

`time_blocks.kind` remains:

```text
course | meeting | unavailable | routine | recovery
```

In v0.3, the editable UI should support only:

```text
course | meeting | unavailable
```

Routine editing stays in Settings. Recovery target stays system default unless a later design explicitly opens it.

### 6.2 Constraint API Contract

Internal PWA route, not public REST:

```yaml
GET /api/constraints:
  response:
    workspaceId: string
    courses:
      - id: string
        name: string
        color: string
    timeBlocks:
      - id: string
        title: string
        kind: course | meeting | unavailable
        startsAt: string
        endsAt: string
        recurrenceRule: string | null
        courseId: string | null
        courseName: string | null
        movable: false
```

```yaml
POST /api/constraints:
  body:
    action: upsert_time_block
    block:
      id: string | null
      title: string
      kind: course | meeting | unavailable
      startsAt: string
      endsAt: string
      recurrenceRule: string | null
      courseName: string | null
      color: string | null
  response:
    timeBlock: TimeBlock
    course: Course | null
```

```yaml
PATCH /api/constraints:
  body:
    action: delete_time_block
    id: string
  response:
    deleted: true
```

Validation rules:

- `title` is required and max 180 chars.
- `kind` must be `course`, `meeting`, or `unavailable`.
- `startsAt < endsAt`.
- Single block duration must be positive and at most 12 hours.
- `courseName` creates or reuses a `courses` row when `kind = course`.
- All operations must scope by `workspace_id`.
- Delete must only delete editable `course|meeting|unavailable` blocks for the current workspace.
- Every write creates a `change_logs` row with `source = manual`.

### 6.3 Capacity Model

Create a single reusable capacity module:

```text
src/lib/planning/capacity-model.ts
```

Inputs:

```ts
type CapacityInput = {
  date: Date;
  tasks: Array<{ id: string; date: Date; daySegment: "morning" | "afternoon" | "evening"; estimatedMinutes: number; status: string }>;
  timeBlocks: Array<{ id: string; title: string; kind: string; startsAt: Date; endsAt: Date; movable: boolean }>;
  routines: Array<{ id: string; title: string; defaultTimeSegment: string; defaultStartTime: string | null; defaultEndTime: string | null; weekdayPattern: string; estimatedMinutes: number }>;
  dayCapacity: { morningMinutes: number; afternoonMinutes: number; eveningMinutes: number } | null;
};
```

Outputs:

```ts
type CapacityResult = {
  dateKey: string;
  segments: Array<{
    segment: "morning" | "afternoon" | "evening";
    availableMinutes: number;
    taskMinutes: number;
    protectedMinutes: number;
    totalUsedMinutes: number;
    remainingMinutes: number;
    state: "room" | "ok" | "over";
    blocks: Array<{ id: string; title: string; kind: string; minutes: number; protected: boolean }>;
  }>;
  warnings: Array<{ id: string; title: string; text: string }>;
};
```

Rules:

- `time_blocks` with kind `course`, `meeting`, `unavailable`, `routine`, or `recovery` are protected capacity usage.
- Routines with `specific_window` should be represented as protected usage if start/end times exist. Other routines count against their default segment.
- Completed/skipped tasks still count as historical used time for today, but future completed/skipped tasks should not create over-capacity warnings.
- Backlog tasks do not count toward day capacity.
- A segment is `over` if `totalUsedMinutes > availableMinutes`.
- Plan views should show the same warning source as Review validation.

### 6.4 Review Trust Model

v0.3 should preserve per-operation review evidence.

Add a small review audit table instead of widening `agent_patches` too much:

```sql
CREATE TABLE agent_patch_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  patch_id uuid NOT NULL REFERENCES agent_patches(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  accepted_operation_indexes jsonb NOT NULL,
  rejected_operation_indexes jsonb NOT NULL,
  skipped_json jsonb NOT NULL,
  conflict_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Indexes:

```sql
CREATE INDEX agent_patch_reviews_workspace_patch_idx
ON agent_patch_reviews(workspace_id, patch_id);
```

Patch apply should:

- Read the draft patch by `workspace_id`.
- Validate selected operations.
- Check current task state before applying:
  - `move_task.from_date` and `from_day_segment` must still match the task.
  - `change_priority.from_priority` must still match the task.
  - applying to a segment with protected over-capacity should skip and report conflict unless the operation only moves backlog/non-scheduled work out.
- Apply accepted operations transactionally.
- Insert `agent_patch_reviews`.
- Insert `plan_versions` and `change_logs`.
- Mark patch `applied` when at least one operation applied.
- Mark patch `rejected` when no operations are accepted and the user explicitly rejects all operations.

### 6.5 Review UI Evidence

Each operation card should display:

- operation type
- task title when resolvable
- before state
- after state
- reason
- capacity impact
- protected block evidence
- provenance: patch id, operation index, created by, created at
- conflict status after apply attempt

The UI must avoid implying that rejected operations were applied. Applied, skipped, rejected, and pending states should be visually distinct.

### 6.6 MCP Daily Loop Additions

Add read tools in v0.3:

```text
get_constraints(date_from?, date_to?)
get_capacity(date_from?, date_to?)
```

Keep write scope narrow:

```text
propose_patch
create_checkin
update_task_status
create_inbox_item
```

Do not let MCP directly edit constraints in v0.3. Constraints are user-owned, not agent-owned.

`propose_patch` must validate against the same protected/capacity model used by Review. If a patch is invalid, the tool should return a clear error and not insert a draft.

### 6.7 Scheduled Automation

PawPlan still does not own scheduling. v0.3 should ship runnable prompts and a smoke script/checklist for external Codex/Cowork scheduled automation.

Morning prompt:

```text
Use PawPlan MCP. Read today, week, constraints, capacity, and recent check-ins.
Summarize what should be protected today, what is over capacity, and what is the first task to execute.
Do not modify PawPlan unless I explicitly ask.
```

Evening prompt:

```text
Use PawPlan MCP. Read today, week, constraints, capacity, tasks, and today's check-in.
If tomorrow or this week needs changes, call propose_patch only.
Do not directly update tasks except for explicit task status changes I already confirmed.
Explain every Review operation with before, after, reason, and capacity impact.
```

## 7. v0.4 Architecture

### 7.1 Conversation And Decision Sediment

Use existing `conversations` and `decisions` tables.

Add MCP tools:

```text
save_conversation_summary
record_decision
get_decisions
get_conversations
```

Tool contracts:

```yaml
save_conversation_summary:
  input:
    topic: string
    context_type: weekly_review | decision | learning_qa | check_in_followup | methodology | adhoc
    summary: string
    decisions:
      - topic: string
        chosen: string
        rationale: string
    open_questions:
      - string
    created_by: codex | claude | user
  output:
    conversationId: string
```

```yaml
record_decision:
  input:
    topic: string
    context: string
    options_considered:
      - string
    chosen: string
    rationale: string
    tradeoffs_accepted: string
    status: active | superseded | abandoned
  output:
    decisionId: string
```

Rules:

- Do not store full chat transcripts by default.
- Store structured summaries only.
- All writes create `change_logs.source = mcp`.
- Decision status changes should never delete prior decisions.

### 7.2 Template Export And Import

Template export should intentionally omit:

- MCP tokens and token hashes.
- Check-ins and check-in task history.
- Task statuses and personal progress history.
- Agent patch history.
- Conversation summaries and decisions unless explicitly exported in a later version.

Include:

- Project/course/track/tag structure.
- Routines.
- Segment energy settings.
- Reusable time block templates when safe.
- Plan structure and task templates with status reset to `todo`.

API:

```yaml
GET /api/templates/export:
  response:
    schemaVersion: pawplan.template.v0.4
    exportedAt: string
    workspace:
      name: string
    tracks: TrackTemplate[]
    courses: CourseTemplate[]
    routines: RoutineTemplate[]
    segmentEnergySettings: SegmentEnergySettingTemplate[]
    timeBlocks: TimeBlockTemplate[]
    tasks: TaskTemplate[]
```

```yaml
POST /api/templates/import:
  body:
    template: PawPlanTemplate
    mode: new_plan
  response:
    planId: string
    tasksCreated: number
    routinesCreated: number
    timeBlocksCreated: number
```

### 7.3 Workspace Data Management

Add Settings controls for:

- Export workspace template.
- Delete workspace data.

Deletion must require a typed confirmation:

```text
DELETE <workspace name>
```

`DELETE /api/workspace` should:

- Require session auth.
- Verify confirmation text.
- Delete workspace row and cascade scoped data.
- Clear session cookie.
- Return `{ deleted: true }`.

### 7.4 Hosted Safety Limits

v0.4 should add light MCP abuse protection without building billing:

- Per-token request counting.
- Per-workspace daily write limit.
- Clear `429` or MCP error message when exceeded.

Suggested table:

```sql
CREATE TABLE mcp_usage_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  token_id uuid REFERENCES mcp_tokens(id) ON DELETE SET NULL,
  tool_name varchar(80) NOT NULL,
  permission mcp_permission NOT NULL,
  success boolean NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
```

Keep limits conservative and configurable in code constants first. Do not create billing or plan tiers in v0.4.

## 8. Error Handling

Shared rules:

- Missing session: redirect for pages, 401 JSON for API.
- Invalid payload: 400 with a specific error.
- Missing active plan: 400 and no write.
- Missing row or wrong workspace: 404.
- Protected block violation: 400 and no write.
- Patch conflict: skip operation and record conflict; do not silently apply.
- Database failure: 500 with generic public error and internal console error.
- MCP read-only token calling write tool: keep existing `MCP token does not allow write tools`.

## 9. Testing Plan

v0.3 minimum:

- Unit: constraint payload validation.
- Unit: constraint service workspace scoping.
- Unit: timetable duplicate behavior or dedupe decision.
- Unit: capacity model with tasks + course + unavailable + routine.
- Unit: `propose_patch` rejects protected/capacity-invalid operations.
- Unit: patch apply records `agent_patch_reviews`.
- Unit: conflict detection skips stale operations.
- E2E: More -> 日历与课程 -> create/edit/delete constraint.
- E2E: Review shows operation evidence and partial apply state.
- E2E: MCP Settings token still works.
- Full: `npm run test`, `npm run build`, `npm run test:e2e`.

v0.4 minimum:

- Unit: conversation/decision MCP schemas.
- Unit: conversation/decision writes produce change logs.
- Unit: template export omits secrets and personal progress.
- Unit: template import creates isolated workspace-scoped data.
- Unit: workspace delete clears scoped data.
- Unit: MCP usage events record read/write success/failure.
- E2E: export template from Settings.
- E2E: workspace delete confirmation.
- Full: `npm run test`, `npm run build`, `npm run test:e2e`.

## 10. Migration Strategy

v0.3 likely migration:

- Add `agent_patch_reviews`.
- Possibly add indexes to `time_blocks(workspace_id, starts_at, ends_at)` and `courses(workspace_id, name)`.
- Avoid destructive column changes.

v0.4 likely migration:

- Add `mcp_usage_events`.
- Add indexes for `conversations(workspace_id, created_at)` and `decisions(workspace_id, status, created_at)` if not already sufficient.
- No secrets in template export.

Production migration rule:

- Generate migration with `npm run db:generate`.
- Review SQL before applying.
- Use Vercel production env without printing `DATABASE_URL`.
- Run production migration only after local test/build/e2e pass.

## 11. Rollback Plan

v0.3:

- UI routes can be hidden by changing More card active state if needed.
- `agent_patch_reviews` is additive; rollback can leave table unused.
- Constraint edits write existing `time_blocks`; if UI has a bug, disable `/constraints` without deleting data.

v0.4:

- Conversation/decision MCP tools are additive and can be permission-filtered off.
- Template export/import can be disabled from Settings while preserving code.
- Usage events are audit-only and can remain unused.

## 12. v1.0 Gate

Only consider `v1.0` after v0.3 and v0.4 prove:

- A real user can complete setup without developer intervention.
- Daily agent loop runs for at least one week without direct DB edits.
- Review catches conflicts and protected-block violations.
- Export/delete safety paths are verified.
- README is current and enough to operate hosted MCP.
