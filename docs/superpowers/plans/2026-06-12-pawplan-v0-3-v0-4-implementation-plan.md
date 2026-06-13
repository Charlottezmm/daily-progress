# PawPlan v0.3 + v0.4 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build v0.3 as a reliable daily agent loop with real constraints and trustworthy Review, then build v0.4 as durability hardening with conversation/decision sediment, template export/import, workspace deletion, and MCP hosted limits.

**Architecture:** v0.3 reuses existing `courses`, `time_blocks`, `routines`, `day_capacities`, `agent_patches`, and MCP infrastructure. It adds a constraints service/UI, a shared capacity model, richer Review audit, and read-only MCP context tools. v0.4 reuses existing `conversations` and `decisions`, adds template export/import and hosted safety audit events, and keeps all AI writes structured and scoped by workspace.

**Tech Stack:** Next.js App Router, React, TypeScript, Drizzle ORM, Postgres, Vitest, Playwright, MCP SDK, Vercel.

---

## Required Reading

- `docs/superpowers/specs/2026-06-12-pawplan-v0-3-v0-4-technical-design.md`
- `docs/handoff/2026-06-12-pawplan-v0-2-completion-handoff.md`
- `docs/superpowers/plans/2026-06-12-pawplan-v0-2-agent-loop.md`
- `docs/automation/pawplan-scheduled-automation.md`
- `docs/design/claude-design-ui-integration-v0.1.md`

Initial commands:

```bash
git status --short --branch
npm run test
npm run build
npm run test:e2e
```

## Implementation Rules

- Keep v0.3 and v0.4 separate commits or PRs.
- Use subagents for independent workstreams: constraints, capacity, Review, MCP/docs, v0.4 durability.
- Write failing tests before implementation.
- Run the listed test command after each task.
- Do not add OAuth, billing, teams, public sharing, embedded LLM chat, or app-owned cron.
- Do not let MCP directly edit constraints in v0.3.
- Do not auto-apply agent suggestions. Review remains the only patch apply surface.

## File Map

v0.3 likely files:

- Create `src/lib/constraints/schema.ts`
- Create `src/lib/constraints/service.ts`
- Create `src/app/api/constraints/route.ts`
- Create `src/app/(app)/constraints/page.tsx`
- Create `src/components/constraints-view.tsx`
- Create `src/lib/planning/capacity-model.ts`
- Modify `src/lib/planning/view-data.ts`
- Modify `src/lib/patches/patch-schema.ts`
- Modify `src/lib/planning/patch-apply.ts`
- Modify `src/lib/planning/service.ts`
- Modify `src/lib/mcp/tools.ts`
- Modify `src/components/reschedule-preview.tsx`
- Modify `src/components/more-view.tsx`
- Add migration for `agent_patch_reviews` and indexes
- Add unit/e2e tests under `src/tests/unit` and `src/tests/e2e`

v0.4 likely files:

- Create `src/lib/mcp/conversation-tools.ts` or extend `src/lib/mcp/tools.ts` if still small
- Create `src/lib/templates/export.ts`
- Create `src/lib/templates/import.ts`
- Create `src/app/api/templates/export/route.ts`
- Create `src/app/api/templates/import/route.ts`
- Create `src/app/api/workspace/route.ts`
- Create `src/lib/mcp/usage.ts`
- Modify `src/components/settings-view.tsx`
- Modify `src/lib/db/schema.ts`
- Add migration for `mcp_usage_events` and optional indexes
- Add tests under `src/tests/unit` and `src/tests/e2e`

## v0.3 Task 1: Constraint Service And API

**Files:**

- Create: `src/lib/constraints/schema.ts`
- Create: `src/lib/constraints/service.ts`
- Create: `src/app/api/constraints/route.ts`
- Test: `src/tests/unit/constraints-service.test.ts`
- Test: `src/tests/unit/constraints-route.test.ts`

- [ ] **Step 1: Write failing service tests**

Cover:

- `upsert_time_block` creates a course when `kind = "course"` and `courseName` is new.
- `upsert_time_block` reuses an existing course scoped to the same workspace.
- `delete_time_block` refuses to delete another workspace's block.
- Invalid `startsAt >= endsAt` is rejected.
- Writes insert `change_logs.source = "manual"`.

Run:

```bash
npm run test -- src/tests/unit/constraints-service.test.ts
```

Expected: fail because files/functions do not exist.

- [ ] **Step 2: Implement schema and service**

Use the API contract from the technical design. Keep allowed editable kinds to:

