# AI Planning App 设计文档

日期：2026-05-24
状态：待评审
仓库：`daily-progress`

## 1. 目标

做一个开源的 AI planning app。它的父结构是时间和日程管理，项目、课程、标签只是同一条时间线里的分类维度，不是彼此独立的计划系统。

它要解决的问题是：用户可以导入某个月或好几个月的计划，导入固定课程表/不可用时间，由系统拆成每日和每周计划；每天记录真实完成情况后，AI 帮用户提出日期调整方案，减少手动拖任务的维护成本。

核心计划模型：

- 保留原始 `baseline plan`。
- 维护当前执行版 `current plan`。
- AI 只生成结构化重排补丁。
- 用户预览并确认后，补丁才真正应用。

## 2. 非目标

MVP 不做：

- 团队协作。
- 计费系统。
- 正式注册制多人 SaaS。
- 复杂权限/RBAC。
- 团队共享 workspace。
- 普通任务的精确日历级自动排程。
- PDF、图片、截图、任意 HTML 解析。
- AI 直接静默改库。
- 暴露私人数据的共享 workspace 链接。

## 3. 产品模式

### 3.0 Web + PWA

MVP 的主要交付形态是响应式 Web app，并支持 PWA 安装体验。

目标体验：

- 桌面端通过浏览器访问。
- iPhone/Android 通过移动浏览器访问。
- 用户可以把 hosted app 添加到手机主屏幕。
- PWA 使用同一套 Web 代码和服务端 API。

MVP 不做 App Store / TestFlight / 原生 iOS app。这里的“iOS 版”指 iPhone 上可用的移动 Web/PWA。

### 3.1 Hosted Lite

Hosted Lite 面向不会自己部署的小白用户。用户打开网页就能开始用，但 AI 成本由用户自带 DeepSeek API key 承担。

流程：

1. 用户打开 hosted app。
2. 创建自己的 workspace。
3. 设置 workspace 访问密码。
4. 填写自己的 DeepSeek API key。
5. 导入或创建计划。
6. 管理自己的日程和任务。

Hosted Lite 的数据存在 hosted 数据库里。即使 AI key 是用户自己的，也仍然需要资源限制，因为你仍然承担托管、数据库、滥用防护和维护责任。

初始限制应覆盖：

- 每个浏览器/会话身份可创建的 workspace 数量。
- 每个 workspace 的 plan 数量。
- 每个 workspace 的 task 数量。
- 导入文件大小。
- 每个 workspace 的 AI 调用频率。

### 3.2 Self-Host Full

Self-Host Full 面向开发者和重度用户。用户从 GitHub 部署自己的实例，数据和密钥都由自己控制。

流程：

1. 用户从 GitHub 部署。
2. 配置数据库连接。
3. 配置加密密钥。
4. 创建 workspace。
5. 填写自己的 DeepSeek API key。

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

- API key。
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

## 5. DeepSeek BYOK

这个 app 采用 BYOK：Bring Your Own DeepSeek Key。

规则：

- 每个 workspace 填自己的 DeepSeek API key。
- 没配置 key 时，AI 功能禁用，但手动计划管理仍可用。
- hosted 运营者不替用户承担 AI 调用成本。
- 模板和数据导出不包含 API key。
- 删除 workspace 时同步删除密钥。

存储方式：

- workspace 级 DeepSeek key 加密后存数据库。
- 加密密钥来自服务端环境变量。
- 不记录原始 API key 日志。
- key 保存后不再回传给客户端。
- 设置页只显示 masked key，例如 `sk-...abcd`。

Self-host 用户配置自己的加密密钥。Hosted Lite 使用 hosted deployment 的加密密钥。

## 6. 核心数据模型

这是概念模型，不是最终 DDL。

