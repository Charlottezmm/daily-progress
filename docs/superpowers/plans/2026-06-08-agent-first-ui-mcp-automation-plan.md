# Agent-first UI + MCP Automation Implementation Plan

日期：2026-06-08
状态：待执行

## 1. 目标

把当前 Next.js + Postgres foundation 从“低保真 planner 页面”改成 agent-first 的 PWA 控制台。

核心目标：

- PWA 只做今日 check、收工反馈、patch preview 确认。
- Postgres 继续作为唯一真实数据源。
- MCP server 暴露 agent 需要的读写工具。
- Codex/Cowork scheduled automation 负责定时唤起 agent，不在 app 内实现 scheduler。
- UI 导航收敛为 Today / Plan / Review / More。

## 2. 非目标

本阶段不做：

- app 内置 server cron。
- 浏览器 timer 或 PWA 后台自动重排。
- AI chat UI。
- 模型 API key 设置。
- 团队协作。
- 公开分享页。
- 复杂日历拖拽。
- 原生 iOS。

## 3. 第一阶段：UI 信息架构收敛

改造页面：

- Today：今日任务 check、blocked、skip、defer、收工反馈、agent 状态提示。
- Plan：日 / 周 / 月 tabs，只展示 agent 编排结果和容量状态。
- Review：展示 MCP `propose_patch` 写回的 patch preview，用户逐条 accept/reject。
- More：Inbox、Calendar & Courses、Routines、Settings、Import、MCP Token。

保留现有数据接口，优先改信息层级和路由/导航。不要先做视觉精修，等 Claude Design 静态稿回交后再套视觉。

## 4. 第二阶段：MCP 工具最小闭环

先实现 agent 排程需要的最小工具：

读：

```txt
get_current_plan(scope: today | week | month)
get_today_tasks()
get_recent_checkins(days)
get_routines(weekday)
get_track_balance(week)
get_inbox(filter)
```

写：

```txt
update_task_status(task_id, status, note)
create_checkin(date, completed_text, blocker_text, next_text)
create_inbox_item(title, source)
propose_patch(operations)
```

`propose_patch` 只写 preview，不 apply。

## 5. 第三阶段：Codex/Cowork Automation 示例

提供三条 automation prompt 模板：

- 晚间审核：读取今天状态和收工反馈，生成明天计划和 rollover patch。
- 早晨确认：读取今天固定约束，确认今天 3-7 个任务。
- 周复盘：读取本周 check-in、track balance、recovery target，生成下周调整建议。

这些模板只描述 agent 要做什么，不包含 app 内定时逻辑。定时触发由 Codex/Cowork automation 配置。

## 6. 第四阶段：Review apply transaction

实现用户确认后的 patch apply：

- 逐条 accept/reject。
- accept all。
- regenerate 只回到 agent，不在 app 内生成。
- apply 时服务端 transaction 更新 task/date/segment/status。
- 写入 plan version 和 change log。
- 拒绝违反 routine/recovery/fixed time block 的 patch。

## 7. 验证计划

自动验证：

```bash
npm run test
npm run build
npm run test:e2e
```

手动验证：

- 创建 workspace 并登录。
- Today 能显示 3-7 个任务和收工反馈。
- 标记 task 完成 / 卡住 / 跳过 / 延后。
- 保存收工反馈后刷新仍存在。
- 模拟 MCP `propose_patch` 后 Review 出现 patch preview。
- 接受部分 patch 后确认 change log 和 plan version。
- Plan 的日 / 周 / 月视图能读到更新后的数据。

## 8. 执行顺序

1. 等 Claude Design 返回静态 HTML/CSS 视觉参考。
2. Codex 拆分视觉参考到真实 Next.js 组件。
3. 先改 Today / Review，再改 Plan / More。
4. 补 MCP 最小工具。
5. 补 scheduled automation prompt 模板。
6. 补 patch apply transaction。
7. 跑完整验证后提交。