```ts
const editableConstraintKinds = ["course", "meeting", "unavailable"] as const;
```

Do not include routines or recovery in editable constraint writes.

- [ ] **Step 3: Add route tests and route**

Route behavior:

- `GET /api/constraints` requires session and returns courses/timeBlocks.
- `POST /api/constraints` validates `action: "upsert_time_block"`.
- `PATCH /api/constraints` validates `action: "delete_time_block"`.
- Errors return 400/404/500 with stable JSON.

Run:

```bash
npm run test -- src/tests/unit/constraints-service.test.ts src/tests/unit/constraints-route.test.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/constraints src/app/api/constraints src/tests/unit/constraints-service.test.ts src/tests/unit/constraints-route.test.ts
git commit -m "feat: add constraints service api"
```

## v0.3 Task 2: Constraints UI

**Files:**

- Create: `src/app/(app)/constraints/page.tsx`
- Create: `src/components/constraints-view.tsx`
- Modify: `src/components/more-view.tsx`
- Test: `src/tests/e2e/constraints.spec.ts`

- [ ] **Step 1: Write failing e2e test**

Flow:

- Log in with test session.
- Open `/more`.
- Click `日历与课程`.
- Create a `course` block.
- Verify it appears in the list.
- Edit the title or time.
- Delete it.

Run:

```bash
npm run test:e2e -- src/tests/e2e/constraints.spec.ts
```

Expected: fail because route/card does not exist.

- [ ] **Step 2: Implement page and component**

UI requirements:

- Dense settings-style panel, not a marketing page.
- Kind selector: `课程`, `会议`, `不可用时间`.
- Inputs: title, date, start time, end time, optional course name, optional notes/recurrence string.
- List existing blocks sorted by start time.
- Delete requires explicit button click, no destructive bulk action.

- [ ] **Step 3: Update More**

Set `日历与课程` to active and link to `/constraints`.

- [ ] **Step 4: Run test**

```bash
npm run test:e2e -- src/tests/e2e/constraints.spec.ts
```

- [ ] **Step 5: Commit**

```bash
git add 'src/app/(app)/constraints' src/components/constraints-view.tsx src/components/more-view.tsx src/tests/e2e/constraints.spec.ts
git commit -m "feat: open calendar and course constraints"
```

## v0.3 Task 3: Shared Capacity Model

**Files:**

- Create: `src/lib/planning/capacity-model.ts`
- Modify: `src/lib/planning/view-data.ts`
- Modify: `src/lib/planning/warnings.ts` if needed
- Test: `src/tests/unit/capacity-model.test.ts`
- Test: `src/tests/unit/planning-view-capacity.test.ts`

- [ ] **Step 1: Write failing capacity tests**

Cover:

- course block consumes protected minutes.
- unavailable block consumes protected minutes.
- routine consumes default segment minutes.
- backlog tasks do not consume capacity.
- over-capacity warning uses tasks plus protected blocks.

Run:

```bash
npm run test -- src/tests/unit/capacity-model.test.ts
```

- [ ] **Step 2: Implement `capacity-model.ts`**

Use the output shape in the technical design. Keep date handling aligned with the existing Shanghai-day helpers in `view-data.ts`.

- [ ] **Step 3: Integrate Today and Week**

Today should show protected blocks and over-capacity warnings from the same model. Week should use the same total used/capacity calculation.

- [ ] **Step 4: Run targeted tests**

```bash
npm run test -- src/tests/unit/capacity-model.test.ts src/tests/unit/planning-view-capacity.test.ts src/tests/unit/capacity.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/planning/capacity-model.ts src/lib/planning/view-data.ts src/lib/planning/warnings.ts src/tests/unit/capacity-model.test.ts src/tests/unit/planning-view-capacity.test.ts src/tests/unit/capacity.test.ts
git commit -m "feat: unify planning capacity model"
```

## v0.3 Task 4: Review Audit And Conflict Safety

**Files:**

- Modify: `src/lib/db/schema.ts`
- Add migration
- Modify: `src/lib/planning/patch-apply.ts`
- Modify: `src/lib/planning/service.ts`
- Modify: `src/lib/patches/patch-schema.ts`
- Test: `src/tests/unit/patch-apply.test.ts`
- Test: `src/tests/unit/patch-schema.test.ts`

- [ ] **Step 1: Write failing tests**

Cover:

- accepted/rejected/skipped indexes are persisted to `agent_patch_reviews`.
- stale `move_task.from_date` is skipped as conflict.
- stale `change_priority.from_priority` is skipped as conflict.
- protected block mutation is rejected before insert.
- patch apply still creates `plan_versions` and `change_logs` when at least one operation applies.

