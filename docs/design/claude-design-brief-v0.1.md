# Claude Design 中文设计 Brief v0.1

## 1. 项目定位

这是一个面向个人使用的 MCP-native planning app。它不是传统 project management 工具，也不是日历替代品的第一版。它的父结构是时间和日程管理：项目、课程、标签、track 都只是用来解释“时间被什么占用”的分类维度。

当前页面是低保真工程页面，只用于固定信息架构、核心入口、页面状态和数据边界。Claude Design 的任务是基于这些页面做视觉设计、布局层级、组件状态和移动端体验，不要重新定义产品范围。

## 2. 设计目标

这套 UI 应该让用户每天快速完成三件事：

1. 看今天应该做什么，以及哪些时间已经被 routine、课程、recovery 占掉。
2. 用最低摩擦记录完成情况、卡点和明天接什么。
3. 让外部 agent 通过 MCP 提出重排建议后，用户能清楚预览、选择、确认或拒绝 patch。

核心感受：清晰、安静、可重复使用、适合每天打开多次。不要做营销 landing page，不要 hero，不要大面积装饰图，不要把它设计成项目管理 SaaS 首页。

## 3. 全局结构

### App Shell

全局需要有稳定导航。桌面端可以是左侧 sidebar，移动端可以是底部 tab 或紧凑顶部导航。Today 和 Week 是主入口，Month、Inbox、Import、Settings、Reschedule Preview 是辅助入口。

所有主页面顶部都要有 `+ Quick Capture`。这是低摩擦 inbox 入口，不属于某个页面，而是全局捕捉入口。用户想到一件事时，可以 1 秒丢进去，不需要决定它是不是 task、routine 或课程相关事项。

### 全局 Quick Capture

功能：

- 输入一行 title。
- Add 后进入 Inbox。
- 不占 capacity。
- 不进入 AI/agent 重排。
- 不要求用户立即分类。

需要设计状态：

- empty input。
- typing。
- submitting。
- success feedback。
- failed feedback。
- mobile 下按钮和输入框不能挤压变形。

## 4. 页面清单

### 4.1 Today

Today 是第一优先级页面，也是用户每天最常打开的页面。

页面应该包含：

- 今日 warnings：例如 inbox 堆积、昨天没 check-in、本周 recovery 不足。
- 今日 tasks：按 morning / afternoon / evening 分组，显示任务标题、项目/课程/track、预计分钟、优先级、energy。
- Routines：家务、做饭、运动、通勤等重复非 task 活动，和 tasks 分开显示。
- Recovery：当天或本周已经锁定的休息/游戏/off block，视觉上要像“保护块”，不是待办。
- Daily Check-in：固定在页面底部或底部附近，永远容易看到。

Daily Check-in 卡片固定 3 个输入框：

- 完成
- 卡点
- 明日接

还有一个 Save 按钮。不要让用户选日期，默认就是今天。不要把 check-in 设计成复杂表单，不需要打开子页面。保存后显示轻反馈，例如“记下了。已 N 天连续打卡”。

Today 需要设计状态：

- 无任务。
- 有任务但无 warning。
- 有 warning。
- routine 已完成/未完成。
- check-in 未填写/已保存/保存失败。
- agent patch pending 时的入口提示。

### 4.2 Week

Week 是第二优先级页面，用来看一周的容量、战线平衡和 recovery 红线。

页面应该包含：

- 一周时间概览：可以按天展示，也可以用 compact timeline。
- Track Balance：展示 main / work / side / recovery / custom 的本周占用。
- Recovery target：展示本周 recovery 已排多少小时、目标多少小时。
- 容量提示：哪些天过载，哪些天还可承接延期任务。
- Check-in history surface：不需要单独历史页，但 Week 里应能看到最近 check-in 摘要。

Week 不是甘特图，也不是完整 calendar。重点是帮助用户判断“这周是否还塞得下”和“哪条战线被侵蚀”。

需要设计状态：

- recovery 达标。
- recovery 不足。
- track 失衡。
- 某天 capacity 超载。
- 本周没有 check-in 记录。

### 4.3 Month

Month 用于查看更长周期的计划分布，不是每天精确排程的地方。

页面应该包含：

- 月度目标或 baseline plan 摘要。
- 当前执行版和 baseline 的差异提示。
- 每周分布概览。
- 重要 deadline。
- 导入计划后的 preview/确认入口可以从这里链接到 Import 或 Reschedule Preview。

Month 的重点是宏观视角：这个月的任务有没有压到某几周，计划是否偏离原始 baseline。

### 4.4 Inbox

