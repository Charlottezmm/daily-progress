# PawPlan 强化收尾记录 · 2026-06-14

> 记录人：Claude（Cowork）+ Codex 协作 ｜ 生产域名：https://pawplan.charlottezmm.info
> 起点：MCP 连接后所有写操作失败 → 终点：全功能可用、线上冒烟通过。

## 一、修的两个阻断 Bug
- **Bug 1 事务全挂**：生产 DB driver 从 `neon-http`（不支持事务）换到 `neon-serverless` Pool，恢复全部 11 处事务写。提交 `9fecb3d`；附带 `ws` bufferutil 修复 `9498423`（解决线上无响应）。
- **Bug 2 day_of_week**：MCP timetable 入参改为单天 enum 契约。

## 二、本轮功能（按 Claude / Codex 分工）

### Claude（前端，全部上线）
- **E 改期**：Plan 新增「改期」tab，未来任务可直接改日期/时段、往前往后挪一天，直接 PATCH 不经 Review。`d0ef218`
- **F 登出**：More 页「账户 → 退出登录」（换工作区也走这里）。
- **C1 Month 视图**：从空壳 → 完成度统计 + 月度目标/milestones + 每周任务分布。`584d41f`
- **C2 时间轴**：Plan「日」用带真实起止时间的 timeline 展示学习/工作/家务/运动/recovery。`584d41f`
- **B1 约束表单**：`/constraints` 类型下拉加 routine（日常事项）/ recovery，不必再绕 Settings。`584d41f`
- **C3 卡住持久化**：Today「卡住」状态写库 + 刷新读回。`e912c4c`

### Codex（后端 / 数据层，全部上线）
- E 接口：`PATCH /api/tasks` 接受 `date/daySegment/blocked`，直接写 + manual changelog。`761dea4`
- 数据层铺路：`MonthViewData` 月度数据、`timelineItems`、`TodayTaskView.blocked`、`POST /api/constraints` 收 routine/recovery。`4bb622b`
- A1 OAuth：connector 支持 refresh_token grant + 轮换 access/refresh token。
- G 邀请加固：工作区撞名自动加后缀；login 文案讲清「无密码找回」。
- usage 口径：MCP 路由按 JSON-RPC body 是否有 error 判定 success，不再把报错的 200 记成成功。`b7690e9`
- A5：加真实 DB 事务集成 smoke（`RUN_DATABASE_INTEGRATION=1`）。

## 三、线上冒烟验证（2026-06-14）
- 读：get_today / get_week 正常。
- 事务写：update_task_status done→todo 成功（事务 bug 已彻底修复，新部署无回归）。
- 改期：SolidWorks 任务实测往前挪一天成功。
- C3：任务返回 `blocked` 字段。
- OAuth：token 轮换后重连恢复，refresh_token 链路过第一次真实考验。
- `npm test` 203 passed / build 通过 / Vercel READY。

## 四、运营系统现状
- 计划已在工具内（Week 3 6/15-6/21 + 周日 6/14 轻量上手）。
- 每日 5:02 scheduled task `may-30day-morning-briefing` 已改为通过 MCP 读 get_today/get_week → review → 给时间线建议。
- `june-2026.md` 已归档，正式切到工具内 Daily Check-in。
- 时间结构 timetable 草稿待在 /review apply（学习 5-12 / 工作 13-18 / 周末 recovery）。

## 五、剩余（非阻断，按需）
- 真多工作区一键切换（当前用登出→登录）。
- 无密码找回机制（当前仅文案提示）。
- in-app chat（产品边界暂不做，靠 Cowork 驱动）。

## 推荐使用节奏
早 5:02 看简报 → 白天勾任务 → 晚 21:30 回简报归档 check-in → 周日说「weekly review」→ 要重排用「改期」或让 Claude propose 进 /review。
