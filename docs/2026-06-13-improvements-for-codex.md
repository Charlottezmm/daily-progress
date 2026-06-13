# PawPlan 改进清单（交 Codex）

> 评审人：Claude（Cowork）｜2026-06-13｜基于通读后端 + 前端代码 + 线上实测
> 优先级：P0 影响日常使用 / P1 明显缺口 / P2 打磨

## 2026-06-14 同步状态

已完成并上线：
- A2：`day_of_week` 已收紧为单天 enum 契约。
- E：`PATCH /api/tasks` 已支持 `{ id, status?, date?, daySegment? }`；用户手动改期直接写 `tasks` + `change_logs(source:"manual")`，不走 `/review` / `agentPatches`。后端提交：`761dea4 feat: support manual task rescheduling`。
- F：More 页已加退出登录按钮；Plan 页已加“改期”入口和前端改期控件。前端提交：`d0ef218 feat: add manual reschedule UI`。
- A1：OAuth connector 已发 `refresh_token`，`/api/oauth/token` 支持 `refresh_token` grant 并轮换 access/refresh token；metadata 已声明 `authorization_code` + `refresh_token`。
- A3：beta workspace 创建时已自动生成默认 active Starter Plan。
- A4：`update_task_status.note` 已写入 `change_logs.detailsJson.note`；`create_inbox_item.source` 支持 `manual|imported` 并落库。
- A5：已加 gated 集成测试 `src/tests/integration/db-transaction.test.ts`，设置 `RUN_DATABASE_INTEGRATION=1 DATABASE_URL=...` 后会对当前 driver 跑最小事务写 + rollback smoke。
- B1 数据层：`POST /api/constraints` 已接受 `routine|recovery`，service 读写/删除权限和测试已同步。
- C1 数据层：`getMonthPlanData` 已返回真实月度任务/周分布/import summary 数据，当前属于已有覆盖。
- C2 数据层：today/week view-data 已暴露 `timelineItems`，包含 task/course/meeting/unavailable/routine/recovery 的 `startsAt/endsAt/minutes/protected`。
- C1/C2/B1 UI：Plan 日视图已用 `timelineItems` 画真实时间轴；Plan 月视图已显示月度指标/目标/milestones/每周分布；Constraints 表单已支持 `routine|recovery`。
- C3 数据层：`tasks.blocked` 已加 schema + migration，`PATCH /api/tasks` 已支持 `{ blocked: boolean }` 并写 manual changelog；`TodayTaskView.blocked` 已透出。
- G 后端：beta workspace 撞名时自动创建 `名称 2`；并发唯一冲突返回明确错误；登录/创建流程已补“当前无密码找回”风险文案。
- Check-in 幂等：已确认 `checkins_workspace_id_date_unique` 覆盖 `(workspace_id,date)`，并补 schema 回归测试保护 `createDailyCheckin` 的 upsert 目标。
- MCP usage：已改为按 JSON-RPC response body 是否含 `error` 判定 success，避免 HTTP 200 的工具失败被计成成功。

仍待拆分处理：
- Claude UI：today “卡住”把初始态接 `task.blocked`，点击时 PATCH `{ blocked: true|false }`。
- 远期：真正的密码找回/重置机制仍未做；当前只是明确告知无找回。

---

## A. 后端 / 数据层

### A1〔P1〕OAuth 加 refresh_token
- 现状：connector access token 30 天过期（`connector-auth.ts` `exchangeAuthorizationCode` 写死 30d），无 refresh_token；`/.well-known/oauth-authorization-server` 只声明 `grant_types_supported: ["authorization_code"]`。
- 后果：Charlotte 自己天天用，每 30 天要重新授权一次连接器。
- 改：发 refresh_token + 加 `refresh_token` grant + token endpoint 支持 refresh 换发。
- 状态：已完成。refresh token 仅存 hash，refresh grant 会同时轮换 access/refresh token。

