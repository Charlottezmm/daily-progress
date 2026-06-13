# PawPlan 改进清单（交 Codex）

> 评审人：Claude（Cowork）｜2026-06-13｜基于通读后端 + 前端代码 + 线上实测
> 优先级：P0 影响日常使用 / P1 明显缺口 / P2 打磨

## 2026-06-14 同步状态

已完成并上线：
- A2：`day_of_week` 已收紧为单天 enum 契约。
- E：`PATCH /api/tasks` 已支持 `{ id, status?, date?, daySegment? }`；用户手动改期直接写 `tasks` + `change_logs(source:"manual")`，不走 `/review` / `agentPatches`。后端提交：`761dea4 feat: support manual task rescheduling`。
- F：More 页已加退出登录按钮；Plan 页已加“改期”入口和前端改期控件。前端提交：`d0ef218 feat: add manual reschedule UI`。

仍待拆分处理：
- A1：OAuth refresh_token。
- A5：当前只有 driver 选择单测，仍缺真实 `DATABASE_URL` 最小事务写集成测试。
- G：邀请流程加固。
- B/C 里的 Month、时间轴、卡住状态持久化、constraints/routines 入口统一仍未开工。

---

## A. 后端 / 数据层

### A1〔P1〕OAuth 加 refresh_token
- 现状：connector access token 30 天过期（`connector-auth.ts` `exchangeAuthorizationCode` 写死 30d），无 refresh_token；`/.well-known/oauth-authorization-server` 只声明 `grant_types_supported: ["authorization_code"]`。
- 后果：Charlotte 自己天天用，每 30 天要重新授权一次连接器。
- 改：发 refresh_token + 加 `refresh_token` grant + token endpoint 支持 refresh 换发。

### A2〔P1〕`day_of_week` schema 陷阱
- 现状：MCP 入参 `timetable-import.ts:23` 只 `z.string().max(20)`，但 `timetable-save.ts:82 normalizeWeekday` 只接受单个 `sun/mon/.../sat`（或全称小写）；范围/中文/大写直接抛 `Invalid day_of_week`，且每行只支持一个 weekday。
- 改（二选一）：① 入参改 enum + tool description 注明"单天，多天拆多行"；② `normalizeWeekday` 支持范围（`mon-sat`）、列表（`mon,wed,fri`）、大小写、常见中文，materialize 时展开。建议至少做 ①。

### A3〔P2〕空 workspace 没有 bootstrap
- 现状：新工作区无 active plan，`propose_patch` / `propose_timetable_import` 抛 `No active plan`，必须先 `import_plan_bundle`。
- 改：workspace 创建时自动建一个默认 active plan，或文档写清启动顺序。

### A4〔P2〕"收到但没存"的字段
- `update_task_status` 的 `note`、`create_inbox_item` 的 `source` 接收后静默丢弃（schema 不支持）。
- 改：补 schema 落库，或从接口删掉避免误导。

### A5〔P1〕加事务回归测试
- 刚修的 neon-http 不支持事务 bug（已由 `9fecb3d` 修复）应有测试兜底。
- 改：加集成测试，对"当前 DATABASE_URL 实际选中的 driver"跑一次最小事务写，CI 挡回归。

---

## B. 约束 / 时间块

### B1〔P0〕`/constraints` UI 不能加 routine / recovery
- 现状：`constraints-view.tsx:9` `EditableKind = "course" | "meeting" | "unavailable"`，表单只能加这三种。**家务、运动（routine）、recovery 在 UI 里加不了**，只能走 timetable 导入。
- 后果：用户想自己加"运动时间""家务""每周 recovery"无入口。
- 改：把 `routine` / `recovery` 加进 `EditableKind` + 表单（含 recurrence、weekday 多选）。可考虑给 `routine` 加细分标签（学习/工作/家务/运动）方便战线统计。
- 注：数据层已支持全部 5 种 kind（course/meeting/unavailable/routine/recovery），实测 course+routine 均可落库，纯前端缺口。

### B2〔P2〕routine 多日重复输入繁琐
- 现状：导入时"周一到周六同一时段"要拆 6 行（每行一个 weekday）。
- 改：UI / 导入支持 weekday 多选 + 单条 recurrence，落库时展开。

---

## C. 前端 UI