Run:

```bash
npm run test -- src/tests/unit/patch-apply.test.ts src/tests/unit/patch-schema.test.ts
```

- [ ] **Step 2: Add schema and migration**

Add `agent_patch_reviews` as described in the technical design.

Run:

```bash
npm run db:generate
```

Review generated SQL before continuing.

- [ ] **Step 3: Implement conflict checks and review audit**

Do not silently apply stale operations. Return skipped/conflict details to the Review UI.

- [ ] **Step 4: Run targeted tests**

```bash
npm run test -- src/tests/unit/patch-apply.test.ts src/tests/unit/patch-schema.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts drizzle src/lib/planning/patch-apply.ts src/lib/planning/service.ts src/lib/patches/patch-schema.ts src/tests/unit/patch-apply.test.ts src/tests/unit/patch-schema.test.ts
git commit -m "feat: audit review patch decisions"
```

## v0.3 Task 5: Review UI Evidence

**Files:**

- Modify: `src/lib/planning/view-data.ts`
- Modify: `src/components/reschedule-preview.tsx`
- Test: `src/tests/e2e/review-trust.spec.ts`
- Test: `src/tests/unit/review-view-data.test.ts`

- [ ] **Step 1: Write failing tests**

Review cards must expose:

- patch id
- operation index
- before/after
- reason
- capacity impact
- protected/conflict status

Run:

```bash
npm run test -- src/tests/unit/review-view-data.test.ts
npm run test:e2e -- src/tests/e2e/review-trust.spec.ts
```

- [ ] **Step 2: Implement view data and UI**

Keep Review operational, not chat-like. Preserve mobile readability.

- [ ] **Step 3: Run targeted tests**

```bash
npm run test -- src/tests/unit/review-view-data.test.ts
npm run test:e2e -- src/tests/e2e/review-trust.spec.ts
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/planning/view-data.ts src/components/reschedule-preview.tsx src/tests/unit/review-view-data.test.ts src/tests/e2e/review-trust.spec.ts
git commit -m "feat: show review trust evidence"
```

## v0.3 Task 6: MCP Daily Loop Context

**Files:**

- Modify: `src/lib/mcp/tools.ts`
- Modify: `src/lib/mcp/server-builder.ts` if tool descriptions need changes
- Modify: `docs/automation/pawplan-scheduled-automation.md`
- Modify: `README.md`
- Test: `src/tests/unit/mcp-tools.test.ts`

- [ ] **Step 1: Write failing MCP tests**

Cover:

- `get_constraints` returns scoped protected blocks.
- `get_capacity` returns day/segment capacity.
- read-only token can call both read tools.
- `propose_patch` still never applies changes directly.

Run:

```bash
npm run test -- src/tests/unit/mcp-tools.test.ts
```

- [ ] **Step 2: Implement tools**

Add descriptions and schemas for:

```text
get_constraints
get_capacity
```

- [ ] **Step 3: Update docs**

README must mention hosted MCP, `import_plan_bundle`, `get_constraints`, `get_capacity`, and Review-only automation.

- [ ] **Step 4: Run targeted tests**

```bash
npm run test -- src/tests/unit/mcp-tools.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/lib/mcp/tools.ts src/lib/mcp/server-builder.ts docs/automation/pawplan-scheduled-automation.md README.md src/tests/unit/mcp-tools.test.ts
git commit -m "feat: expose planning constraints to mcp"
```

## v0.3 Final Verification And Deploy

- [ ] Run full verification:

```bash
npm run test
npm run build
npm run test:e2e
```

- [ ] If schema changed, run production migration using Vercel production env without printing `DATABASE_URL`.

