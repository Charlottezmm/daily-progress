# PawPlan MCP 写入面 Bug 报告（交 Codex 一次性修）

> 测试人：Claude（Cowork）｜日期：2026-06-13｜环境：线上 Vercel + Neon 生产库
> 连接方式：Claude Custom Connector（OAuth）已连通，workspaceId `511b7f4d-37b4-44f7-a66b-d3af972e03ce`，active planId `1d764896-aebe-4aef-8c5d-032b903fc2b2`
> 测试结论：**读全部正常；写按"是否走事务"分成两类——走事务的全挂，单条 insert 的正常。**

## 2026-06-14 同步状态

已完成并上线：
- Bug 1 主修复：生产 DB driver 已从 `neon-http` 切到 `neon-serverless` Pool，恢复 hosted MCP 事务写入。提交：`9fecb3d fix: restore hosted MCP transaction writes`。
- Vercel/`ws` 原生模块修复：已禁用 `bufferutil` native path，解决线上 `TypeError: t.mask is not a function` / 请求无响应问题。提交：`9498423 fix: disable ws native bufferutil in hosted db client`。
- Bug 2 最小修复：`day_of_week` 已改为单天 enum 契约，多天仍按“拆多行”处理。

仍待处理：
- A5 集成测试：仍缺对当前 `DATABASE_URL` 实际 driver 的最小事务写回归测试。
- 本报告里的 OAuth refresh、邀请流程加固等非本次阻断项，继续按改进清单拆分处理。

---

## Bug 1 ★阻断性★ — 生产库用 neon-http driver，不支持事务，所有 `db.transaction()` 写操作全挂

### 根因
`src/lib/db/client.ts` 中，非 localhost（即生产 Neon）走 `drizzle-orm/neon-http`：

```ts
const sql = neon(databaseUrl);
cachedDb = drizzleNeon(sql, { schema });
```

`neon-http` driver **不支持交互式事务** `db.transaction(async (tx) => …)`，调用即抛
`No transactions support in neon-http driver`。

### 线上实测证据
| 工具 | 走事务？ | 结果 |
|---|---|---|
| `get_today` / `get_week` / `get_tasks` 等所有 read | 否 | ✓ 正常 |
| `create_inbox_item` | 是 | ✗ `No transactions support in neon-http driver` |
| `import_plan_bundle` | 是 | ✗ 同上 |
| `propose_timetable_import`（day_of_week 合法时）| 否（单条 insert agentPatch）| ✓ 建 draft 成功 |

→ 证明：**问题不是某个工具，是 driver 层。凡是事务都挂，单条 insert 不挂。**

### 受影响的全部事务点（11 处 / 8 文件）——修 driver 后一并恢复
- `src/lib/mcp/plan-import.ts:218` — `saveMcpPlanImport`（import_plan_bundle）
- `src/lib/planning/service.ts:101` — `updateTaskStatus`（update_task_status）
- `src/lib/planning/service.ts:136` — `createDailyCheckin`（create_checkin）
- `src/lib/planning/service.ts:197` — `createInboxItem`（create_inbox_item，mcp 分支）
- `src/lib/planning/service.ts:228` — `processInboxItem`（app 内 inbox 处理）
- `src/lib/mcp/conversation-tools.ts:56` — `saveConversationSummary`（save_conversation_summary）
- `src/lib/mcp/conversation-tools.ts:88` — `recordDecision`（record_decision）
- `src/lib/planning/patch-apply.ts:294` — `/review` 里 apply patch
- `src/lib/imports/timetable-save.ts:256` — `/review` 里 apply 时间表导入
- `src/lib/imports/plan-save.ts:98` — `/review` 里 apply 计划导入
- `src/lib/constraints/service.ts:175,235` — 约束写入
- `src/lib/templates/import.ts:89` — 模板导入

**连带后果**：`propose_*` 能建 draft，但用户去 `/review` 点 **apply 时仍然挂**（apply 走 `patch-apply.ts` / `timetable-save.ts` 事务）。所以"agent 提议 → 用户在 /review 确认"这条产品核心链路在线上**完全断**。

### 推荐修法（改 1 个文件即可全恢复）
把生产分支从 `neon-http` 换成 `neon-serverless`（WebSocket Pool，支持事务）。

