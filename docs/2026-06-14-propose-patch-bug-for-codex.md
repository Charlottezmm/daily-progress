# Bug：propose_patch 对 agent 不可调用（交 Codex）

> 现象：Claude/Cowork agent 调 MCP `propose_patch` 必失败，报 `Expected object, received string`（path []）。
> 后果：「agent 建议挪任务 → 用户在 /review 确认」这条核心逻辑跑不通——agent 没法创建 move_task 草稿。
> 实测：2026-06-14 用 propose_patch 移动一条任务（move_task），稳定复现该错误。

## 根因
`src/lib/mcp/tools.ts` 第 ~148 行，`pawPlanToolSchemas.propose_patch` 的 `patch` 字段是 `z.unknown()`：

```ts
propose_patch: z.object({
  mode: z.enum(["today", "week"]),
  reason: z.string().min(1),
  patch: z.unknown(),          // ← 问题在这
  created_by: createdBySchema.optional(),
}),
```

`z.unknown()` → MCP inputSchema 里 `patch` 没有类型（`{}`）。Cowork/Claude 的工具调用层遇到**无类型的对象参数会把它序列化成 JSON 字符串**传过去。服务端 `runPawPlanTool` 把它交给 `proposeAgentPatch` → `validatePatchAgainstProtectedBlocks` 做 `z.object({ operations: z.array(z.unknown()) }).parse(rawPatch)`，此时 rawPatch 是 string → 抛 `Expected object, received string`。

→ 任何 agent（包括每日 scheduled 简报）都无法调用 propose_patch，move_task / defer_task / change_priority 等草稿都建不出来。

## 修法
把 `patch` 改成**有结构的 schema**，让 MCP inputSchema 把它描述成对象（这样调用层会按对象序列化，不再 stringify）。直接复用/对齐 `src/lib/patches/patch-schema.ts` 的 `agentPatchSchema`：

```ts
import { agentPatchSchema } from "@/lib/patches/patch-schema";
// ...
propose_patch: z.object({
  mode: z.enum(["today", "week"]),
  reason: z.string().min(1),
  patch: agentPatchSchema,     // { operations: [ move_task | defer_task | ... ] }
  created_by: createdBySchema.optional(),
}),
```

注意 `agentPatchSchema` 用了 `z.union` of literal-typed operations，MCP 客户端对 union 的支持要测一下；若 union 在 inputSchema 里表达不好，退一步把 `patch` 定义成 `z.object({ operations: z.array(z.object({ type: z.string() }).passthrough()) })`（至少把顶层结构定成对象，避免 stringify），具体 operation 校验仍在 `validatePatchAgainstProtectedBlocks` 里做。

## 验收
- 从 Cowork/Claude 用 MCP 调 `propose_patch`（mode:"week", patch:{operations:[{type:"move_task", task_id, from_date, from_day_segment, to_date, to_day_segment, reason}]}) → 应成功建 draft、出现在 /review。
- 用户在 /review 接受 → 任务日期被改。
- 改完后由 Claude 更新每日 scheduled 简报 prompt：建议挪任务时真的调 propose_patch 建草稿（不再只给文字）。

## 备注
- 这是「agent 提议 → /review 确认」产品链路能不能用的关键卡点，建议优先。
- 用户自己在「改期」tab 直接调任务日期（走 `PATCH /api/tasks`）不受此 bug 影响，已正常。

---

## 2026-06-14 第一次修复后复测（`59dcb09` 之后）——仍未通，需补
- 现象更新：agent 调 propose_patch 现在报 **MCP `-32602` Input validation error，`path:["patch"]`，Expected object received string**。
- 说明：服务端 zod 校验已改成要 object（对），**但 MCP 对外发布的 inputSchema 里 `patch` 仍是空 `{}`**（实测刷新工具定义后仍为 `{"patch": {}}`）。
- 根因推断：`server-builder.ts` 用 `pawPlanToolSchemas[tool].shape` 生成 inputSchema；`agentPatchSchema` 是 `z.union(...)` of 多个 literal-typed operation，MCP SDK 把这个 union 转 JSON Schema 时塌成了 `{}`。
- 后果：客户端（Cowork/Claude harness）看到 `patch` 无类型 → 把对象**序列化成字符串**发送 → 服务端收到 string → -32602。**比修复前更死**（之前是应用层报错，现在是入参直接被拒）。

### 补充修法（关键）
**手写 propose_patch 的 published inputSchema**，别依赖 union 自动转换。至少把 `patch` 顶层定成 object，让 harness 按对象序列化：
- 方案 A：在注册工具时给 propose_patch 传一个**显式 JSON Schema**（不走 `.shape` 自动转），`patch` 写成
  `{ type: "object", properties: { operations: { type: "array", items: { type: "object", properties: { type: {type:"string"}, task_id:{type:"string"}, ... }, required:["type"], additionalProperties: true } } }, required: ["operations"] }`。
  服务端仍用 `agentPatchSchema` 做细校验。
- 方案 B：把 zod 的 `patch` 从 `z.union` 改成 `z.object({ operations: z.array(z.object({ type: z.string() }).passthrough()) })`（顶层 object 能正确转出 JSON Schema），细分 operation 校验放进 `validatePatchAgainstProtectedBlocks`。

### 验收（务必从一个全新 MCP 连接 / 会话测）
1. 刷新工具定义后，`propose_patch` 的 inputSchema 里 `patch` 应是 **type: object**（不是 `{}`）。
2. agent 调 `propose_patch({mode, reason, patch:{operations:[{type:"move_task",...}]}})` → 返回 draft、出现在 /review。
3. 用户 /review 接受 → 任务日期改动生效。
