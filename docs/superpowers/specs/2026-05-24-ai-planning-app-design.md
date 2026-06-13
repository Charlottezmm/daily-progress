# MCP-native Planning App 设计文档

日期：2026-05-24
状态：待评审
仓库：`daily-progress`

## 1. 目标

做一个开源的 MCP-native planning app。它的父结构是时间和日程管理，项目、课程、标签只是同一条时间线里的分类维度，不是彼此独立的计划系统。

它要解决的问题是：用户可以导入某个月或好几个月的计划，导入固定课程表/不可用时间，由系统拆成每日和每周计划；每天记录真实完成情况后，Cowork/Codex/Claude 可以通过 MCP 读取真实数据、提出结构化调整方案，并把关键对话沉淀写回工具。自动审核计划不由 app 内置 scheduler 触发，而由 Codex/Cowork scheduled automation 定时唤起 agent，再通过 MCP 读写数据。

当前优先解决的真实痛点：

- 琐事太多，不能直接污染 plan，需要先进入 Inbox 缓冲。
- 家务、做饭、洗澡、运动、通勤等 routine 会挤占容量，但不应该被 agent 当成 task 重排。
- 学习、工作、副线、恢复多条战线会互相侵蚀，需要 track balance 监测。
- 放松/recovery 是红线，不应被 agent 为了“完成更多任务”自动挤掉。
- 上午/下午/晚上能量不同，agent 排程必须考虑 energy × time segment 的匹配。

核心计划模型：

- 保留原始 `baseline plan`。
- 维护当前执行版 `current plan`。
- Agent 只生成结构化重排补丁。
- 用户预览并确认后，补丁才真正应用。

## 2. 非目标

MVP 不做：

- 团队协作。
- 计费系统。
- 正式注册制多人 SaaS。
- 复杂权限/RBAC。
- 团队共享 workspace。
- 普通任务的精确日历级自动排程。
- app 内置 server cron / browser timer / PWA 后台任务调度。
- PDF、图片、截图、任意 HTML 解析。
- Agent 直接静默改库。
- 暴露私人数据的共享 workspace 链接。
- 把 routine、recovery、inbox item 当成普通 task 统一重排。

## 3. 产品模式

### 3.0 Web + PWA

MVP 的主要交付形态是响应式 Web app，并支持 PWA 安装体验。

目标体验：

- 桌面端通过浏览器访问。
- iPhone/Android 通过移动浏览器访问。
- 用户可以把 hosted app 添加到手机主屏幕。
- PWA 使用同一套 Web 代码和内部 route handler。

MVP 不做 App Store / TestFlight / 原生 iOS app。这里的“iOS 版”指 iPhone 上可用的移动 Web/PWA。

### 3.1 Hosted Lite

Hosted Lite 面向不会自己部署的小白用户。用户打开网页就能开始用。工具本身不持有任何 LLM API key，也不主动调用 LLM；AI 推理发生在用户自己的 Cowork/Codex/Claude 环境里，通过 MCP 读写工具数据。

流程：

1. 用户打开 hosted app。
2. 创建自己的 workspace。
3. 设置 workspace 访问密码。
4. 导入或创建计划。
5. 管理自己的日程和任务。
6. 可选：在 Settings 生成 workspace-scoped MCP token，连接 Cowork/Codex/Claude。

Hosted Lite 的数据存在 hosted 数据库里。即使工具不承担 LLM 调用成本，也仍然需要资源限制，因为你仍然承担托管、数据库、MCP 滥用防护和维护责任。

初始限制应覆盖：

- 每个浏览器/会话身份可创建的 workspace 数量。
- 每个 workspace 的 plan 数量。
- 每个 workspace 的 task 数量。
- 导入文件大小。
- 每个 workspace 的 MCP 调用频率。

### 3.2 Self-Host Full

Self-Host Full 面向开发者和重度用户。用户从 GitHub 部署自己的实例，数据和密钥都由自己控制。