```ts
// src/lib/db/client.ts
import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { drizzle as drizzleNeonServerless } from "drizzle-orm/neon-serverless";
import { drizzle as drizzleNodePostgres } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import ws from "ws";                         // 新增依赖
import * as schema from "./schema";

// Node < 22 没有全局 WebSocket；显式注入以保证 Vercel 任意 Node 版本都可用
neonConfig.webSocketConstructor = ws;

// …isLocalDatabaseUrl 的 localhost 分支保持 node-postgres 不变…

// 生产分支改为：
const pool = new NeonPool({ connectionString: databaseUrl });
cachedDb = drizzleNeonServerless(pool, { schema });
```

- 需新增依赖：`npm i ws` + `npm i -D @types/ws`
- `@neondatabase/serverless` 已在 deps 里，`drizzle-orm/neon-serverless` 已存在（`node_modules/drizzle-orm/neon-serverless/` 已确认）
- 备选方案（不引 ws）：生产也用 `pg` node-postgres Pool 连 Neon `-pooler` 端点。支持事务但 serverless 冷启动更慢、有连接耗尽风险，不如 serverless driver。
- **回归防护**：加一个集成测试，对"当前 DATABASE_URL 实际选中的 driver"跑一次最小事务写，CI 里挡住这类回归。

---

## Bug 2 — `propose_timetable_import` 的 `day_of_week` 只认单个星期，schema 没约束、范围/中文直接抛错

### 现象
传 `day_of_week: "Mon-Sat"` / `"每天"` / `"Sat"`（大写）→ `Invalid day_of_week`。
传 `"mon"` → 正常。

### 根因
- MCP 入参 schema（`src/lib/mcp/timetable-import.ts:23`）只校验 `z.string().max(20)`，不限内容——**对 agent 没有任何提示**。
- 落库归一化（`src/lib/imports/timetable-save.ts:82` `normalizeWeekday` + 第 15 行 `weekdayNumbers`）只接受单个：`sun/mon/tue/wed/thu/fri/sat` 或全称小写，否则抛 `Invalid day_of_week`。
- 且每行只支持**一个** weekday（`timetable-save.ts:104` "day_of_week is required for multi-day timetable ranges"），无法用一行表达"周一到周六"。

### 影响
agent 要导"每天 5-7 学习"这种重复时段，必须**拆成 6 行**（mon…sat），否则报错。schema 不报信，错误只在 propose 时才暴露，体验差。

### 推荐修法（二选一）
1. **收紧 schema + 在 tool description 写清**：把 `day_of_week` 改成 enum（`mon|tue|…|sun`，可选 `null`），description 注明"单个星期，多天请拆多行"。让 agent 一次就传对。
2. **放宽归一化**：`normalizeWeekday` 支持范围（`mon-sat`）和列表（`mon,wed,fri`）、大小写、常见中文（周一/周日），在 materialize 时展开成多行。更省 agent 事，但实现量大。

建议至少做 1（低成本、立刻消除踩坑）。

---

## 非 bug 但建议确认的点

- `createDailyCheckin`（`service.ts:136`）用 `onConflictDoUpdate({ target: [checkins.workspaceId, checkins.date] })`，依赖 `(workspace_id, date)` 上有唯一约束。请确认 migration 里建了该唯一索引，否则修完事务后 create_checkin 仍会抛 conflict 错。
- 路由 `src/app/api/mcp/route.ts`：JSON-RPC 工具内部抛错时 transport 往往返回 HTTP 200（错误在 body 里），`recordHostedMcpUsage` 的 `success: response.status < 400` 可能把失败记成成功。修完事务后建议复核 usage 计数口径。

---

## 修完后的验收清单（线上重新部署后跑）
1. `import_plan_bundle` 写入一个最小 bundle → 应成功、`get_today`/`get_week` 能读到任务。
2. `create_inbox_item` / `create_checkin` / `update_task_status` / `record_decision` / `save_conversation_summary` 各跑一次 → 全成功。
3. `propose_timetable_import` 建 draft → 去 `/review` 点 **apply** → 应成功写入 timeBlocks（验证 apply 事务路径已恢复）。
4. 清理本次测试残留：`/review` 里丢弃 patchId `ec5c4613-3557-4eb0-96bc-93f6b7ce28f5`（`__bugtest__` 时间块草稿）。

---

## 当前未做（等修好 + 重新部署后由 Claude 接着做）
- 把 Week 3（6/15-6/21）计划 + 每日时间结构正式 import 进工具（已草拟好，见会话记录）。
- 改造每日 scheduled task：从 cat markdown → 通过 MCP 读 get_today/get_week → review 任务 → 给时间线调整建议。
- 把 `june-2026.md` 标 archived，正式切到工具内 Daily Check-in。
