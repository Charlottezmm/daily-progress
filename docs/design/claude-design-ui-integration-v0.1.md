# Claude Design UI Integration Spec v0.1

## 1. 目标

把 Claude Design zip 的审查结论和 2026-06-08 agent-first 方向转成项目内可执行的 UI 集成规则。本文只约束后续 Codex 实现，不要求现在改 `src`。

完成标准：

- 后续实现只建一套响应式 Next 组件。
- 页面优先级、移动端行为、颜色 token、MVP 验收项清楚。
- UI 收敛为 Today / Plan / Review / More，不再沿用复杂 planner 导航。
- 不把 zip 里的 `app/` 和 `pwa/` 原型直接搬进项目。

## 2. 采用什么

采用这些设计方向：

- 页面结构：Today、Plan、Review、More。
- 信息架构：agent-first execution console；PWA 只做 check、收工反馈、patch 确认。
- Quick Capture：降级为轻量捕捉入口，不抢 Today 首屏主层级。
- Inbox 边界：不占 capacity，不参与 agent patch，只负责临时收纳和转化。
- Review：按 patch group 审查变更，用户逐条 accept/reject，确认前不写入计划。
- Protected block：routine/recovery 在 UI 上要明确不可被 agent 移动或缩短。
- 状态覆盖：empty、loading、populated、warning、error、saving、success、unauthorized。
- Codex/Cowork scheduled automation 负责定时唤起 agent；app 不设计 scheduler。

## 3. 不采用什么

不采用这些实现方式：

- 不把 zip 里的 `app/` 和 `pwa/` 当两套代码移植。
- 不新建两套桌面/手机页面树。
- 不把 Quick Capture 在手机端只放进 FAB。
- 不删除 mobile Inbox 的 `Convert to routine`。
- 不把 Review 做成聊天界面或“AI 已完成”的确认页。
- 不继续用大面积 linen/beige 作为主背景和主要 surface。
- 不新增与本次 UI 集成无关的模型 key、团队协作、公开分享、push notification 完整流程、app 内置 scheduler。

## 4. 页面改造优先级

P0：

- App Shell：统一 Today / Plan / Review / More 的信息架构。
- Today：3-7 个任务、完成/卡住/跳过/延后、收工反馈、agent 状态提示。
- Review：patch group、逐条 accept/reject、accept all、regenerate、apply 前摘要、protected block 证据。

P1：

- Plan：日 / 周 / 月 tabs，展示 agent 编排结果、容量、课程/routine/recovery 约束。
- More：Inbox、Calendar & Courses、Routines、Settings、Import、MCP Token。

P2：

- Inbox：mobile 和 desktop 都支持 promote to task、convert to routine、delete。
- Import / Settings：保持低频工具，不进入一级导航。

## 5. 响应式策略

只做一套组件，按 layout 容器和 viewport 切换展示密度。

桌面：

- 左侧 sidebar 常驻。
- 主内容使用单栏或主栏 + 右侧辅助栏。
- Quick Capture 使用紧凑入口，不抢占 Today 主层级。
- Inbox item 的三个动作可以直接展开。
- Review 可以使用宽表格式，展示 patch 证据和影响摘要。

Mobile web/PWA：

- 底部 tab 承载 Today、Plan、Review、More。
- More 进入 Inbox、Calendar & Courses、Routines、Import、Settings、MCP Token。
- Today 首屏优先展示 Agent 状态和今日任务；Quick Capture 只需有紧凑入口，不作为主输入区。
- Inbox item 动作可以折叠，但必须能完成 task/routine/delete 三种处理。
- Review patch item 使用纵向卡片，每张卡片必须展示 before/after、reason、impact、accept/reject。
- 收工反馈保存按钮不能被键盘遮住到不可操作。
- 所有横向数据在手机端改成纵向堆叠或可读的 compact summary，不做横向溢出。

## 6. 颜色与 token 调整

当前 zip 的 linen/beige 适合作为暖色参考，但不适合作为主视觉。后续 token 方向：

- `background`：使用中性浅灰或近白，不用大面积米色。
- `surface`：白色或极浅中性灰，保证任务、routine、recovery 区分靠结构和状态色，不靠整页暖色。
- `text`：高对比深灰，secondary text 使用稳定灰阶。
- `accent`：保留少量暖色用于 Quick Capture、pending patch、重点提示，但不能主导整页。
- `success`：用于 saved、accepted、recovery 达标。
- `danger`：用于 over capacity、解析失败、blocked patch、Inbox 超 10 条。
- `protected`：routine/recovery protected block 使用低饱和色块或边框，必须可识别但不抢主任务层级。

验收标准：截图快速扫一眼，页面不应读成单一 beige/linen 主题；Today 的任务、routine、recovery、warning、check-in 应能区分。

## 7. Review 信任证据

Review 的每个 patch item 至少显示：

- patch 类型：moved、split、defer、backlog、priority change、milestone suggestion、rejected/invalid。
- before/after：原日期/时段/容量位置和建议位置。
- reason：为什么建议改。
- impact：capacity、recovery、track 或 deadline 的影响。
- constraints：是否触碰 protected routine/recovery；如果触碰，显示 blocked。
- provenance：agent patch id、plan version 或来源任务标识，至少保留一个可追踪字段。

Apply 前必须显示汇总：

- accepted 数量。
- rejected 数量。
- pending 数量。
- 应用后受影响的日期或 segment。

## 8. MVP 页面验收清单

Today：

- Mobile 首屏能看到 Agent 状态和今日任务。
- 今日任务只有完成、卡住、跳过、延后这些轻操作。
- 收工反馈有完成、卡点、明日接三个输入和保存状态。
- warning 不遮挡主要任务。

Plan：

- 有日 / 周 / 月 tabs。
- 能看到每天容量状态。
- 能看到课程/routine/recovery 对容量的占用。
- Mobile 不横向溢出。

Inbox：

- Empty、少量 item、超过 10 条都有状态。
- Desktop 和 mobile 都能 promote to task、convert to routine、delete。
- Item action 不挤压标题到不可读。

Import：

- `plan.md` 和 `timetable.csv` preview 分开。
- 解析失败有明确错误。
- 确认前不写入。

Month：

- 能看 baseline 与执行版差异。
- 能看 deadline 和周分布。
- 不承担日历级精确排程。

More：

- 能进入 Inbox、Calendar & Courses、Routines、Settings、Import、MCP Token。
- 低频工具不抢 Today 主层级。

Review：

- 页面明确说明这是建议，不是自动改动。
- 每个 patch item 可单独 accept/reject。
- Accept all、Regenerate、Apply 都有清楚状态。
- Protected routine/recovery 的 blocked 证据可见。
- Apply 前有 accepted/rejected/pending 汇总。