流程：

1. 用户从 GitHub 部署。
2. 配置数据库连接。
3. 创建 workspace。
4. 可选开启 MCP server。

Self-host 版本默认不需要 hosted 限额，但代码里应保留限流钩子，方便部署者自己开启。

### 3.3 模板分享

模板分享不能泄露私人数据。

模板可以包含：

- baseline plan 结构。
- 任务标题和预估时长。
- project/course/tag 分类建议。
- timetable CSV 示例。
- prompt 元数据。

模板不能包含：

- check-in。
- 完成历史。
- 复盘内容。
- 私人 change log。
- 带有个人进度信息的 current adjusted plan。

Hosted 用户可以把模板复制进自己的 workspace。Self-host 用户可以导入同一份 template JSON 或 Markdown bundle。

## 4. 认证和 Workspace 模型

MVP 采用 workspace-first 的轻账号模型。

每个 workspace 相互隔离。别人打开你分享的模板链接后，如果想使用这个 app，应创建自己的 workspace，只看到自己的数据。

初始访问控制：

- workspace password。
- 密码只存 hash。
- 登录后发 httpOnly session cookie。
- 所有查询必须按 `workspace_id` 过滤。

数据模型要保留未来升级 SaaS 的路径：

- 核心表都带 `workspace_id`。
- 即使 MVP 每个 workspace 只有一个成员，也可以保留 member/user 边界。
- 应用代码从 session context 解析当前 workspace。
- 不写未加 scope 的全局 `getCurrentPlan()` / `getTasks()`。

## 5. MCP-Native Agent Layer

这个 app 不内嵌 LLM client，不保存 DeepSeek/OpenAI/Anthropic 等模型 API key，也不主动调用任何 LLM endpoint。

定位：

- Web/PWA 是人类操作界面。
- MCP server 是 agent 接入层。
- Cowork/Codex/Claude 负责推理、对话、重排建议和对话摘要。
- 工具负责结构化数据、视图、权限、patch preview 和用户确认。
- 内部 route handlers / server actions 只服务 Web/PWA，不作为 public REST API 承诺；agent 接入面是 MCP。

### 5.1 MCP 工具接口

读类工具：

```txt
get_current_plan(scope: today | week | month)
get_today_tasks()
get_recent_checkins(days: 7)
get_must_wins(week: this_week | next_week)
get_track_balance(week)
get_routines(weekday)
get_inbox(filter: unprocessed | all)
get_relevant_conversations(topic, k)
search_decisions(query, k)
get_entity_graph(entity_id, depth)
```

写类工具：

```txt
create_inbox_item(title, source)
update_task_status(task_id, status, note)
create_checkin(date, completed_text, blocker_text, next_text)
create_decision(topic, context, options, chosen, rationale, tradeoffs, links)
save_conversation_summary(topic, context_type, summary, decisions, open_questions, links)
propose_patch(operations)
add_entity_link(from, to, relation, note)
```

约束：

- 每个 workspace 可以生成 workspace-scoped MCP token。
- token 可撤销。
- token 至少分 read-only 和 read-write 两级。
- 所有 MCP 写操作必须写入 `change_log`，v0.2 后写入 `event`。
- `propose_patch` 只创建 preview，绝不直接 apply。
- `apply patch` 必须在 Web/PWA 内由用户确认。
- UI 应显示由 Claude/Codex/MCP 创建或修改过的实体。

### 5.2 Agent Automation Boundary

MCP 是 agent 访问数据的工具层，不是定时器。自动计划审核由 Codex/Cowork scheduled automation 负责触发。

边界：

- PWA 负责人类操作：check task、写收工反馈、确认 patch preview。
- Postgres 是唯一真实数据源。
- MCP server 负责把 Postgres 中的计划、任务、课程、routine、check-in、patch preview 暴露给 agent。
- Codex/Cowork scheduled automation 负责在固定时间唤起 agent。
- Agent 通过 MCP 读取数据，生成重排建议，并调用 `propose_patch` 写回 preview。
- App 不实现自己的 server cron、浏览器后台 timer 或 PWA 后台重排逻辑。

