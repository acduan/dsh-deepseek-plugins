# 交叉复核模式（Cross-Verification Mode）

一个可选的 DSH Agent Preset（自定义模式），用于对抗模型常见的 **幻觉、遗漏、绕路、错误、过度自信，以及“未验证就打勾”**。

## 单一插件包

本模式由**一个** bundle 包 `@local/dsh-cross-review` 提供全部能力：

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：模型配置服务 `crossReviewConfig` + `/api/cross-review-config` 路由 |
| `preset.js` | 预设内挂载：`cross_review` / `cross_review_arbitrate` 工具与执行守卫 |
| `client.js` | Client 半：**Settings → 交叉复核模式** 模型设置页 |
| `cordis.patch.yml` | 三个 Agent Preset 声明 |

安装时只需安装这一个包，插件管理里也只显示一个「交叉复核模式」。

## 三个 Agent Preset

| Preset ID | 显示名 | 用途 |
|---|---|---|
| `cross-review` | 交叉复核模式 | 用户可选择的主模式 |
| `cross-review-internal` | 复核者 / 裁决者（内部） | 内部只读子代理，角色由任务消息指定 |

## 工具

### `cross_review`

把当前步骤、决策、命令、交付物或用户问题交给独立复核者审查。返回：

- `consensus`：可以继续；
- `objection`：不得继续，按 `required_fixes` 修改后复审（同一事项最多 3 轮）；
- `error` / `unstructured`：视为未通过。

### `cross_review_arbitrate`

当主代理和复核者无法达成共识时，提交双方立场给裁决模型做最终裁决；`ruling` 为 `uphold_main`、`uphold_reviewer`、`modified` 或 `need_more_evidence`。

## 执行守卫与中断

主模式默认 `enforceGuard: true`。以下工具调用必须先有一次对应的 `consensus` 审查，否则会被拦截：

`write`、`edit`、`apply_patch`、`bash`、`pwsh`、`ask_user_question`、`present`、`spawn_teammate`。

- `reviewUses`（默认 8）：一次 `consensus` 审查在 TTL 内可授权多次匹配动作，避免每个写操作都要重新审查。
- `reviewTimeoutMs`（默认 180000）：复核/裁决超时后工具立即返回 `error` 结论，不会无限挂住。
- 用户点击停止时，工具会观察到 `exec.signal` 中止并调用子代理 `dispose()`，会话可以立即终止，不需要强退 DSH。

```yaml
- id: cross-review-preset
  name: '@local/dsh-cross-review/preset'
  config:
    enforceGuard: true
    reviewUses: 8
    reviewTimeoutMs: 180000
    reviewer:
      provider: magpie
      model: workbuddy/hy4free
      reasoningEffort: high
    arbiter:
      provider: magpie-responses
      model: packycode1/gpt-6.1-sol
      reasoningEffort: high
```

## 界面配置模型（推荐）

打开 **Settings → 交叉复核模式**，页面从当前 DSH 已配置且注册的 LLM providers 动态读取模型列表：

- **复核模型（`cross_review`）**：默认 Hy4 · WorkBuddy
- **裁决模型（`cross_review_arbitrate`）**：默认 GPT-6.1 Sol · PackyCode1

Provider、模型和推理强度都通过下拉框选择；保存后立即作用于后续调用。模型列表来自 `ctx.llm.listProviders()` / `listModels()`，不是硬编码清单。配置通过 `/api/cross-review-config` 读写并持久化在 `cross_review_config` storage domain 中。

## 启动开销

Agent Preset 是 eager 加载，所以本 bundle 特意压缩了预设体积：

- 主预设不再挂载 `workflow-ptc` / `tool-workflow`；
- 复核者与裁决者共用**一个**内部预设（原先是两个），且不再各自挂载 compaction 组。

## 团队模式

- Lead 应先创建常驻复核队友 `leader1`，专门质疑 Lead 的决策、分工、进度与最终答复；
- 需求分析 → 需求质疑者；前端开发 → 前端体验质疑者；后端开发 → 健壮性/安全质疑者；测试 → 测试有效性质疑者；文档 → 文档准确性质疑者；交付 → 交付验收质疑者。
- 复核者只读、可联网、可运行只读验证，不修改交付物。

## 说明与限制

- `cross_review` 是阻塞式调用：每次审查都会启动一个独立子代理，耗费额外 token 与时间。
- 复核者子代理看不到主代理的对话，因此 `subject` 必须自包含（目标、命令原文、文件路径、证据）。
- 内部预设 `cross-review-internal` 会出现在预设列表中，请勿作为普通工作模式选择。
