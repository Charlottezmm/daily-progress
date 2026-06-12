# PawPlan Scheduled Automation

## 目标

PawPlan 的定时审核由 Codex / Cowork scheduled automation 在应用外部触发。Automation 负责在固定时间唤起 agent，agent 通过 PawPlan MCP server 读取真实计划数据，生成结构化 patch，并调用 `propose_patch` 写回 Review preview。

用户必须在 PawPlan 的 `/review` 页面确认后才 apply。Agent 定时审核不能直接修改任务日期，不能直接 apply patch，也不能绕过 Review。

## 非目标

- 不在 PawPlan app 内实现 scheduler。
- 不实现 server cron。
- 不实现 browser timer。
- 不实现 PWA 后台重排。
- 不让 scheduled automation 直接改 task date。
- 不让 scheduled automation 自动 apply patch。

## Hosted MCP Server 配置

PawPlan v0.2 优先使用 hosted HTTPS MCP：

```text
https://pawplan.charlottezmm.info/api/mcp
```

在 PawPlan `/settings` 里创建 workspace-scoped MCP token。建议 scheduled automation 使用 `read_write`
token，因为它需要调用 `propose_patch` 写入 Review preview。只读 token 只能读取 `get_today` / `get_week` /
`get_month` / `get_constraints` / `get_capacity` / `get_checkins` / `get_tasks`。

Codex config 示例：

```toml
[mcp_servers.pawplan]
url = "https://pawplan.charlottezmm.info/api/mcp"
bearer_token_env_var = "PAWPLAN_MCP_TOKEN"
startup_timeout_sec = 30
tool_timeout_sec = 60
default_tools_approval_mode = "prompt"
```

本地启动 Codex 前，把 `PAWPLAN_MCP_TOKEN` 设置为 Settings 里刚生成的 raw token。Raw token 只显示一次；
之后只能撤销并重新生成。

Claude Desktop Cowork 使用同一个 hosted MCP URL 和 bearer token。优先把 token 放在 Cowork 的 secret /
environment 配置里；不要把 raw token 写进计划快照、聊天记录、文档或 git。

## Local stdio MCP Server 配置

PawPlan MCP server 当前通过 stdio 运行：

```bash
npm run mcp
```

本地私有 fallback 可继续在 Codex / Cowork 的 MCP 配置里设置：

```json
{
  "mcpServers": {
    "pawplan": {
      "command": "npm",
      "args": ["run", "mcp"],
      "cwd": "/Users/charlotte/daily-progress",
      "env": {
        "DATABASE_URL": "postgres://USER:PASSWORD@HOST:PORT/DB",
        "PAWPLAN_WORKSPACE_ID": "WORKSPACE_ID"
      }
    }
  }
}
```

配置要求：

- `cwd` 必须指向 PawPlan repo：`/Users/charlotte/daily-progress`。
- `DATABASE_URL` 必须指向 PawPlan 使用的 Postgres 数据库。
- `PAWPLAN_WORKSPACE_ID` 必须是要审核的 workspace id；MCP server 启动时缺少该变量会失败。
- `npm run mcp` 只启动 MCP server，不启动 Web app，也不提供 app 内定时器。
- 默认权限是 `read_write`；如需降权可设置 `PAWPLAN_MCP_PERMISSION=read_only`。

## 可用 MCP Tools

- `get_today`：读取当前 workspace 今天的任务和 check-in。
- `get_week`：读取当前 workspace 本周任务，按日期分组。
- `get_month`：读取当前 workspace 的月度或日期范围任务，按日期分组。
- `get_constraints`：读取当前 workspace 的课程、routine 和 protected time blocks；只读，不编辑 constraints。
- `get_capacity`：读取共享 capacity model 输出，包括每天 morning / afternoon / evening 的任务占用、protected 占用、剩余容量和 warning。
- `get_checkins`：读取最近 daily check-in。
- `get_tasks`：按状态和日期范围读取任务。
- `create_inbox_item`：创建 inbox item，并记录 MCP 审计来源。
- `create_checkin`：创建或更新 daily check-in，用于记录用户明确提供的事实。
- `update_task_status`：更新任务状态，只用于记录事实，例如用户明确说某任务已完成、跳过或回 backlog。
- `propose_patch`：创建 preview-only agent patch draft；只写 Review preview，绝不 apply。
- `import_plan_bundle`：把已经讨论确认的结构化计划导入 PawPlan，创建真实任务并保留 provenance。只用于初始/明确导入，不用于后续重排。

## 直接导入任务 Prompt

当 Claude / Codex 已经和用户讨论清楚任务进度后，可以让 agent 直接导入：

```text
用 PawPlan MCP 把我们已经讨论好的任务进度导入 PawPlan。
请整理成 import_plan_bundle payload，包含 import_key、overall_plan、daily_tasks、weekly_summary、monthly_summary。
调用 import_plan_bundle。不要重复导入同一个 import_key，不要覆盖已有任务。
导入后我应该能在 PawPlan 的日计划、周计划、月计划里直接看到这些任务。
```

导入后的后续修改仍然走 Review：

```text
用 PawPlan MCP 读取 today、week、constraints、capacity、month 和最近 check-ins。
判断当前计划是否需要重排。如果需要，只生成 Review patch，不要直接 apply。
说明为什么调、影响哪些任务、对本周和本月目标有什么影响。
```

## 通用安全规则

所有 scheduled automation prompt 都必须遵守：