建议 automation：

- 晚间审核：21:30 或用户自定义时间，读取当天 task status、收工反馈、课程/routine/recovery 约束，生成明天计划草案和需要确认的 patch preview。
- 早晨确认：08:00 或用户自定义时间，轻量检查当天固定日程变化，确认今天 3-7 个执行任务。
- 周复盘：每周固定时间读取 check-in、track balance、recovery target、未完成任务，生成下周调整建议。

automation 的输出不是直接改库，而是写入 patch preview。用户在 PWA Review 页面确认后才 apply。

### 5.3 Conversation Sediment

不存裸 chat log。工具只保存结构化对话摘要和决策资产。

原则：

- 对话发生在 Cowork/Codex/Claude。
- 关键讨论结束后，由 agent 通过 MCP 调 `save_conversation_summary`。
- 方向决策、weekly review 结论、方法论调整、客户取舍等写入 `decision`。
- 后续 agent 通过 `get_relevant_conversations` / `search_decisions` 拉上下文。

### 5.4 Semantic Graph 边界

v0.2 可以引入 `decision`、`conversation`、`entity_link`。v0.3 再考虑 `event` 和 embedding/semantic search。

不要在 v0.1 给所有表强制加 `embeddings VECTOR(1536)`。原因：

- 工具自己不调用 LLM，也不应该为了 embedding 引入新的模型 key。
- pgvector 会增加数据库和部署复杂度。
- 第一版可以先用 topic、context_type、linked entity 和 Postgres text search。
- 如果后续需要 embedding，应通过 MCP 写入，或由 self-host 用户自行配置 embedding provider。

## 6. 核心数据模型

这是概念模型，不是最终 DDL。

```txt
workspace
- id
- name
- password_hash
- created_at
- updated_at

plan
- id
- workspace_id
- title
- start_date
- end_date
- status: active | archived
- baseline_snapshot
- current_version_id
- created_at
- updated_at

plan_version
- id
- workspace_id
- plan_id
- version_number
- snapshot
- source: baseline | manual_edit | agent_patch
- created_at

task
- id
- workspace_id
- plan_id
- title
- notes
- date
- day_segment: morning | afternoon | evening
- status: todo | done | skipped | backlog
- priority: low | normal | high | urgent
- estimated_minutes
- energy_level: low | medium | high
- movable
- project_id nullable
- course_id nullable
- track_id nullable
- parent_task_id nullable
- created_at
- updated_at

project
- id
- workspace_id
- name
- color
- created_at
- updated_at

course
- id
- workspace_id
- name
- color
- created_at
- updated_at

track
- id
- workspace_id
- name
- kind: main | work | side | recovery | custom
- target_min_percent nullable
- target_max_percent nullable
- color
- created_at
- updated_at

tag
- id
- workspace_id
- name

task_tag
- task_id
- tag_id

time_block
- id
- workspace_id
- title
- kind: course | meeting | unavailable | routine | recovery
- starts_at
- ends_at
- recurrence_rule nullable
- course_id nullable
- track_id nullable
- movable
- estimated_minutes nullable
- energy_level nullable

routine
- id
- workspace_id
- title
- default_time_segment: morning | afternoon | evening | specific_window
- default_start_time nullable
- default_end_time nullable
- weekday_pattern
- estimated_minutes
- energy_level: low | medium
- created_at
- updated_at

routine_completion
- id
- workspace_id
- routine_id
- date
- completed
- created_at
- updated_at

inbox_item
- id
- workspace_id
- title
- source: manual | imported
- processed_at nullable
- created_at

day_capacity
- id
- workspace_id
- date
- morning_minutes
- afternoon_minutes
- evening_minutes

segment_energy_setting
- id
- workspace_id
- segment: morning | afternoon | evening
- energy_level: low | medium | high

checkin
- id
- workspace_id
- plan_id
- date
- completed_text
- blocker_text
- next_text
- created_at

checkin_task
- checkin_id
- task_id
- status: done | not_done | partial | skipped
- note

agent_patch
- id
- workspace_id
- plan_id
- status: draft | applied | rejected
- scope_start
- scope_end
- reason
- patch_json
- created_by: claude | codex | user
- created_at
- applied_at nullable

change_log
- id
- workspace_id
- plan_id
- source: manual | agent_patch | import
- summary
- details_json
- created_at
```

