# 固定安排改用真 recurrence（交 Codex）

> 目标：固定时段（学习/工作/recovery 等）从「按日期materialize成一堆具体块」改为「存 1 条重复规则，读时按需展开」。
> 现状问题：导 6/15-6/30 半个月 → 5 个时段被铺成 **44 个 time_blocks**。范围越长块越多，库里冗余、摘要要靠折叠还原。

## 现状（根因）
- `src/lib/imports/timetable-save.ts` 的 `materializeTimetableRows` 把每行（单 weekday + 日期范围）展开成**每个匹配日期一条** `time_blocks`，`saveTimetableImport` 全部 insert。
- `time_blocks` 已有 `recurrence_rule` 列，但目前是自由文本、不参与展开。
- 读侧（时间轴 / 容量 / 冲突 / 摘要）都直接读这些 materialized 块。

## 期望行为
- 一个重复时段 = **1 条 time_blocks 记录**，带结构化重复信息：`weekdays`(多选) + `start_time` + `end_time` + `starts_on` + `ends_on`（+ 可选 `recurrence_rule` 文本如 weekly/weekdays）。
- **展开发生在读时**，不落库：按查询的日期范围算出具体 occurrence。
- 删除/编辑以「这一条规则」为单位（也可保留「删某个具体日期」= 加一条 exception，二期再说）。

## 改动面（按数据流）
1. **Schema/migration**：`time_blocks` 增加 `weekdays`(int[] 或 bitmask) + 用好 `starts_on`/`ends_on`；保留 `start_time`/`end_time`。一条记录代表一个重复槽。迁移：把现有 44 个 materialized 块按 (title+start_time+end_time+kind) 折叠回 N 条 recurring（或留旧数据、只对新导入生效，二选一，建议写个一次性 collapse 脚本）。
2. **写入** `timetable-save.ts`：`materializeTimetableRows` 不再按日期铺；改成每个 (title+time+weekday集合) 存 1 条。`propose_timetable_import` 的 MCP 入参可考虑支持 `weekdays: ["mon","tue",...]`（顺带解决之前 day_of_week 多天要拆行的问题）。
3. **读时展开**（新建一个 `expandRecurringBlocks(blocks, rangeStart, rangeEnd)` helper，所有读侧统一调用）：
   - `src/lib/planning/view-data.ts` `buildDayTimelineItems`（时间轴）
   - 容量模型 `buildCapacityModel`（占用计算）
   - 冲突检测 `src/lib/mcp/timetable-import.ts` `findTimetableImportConflicts` + `/review` apply 的冲突重查
   - MCP `get_constraints` / `get_capacity`（`src/lib/mcp/tools.ts`）
   - 固定安排页 `constraints-view` 的 `buildConstraintGroups` / 时间轴 / 周循环摘要（摘要会自然变成「5 条规则」而不是折叠 44）
4. **冲突语义**：两条规则重叠 = 它们展开后的 occurrence 有交集即冲突；按 weekday+time 比对即可，不必全展开。

## 验收
- 重新导入 6 月时间结构 → 固定安排页显示 **5 条**（不是 44）。
- 时间轴、容量、recovery 统计、冲突检测结果跟之前 materialized 版**一致**。
- 编辑/删除一条 = 整个重复槽生效。
- `get_capacity` / `get_constraints` 返回的占用与展开结果一致。

## 规模 & 备注
- 这是**中等偏大**重构（核心是统一的 `expandRecurringBlocks` + 所有读侧接入），建议**独立分支独立提交**，别和别的混。
- 轻量替代（如果暂时不想做大改）：保持 materialize，但导入时**默认只导当周/两周**，减少块数；摘要已折叠，日常影响不大。Charlotte 已选「做真 recurrence」，此条仅备选。