### A2〔P1〕`day_of_week` schema 陷阱
- 现状：MCP 入参 `timetable-import.ts:23` 只 `z.string().max(20)`，但 `timetable-save.ts:82 normalizeWeekday` 只接受单个 `sun/mon/.../sat`（或全称小写）；范围/中文/大写直接抛 `Invalid day_of_week`，且每行只支持一个 weekday。
- 改（二选一）：① 入参改 enum + tool description 注明"单天，多天拆多行"；② `normalizeWeekday` 支持范围（`mon-sat`）、列表（`mon,wed,fri`）、大小写、常见中文，materialize 时展开。建议至少做 ①。

### A3〔P2〕空 workspace 没有 bootstrap
- 现状：新工作区无 active plan，`propose_patch` / `propose_timetable_import` 抛 `No active plan`，必须先 `import_plan_bundle`。
- 改：workspace 创建时自动建一个默认 active plan，或文档写清启动顺序。
- 状态：已确认已有覆盖。`/api/beta/workspaces` 创建 workspace 时会写默认 active Starter Plan。

### A4〔P2〕"收到但没存"的字段
- `update_task_status` 的 `note`、`create_inbox_item` 的 `source` 接收后静默丢弃（schema 不支持）。
- 改：补 schema 落库，或从接口删掉避免误导。
- 状态：已完成。`note` 进入 changelog details，`source` 支持 `manual|imported`。

### A5〔P1〕加事务回归测试
- 刚修的 neon-http 不支持事务 bug（已由 `9fecb3d` 修复）应有测试兜底。
- 改：加集成测试，对"当前 DATABASE_URL 实际选中的 driver"跑一次最小事务写，CI 挡回归。
- 状态：已完成 gated 集成测试；默认不跑真实库，需显式设置 `RUN_DATABASE_INTEGRATION=1`。

---

## B. 约束 / 时间块

### B1〔P0〕`/constraints` UI 不能加 routine / recovery
- 现状：`constraints-view.tsx:9` `EditableKind = "course" | "meeting" | "unavailable"`，表单只能加这三种。**家务、运动（routine）、recovery 在 UI 里加不了**，只能走 timetable 导入。
- 后果：用户想自己加"运动时间""家务""每周 recovery"无入口。
- 改：把 `routine` / `recovery` 加进 `EditableKind` + 表单（含 recurrence、weekday 多选）。可考虑给 `routine` 加细分标签（学习/工作/家务/运动）方便战线统计。
- 注：数据层已支持全部 5 种 kind（course/meeting/unavailable/routine/recovery），实测 course+routine 均可落库，纯前端缺口。
- 状态：API/service 数据层已确认支持 `routine|recovery`；前端表单已支持这两类。

### B2〔P2〕routine 多日重复输入繁琐
- 现状：导入时"周一到周六同一时段"要拆 6 行（每行一个 weekday）。
- 改：UI / 导入支持 weekday 多选 + 单条 recurrence，落库时展开。

---

## C. 前端 UI

### C1〔P0〕Month 视图是空壳
- 现状：`month-view.tsx` 仅 10 行，只有标题占位，无任何内容；`get_month` 也注明"no full month planner contract"。
- 后果：用户跑 4 个月计划、有月度 milestone，月视图完全空白。
- 改：做月度视图——按周/按 track 的任务分布、月度 milestone 进度、baseline vs current 对比（占位文案已暗示要做这些）。
- 状态：数据层已有 `getMonthPlanData` 真实数据；Plan 月视图已接入月度指标、目标、milestones 和每周分布。

### C2〔P1〕缺时间轴 / 日历网格
- 现状：week = 容量条，today = 任务列表（把固定安排压成一个总分钟数 `fixedMinutes`），全工具没有"一天/一周的时段排布"可视化。
- 后果：用户看不到 5-7 学习、9-12、13-18 工作、家务、运动、课程长在哪；想要的"课程表/日程表"没有载体。
- 改：加一个 day/week 时间轴视图，把 routine/course/recovery 时间块 + 当天任务按时段画在网格上（只读即可，不必拖拽，符合现有边界）。
- 状态：数据层已新增 `timelineItems`；Plan 日视图已按起止时间渲染时间轴。