### 6.1 MCP / Conversation v0.2 模型

这些表属于 v0.2 MCP + Conversation Sediment 范围。v0.1 可以先不实现，但 schema 设计不能和它冲突。

```txt
mcp_token
- id
- workspace_id
- token_hash
- name
- permission: read_only | read_write
- expires_at nullable
- revoked_at nullable
- created_at

conversation
- id
- workspace_id
- topic
- context_type: weekly_review | decision | learning_qa | check_in_followup | methodology | adhoc
- summary
- decisions_json
- open_questions_json
- created_by: claude | codex | user
- created_at

decision
- id
- workspace_id
- topic
- context
- options_considered_json
- chosen
- rationale
- tradeoffs_accepted
- status: active | superseded | abandoned
- created_at

entity_link
- id
- workspace_id
- from_entity_type: task | plan | decision | conversation | checkin | inbox_item
- from_entity_id
- to_entity_type
- to_entity_id
- relation: is_blocked_by | informed_by | superseded | clarified | evidence_for | spawned_from
- note nullable
- created_at

event
- id
- workspace_id
- actor: user | claude | codex | system
- type
- entity_type
- entity_id
- payload_json
- linked_entities_json
- created_at
```

## 7. 计划层级

时间是父结构。

推荐层级：

```txt
workspace
  plans
    months / weeks / days
      tasks
        optional project
        optional course
        optional tags
```

不要做成：

```txt
workspace
  project_plans
  course_plans
  work_plans
```

原因是一个任务可能同时属于课程、项目、deadline、固定时间约束和某个 tag。它们应该都挂在一条共享时间线里。

## 8. 排程精度

MVP 使用时间段级排程。

普通任务只排到：

- `morning`
- `afternoon`
- `evening`

固定 block 使用精确时间：

- 课程。
- 会议。
- 不可用时间。
- 睡眠或 routine 约束，如果用户导入。

AI 重排必须尊重：

- 固定 time block。
- routine time block。
- recovery time block。
- 时间段容量。
- 任务预估时长。
- 任务是否可移动。
- 任务优先级。
- task energy 和 day segment energy 的匹配。
- track balance 阈值。
- 默认只影响当前周剩余时间。

MVP 不需要给普通任务生成精确开始/结束时间。这样比完整 calendar 稳，也足够支持每日计划。

### 8.1 Routine

Routine 是重复出现的非 task 活动，例如家务、做饭、洗澡、运动、通勤。

规则：

- Routine 不进入 baseline plan。
- Routine 不进入 AI 重排范围。
- Routine 占用 day capacity。
- Routine 在 Today 视图底部独立显示，和 tasks 分开。
- Routine 完成后可以打勾，但不影响 plan version。
- Agent patch 不能移动 routine。
- Agent patch 不能把 task 移入 routine 对应的 time block。

录入方式：

- Settings -> Routines。
- 每条 routine 设置默认时间段、weekday pattern、预估时长和 energy level。
- 如果 routine 使用 specific window，应生成不可移动的 routine time block。

### 8.2 Recovery Block

Recovery block 是每周必须保留的休息、游戏、完全 off 时间。

规则：