Inbox 是临时缓冲池，处理琐事和还没有分类的想法。

每个 inbox item 需要有三个主要动作：

- Promote to task：转成 task。
- Convert to routine：转成 routine。
- Delete：删除。

Inbox 不参与计划、不占 capacity、不参与 agent patch。它只是防止琐事污染今日计划。

需要设计状态：

- 空 inbox。
- 少量 item。
- 超过 10 条时的红色/高优先级提示。
- item hover/action 状态。
- mobile 下 item 操作不要太拥挤。

### 4.5 Import

Import 页面用于导入两个核心输入：

- `plan.md`
- `timetable.csv`

导入不是直接写库，而是先 preview，再确认。

`plan.md` preview 应显示：

- goal。
- projects。
- deadlines。
- constraints。

`timetable.csv` preview 应显示：

- title。
- kind：course / meeting / unavailable / routine / recovery。
- day of week。
- start/end time。
- date range。
- recurrence。
- course。

需要设计状态：

- 上传/粘贴输入。
- 解析成功 preview。
- 解析失败，指出错误。
- preview 待确认。
- 确认保存后的反馈。

第一版不做 PDF、图片、截图、任意 HTML 解析。

### 4.6 Settings

Settings 是工作区和规则设置，不是高频页面。

需要包含：

- Workspace password。
- MCP token 管理入口：生成、复制一次、撤销、权限 read-only/read-write。
- Routines 管理。
- Recovery weekly target。
- Segment energy 默认值：morning / afternoon / evening。
- Track thresholds。
- Import/export。
- Hosted limits 提示。

Settings 的信息密度可以比 Today 更高，但要分组清晰，不要做成一长串无结构表单。

### 4.7 Reschedule Preview

Reschedule Preview 是 agent patch 的审批页面。它是信任系统的核心，不能设计得像“AI 已经帮你改好了”。

页面应该表达：

- 这是建议，不是自动改动。
- 用户可以接受全部。
- 用户可以取消某些 patch item。
- 用户可以拒绝全部。
- routine/recovery 是 protected block，不允许被移动或缩短。

Patch group 类型：

- moved：任务从某天/某时段移到另一处。
- split：任务拆成多个小任务。
- defer：延期到某天或下周。
- backlog：移入 backlog。
- priority change：优先级变化。
- milestone suggestion：里程碑文字建议。
- rejected/invalid：违反约束的 patch。

每个 patch item 至少要显示：

- 改了什么。
- 从哪里到哪里。
- reason。
- 对 capacity / recovery / track 的影响，如果有。
- accept/reject 控制。

不要把 patch 设计成聊天气泡。这个页面更像变更审查/差异预览。

## 5. 移动端要求

这个产品会被当作 PWA 使用，手机端不是附属版本。

移动端需要特别处理：

- Today 首屏能看到 Quick Capture、Today 标题、至少一部分 tasks 或 check-in。
- Daily Check-in 输入不能被键盘遮住到无法保存。
- Week 的 track/recovery 信息要能快速扫读，不要横向溢出。
- Reschedule Preview 的 patch item 要能逐条处理。
- 导航要适合单手使用。

## 6. 组件状态要求

每个主要页面至少要设计这些状态：

- Empty。
- Loading。
- Populated。
- Warning。
- Error。
- Saving/submitting。
- Saved/success。
- Unauthorized / needs workspace login。

不要只交付静态 populated 状态，否则 Codex 后续实现时会缺少失败和空状态依据。

## 7. 明确不要设计的内容

不要设计：

- 营销 landing page。
- 原生 iOS app。
- App Store / TestFlight 流程。
- Chat UI。
- 模型 API key 设置页。
- 复杂团队协作。
- 公开分享页面。
- 日历级精确拖拽排程。
- PWA push notification 的完整流程。

PWA push 可以作为未来功能提到，但 v0.1 只需要设计 Today 内的 check-in 卡片和 warning 状态。

## 8. 交付物

请输出：

- Desktop layout。
- Mobile layout。
- Today / Week / Month / Inbox / Import / Settings / Reschedule Preview 全页面设计。
- 每页 empty/loading/warning/error/populated 状态。
- Daily Check-in 组件状态。
- Quick Capture 组件状态。
- Agent patch group 的视觉处理。
- 基础组件清单：button、input、textarea、select、tabs、badge、warning bar、toast、modal/drawer、list item。

视觉风格、颜色、字体、品牌感可以由 Charlotte 和 Claude Design 单独讨论决定。这里不强行指定视觉人格，只要求它必须服务于 schedule-first、低摩擦、日常重复使用的产品目标。