### C3〔P2〕today "卡住"状态不持久化
- 现状：`today-view.tsx` `blocked` 只在前端 state，不 PATCH 落库，刷新即丢。
- 改：要么持久化一个 `blocked`/`stuck` 标记，要么明确它是临时态并在 UI 注明。
- 状态：数据层已加 `tasks.blocked` + `PATCH /api/tasks` 支持，并已在 `TodayTaskView` 透出；Today UI 初始态和 PATCH 接线仍待 Claude。

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
- 状态：后端撞名已自动加 ` 2` 后缀；登录/创建流程已补无密码找回文案。真正 recovery 机制仍是远期。

## D. 任务 reschedule（回答"往前排"）
- 现状：**已支持**。`patch-schema.ts` 的 `propose_patch` 含 `move_task`（任意日期，往前往后皆可）、`defer_task`、`change_priority`、`split_task`、`move_to_backlog`；走 `/review`(`reschedule-preview.tsx`) 逐条确认，apply 前重查任务状态 + 冲突（乐观并发，`patch-apply.ts`）。
- 缺的是入口顺手度：
  - 〔P2〕在 today/week 任务卡上加"往前挪/往后挪"快捷操作，直接生成一条 move_task 草稿进 /review（现在只能靠 agent 对话发起）。Claude 已用直接编辑（E 接口）实现了「改期」tab，本项可降级或取消。

---

## 本轮后续范围与状态

> 原始分工：Codex 做后端/data/API/schema/test；Claude 做 UI。当前本地收尾已经包含 Claude 的 C1/C2/B1 前端改动，Codex 只补了 C3 的 `TodayTaskView.blocked` 数据字段并负责 commit/deploy。

### 纯后端项（独立提交，互不混）
1. **A5** 真实 `DATABASE_URL` driver 的最小事务写集成测试（回归防护）——已完成，默认 gated。
2. **A1** OAuth refresh_token：发 refresh_token + 加 `refresh_token` grant + token endpoint 支持续期 + metadata 声明——已完成。
3. **G** 邀请加固：工作区名撞名自动加后缀 / 放宽唯一性；/login + 创建流程文案讲清无密码找回（或加 recovery）——撞名和文案已完成，recovery 机制未做。
4. **A3** 空 workspace 自动建默认 active plan——已确认已有覆盖。
5. **A4** `update_task_status.note` / `create_inbox_item.source` 补 schema 落库，或从 API 删字段——已完成。
6. 确认点：`createDailyCheckin` 的 `(workspace_id,date)` 唯一索引是否存在；`recordHostedMcpUsage` 把失败记成成功的口径——已完成并补测试。

### 数据/UI 准备
7. **C1 数据/UI**：`getMonthPlanData`（`src/lib/planning/view-data.ts`）返回真实月度数据，Plan 月视图已接入。
8. **C2 数据/UI**：day/week view-data 暴露带 **起止时间** 的时间块（routine/course/recovery）+ 当天任务，Plan 日视图已接入。
9. **B1 数据/UI**：`POST /api/constraints` 接受 `kind: routine | recovery`，Constraints 表单已接入。
10. **C3 数据**：tasks 加一个可持久化的 `blocked`/`stuck` 字段（schema + migration + PATCH 支持）并透出 `TodayTaskView.blocked`；Today UI 接线待 Claude。

### 交接顺序
- Codex 后端/data 侧已完成并验证，待 push + 部署。
- 部署后告诉 Claude「C3 的 `TodayTaskView.blocked` 已好了」，Claude 只需接 today 卡住初始态和 PATCH。