- `time_block.kind = recovery`。
- Recovery block 不进入 AI 重排范围。
- Agent patch 不能移动、缩短或覆盖 recovery block。
- Week 视图展示本周 recovery 总时长。
- 每个 workspace 可配置 weekly recovery target，默认 3 小时。
- 如果本周 recovery 小于目标值，Week/Today 显示红色提醒。
- 周日 review 必查 recovery 是否达标；未达标时，下周应强制建议补一块。

### 8.3 Track Balance

Track 用来表达战线，例如 main、work、side、recovery。Track 是分类维度，不是 plan 的父结构。

规则：

- 不给 `plan` 加单一 `track` 字段。
- `task.track_id` 可选。
- `time_block.track_id` 可选，recovery block 默认挂到 recovery track。
- Week 视图可展示各 track 的实际/计划占用时间。
- Track 可以配置目标上下限，例如 main >= 30%。
- 如果 track 违反阈值，下次 AI 重排应把这个信息作为 prompt context。

### 8.4 Energy × Time Segment

每个时间段有默认 energy：

- 默认 `morning = high`。
- 默认 `afternoon = medium`。
- 默认 `evening = low`。

用户可在 Settings 调整默认值。

AI 重排时：

- high-energy task 优先进入 high-energy segment。
- medium task 可进入 high 或 medium segment。
- low task 可进入任意 segment，但放进 morning 应计为 penalty。
- high-energy task 放进 evening 应计为 penalty，除非用户明确接受。

## 9. 输入格式

MVP 支持两类核心输入。

### 9.1 Plan Markdown

`plan.md` 可以包含：

- 长期目标。
- 月度或多月目标。
- 项目。
- 课程。
- deadline。
- milestone。
- 约束。
- 偏好。

导入器负责抽取候选任务、milestone、project、course 和 deadline，然后先展示 preview，再创建 baseline plan。

### 9.2 Timetable CSV

`timetable.csv` 用来导入固定时间块。

建议列：

```csv
title,kind,day_of_week,start_time,end_time,starts_on,ends_on,course,recurrence,notes
Deep Learning Lecture,course,Monday,09:00,11:00,2026-09-01,2026-12-20,Deep Learning,weekly,
Company Work,unavailable,Monday,14:00,18:00,2026-09-01,2026-12-20,,weekdays,
```

PDF、截图、任意 HTML、日历集成都是后续增强，不进 MVP。

## 10. Agent Patch / 重排机制

重排必须是 patch-based。工具自身不调用 LLM；Cowork/Codex/Claude 通过 MCP 读取数据、推理、生成 patch，并调用 `propose_patch` 写回工具。定时触发由 Codex/Cowork scheduled automation 负责，不由 app 内置 scheduler 负责。

触发方式：

- 自动：Codex/Cowork scheduled automation 每晚或每天早上唤起 agent，agent 通过 MCP 读取上下文并调用 `propose_patch`。
- 手动：用户在 Cowork/Codex 里说“重排今天/本周”，agent 通过 MCP 读取上下文并调用 `propose_patch`。
- PWA：只展示当前 patch preview 和任务状态，不承担唤起 LLM 的职责。

默认范围：

- 当前周剩余时间。

重排模式：

- `plan_today`：生成或修正今天 3-7 个执行任务。
- `rollover_unfinished`：处理昨天/今天未完成任务，必要时顺延到明天。
- `replan_week`：处理当前周剩余时间。
- `weekly_review`：周复盘时调整下周重点、recovery 和容量分布。

如果当前周塞不下，agent 可以建议：

- 挪到下周。
- 降低优先级。
- 拆任务。
- 放入 backlog。
- 调整 weekly milestone。

Agent 可生成的 patch operation：

```txt
move_task
- task_id
- from_date
- from_day_segment
- to_date
- to_day_segment
- reason

split_task
- task_id
- new_tasks[]
- reason

defer_task
- task_id
- target_week_or_date
- reason

move_to_backlog
- task_id
- reason

change_priority
- task_id
- from_priority
- to_priority
- reason

suggest_milestone_change
- milestone_id
- proposed_text
- reason
```

