# Changelog

## 1.2.0

复核者整体下线。

### 移除

- 删除 `cross_review` 工具（过程中的建议型复核）及其提示词、检查清单、归一化与错误构造。
- 删除复核者角色配置：`DEFAULT_CONFIG.reviewer`、`preset.js` 的 `DEFAULT_REVIEWER`、`liveRoutes()` 的 reviewer 分支、设置页的复核者卡片（含其中英文案）。
- `buildProtocol()` 不再输出复核者状态、"过程中复核"章节，角色说明从三行收敛为两行。
- 内部子代理预设在 persona 中不再区分"复核者 / 裁决者"，固定为裁决者。
- 配置接口收敛为只含 `arbiter`：`GET` 返回 `config.arbiter`，`PUT` 只接受 `arbiter`，`POST` 探测不再带 `role`。
- 预设描述、persona 前缀、README 中"复核者默认使用 Hy4 · WorkBuddy"等表述全部删除。

### 变更

- 设置页由两张卡片改为一张（裁决者）。
- `/api/cross-review-config` 的探测请求体从 `{ role, route }` 简化为 `{ route }`。
- 版本升至 1.2.0；测试从 39 项调整为 36 项（移除复核者相关用例，新增"配置里不再有 reviewer 字段"断言）。

## 1.1.0

面向「删掉守卫之后的形态」做的一轮收敛：去掉死代码与失效默认值，把复核从"求模型吐 JSON"改成运行时可校验的结构化输出，并补上配置可验证性与文档一致性。

### 移除

- 删除 `cross_review_arbitrate`（争议裁决）工具及其提示词、归一化与错误构造。
- 删除执行守卫的全部残骸：`ENFORCED_TOOLS`、`TARGETS_BY_CATEGORY`、`reviews`、`rememberReview` / `forgetReview` / `guardBlockMessage` / `installGuard`，以及配置项 `enforceGuard`、`reviewUses`。守卫在此前版本已不再挂载，这些代码与配置只是误导性的死重。
- `inject` 不再硬依赖 `subagents`：缺失时工具返回可操作的错误，而不是让整个预设组合挂载失败。

### 新增

- `outputSchema`：三个工具改为让子代理通过运行时提交并校验结构化结果（`result.structured`），正文 JSON 解析只作为旧路径的后备。
- 一次有界重试：`stopReason=error` 或可识别的瞬时网络/限流错误在 900ms 后重试一次；取消与超时永不重试。
- `cross_review_final.requirement` 变为可选：省略时自动复用本会话 `cross_review_brief` 的验收标准；显式传入时额外附上 brief 版本并标注"主代理未改写"，供裁决者指出差异。
- 客观工具事实：每次调用自动附带从会话事件日志提取的写操作路径、shell 命令与失败记录，主代理无法改写。
- 设置页连通性探测：`POST /api/cross-review-config`，用当前草稿路由发一条极短 prompt，返回延迟与回复。
- 设置页恢复复核者卡片（v1.0.0 移除复核者时连同卡片一起删掉了），并在停用角色时给出明确说明。
- `error` 结论的协议语义：明确它"既不是通过也不是不通过"，要求重试或披露未复核。
- 轻量任务豁免：无文件改动、无外部副作用的纯问答可跳过首尾审核，但必须声明未复核。

### 修复

- 默认复核者模型 `workbuddy/hy4free` 不在当前 magpie 的模型目录中，改为 `workbuddy/hy4std`（与 README 声称的 Hy4 · WorkBuddy 一致）。
- 模型目录由「每个模型串行 `resolveModelInfo`」改为并发探测并缓存 60 秒；保存配置时使缓存失效，设置页的"刷新模型列表"强制重探。
- `cross_review_final` 提示词与归一化逻辑对 `unverified` 的结论不一致（提示词说 `not_ready`、代码产出 `need_more_evidence`），现统一为 `need_more_evidence`。
- 预设备注、内部预设名称与 README 仍描述已删除的复核者/守卫/四工具结构，全部改正；内部预设明确标注"请勿选择此模式"。
- 设置页保存不再只提交裁决者：复核者与裁决者一并提交与校验。
- 设置页增加未保存修改提示，保存按钮在无改动时禁用。
- 设置页新增"恢复默认"：`POST /api/cross-review-config` 的 `action: 'reset'` 把两套路由重置回出厂值。
- 保存只校验**改动过的那一侧**：历史遗留的失效模型不再阻塞另一侧的保存，页面会标注"当前保存，当前不可用"。

### 测试

- 新增 `test/`（`node --test test/`）：结构化解析容错、`ready` 的 fail-closed 判定、工具调用事实提取、协议状态文案、超时钳制、目录缓存、连通性探测成功与失败路径。

## 1.0.0

- 初始公开形态：移除复核者与争议裁决，仅保留裁决者的需求解析（`cross_review_brief`）与交付审核（`cross_review_final`）。