```txt
workspace
- id
- name
- password_hash
- created_at
- updated_at

workspace_secret
- workspace_id
- deepseek_api_key_encrypted
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
- source: baseline | manual_edit | ai_patch
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
- kind: course | meeting | unavailable | routine
- starts_at
- ends_at
- recurrence_rule nullable
- course_id nullable
- movable

day_capacity
- id
- workspace_id
- date
- morning_minutes
- afternoon_minutes
- evening_minutes

checkin
- id
- workspace_id
- plan_id
- date
- summary
- created_at

checkin_task
- checkin_id
- task_id
- status: done | not_done | partial | skipped
- note

ai_patch
- id
- workspace_id
- plan_id
- status: draft | applied | rejected
- scope_start
- scope_end
- reason
- patch_json
- model
- created_at
- applied_at nullable

change_log
- id
- workspace_id
- plan_id
- source: manual | ai_patch | import
- summary
- details_json
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
- 时间段容量。
- 任务预估时长。
- 任务是否可移动。
- 任务优先级。
- 默认只影响当前周剩余时间。

MVP 不需要给普通任务生成精确开始/结束时间。这样比完整 calendar 稳，也足够支持每日计划。

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

## 10. AI 重排机制

AI 重排必须是 patch-based。

触发方式：

- 默认：每日 check-in/复盘后触发。
- 手动：用户点击 “reschedule now”。

默认范围：

- 当前周剩余时间。

如果当前周塞不下，AI 可以建议：

- 挪到下周。
- 降低优先级。
- 拆任务。
- 放入 backlog。
- 调整 weekly milestone。

AI 可生成的 patch operation：

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

AI 不能直接改数据库。

流程：

1. 用户完成 daily check-in。
2. 用户点击生成重排方案。
3. 服务端基于 current plan、check-in、任务列表、time block、容量和约束构造 scoped prompt。
4. DeepSeek 返回结构化 patch JSON。
5. 服务端校验 patch JSON。
6. UI 展示 Reschedule Preview。
7. 用户接受全部，或取消部分 patch item。
8. 服务端在一个 transaction 里应用被接受的 patch。
9. 服务端写入 plan version 和 change log。

## 11. 页面和视图

MVP 页面：

- Today：当天计划、check-in、完成状态、手动重排。
- Week：周时间线、剩余容量、milestone 状态。
- Month：月度计划和任务分布。
- Projects：按项目筛选的任务视图。
- Courses：课程表和课程相关任务视图。
- Import：`plan.md` 和 `timetable.csv` 导入流程。
- Reschedule Preview：AI patch 审批。
- Settings：workspace password、DeepSeek key、导入导出、hosted limits。

导航上 Today 和 Week 应该是主入口。Projects 和 Courses 是筛选/上下文页面，不是独立计划根。

## 12. 错误处理

关键错误：

- 缺 DeepSeek key：禁用 AI 按钮，并引导去 Settings。
- DeepSeek key 无效：展示 provider error，但不记录 key。
- AI 返回非法 JSON：当前计划不变，允许重试。
- patch 校验失败：当前计划不变，展示校验摘要。
- patch 和任务版本冲突：要求用户重新生成。
- 容量不足：展示塞不下的任务，让用户选择延期、拆分或 backlog。
- 导入解析失败：尽量指出失败的行或段落。

所有 AI 失败都必须保持现有计划不变。

## 13. 安全和隐私

Hosted Lite 安全底线：

- workspace password hash 存储。
- 使用 httpOnly session cookie。
- workspace API key 加密存储。
- 所有查询按 `workspace_id` scope。
- 默认不记录导入文档、API key 或完整 AI prompt。
- 导出和模板不包含 API key。
- 提供 workspace 删除，删除 planning data 和 secrets。

隐私表述：

- Hosted Lite 是 convenience hosting。
- 敏感数据用户建议 self-host。
- README 需要明确说明：AI prompt 会用用户自己的 DeepSeek API key 发给 DeepSeek。

## 14. MVP 范围

MVP 包含：

- 响应式 Web app。
- PWA manifest 和 Add to Home Screen 体验。
- workspace 创建和密码登录。
- 加密 DeepSeek key 设置。
- Plan Markdown 导入。
- Timetable CSV 导入。
- baseline plan 生成。
- Today / Week / Month 视图。
- Project / Course / Tag 分类。
- Daily check-in。
- AI reschedule patch 生成。
- Reschedule Preview。
- 确认后 transaction 应用 patch。
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
- PDF/image import。

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

MVP 不实现这些功能，但 schema 和服务边界不要堵死升级路径。

## 16. 测试计划

最低测试覆盖：

- workspace auth 和 query scoping。
- API key 加密/解密路径。
- Plan Markdown import parser。
- Timetable CSV import parser。
- 时间段容量计算。
- AI patch schema validation。
- patch application transaction。
- export 不包含 secrets。
- template import 创建隔离的 workspace 数据。

手动验证路径：

- 创建 workspace。
- 添加 DeepSeek key。
- 导入 `plan.md`。
- 导入 `timetable.csv`。
- 生成 baseline plan。
- 标记任务未完成。
- 生成 reschedule preview。
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
- AI 只生成 patch，必须用户确认。

### 17.2 Hosted 责任

Hosted Lite 降低使用门槛，但也带来托管责任。

缓解：

- AI 成本 BYOK。
- Hosted limits。
- 清晰隐私说明。
- 保持强 self-host 路径。

### 17.3 AI 计划漂移

如果 AI 可以自由重写计划，用户很快会失去信任。

缓解：

- 保存 baseline plan。
- 维护 current plan version。
- 必须通过 patch preview。
- 记录 change log。
- 默认只重排当前周。

## 18. 实现计划阶段再定的点

这些点可以在 implementation plan 阶段决定：

- 具体 Postgres provider。
- ORM 选择。
- Hosted Lite 的密码找回策略。
- `plan.md` 示例格式。
- `timetable.csv` 严格校验规则。
- DeepSeek 具体模型名。
- Hosted Lite 默认 limits。
- UI component library。

这些选择不应该改变上面的产品架构。
