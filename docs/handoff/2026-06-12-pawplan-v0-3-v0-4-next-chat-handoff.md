# PawPlan v0.3 + v0.4 Next Chat Handoff

Date: 2026-06-12

## Current Production State

Production URL:

```text
https://pawplan.charlottezmm.info
```

Current branch:

```text
codex/mcp-planning-v0-1
```

v0.2 has been implemented, verified, deployed, committed, and pushed.

Latest v0.2 commit:

```text
73d7a6f feat: complete PawPlan v0.2 MCP workflow
```

v0.2 shipped:

- Inbox primary navigation.
- Settings MCP token create/revoke.
- Hosted MCP endpoint at `/api/mcp`.
- `import_plan_bundle`.
- Real imported tasks in Today / Plan day / week / month.
- Month view no longer uses fake progress.
- AI-native import storage with payload/provenance/derived task ids/change logs.
- Review-first future rescheduling.
- Mobile floating cat moved top-right.
- More page `日常事项` now links to Settings; `日历与课程` remains unopened.

## Version Direction

Next stage is `v0.3`, not `v1.0`.

`v0.3` target:

```text
Daily Agent Loop + Constraints
```

`v0.4` target:

```text
Durability + Sediment + Export + Hosted Safety
```

Do not call this v1.0 until daily hosted usage works without developer help.

## Required Reading For Next Chat

Read these first:

1. `docs/superpowers/specs/2026-06-12-pawplan-v0-3-v0-4-technical-design.md`
2. `docs/superpowers/plans/2026-06-12-pawplan-v0-3-v0-4-implementation-plan.md`
3. `docs/handoff/2026-06-12-pawplan-v0-2-completion-handoff.md`
4. `docs/superpowers/plans/2026-06-12-pawplan-v0-2-agent-loop.md`
5. `docs/automation/pawplan-scheduled-automation.md`
6. `docs/design/claude-design-ui-integration-v0.1.md`
7. `README.md`

Then run:

```bash
git status --short --branch
npm run test
npm run build
npm run test:e2e
```

## Required Agent Workflow

Use subagents. This is not a one-agent linear task.

Recommended split for v0.3:

- Subagent A: constraints service/API/UI.
- Subagent B: shared capacity model and Plan/Today integration.
- Subagent C: Review audit/conflict safety.
- Subagent D: MCP daily loop tools and automation docs.
- Main agent: review diffs, run verification, handle migrations/deploy.

Recommended split for v0.4:

- Subagent A: conversation/decision MCP tools.
- Subagent B: template export/import.
- Subagent C: workspace delete.
- Subagent D: MCP usage audit/limits.
- Main agent: review diffs, run verification, handle migrations/deploy.

## v0.3 Scope

### 1. Open Calendar And Course Constraints

Implement:

- `/constraints` page.
- `GET /api/constraints`.
- `POST /api/constraints` with `action: "upsert_time_block"`.
- `PATCH /api/constraints` with `action: "delete_time_block"`.
- More page `日历与课程` active link.

Use existing:

- `courses`
- `time_blocks`

Editable kinds:

```text
course
meeting
unavailable
```

Do not let users edit `routine` or `recovery` time blocks from this page.

### 2. Shared Capacity Model

Create one capacity model used by:

- Today
- Week
- Plan day/week/month
- Review validation
- MCP context

Capacity must account for:

- tasks
- course blocks
- meeting blocks
- unavailable blocks
- routines
- recovery
- day capacity

### 3. Review Trust Upgrade

Review must show:

- patch id
- operation index
- before
- after
- reason
- capacity impact
- protected block evidence
- conflict/skipped state

Patch apply must persist:

- accepted operation indexes
- rejected operation indexes
- skipped operations
- conflicts

Suggested table:

```text
agent_patch_reviews
```

### 4. MCP Daily Loop Context

Add read tools:

```text
get_constraints
get_capacity
```

Keep write behavior:

- `propose_patch` creates draft only.
- MCP does not auto-apply.
- MCP does not directly edit constraints in v0.3.

### 5. Automation Docs And Smoke

Update:

- `README.md`
- `docs/automation/pawplan-scheduled-automation.md`

Include morning and evening prompts from the v0.3/v0.4 technical design.

## v0.3 Non-Goals

Do not implement:

- OAuth
- billing
- teams
- public sharing
- template gallery
- app-owned cron
- PWA push notification
- embedded LLM chat
- direct MCP constraint editing
- direct MCP patch apply

## v0.3 Verification

After each stage, run targeted tests from the implementation plan.

Before deploy, run:

```bash
npm run test
npm run build
npm run test:e2e
```

If schema changes:

1. Run `npm run db:generate`.
2. Review generated SQL.
3. Run production migration with Vercel production env.
4. Do not print `DATABASE_URL`.

Deploy:

```bash
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399
```

## v0.4 Scope

### 1. Conversation And Decision Sediment

Use existing tables:

- `conversations`
- `decisions`

Add MCP tools:

```text
save_conversation_summary
record_decision
get_decisions
get_conversations
```

Rules:

- Do not store full raw conversations by default.
- Store structured summaries.
- All writes scoped by workspace.
- All writes create `change_logs.source = mcp`.

### 2. Template Export And Import

Add safe template export/import.

Export must omit:

- MCP tokens and token hashes
- check-ins
- task completion status
- agent patches
- personal progress history

Export may include:

- tracks
- courses
- routines
- segment energy settings
- time block templates
- task templates reset to `todo`

### 3. Workspace Delete

Add Settings danger zone:

- typed confirmation
- `DELETE /api/workspace`
- delete workspace row and cascade scoped data
- clear session cookie

### 4. MCP Usage Audit And Hosted Limits

Add light hosted protection:

- usage event rows
- per-workspace daily write cap
- clear error when cap exceeded

Do not build billing or plans.

## v0.4 Verification

Run:

```bash
npm run test
npm run build
npm run test:e2e
```

Deploy only after tests pass and migrations are applied.

## Prompt For Next Chat

Use this as the first message:

```text
你在 /Users/charlotte/daily-progress 继续 PawPlan v0.3，然后 v0.4。

先阅读：
1. docs/superpowers/specs/2026-06-12-pawplan-v0-3-v0-4-technical-design.md
2. docs/superpowers/plans/2026-06-12-pawplan-v0-3-v0-4-implementation-plan.md
3. docs/handoff/2026-06-12-pawplan-v0-3-v0-4-next-chat-handoff.md
4. docs/handoff/2026-06-12-pawplan-v0-2-completion-handoff.md
5. docs/automation/pawplan-scheduled-automation.md

然后先跑：
git status --short --branch
npm run test
npm run build
npm run test:e2e

必须调用 subagents 分工实现。不要一个 agent 线性硬写。

目标：
v0.3 = Daily Agent Loop + Constraints
- 打开 日历与课程 / constraints 主流程。
- 复用 courses/time_blocks，不新造 calendar 大系统。
- Today / Plan / Review / MCP 共用一个 capacity model。
- Review 显示 before/after/reason/impact/provenance/conflict，并持久化 per-operation review audit。
- MCP 增加 get_constraints 和 get_capacity。
- scheduled automation 文档和 smoke prompt 更新。
- 不允许 MCP 直接编辑 constraints，不允许自动 apply patch。

v0.4 = Durability + Sediment + Export + Hosted Safety
- MCP 增加 save_conversation_summary / record_decision / get_decisions / get_conversations。
- template export/import，不能包含 secrets、token、check-in、个人完成状态、agent patch 历史。
- Settings 增加 workspace delete。
- hosted MCP 增加 usage audit 和轻量 write limit。

每个阶段后跑对应测试。
最终跑：
npm run test
npm run build
npm run test:e2e

如果 schema 改了，生成并审查 migration，然后用 Vercel production env 跑 production migration，不要打印 DATABASE_URL。

最后部署：
npm_config_cache=/tmp/pawplan-npm-cache-deploy npx vercel --prod --scope charlottes-projects-f7255399

完成后告诉我：
- 生产 URL
- v0.3/v0.4 完成了哪些闭环
- MCP tools 最终列表
- 数据库 migration 状态
- 测试结果
- git status
```

## Completion Definition

The next chat is complete only when:

- v0.3 and v0.4 docs are followed or explicitly updated.
- All new schema has reviewed migrations.
- Production migration has run if schema changed.
- Production deploy is READY.
- `npm run test`, `npm run build`, and `npm run test:e2e` pass.
- Git is committed and pushed.