- [ ] Deploy:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399
```

- [ ] Commit docs/handoff:

```bash
git add docs
git commit -m "docs: add PawPlan v0.3 completion handoff"
git push
```

## v0.4 Task 1: Conversation And Decision MCP Tools

**Files:**

- Modify or create: `src/lib/mcp/conversation-tools.ts`
- Modify: `src/lib/mcp/tools.ts`
- Test: `src/tests/unit/mcp-conversation-tools.test.ts`

- [ ] Write failing tests for `save_conversation_summary`, `record_decision`, `get_decisions`, and `get_conversations`.
- [ ] Implement structured-summary-only writes using existing `conversations` and `decisions`.
- [ ] Ensure every write creates `change_logs.source = "mcp"`.
- [ ] Run:

```bash
npm run test -- src/tests/unit/mcp-conversation-tools.test.ts src/tests/unit/mcp-tools.test.ts
```

- [ ] Commit:

```bash
git add src/lib/mcp src/tests/unit/mcp-conversation-tools.test.ts
git commit -m "feat: add mcp decision sediment tools"
```

## v0.4 Task 2: Template Export And Import

**Files:**

- Create: `src/lib/templates/export.ts`
- Create: `src/lib/templates/import.ts`
- Create: `src/app/api/templates/export/route.ts`
- Create: `src/app/api/templates/import/route.ts`
- Modify: `src/components/settings-view.tsx`
- Test: `src/tests/unit/template-export.test.ts`
- Test: `src/tests/unit/template-import.test.ts`
- Test: `src/tests/e2e/template-export.spec.ts`

- [ ] Write failing tests proving export omits MCP tokens, check-ins, task statuses, agent patches, and personal progress history.
- [ ] Implement `pawplan.template.v0.4` export.
- [ ] Implement `mode: "new_plan"` import.
- [ ] Add Settings UI controls.
- [ ] Run targeted tests:

```bash
npm run test -- src/tests/unit/template-export.test.ts src/tests/unit/template-import.test.ts
npm run test:e2e -- src/tests/e2e/template-export.spec.ts
```

- [ ] Commit:

```bash
git add src/lib/templates src/app/api/templates src/components/settings-view.tsx src/tests/unit/template-export.test.ts src/tests/unit/template-import.test.ts src/tests/e2e/template-export.spec.ts
git commit -m "feat: add safe template export import"
```

## v0.4 Task 3: Workspace Delete

**Files:**

- Create: `src/app/api/workspace/route.ts`
- Modify: `src/components/settings-view.tsx`
- Test: `src/tests/unit/workspace-route.test.ts`
- Test: `src/tests/e2e/workspace-delete.spec.ts`

- [ ] Write failing tests for typed confirmation and session clearing.
- [ ] Implement `DELETE /api/workspace`.
- [ ] Add Settings danger zone.
- [ ] Run targeted tests:

```bash
npm run test -- src/tests/unit/workspace-route.test.ts
npm run test:e2e -- src/tests/e2e/workspace-delete.spec.ts
```

- [ ] Commit:

```bash
git add src/app/api/workspace src/components/settings-view.tsx src/tests/unit/workspace-route.test.ts src/tests/e2e/workspace-delete.spec.ts
git commit -m "feat: add workspace deletion"
```

## v0.4 Task 4: MCP Usage Audit And Limits

**Files:**

- Modify: `src/lib/db/schema.ts`
- Create: `src/lib/mcp/usage.ts`
- Modify: `src/app/api/mcp/route.ts`
- Modify: `src/lib/mcp/tools.ts`
- Test: `src/tests/unit/mcp-usage.test.ts`
- Test: `src/tests/unit/mcp-http-route.test.ts`

- [ ] Write failing tests for successful usage event, failed usage event, and daily write limit.
- [ ] Add `mcp_usage_events` schema and migration.
- [ ] Record usage around hosted MCP requests/tool calls.
- [ ] Return a clear error when the write limit is exceeded.
- [ ] Run:

```bash
npm run test -- src/tests/unit/mcp-usage.test.ts src/tests/unit/mcp-http-route.test.ts
```

- [ ] Commit:

```bash
git add src/lib/db/schema.ts drizzle src/lib/mcp/usage.ts src/app/api/mcp/route.ts src/lib/mcp/tools.ts src/tests/unit/mcp-usage.test.ts src/tests/unit/mcp-http-route.test.ts
git commit -m "feat: audit hosted mcp usage"
```

## v0.4 Final Verification And Deploy

- [ ] Run:

```bash
npm run test
npm run build
npm run test:e2e
```

- [ ] Generate/review/apply production migration if schema changed.
- [ ] Deploy:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399
```

- [ ] Write v0.4 completion handoff and push:

```bash
git add docs
git commit -m "docs: add PawPlan v0.4 completion handoff"
git push
```

## v1.0 Gate Checklist

Do not rename the project to v1.0 until all are true:

- A fresh workspace can set up hosted MCP using only README and Settings.
- A real one-week daily loop completes without direct database edits.
- Constraints influence capacity in Today, Week, Month, MCP, and Review.
- Review records accepted, rejected, skipped, and conflicted operations.
- Template export/import omits secrets and progress history.
- Workspace deletion is verified.
- Production migration/deploy process is documented and repeatable.
