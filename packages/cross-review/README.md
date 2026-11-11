# 交叉复核模式（Cross-Verification Mode）

一个可选的 DSH Agent Preset，用三角色分工解决模型常见的 **幻觉、遗漏、绕路、过度自信，以及“未验证就打勾”**。

核心设计：**复核者不再是拦路审批，而是方向顾问**。它优先给出"下一步该做什么、哪里会翻车"，只有真正会造成返工/损坏/安全问题时才阻塞。这样既保留监督价值，又不会让流程变成每步一卡。

## 角色分工

| 角色 | 模型 | 职责 | 调用时机 |
|---|---|---|---|
| **裁决者** | 默认 GPT-6.1 Sol | 开工前解析需求、收尾时审核交付 | 任务首尾各一次 |
| **主代理** | 你选择的模型 | 按规格执行 | 全程 |
| **复核者** | 默认 Hy4 · WorkBuddy | 过程监督 + 引导 | 关键节点按需 |

## 单一插件包

本模式由**一个** bundle 包 `@local/dsh-cross-review` 提供全部能力：

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：模型配置服务 `crossReviewConfig` + `/api/cross-review-config` 路由 |
| `preset.js` | 预设内挂载：四个工具与执行守卫 |
| `client.js` | Client 半：**Settings → 交叉复核模式** 模型设置页 |
| `cordis.patch.yml` | 两个 Agent Preset 声明 |

## 工具

### `cross_review_brief` — 需求解析（开工前一次）

把用户原始需求交给裁决者，返回：

- `goal`：一句话目标
- `in_scope` / `out_of_scope`：范围边界
- `acceptance_criteria`：**可验证**的验收标准
- `assumptions`：裁决者做的合理推断
- `open_questions`：必须问用户才能确定的
- `risks` / `suggested_steps`

目的：让主代理一开始就理解正确，避免做完才发现方向错。

### `cross_review` — 过程监督 + 引导

把当前步骤交给复核者，返回三种结论：

- `consensus`：可行，按 `guidance` 优化后继续
- `proceed_with_caution`：**可以继续**，但要把 `watchpoints` 当检查清单
- `objection`：仅当会导致返工/损坏/安全问题时出现

关键输出字段：

- `guidance`：下一步该做什么、更省力的路径（**最有价值**）
- `focus_next`：接下来最该优先处理的事项
- `watchpoints`：过程中要盯住的风险点
- `objections`：仅限阻塞项

只有 `objections` 和 `required_fixes` 会导致阻塞；`risks`、`omissions`、`alternatives` 都是建议性质。

### `cross_review_final` — 交付审核（收尾一次）

把验收标准和交付声明交给裁决者，它会**自己核对文件与测试**，返回：

- `ready`：可以宣布交付
- `not_ready`：有验收标准 fail，按 `required_actions` 修
- `need_more_evidence`：有验收标准无法验证，需补证据

审核会专门识别这些虚假完成：声称改了但文件没变、声称测试通过但没有输出、只做了一部分却说全部完成、把"能编译"当成"功能正确"。

### `cross_review_arbitrate` — 争议裁决

主代理与复核者多轮仍无法达成共识时使用，提交双方立场给裁决者。

## 执行守卫与中断

主模式默认 `enforceGuard: true`。以下工具调用需要先有一次通过的复核，否则会被拦截：

`write`、`edit`、`apply_patch`、`bash`、`pwsh`、`ask_user_question`、`present`、`spawn_teammate`。

- `consensus` 和 `proceed_with_caution` **都授权**后续动作，只有 `objection` 阻塞。
- `reviewUses`（默认 8）：一次复核在 TTL 内可授权多次匹配动作，避免每个写操作都要重新审查。
- `reviewTimeoutMs`（默认 180000）：复核/裁决超时后立即返回 `error` 结论，不会无限挂住。
- 用户点击停止时，工具会观察 `exec.signal` 并 `dispose()` 子代理，会话可立即终止。

## 模型配置

打开 **Settings → 交叉复核模式**，每个角色一张卡片，可配置：

| 项 | 说明 |
|---|---|
| **启用开关** | 停用后对应工具直接放行，**不启动子代理**，节省 token 与时间 |
| **Provider / 模型 / 推理强度** | 从当前 DSH 已配置且注册的 LLM providers 动态读取 |
| **超时时长** | 按秒配置，范围 10–1800 秒，默认 180 秒；每个角色独立 |

默认值：

- **复核者**：Hy4 · WorkBuddy，180 秒
- **裁决者**：GPT-6.1 Sol · PackyCode1，180 秒

停用某个角色后的行为：

| 停用角色 | 受影响工具 | 行为 |
|---|---|---|
| 复核者 | `cross_review` | 返回 `consensus` 并说明"已停用"，执行守卫照常授权 |
| 裁决者 | `cross_review_brief` | 返回空规格并说明"已停用"，主代理按自身理解执行 |
| 裁决者 | `cross_review_final` | 返回 `ready` 并说明"已停用"，不再审核 |
| 裁决者 | `cross_review_arbitrate` | 返回 `uphold_main` 并说明"已停用" |

协议提示词会同步显示当前停用状态，主代理不会误以为该角色仍在工作。

配置通过 `/api/cross-review-config` 读写并持久化在 `cross_review_config` storage domain 中。

## 配置文件方式（备用）

```yaml
- id: cross-review-preset
  name: '@local/dsh-cross-review/preset'
  config:
    enforceGuard: true
    reviewUses: 8
    reviewTimeoutMs: 180000
    reviewer:
      enabled: true
      provider: magpie
      model: workbuddy/hy4free
      reasoningEffort: high
      timeoutMs: 180000
    arbiter:
      enabled: true
      provider: magpie-responses
      model: packycode1/gpt-6.1-sol
      reasoningEffort: high
      timeoutMs: 180000
```

配置文件值只作为 `crossReviewConfig` 服务不可用时的 fallback；正常桌面 profile 下，设置页保存的值优先。

## 设计取舍

- **不按步骤阻塞**：早期版本对每个工具调用都强制复核，导致子代理调用次数爆炸、体感很慢。现在改为"关键节点按需 + 首尾各一次"。
- **复核者输出分三层**：引导 > 监督 > 拦截，避免把所有建议都当成阻塞项。
- **审核必须自己验证**：交付审核不采信主代理的声明，必须核对真实文件与测试输出。
- **内部预设只有一个**：复核者和裁决者共用同一份只读预设，角色由任务消息指定，减少启动时的 eager 挂载开销。

## 说明与限制

- 每次复核/审核都会启动一个独立子代理，耗费额外 token 与时间；这是该模式的核心成本。
- 子代理看不到主代理的对话，因此 `subject` / `requirement` / `claim` 必须自包含。
- 子代理被限制为只读：不修改文件、不安装依赖、不提交或部署。
- 内部预设 `cross-review-internal` 会出现在预设列表中，请勿作为普通工作模式选择。
