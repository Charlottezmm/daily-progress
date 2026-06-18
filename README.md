# PawPlan

PawPlan is an invite-gated, schedule-first planning app for turning external agent work into safe, reviewable plans.

It is designed for a specific workflow: Claude, Codex, or another external agent can read planning context and draft changes, while PawPlan owns validation, persistence, Review, audit trails, and readback. A task move is not real until the user reviews and applies it in the app.

Production: [https://pawplan.charlottezmm.info](https://pawplan.charlottezmm.info)

## Status

PawPlan v1 formal is a controlled beta. It is usable for invited workspaces, but it is not public GA.

The old static May dashboard prototype is preserved at `docs/legacy/index-static-dashboard.html`.

## What PawPlan Does

PawPlan helps a user plan from a real schedule instead of a blank task list.

- Capture tasks, chores, decisions, check-ins, and planning context.
- Keep protected schedule blocks, routines, courses, and capacity visible to agents.
- Let external agents propose daily or weekly rebalances without directly changing the plan.
- Show agent-generated changes as Review drafts before anything is applied.
- Record agent runs with status, idempotency, structured outputs, failures, and readback.
- Keep life-admin items in Inbox until they are promoted into scheduled work.

## Core Workflow

1. The user records tasks, fixed schedule, routines, and constraints in PawPlan.
2. An external agent reads context through MCP.
3. The agent proposes a change with a narrow tool such as `propose_daily_rebalance` or `propose_week_rebalance`.
4. PawPlan creates an idempotent Review draft and records the agent run.
5. The user opens `/review`, checks the draft, and applies or rejects it.
6. PawPlan persists the final state and exposes readback so agent success is verifiable.

This is intentionally preview-first. Review, draft, suggestion, and brief are not treated as applied work.

## Included

- Web + PWA planning surface.
- Next.js app router frontend and API routes.
- Postgres data layer with Drizzle migrations.
- Invite-code workspace creation.
- Workspace password login for existing workspaces.
- Hosted MCP endpoint for Codex bearer-token clients.
- Claude Custom Connector OAuth adapter.
- Today, week, month, inbox, fixed schedule, review, import, and settings surfaces.
- Inbox capture for life-admin items and later promotion into planned work.
- Agent run status, idempotency, failure visibility, and draft readback.
- Review-confirmed task changes, daily rebalance drafts, weekly rebalance drafts, and timetable imports.
- Settings observability for hosted MCP tokens, routines, and workspace-level controls.

## Not Included

PawPlan v1 formal deliberately does not include:

- App-owned LLM calls or embedded AI chat.
- App-owned scheduler, server cron, browser timer, or PWA background rescheduler.
- Automatic patch apply.
- Billing.
- Team collaboration.
- Public open signup.
- Google/Apple/Outlook Calendar sync.
- Full drag-and-drop calendar editing.

External agents can schedule themselves outside PawPlan. PawPlan remains the product-owned data, validation, Review, and audit layer.

## Architecture

PawPlan is a Next.js + Postgres application with a narrow MCP boundary.

- `src/app`: app router pages and API routes.
- `src/components`: UI surfaces for planning, inbox, review, settings, and imports.
- `src/lib/planning`: planning services, view data builders, capacity, and rebalance logic.
- `src/lib/agent-runs`: agent run creation, idempotency, status transitions, and readback.
- `src/lib/mcp`: MCP tool schemas, dispatch, hosted route helpers, and server builder.
- `src/lib/settings`: workspace settings and observability helpers.
- `drizzle`: schema migrations and snapshots.
- `docs`: automation guides, beta smoke checklists, MCP connector instructions, and implementation specs.

The main reliability rule is simple: tool invocation success is not business success. PawPlan checks structured return values and reads back persisted state.

## MCP Server

PawPlan exposes both a local stdio MCP server and a hosted MCP endpoint.

Local stdio server:

```bash
npm run mcp
```

Required local MCP environment:

- `DATABASE_URL`
- `PAWPLAN_WORKSPACE_ID`

Hosted MCP endpoint:

```text
https://pawplan.charlottezmm.info/api/mcp
```

The MCP surface is intentionally narrow. Agents read context, write audited low-risk records, or create Review drafts. They do not directly edit protected constraints, apply drafts, or own scheduled automation.

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

Write and draft tools:

- `create_inbox_item`
- `create_checkin`
- `update_task_status`
- `update_task_schedule`
- `update_task_notes`
- `save_conversation_summary`
- `record_decision`
- `propose_patch`
- `propose_daily_rebalance`
- `propose_week_rebalance`
- `propose_timetable_import`
- `import_plan_bundle`

Daily and weekly automation is configured outside PawPlan in Codex / Cowork / Claude. The external agent reads through MCP, proposes changes with Review-safe tools, and waits for the user to confirm in `/review`.

See `docs/automation/pawplan-scheduled-automation.md`.

## Local Development

Install dependencies:

```bash
npm install
```

Copy `.env.example` to `.env.local` and set:

- `DATABASE_URL`
- `APP_SECRET`
- `NEXT_PUBLIC_APP_NAME`

`NEXT_PUBLIC_APP_NAME` should be `PawPlan` for the current product.

Run database migrations:

```bash
npm run db:migrate
```

Start the app:

```bash
npm run dev
```

Run verification:

```bash
npm run test
npm run build
npm run test:e2e
```

## Production Smoke

Before sharing an invite, run the smoke checklist:

```text
docs/public-beta/2026-06-13-public-beta-smoke-checklist.md
```

Daily Claude/Codex agent loop prompts live at:

```text
docs/public-beta/2026-06-13-daily-agent-loop-prompts.md
```

Connector guides:

- `docs/public-beta/connect-codex.md`
- `docs/public-beta/connect-claude.md`
- `docs/public-beta/review-safety.md`
- `docs/public-beta/agent-runs-troubleshooting.md`

## 中文说明

PawPlan 是一个邀请制、以日程为中心的计划应用，用来把外部 Agent 的建议变成可审查、可回读、可安全落地的计划草稿。

它不是一个通用 AI 聊天应用，也不是自动帮你改日程的黑盒调度器。PawPlan 的核心边界是：Claude、Codex 或其他外部 Agent 可以读取上下文、提出建议、生成 Review 草稿；但数据校验、持久化写入、Review 审核、审计记录和最终 readback 都由 PawPlan 后端负责。任务移动只有在用户进入 `/review` 审核并确认后，才算真正生效。

生产地址：[https://pawplan.charlottezmm.info](https://pawplan.charlottezmm.info)

## 当前阶段

PawPlan v1 formal 是 controlled beta，也就是受控邀请测试版，不是 public GA。

当前目标不是开放注册、商业化或团队协作，而是把个人计划工作流中的关键闭环做稳：读取真实日程、生成可审查草稿、确认后落库、失败可见、结果可回读。

旧版静态 May dashboard 原型保存在 `docs/legacy/index-static-dashboard.html`。

## PawPlan 解决什么问题

很多计划工具只维护任务列表，Agent 也容易只生成漂亮但不可执行的建议。PawPlan 的重点是把任务放回真实时间、固定安排和容量约束里。

它支持：

- 记录任务、家务/生活行政事项、决策、check-in 和计划上下文。
- 维护固定安排、课程、routine、时间块和每日容量。
- 让外部 Agent 读取上下文后提出 daily / weekly rebalance。
- 把 Agent 的修改建议放进 Review，而不是直接改数据库。
- 记录每次 agent run 的状态、幂等键、结构化返回、失败原因和 readback。
- 把生活行政事项先放进 Inbox，等用户确认后再 promotion 成计划任务。

## 核心流程

1. 用户在 PawPlan 里维护任务、固定安排、routine 和约束。
2. 外部 Agent 通过 MCP 读取 PawPlan 上下文。
3. Agent 调用 `propose_daily_rebalance`、`propose_week_rebalance` 等窄工具提出修改。
4. PawPlan 创建幂等的 Review 草稿，并记录 agent run。
5. 用户进入 `/review` 检查草稿，选择应用或拒绝。
6. PawPlan 落库最终状态，并提供 readback，让“成功”可以被验证。

这里的原则是 preview-first：Review、draft、suggestion、brief 都不是已应用结果。只有持久化记录和读回状态才算完成。

## 已包含能力

- Web + PWA 计划界面。
- Next.js app router 前端和 API routes。
- Postgres + Drizzle 数据层和 migrations。
- 邀请码创建 workspace。
- 已有 workspace 的密码登录。
- 给 Codex bearer-token client 使用的 hosted MCP endpoint。
- Claude Custom Connector OAuth adapter。
- Today、Week、Month、Inbox、Fixed Schedule、Review、Import、Settings 等主要界面。
- Inbox life-admin capture 和 promotion。
- Agent run 状态、幂等、失败可见和 draft readback。
- Review-confirmed task changes、daily rebalance drafts、weekly rebalance drafts 和 timetable imports。
- Settings 中的 MCP token、routine、workspace 控制和可观察性。

## 暂不包含

PawPlan v1 formal 明确不做这些事情：

- 应用内置 LLM 调用或 AI chat。
- 应用内置 scheduler、server cron、browser timer 或 PWA background rescheduler。
- 自动应用 Agent 草稿。
- Billing。
- Team collaboration。
- Public open signup。
- Google / Apple / Outlook Calendar sync。
- 复杂拖拽日历编辑。

外部 Agent 可以自己在 Codex / Cowork / Claude 里定时运行；PawPlan 只负责产品后端该负责的数据、校验、Review 和审计边界。

## 技术结构

PawPlan 是一个 Next.js + Postgres 应用，MCP 是它和外部 Agent 之间的受控边界。

- `src/app`：app router 页面和 API routes。
- `src/components`：计划、Inbox、Review、Settings、Import 等 UI。
- `src/lib/planning`：计划服务、view data、capacity 和 rebalance 逻辑。
- `src/lib/agent-runs`：agent run 创建、幂等、状态流转和 readback。
- `src/lib/mcp`：MCP tool schema、dispatch、hosted route helper 和 server builder。
- `src/lib/settings`：workspace settings 和可观察性相关服务。
- `drizzle`：数据库 migration 和 schema snapshot。
- `docs`：自动化说明、beta smoke、MCP connector 文档和实现方案。

可靠性底线是：工具调用成功不等于业务成功。PawPlan 必须看结构化返回值，并读回最终状态。

## 本地开发

安装依赖：

```bash
npm install
```

复制 `.env.example` 到 `.env.local`，并设置：

- `DATABASE_URL`
- `APP_SECRET`
- `NEXT_PUBLIC_APP_NAME`

当前产品名下，`NEXT_PUBLIC_APP_NAME` 应为 `PawPlan`。

执行数据库 migration：

```bash
npm run db:migrate
```

启动开发环境：

```bash
npm run dev
```

验证：

```bash
npm run test
npm run build
npm run test:e2e
```

## License

Code is MIT. Content is CC-BY 4.0.