- 先读取数据，再判断是否需要 patch。
- 判断冲突、过载或固定时间时，必须读取 `get_constraints` 和 `get_capacity`，不要凭任务列表猜容量。
- 需要重排、延期、拆分、改优先级或调整计划时，只能生成 patch 并调用 `propose_patch`。
- 不得调用 apply。
- 不得直接改 task date。
- 不得直接改 task status，除非用户明确是在记录事实；`update_task_status` 不能用于重排。
- 不得用 `import_plan_bundle` 做后续破坏性覆盖或重排；导入后的调整必须走 `propose_patch` 和 Review。
- 无足够数据时不写 patch，改为说明缺少哪些数据。
- 不覆盖 routine / recovery / fixed time block。
- 不伪造已完成；没有用户事实依据时，不把任务标记为 `done`。
- Inbox 只用于临时收纳，不自动占用 capacity；需要纳入计划时通过 patch 提议。

## 模板 1：晚间审核

建议触发时间：每天 21:30，或用户自定义收工后时间。

```text
你是 PawPlan 的晚间审核 agent。只通过 MCP 操作 PawPlan。

目标：
读取今天的真实执行数据和最近 check-in，判断明天是否需要重排，并把建议写成 Review preview。

步骤：
1. 调用 get_today 读取今天任务、状态和 check-in。
2. 调用 get_week 读取本周剩余计划。
3. 调用 get_constraints 和 get_capacity 读取今天到本周结束的固定约束与共享容量。
4. 调用 get_checkins 读取最近 7 天 check-in。
5. 如果没有任务、没有 check-in，或数据不足以判断，不要调用 propose_patch；只返回缺少的数据。
6. 如果需要把未完成任务 rollover、拆分任务、避开 protected blocks 或改变优先级，生成 patch。
7. 调用 propose_patch，mode 使用 today 或 week，reason 写清楚依据。
8. 告诉用户去 PawPlan /review 确认。

限制：
- 不得调用 apply。
- 不得直接改 task date。
- 不得直接调用 update_task_status 做重排。
- update_task_status 只允许在用户明确提供事实时使用，例如用户说“任务 X 已完成”。
- 不覆盖 routine / recovery。
- 不直接编辑 constraints；constraints/capacity 只用于读取判断。
- 不伪造已完成。
```

## 模板 2：早晨确认

建议触发时间：每天开始工作前。

```text
你是 PawPlan 的早晨确认 agent。只通过 MCP 操作 PawPlan。

目标：
读取今天和本周计划，确认今天是否可执行；如果发现明显过载、冲突或昨天遗留影响今天，写入 Review preview。

步骤：
1. 调用 get_today 读取今天任务。
2. 调用 get_week 读取本周计划。
3. 调用 get_constraints 和 get_capacity 读取今天和本周的 protected blocks、课程、routine 与剩余容量。
4. 必要时调用 get_tasks 读取 todo / backlog 任务，确认是否有应进入今日但尚未排入的任务。
5. 如果今天计划可执行，且没有需要用户确认的变更，不要调用 propose_patch。
6. 如果需要减载、拆分、延期、补 recovery 或调整 priority，生成 patch。
7. 调用 propose_patch，reason 写明触发条件和影响。
8. 告诉用户在 PawPlan /review 逐条确认后再 apply。

限制：
- 不得调用 apply。
- 不得直接改 task date。
- 不得直接修改状态来制造“进度”。
- update_task_status 只用于记录用户明确说出的事实。
- 不覆盖 routine / recovery。
- 不直接编辑 constraints；constraints/capacity 只用于读取判断。
- 无数据时不写 patch。
```

## 模板 3：周复盘

建议触发时间：周日晚上，或新周开始前。

```text
你是 PawPlan 的周复盘 agent。只通过 MCP 操作 PawPlan。

目标：
读取本周任务、近期 check-in 和下周可见任务，生成下周计划调整建议，并写入 Review preview。

步骤：
1. 调用 get_week 读取本周任务。
2. 调用 get_constraints 和 get_capacity，读取本周到下周可见范围的固定约束与容量。
3. 调用 get_checkins，days 使用 14，读取最近两周 check-in。
4. 调用 get_month，读取覆盖本周和下周的日期范围。
5. 必要时调用 get_tasks 读取 backlog 和 todo。
6. 分析完成、跳过、未完成、过载、recovery 缺口和下周风险。
7. 如果没有足够数据，或没有明确调整建议，不要调用 propose_patch。
8. 如果需要调整下周重点、拆分大任务、rollover 未完成任务、补 recovery 或改变优先级，生成 patch。
9. 调用 propose_patch，mode 使用 week，reason 写清楚复盘证据。
10. 告诉用户在 PawPlan /review 确认。

限制：
- 不得调用 apply。
- 不得直接改 task date/status 来完成周复盘。
- update_task_status 只用于记录用户明确给出的事实，不用于计划重排。
- 不覆盖 routine / recovery。
- 不直接编辑 constraints；constraints/capacity 只用于读取判断。
- 不伪造已完成。
```

## Review Handoff

Automation 的完成标准不是计划已被改动，而是 Review preview 已生成。

用户下一步：

1. 打开 PawPlan `/review`。
2. 查看每个 patch item 的 before / after、reason 和 impact。
3. 逐条确认或拒绝。
4. 只在确认后 apply。

如果 `/review` 没有新 preview，说明 automation 没有足够依据生成 patch，或当前计划不需要调整。

## 失败处理

- MCP server 启动失败：检查 `cwd`、`DATABASE_URL`、`PAWPLAN_WORKSPACE_ID`。
- 读取结果为空：不要写 patch；提示用户补充任务、check-in 或 workspace 配置。
- patch 违反 routine / recovery：不要绕过限制；返回冲突说明，等待用户手动决策。
- 数据和用户口头描述冲突：以数据库读取结果为准，除非用户明确要求记录事实。
- `propose_patch` 失败：不要改用直接写任务；返回错误内容，等待用户处理。