Agent 不能直接改数据库。

Agent patch 禁止：

- move routine。
- move recovery block。
- shrink recovery block。
- 把普通 task 移入 routine/recovery 占用时段。
- 忽略 fixed time block。
- 超出用户选择的 scope 直接改整个月计划。

流程：

1. 用户在 PWA 完成 task check 和收工反馈。
2. Codex/Cowork scheduled automation 定时触发，或用户在 Cowork/Codex 手动请求重排。
3. Agent 通过 MCP 读取 current plan、check-in、任务列表、time block、capacity、track balance 和历史 conversation/decision。
4. Agent 生成结构化 patch JSON，并调用 MCP `propose_patch`。
5. 工具服务端校验 patch JSON。
6. UI 展示 Review / Patch Preview。
7. 用户接受全部，或取消部分 patch item。
8. 服务端在一个 transaction 里应用被接受的 patch。
9. 服务端写入 plan version 和 change log；v0.2 后同步写入 event。

## 11. 页面和视图

MVP 导航应收敛成四个主入口：

- Today：今天执行，只做 check、blocked、skip、defer 和收工反馈。
- Plan：日 / 周 / 月计划展示，展示 agent 已排好的时间分布、课程占用、routine/recovery 约束和目标拆分；不作为高频手动编辑页面。
- Review：agent patch preview 审批页。Codex/Cowork automation 写回来的建议在这里逐条确认。
- More：Inbox、Calendar & Courses、Routines、Settings、Import、Export、MCP token 等低频工具入口。

页面职责：

- Today 是每日主入口。用户应该在 30 秒内完成今日任务状态反馈。
- Plan 是展示层，不是传统 planner 后台。日/周/月只用于查看 agent 编排结果和容量状态。
- Review 是信任系统核心，必须清楚表达“这是建议，不是已经改动”。
- Calendar / Courses / Routines 是约束层，帮助 agent 避开固定时间和生活容量，不是主导航根。

### 11.1 Quick Capture / Inbox

Quick Capture 是低摩擦捕捉入口，但不应抢占 Today 首屏主层级。桌面端可以是紧凑输入或按钮；移动端可以是小型 `+` 入口或浮动按钮，但必须容易触达。

规则：

- Quick Capture 只要求输入 title，目标是 1 秒录入。
- 新内容进入 `inbox_item`。
- Inbox item 不进入 plan。
- Inbox item 不进入 AI 重排。
- Inbox item 不占 capacity。

Inbox 页面每条 item 有三个动作：

- Promote to task：打开 task 创建表单，预填 title。
- Convert to routine：打开 routine 创建表单，预填 title。
- Delete：删除该 inbox item。

如果未处理 inbox item 超过 10 条，Today 顶部显示红条提醒。

### 11.2 Daily Check-in

Daily Check-in 在 UI 上命名为“收工反馈”。它的目标是 5 秒完成，不做成复盘子系统。

Today 视图底部固定一个收工反馈卡片，永远可见。它不要求用户打开子页面，不要求选日期，不要求在 check-in 里标记 task done；task 完成状态仍然由 task action 管。

字段：

- 完成：今天完成了什么。
- 卡点：今天卡在哪里。
- 明日接：明天从哪里继续。

规则：

- 日期自动等于今天。
- 每个 workspace 每天最多一条 check-in；重复保存时更新当天记录。
- Save 后立刻反馈：底部 toast `记下了。已 N 天连续打卡`。
- Save 后可以显示 agent-facing 状态，例如 `有 2 个未完成任务待 automation 审核`。
- 连续打卡天数由最近连续 check-in 日期计算，不需要持久化冗余字段。
- Week / Month 视图 surface 历史 check-in 摘要，不要求用户翻文件或进入单独页面。
- Today 视图在 21:30 后如果当天还没 check-in，可以显示固定提醒条。