### C1〔P0〕Month 视图是空壳
- 现状：`month-view.tsx` 仅 10 行，只有标题占位，无任何内容；`get_month` 也注明"no full month planner contract"。
- 后果：用户跑 4 个月计划、有月度 milestone，月视图完全空白。
- 改：做月度视图——按周/按 track 的任务分布、月度 milestone 进度、baseline vs current 对比（占位文案已暗示要做这些）。

### C2〔P1〕缺时间轴 / 日历网格
- 现状：week = 容量条，today = 任务列表（把固定安排压成一个总分钟数 `fixedMinutes`），全工具没有"一天/一周的时段排布"可视化。
- 后果：用户看不到 5-7 学习、9-12、13-18 工作、家务、运动、课程长在哪；想要的"课程表/日程表"没有载体。
- 改：加一个 day/week 时间轴视图，把 routine/course/recovery 时间块 + 当天任务按时段画在网格上（只读即可，不必拖拽，符合现有边界）。

### C3〔P2〕today "卡住"状态不持久化
- 现状：`today-view.tsx` `blocked` 只在前端 state，不 PATCH 落库，刷新即丢。
- 改：要么持久化一个 `blocked`/`stuck` 标记，要么明确它是临时态并在 UI 注明。

### C4〔P2〕in-app chat（按需，可不做）
- 现状：产品边界明确"No embedded AI chat"，用户靠 Cowork/Codex 连接器驱动。
- 说明：如果产品愿景是"用户在工具里直接跟 Claude 聊"（progress 文件 OVERRIDE 里提过），需另立项；否则保持现状即可，只需在引导里讲清"日常通过 Cowork 对话"。

---

## 分工约定（重要）
- **Claude 改前端**：只动 `src/components/**` + `src/app/(app)/**` 页面。
- **Codex 改后端**：只动 `src/lib/**` + `src/app/api/**` + DB schema/migration。
- 边界文件 = API route：Codex 负责实现，Claude 只按下面的契约调用。两边都按本文件契约来，不要改对方的目录。

## E〔P0〕用户直接改任务日期 / 时段（不走 /review）—— Codex 后端
- 设计原则：preview-first（/review）只约束 **agent 的写**；**用户对自己任务的直接编辑是授权写**，直接落库，跟现有 `PATCH /api/tasks` 改 status 同性质。
- 契约：扩 `PATCH /api/tasks`（`src/app/api/tasks/route.ts`）接受可选字段：
  ```
  { id: uuid, status?, date?: "YYYY-MM-DD", daySegment?: "morning"|"afternoon"|"evening" }
  ```
  - 至少给 status 或 date/daySegment 之一。
  - date/daySegment 走一个新的 service 函数（如 `updateTaskSchedule`），直接 update tasks.date/daySegment + 写 changeLog（source:"manual"），**不经 agentPatches / 不进 /review**。
  - workspace 鉴权同现有。date 用上海时区边界解析（参考 `patch-apply.ts` `dateFromDateKey`）。
- Claude 前端：在 today/week 任务卡加「改日期 / 往前挪 / 往后挪」控件，乐观更新后调该接口。

## F〔P1〕登出 + 切换 workspace
- 登出：接口 `POST /api/auth/logout` **已存在**，仅缺前端按钮 → Claude 在 More/Settings 加按钮，调用后 `location.replace("/login")`。无需后端改动。
- 切换 workspace：最小实现 = 登出 → /login（Claude 前端，复用登出）。真正多工作区一键切换需后端多会话，**本期不做**，记为远期。

## G〔P1〕邀请流程加固 —— Codex 后端
- 工作区名全局唯一（`workspaces_name_unique`）撞名报错差 → 自动加后缀或放宽唯一性约束范围。
- 无密码找回（无账号/邮箱）→ 至少在 /login + 创建流程文案里讲清"密码丢了进不去"，或加一个 recovery 机制（远期）。

## D. 任务 reschedule（回答"往前排"）
- 现状：**已支持**。`patch-schema.ts` 的 `propose_patch` 含 `move_task`（任意日期，往前往后皆可）、`defer_task`、`change_priority`、`split_task`、`move_to_backlog`；走 `/review`(`reschedule-preview.tsx`) 逐条确认，apply 前重查任务状态 + 冲突（乐观并发，`patch-apply.ts`）。
- 缺的是入口顺手度：
  - 〔P2〕在 today/week 任务卡上加"往前挪/往后挪"快捷操作，直接生成一条 move_task 草稿进 /review（现在只能靠 agent 对话发起）。
