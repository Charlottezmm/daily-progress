# Claude Design 中文设计 Brief v0.1

## 1. 项目定位

这是一个 agent-first 的 MCP-native planning app。它不是传统 todo app，也不是手动日历规划工具。

核心分工：

- Agent 负责拆计划、排日期、顺延任务、生成调整建议。
- PWA 只负责人类操作：今日 check、收工反馈、确认 Agent patch。
- Postgres 是真实数据源。
- MCP server 给 Codex/Cowork/Claude 读取和写入结构化数据。
- Codex/Cowork scheduled automation 负责定时唤起 Agent。App 不设计自己的 scheduler UI，不实现浏览器后台定时器，也不实现 server cron。

这次设计只需要一个最简单的静态视觉参考。不要写复杂 JSX，不要做完整交互，不要设计数据模型，不要设计 AI chat。

## 2. 输出要求

请输出一个单 HTML 文件即可：

- CSS 写在 `<style>` 标签里。
- 可以有极少量 JS 用于 tab 切换演示，但不需要真实功能。
- 不需要 React、不需要 shadcn、不需要复杂组件结构。
- 重点是视觉层级、布局、按钮形态、状态呈现、移动端可用性。

Codex 后续会把视觉参考拆成真实 Next.js 组件并接 Postgres 数据。

## 3. 全局导航

导航只保留四个入口：

- Today
- Plan
- Review
- More

移动端优先。手机端建议底部 tab；桌面端可以使用左侧窄导航或居中 app shell，但不要做复杂后台系统。

不要再把 Week、Month、Inbox、Import、Settings、Reschedule 全部作为一级导航。

## 4. 页面 1：Today

目标：用户 30 秒内完成今日执行反馈。

Today 不是手动 planner。它只回答三个问题：

- 今天 Agent 给我安排了什么？
- 我完成了哪些、卡住哪些、要延后哪些？
- 今天收工时要给 Agent 留什么事实反馈？

页面内容：

- 顶部显示日期和 Agent 状态，例如：`Agent 已为你安排 5 个任务`。
- 今日任务列表，建议 3-7 个。
- 每个任务只显示最少信息：
  - 标题
  - 预计时间
  - 所属项目 / 课程 / track
  - 当前状态
- 每个任务只需要这些操作：
  - 完成
  - 卡住
  - 跳过
  - 延后
- 页面底部固定或接近底部显示“收工反馈”。

收工反馈字段：

- 完成：今天实际完成了什么。
- 卡点：今天卡在哪里。
- 明日接：明天必须从哪里继续。

保存后显示轻反馈，例如：

- `已记录，Agent 下次审核会参考。`
- `有 2 个未完成任务待 Review。`

Today 不要设计：

- 手动拖拽排期。
- 复杂日历。
- 大面积 routine/recovery 卡片。
- 复杂 Quick Capture 顶部输入区。

Routine、课程、recovery 可以作为轻量状态条出现，例如：

- `今天固定日程占用 3h`
- `本周 recovery 不足，Agent 重排时会保护休息块`

## 5. 页面 2：Plan

目标：展示日 / 周 / 月计划，不作为主要编辑页面。

Plan 顶部有三个 tab：

- 日
- 周
- 月

日视图：

- 展示今天任务分布。
- 展示固定课程 / routine / unavailable time 对容量的影响。
- 不需要精确 calendar 拖拽。

周视图：

- 展示本周重点。
- 展示课程占用、routine 占用、recovery 状态。
- 展示本周是否过载。

月视图：

- 展示本月目标。
- 展示每周拆分。
- 展示 deadline 或重要节点。

Plan 是“Agent 编排结果展示”，不是用户每天手动调整日期的地方。

## 6. 页面 3：Review

目标：确认 Agent 自动重排建议。

Review 是整个产品的信任核心。这里展示 Codex/Cowork automation 或用户手动请求 Agent 后写回的 patch preview。

每条建议示例：

- `把「写 PRD」从今天顺延到明天上午`
- `把「课程复习」拆成两个 45min`
- `因为周三有课，把「硬件学习」移到周四`
- `保留周六 recovery，不允许继续塞任务`

每条建议至少显示：

- 改了什么。
- 为什么改。
- before / after。
- 对容量、课程、routine、recovery 的影响。
- 接受 / 拒绝。

页面底部或顶部需要有：

- 接受全部
- 重新生成
- 稍后处理

必须明确表达：这是建议，不是已经自动改库。用户确认后才 apply。

不要把 Review 做成聊天界面。

## 7. 页面 4：More

More 是低频工具入口，简单列表即可：

- Inbox
- Calendar & Courses
- Routines
- Settings
- Import
- MCP Token

Calendar & Courses 是约束层，不是主入口。它可以包含：

- 课程
- 固定日程
- 不可用时间
- routine，例如打扫卫生、做饭、洗澡、运动、通勤
- recovery block

Routine 需要能表达两种类型：

- 固定 routine：固定时间，不允许 Agent 移动。
- 弹性 routine：占用容量，但 Agent 可以建议安排到合适时间。

## 8. 视觉风格

风格关键词：

- 极简
- 清楚
- 轻量
- 执行控制台
- 不像复杂 todo app
- 不像项目管理 SaaS 后台

要求：

- mobile-first。
- 桌面端也能舒适居中或轻量扩展。
- 不要 landing page。
- 不要 hero。
- 不要大面积装饰。
- 不要复杂动画。
- 不要大面积米色 / beige / linen。
- 不要一眼看起来像传统 calendar。
- 按钮和状态要清楚，尤其是完成 / 卡住 / 跳过 / 延后。

## 9. 必须设计的状态

Today：

- 无任务。
- 有 3-7 个任务。
- 任务完成 / 卡住 / 跳过 / 延后。
- 收工反馈未填 / 已保存 / 保存失败。
- 有未完成任务待 Agent 审核。

Plan：

- 日 / 周 / 月 tab。
- 有课程或 routine 占用。
- 本周过载。
- recovery 不足。

Review：

- 无建议。
- 有待确认建议。
- 单条接受 / 拒绝。
- 接受全部。
- patch 被保护规则阻止。

More：

- 简单工具列表即可。

## 10. 不要设计

不要设计：

- AI chat UI。
- API key 设置。
- app 内置 scheduler。
- PWA push notification 完整流程。
- 团队协作。
- 公开分享页。
- 复杂日历拖拽。
- 完整 task 创建后台。
- 两套 desktop/mobile 代码结构。