不进入 MVP：

- PWA push notification。
- iOS/Android 系统级通知权限。
- Service Worker push subscription。

21:30 PWA push 是后续增强。原因是它涉及通知权限、PWA 安装状态、Service Worker 和浏览器兼容性；不能当作 Daily Check-in UI 的附属小功能塞进第一阶段。

### 11.3 轻量自动警示

MVP 只做轻量 warning rules，不做复杂智能诊断。

初始 warning rules：

- inbox item 超过 10 条。
- 本周 recovery 小于 workspace recovery target。
- 昨天没有 check-in。
- 21:30 后当天没有 check-in。

后续增强 warning rules：

- 某 task 连续 3 天仍为 todo 且未被移动。
- 某 track 连续 2 天没有实际投入。
- 三战线占比连续一周违反阈值。

## 12. 错误处理

关键错误：

- MCP token 缺失或无效：拒绝 MCP 请求，并引导用户在 Settings 重新生成 token。
- Agent 提交非法 JSON：当前计划不变，允许重新提交。
- patch 校验失败：当前计划不变，展示校验摘要。
- patch 和任务版本冲突：要求用户重新生成。
- 容量不足：展示塞不下的任务，让用户选择延期、拆分或 backlog。
- Agent patch 试图修改 routine/recovery：拒绝 patch，并显示违反的约束。
- 导入解析失败：尽量指出失败的行或段落。

所有 agent/MCP 失败都必须保持现有计划不变。

## 13. 安全和隐私

Hosted Lite 安全底线：

- workspace password hash 存储。
- 使用 httpOnly session cookie。
- MCP token hash 存储，原始 token 只显示一次。
- MCP token 可撤销，可设置过期时间。
- MCP token 分 read-only / read-write 权限。
- 所有查询按 `workspace_id` scope。
- 默认不记录完整对话原文，只保存用户确认或 agent 写入的结构化摘要。
- 导出和模板不包含 MCP token。
- 提供 workspace 删除，删除 planning data、MCP token 和 conversation/decision 数据。

隐私表述：

- Hosted Lite 是 convenience hosting。
- 敏感数据用户建议 self-host。
- README 需要明确说明：工具本身不调用 LLM；如果用户通过 Cowork/Codex/Claude 使用 MCP，相关数据会被发送给用户自己的 agent client。

## 14. MVP 范围

这里描述的是产品 MVP 的完整目标，不等同于第一轮工程 foundation。第一轮可以先做数据模型、核心页面、patch proposal contract 和 preview；完整 MCP server、conversation sediment UI、以及 patch application transaction 可以拆到后续 execution plan。

MVP 包含：

- 响应式 Web app。
- PWA manifest 和 Add to Home Screen 体验。
- workspace 创建和密码登录。
- Plan Markdown 导入。
- Timetable CSV 导入。
- baseline plan 生成。
- Today / Plan / Review / More 四入口信息架构。
- Plan 内部日 / 周 / 月展示。
- Project / Course / Tag 分类。
- Track 表和 `task.track_id`。
- Track balance 数据计算。
- Routine 管理；routine 可作为 Calendar & Courses 约束层的一部分。
- Recovery block 和 weekly target。
- Inbox quick capture。
- 收工反馈。
- 5 秒收工反馈卡片：完成 / 卡点 / 明日接。
- MCP-shaped patch preview。
- Review 页面。
- Codex/Cowork scheduled automation 的 MCP 调用边界文档和示例 prompt。
- 确认后 transaction 应用 patch。
- Segment energy setting。
- Change log。
- 不含 secrets 的 template export/import。

MVP 不包含：

