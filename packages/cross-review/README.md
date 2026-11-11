# 交叉复核模式（Cross-Verification Mode）

一个可选的 DSH Agent Preset（自定义模式），用于对抗模型常见的 **幻觉、遗漏、绕路、错误、过度自信，以及“未验证就打勾”**。

它提供三层能力：

1. **主代理（cross-review）**：正常执行任务，但每个关键步骤都要先经独立「复核者」审查。
2. **复核者（cross-review-reviewer）**：独立子代理，默认使用 **Hy4 · WorkBuddy**（`magpie/workbuddy/hy4free`），可联网搜索、读取工作区文件、运行只读验证；
3. **裁决者（cross-review-arbiter）**：主代理与复核者无法达成共识时，默认使用 **GPT-6.1 Sol · PackyCode1**（`magpie-responses/packycode1/gpt-6.1-sol`）做最终裁决。

## 安装结果

本 bundle 已安装到当前 `desktop` profile，并声明三个 Agent Preset：

| Preset ID | 显示名 | 用途 |
|---|---|---|
| `cross-review` | 交叉复核模式 | 用户可选择的主模式 |
| `cross-review-reviewer` | 复核者（内部） | 内部子代理，不建议直接选择 |
| `cross-review-arbiter` | 裁决者（内部） | 内部子代理，不建议直接选择 |

新建会话时在模式/预设列表选择「交叉复核模式」即可。首次安装或更新本 bundle 后，请刷新页面；如果 Settings 里仍看不到「交叉复核模式」，重启一次 DSH 即可加载新的 Client half。

设置页位置：**Settings → 交叉复核模式**。

## 工具

主模式自动挂载两个工具：

### `cross_review`

把当前步骤、决策、命令、交付物或用户问题交给独立复核者审查。返回：

- `consensus`：可以继续；
- `objection`：不得继续，按 `required_fixes` 修改后复审（同一事项最多 3 轮）；
- `error` / `unstructured`：视为未通过。

建议调用时填写 `target_tools`，例如 `["pwsh"]`、`["write"]`、`["ask_user_question"]`、`["present"]`。执行守卫会为每个动作消耗一次通过审查。

### `cross_review_arbitrate`

当主代理和复核者无法达成共识时，提交双方立场给 GPT-6.1 Sol 裁决；`ruling` 为 `uphold_main`、`uphold_reviewer`、`modified` 或 `need_more_evidence`，裁决结果具有约束力。

## 执行守卫

主模式默认 `enforceGuard: true`。以下工具调用必须先有一次对应的 `consensus` 审查，否则会被拦截：

`write`、`edit`、`apply_patch`、`bash`、`pwsh`、`ask_user_question`、`present`、`spawn_teammate`。

一次通过审查只授权一次动作。若不需要硬拦截，可把 `cross-review` 行的 `enforceGuard` 改为 `false`，退化为纯提示/协议模式。

## 团队模式

- Lead 应先创建常驻复核队友 `leader1`，专门质疑 Lead 的决策、分工、进度与最终答复；
- 需求分析 → 需求质疑者；
- 前端开发 → 前端体验质疑者（重点：美观、简洁、一致性、可访问性、响应式、交互细节）；
- 后端开发 → 后端健壮性/安全性质疑者；
- 测试 → 测试有效性质疑者（覆盖、边界、假阳性）；
- 文档 → 文档准确性质疑者；
- 交付 → 交付验收质疑者。

复核者只读、可联网、可运行只读验证，不修改交付物。

## 界面配置模型（推荐）

打开 **Settings → 交叉复核模式**，页面会从当前 DSH 已配置且已注册的 LLM providers 动态读取模型列表：

- **复核模型（cross_review）**：默认 Hy4 · WorkBuddy
- **裁决模型（cross_review_arbitrate）**：默认 GPT-6.1 Sol · PackyCode1

Provider、模型和推理强度都可以通过下拉框选择；保存后立即用于后续的 `cross_review` / `cross_review_arbitrate` 调用。模型列表来自 `ctx.llm.listProviders()` / `listModels()`，不是硬编码清单。

设置页由配套插件 `@local/dsh-cross-review-settings-ui` 提供（注册到 `settings.section`）；配置通过 Host 的 `/api/cross-review-config` 路由读写，并持久化在 `cross_review_config` storage domain 中。安装时请同时安装 `cross-review` 与 `cross-review-settings-ui` 两个包。

## 配置文件方式（备用）

编辑本 bundle 的 `cordis.patch.yml` 中 `cross-review` 插件行的 `config.reviewer` / `config.arbiter`：

```yaml
- id: cross-review
  name: '@local/dsh-cross-review'
  config:
    enforceGuard: true
    reviewer:
      provider: magpie              # 任意已配置的 LLM provider
      model: workbuddy/hy4free      # 默认 Hy4 · WorkBuddy
      reasoningEffort: high
    arbiter:
      provider: magpie-responses
      model: packycode1/gpt-6.1-sol # 默认 GPT-6.1 Sol · PackyCode1
      reasoningEffort: high
```

配置文件值只作为 `crossReviewConfig` 服务不可用时的 fallback；正常桌面 profile 下，Settings 页保存的值优先。

## 说明与限制

- `cross_review` 是阻塞式调用：每次审查都会启动一个独立子代理，耗费额外 token 与时间；这是该模式的核心成本。
- 复核者子代理无法看到主代理的对话，因此 `subject` 必须自包含（目标、命令原文、文件路径、证据）。
- 复核者被限制为只读：它不会修改文件、安装依赖、提交或部署。
- 执行守卫只约束核心工具调用；“每个思考步骤都要审查”仍依赖主代理按协议执行。
- 内部预设 `cross-review-reviewer` / `cross-review-arbiter` 会出现在预设列表中，请勿将它们作为普通工作模式选择。