- OAuth。
- 邮箱登录。
- 计费。
- 团队共享。
- 公开只读计划页。
- Calendar sync。
- App Store / TestFlight / 原生 iOS app。
- Push notification。
- app 内置 server cron / browser timer / PWA 后台重排。
- PDF/image import。
- 内嵌 DeepSeek/OpenAI/Anthropic client。
- 工具内 chat UI。
- MCP server 完整实现。
- Conversation/decision 语义图 UI。

## 15. 后续路径

可能的后续升级：

1. 公开 template gallery。
2. 带脱敏选项的只读公开计划分享。
3. Google Calendar 或 ICS 导入。
4. OAuth 登录。
5. Hosted paid plan，提高 hosted limits。
6. 团队 workspace，只有真实用户明确需要协作时再做。
7. 更多导入格式。
8. 面向强日历用户的精确时间排程。
9. 自动警示增强：连续未触碰任务、track 空白、多周失衡。
10. 21:30 PWA push notification，用于 Daily Check-in 习惯养成。
11. MCP server 完整实现。
12. Conversation / Decision 沉淀。
13. Entity graph 和 event timeline。
14. Embedding / semantic search。

MVP 不实现这些功能，但 schema 和服务边界不要堵死升级路径。

## 16. 测试计划

最低测试覆盖：

- workspace auth 和 query scoping。
- MCP token hash / scope / revoke。
- Plan Markdown import parser。
- Timetable CSV import parser。
- 时间段容量计算。
- Routine/recovery 容量占用。
- Track balance 计算。
- Energy mismatch penalty。
- Agent patch schema validation。
- Agent patch 禁止修改 routine/recovery 的校验。
- Daily Check-in upsert。
- 连续 check-in 天数计算。
- patch application transaction。
- export 不包含 secrets。
- template import 创建隔离的 workspace 数据。

手动验证路径：

- 创建 workspace。
- 导入 `plan.md`。
- 导入 `timetable.csv`。
- 生成 baseline plan。
- 创建 routine。
- 创建 recovery block。
- 使用 Quick Capture 添加 inbox item，并 promote 为 task。
- 保存 Daily Check-in，确认 toast 显示连续天数。
- 在 Plan 的周 / 月视图看到 check-in 历史摘要。
- 标记任务未完成。
- 通过模拟 Codex/Cowork scheduled automation 的 MCP `propose_patch` 创建 today review preview。
- 通过模拟 Codex/Cowork scheduled automation 的 MCP `propose_patch` 创建 week review preview。
- 取消一个 patch item。
- 应用剩余 patch item。
- 确认 change log 和 plan version。
- 导出 template，并确认不包含 secrets 或个人进度历史。

## 17. 关键风险

### 17.1 范围膨胀

最大风险是把它同时做成 calendar、LMS、project manager 和 SaaS 平台。

缓解：

- 保持时间/日程是父结构。
- project/course 只是分类。
- 普通任务只做时间段级排程。
- Agent 只生成 patch，必须用户确认。

### 17.2 Hosted 责任

Hosted Lite 降低使用门槛，但也带来托管责任。

缓解：

- 工具不承担 LLM 调用，也不保存 LLM key。
- MCP 调用限流和 token revoke。
- Hosted limits。
- 清晰隐私说明。
- 保持强 self-host 路径。

### 17.3 Agent 计划漂移

如果 agent 可以自由重写计划，用户很快会失去信任。

缓解：

- 保存 baseline plan。
- 维护 current plan version。
- 必须通过 patch preview。
- 记录 change log。
- 默认只重排当前周。
- routine 和 recovery 作为不可修改约束。

## 18. 实现计划阶段再定的点

这些点可以在 implementation plan 阶段决定：

- 具体 Postgres provider。
- ORM 选择。
- Hosted Lite 的密码找回策略。
- `plan.md` 示例格式。
- `timetable.csv` 严格校验规则。
- Hosted Lite 默认 limits。
- UI component library。
- Track 默认分类和默认阈值。
- MCP server transport 形态：stdio / local process / HTTP endpoint。

这些选择不应该改变上面的产品架构。
