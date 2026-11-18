# 交叉复核模式（Cross-Verification Mode）

一个可选的 DSH Agent Preset：由独立的「裁决者」模型在**开工前解析需求、收尾时审核交付**，补上主代理最容易犯的四类错误——**幻觉、遗漏、绕路、把"看起来做完了"当成完成**。

核心设计：**裁决者在首尾判定，主代理负责执行与取证。**

> **v1.5.0**：修掉覆盖门禁的**误报根源**——按 `AC` 编号核对（不再要求逐字复现原文）、归一化处理 `ACn ` 等编号变体；自由文本需求不再「静默通过」而是显式标注 `coverage_enforced=false`；只读沙箱下不再把 `Get-NetTCPConnection` 静默失败误判成「服务停机」；大审核结果不再被 8KB 剪枝截断；连续多轮纯证据型重提会自动升级为「告知用户」。详见 [CHANGELOG.md](CHANGELOG.md)。
>
> **v1.4.0**：针对「太慢、要打回好几次、部分未修复也通过」优化——交付审核一次列全所有问题、宿主按 `AC1…` 强制逐条覆盖（漏项/空证据/零工具调用都不判 ready）、提交前先备齐证据、开工前先确认歧义。详见 [CHANGELOG.md](CHANGELOG.md)。
>
> **v1.3.0**：修掉失败路径被运行时拒绝、内部子代理 shell 实际可写、以及 brief 关闭后 final 无解三条缺陷；预设补齐到与 `standard` 一致。详见 [CHANGELOG.md](CHANGELOG.md)。
>
> **v1.2.0**：移除复核者角色及其全部逻辑（`cross_review` 途中复核工具、复核者模型配置、设置页卡片、协议章节）。现在只有首尾两个判定点。

## 角色分工

| 角色 | 默认模型 | 职责 | 调用时机 |
|---|---|---|---|
| **裁决者** | GPT-6.1 Sol · PackyCode1 | 需求解析、交付审核（两项可分别关闭） | 任务首尾各一次 |
| **主代理** | 你选择的模型 | 按规格执行、产出可复现证据 | 全程 |

## 工具

### `cross_review_brief` — 需求解析（开工前）

把用户原始需求交给裁决者，返回 `goal` / `in_scope` / `out_of_scope` / `acceptance_criteria` / `assumptions` / `open_questions` / `risks` / `suggested_steps`。

结果会**按会话被插件记住**，收尾审核自动复用，不需要主代理再抄一遍。

### `cross_review_final` — 交付审核（收尾）

逐条核对验收标准，自己读文件、跑只读检查，返回：

- `ready`：可以宣布交付
- `not_ready`：有验收标准 fail，按 `required_actions` 修
- `need_more_evidence`：关键项无法验证，先补证据
- `error`：审核本身没跑成（超时/模型故障/被取消/裁决者没给出可判定结论）。**既不是通过也不是不通过**，协议要求主代理重试一次或明确披露「未复核」；此结论总会带一条可执行的 `required_actions`
- `skipped`：该职责已在设置中关闭，本次**没有审核**。不谎报 `ready`，主代理必须在回复里说明「本次未走交叉复核」

子代理能提交的结论只有前三个；`error` / `skipped` 由插件产生，因此工具声明的输出枚举比子代理的宽——运行时校验工具返回值，两者混用会让失败路径直接被判为工具错误。

`requirement` 可以省略：省略时自动使用 brief 的验收标准；若显式传入，系统会额外附上一份 brief 版本并标注"主代理未改写"，让裁决者指出两者差异。

审核会专门识别这些虚假完成：声称改了但文件没变、声称测试通过但没有输出、只做了一部分却说全部完成、把"能编译"当成"功能正确"、留下未处理的警告或 TODO 却报告已完成。

### 覆盖门禁与「一次列全」（v1.4.0，v1.5.0 修正匹配）

- **宿主按编号逐条覆盖（id-primary）**：brief 的验收标准渲染为 `AC1…`；`cross_review_final` 返回后，插件核对每一条标准是否都有对应的 `criteria` 行。**以 `criterion_id` 为主键**——编号命中即视为该条已核对，`item` 只需概括、不必逐字复现原文（真实模型几乎不会逐字复现 100~500 字中文标准）。无编号时回退到「归一化文本相等」；未知/越界编号不会替代任何标准；一对一（同一行不能顶两条）。`pass` 但证据为空、本会话零工具调用、有清单却漏项的 `ready` 都会被硬降级。
- **自由文本需求显式披露**：既无会话 brief、又无法从显式 `requirement` 提取结构化清单时，结果带 `coverage_enforced=false` 并在 `summary` 写明「未做逐条覆盖校验」，主代理必须在最终回复中披露——不再静默当成通过。有清单（brief 或提取到的 `ACn`/「验收标准」列表）时才真正逐条核对，并会把提取出的编号清单渲染给裁决者。
- **一次性全量反馈**：审核提示要求遍历全部标准、发现第一个失败后仍继续核查其余项，一次性返回所有 `fail` / `unverified` / `blocking` 与 `required_actions`；主代理一次改完再复审。
- **提交前自检**：主代理协议要求在提交 final 前对照每条标准备齐证据（路径+行号、命令+输出/退出码、截图/测量值）；开工前先把影响验收的歧义用 `ask_user_question` 问清楚。
- **只读取证**：裁决者的 shell 在只读沙箱中，`Get-Process`/`Get-NetTCPConnection` 等可能静默失败——这是沙箱限制、不代表对象异常；提示与 persona 已给出 `netstat -ano` 等可用原生命令。
- **边界**：覆盖门禁只保证「已知清单没有被跳过」，不能证明 `evidence` 内容为真；纯自然语言且无 brief 的显式 requirement 依赖模型在同一次审核内拆分标准，宿主会标注 `coverage_enforced=false` 而非假装已校验。

## 子代理能看到什么

子代理在独立会话中运行，看不到主代理的实时对话。每次调用由插件自动附带：

- **工作目录**与最近若干轮 user/assistant 文本摘要（截断、只读）
- **客观事实**：本会话真实的 `write` / `edit` / `apply_patch` 目标路径、`pwsh` / `bash` 命令与失败记录——从会话事件日志提取，**主代理无法改写**。命令会标注「未返回结果 / 失败 / 退出码 N / 退出码 0」，只有退出码 0 才视为命令正常结束。这是对抗"声称改了但没改"的主要手段
- 主会话最近粘贴的图片（自动转交，可直接查看）
- 你通过 `files` 参数显式给出的文件/目录路径

## 健壮性

- **结构化输出**：子代理通过运行时的 `outputSchema` 提交结果，由运行时校验；模型不再需要在正文里祈求"只输出 JSON"。
- **一次重试**：`stopReason=error` 或可识别的瞬时网络/限流错误会重试一次（900ms 后）。取消与超时**不会**重试。
- **超时**：范围 10–3600 秒，默认 180 秒；超时立即返回 `error` 并释放子代理。
- **可取消**：工具观察 `exec.signal`，已取消的调用不会启动子代理；用户点停止会 `dispose()` 子代理，会话立即终止。
- **无硬依赖**：`subagents` 不是挂载依赖；缺失时工具返回可操作的错误，而不是让整个预设组合挂掉。

### 只读边界（重要）

内部子代理预设的**文件工具**是真只读：`write` / `edit` / `applyPatch` 全部关闭。**shell 也是真只读**，由 `internal-guard.js` 在运行时强制，而不是提示词请求：

- 预设里的 `sandboxPolicy.mode` 默认值**挡不住** shell。`sandboxPolicy.resolve()` 是 `request.mode ?? overrideOf(session) ?? defaultMode`，而子代理运行时会把自己父会话的显式模式写进子会话（`source: 'delegation'`）。主代理在 `danger-full-access` 下运行时，裁决者会继承同一个模式，预设默认值根本不参与计算。
- 因此 `internal-guard` 在每次调用前把该会话钉到 `read-only`（写入真实的 `sandbox/mode` 事件），随后由 pwsh/bash 沙箱按该模式实际执行；如果钉不住（会话日志不可写）或没有可用的沙箱策略，它**直接拒绝**这次 shell 调用，而不是放行一个无法保证只读的命令。

也就是说，"不要修改文件"对 shell 而言已是运行时强制。需要进一步收紧（例如连只读命令也不给）时，可从内部预设移除 `tool-pwsh` / `tool-bash`，裁决者仍可用 `read` / `glob` / `grep` / `web_fetch` 取证。

## 配置

打开 **Settings → 交叉复核模式**。一张卡片配置裁决者：

| 项 | 说明 |
|---|---|
| 启用开关 | 停用后两个工具直接放行，**不启动子代理** |
| Provider / 模型 / 推理强度 | 从当前 DSH 已配置且注册的 LLM providers 动态读取 |
| 超时 | 秒，10–3600，默认 180 |
| **测试** | 用当前草稿路由发一句极短 prompt，返回延迟与回复；配置错了当场可见，而不是等任务收尾才失败 |
| **恢复默认** | 重置回出厂路由（升级后模型 id 失效时最省事） |

保存时若提交的路由与已存值相同则直接沿用（不再校验）：一个已失效的历史模型不会阻塞保存，页面会把它标成"当前保存，当前不可用"，改一下或点恢复默认即可。

裁决者的两项职责（需求解析 / 交付审核）可独立勾选。模型目录在 Host 侧**并行探测并缓存 60 秒**，"刷新模型列表"会强制重新探测。

配置通过 `/api/cross-review-config` 读写（GET 目录、PUT 保存、POST 连通性探测与 `action: 'reset'`），持久化在 `cross_review_config` storage domain。

### 配置文件方式（备用）

```yaml
- id: cross-review-preset
  name: '@local/dsh-cross-review/preset'
  config:
    reviewTimeoutMs: 180000
    arbiter:
      enabled: true
      briefEnabled: true
      auditEnabled: true
      provider: magpie-responses
      model: packycode1/gpt-6.1-sol
      reasoningEffort: high
      timeoutMs: 180000
```

配置文件值只作为 `crossReviewConfig` 服务不可用时的 fallback；正常桌面 profile 下，设置页保存的值优先。

## 轻量任务可以跳过

纯问答、只读检索、单行格式确认这类**没有文件改动也没有外部副作用**的请求，可以跳过 brief 与 final——但要在回复里说明"本次未走交叉复核"，不要假装复核过。这条豁免写在协议里，因为对小任务起两次子代理并不划算。

## 设计取舍

- **不装执行守卫**：守卫把每个写操作都变成一次子代理调用，代价远大于收益。现在的约束是"首尾判定"，靠协议而非锁。
- **没有途中复核**：只有一个判定者、两个时间点。途中发现偏差靠主代理自己的证据与 todo，而不是再加一个常驻角色。
- **审核必须自己验证**：交付审核不采信主代理的声明，另外拿系统提供的工具调用事实对账。
- **单一内部预设**：只有一份只读子代理预设，减少启动时的 eager 挂载开销。

## 已知限制

- 每次调用都会启动一个独立子代理，消耗额外 token 与时间——这是该模式的核心成本。
- 子代理看不到主代理的对话，`requirement` / `claim` 必须自包含。
- 内部预设 `cross-review-internal` 出现在预设列表里（名称为"内部只读子代理（请勿选择此模式）"），因为 registry 没有隐藏声明的能力。

## 性能与验证边界（v1.4.0 / v1.4.1 / v1.4.2）

- **v1.4.2 精简上下文（纯减法）**：不再附带「最近对话摘要」；`evidence` 超 4000 字截断标记；工具事实去掉重复的「失败调用」列表、shell 输出摘要改 120 字头+尾、shell 历史 10→6 条。仍保留写操作文件、命令状态/退出码与输出摘要、工作目录、files——即“判定是否真的改了/跑了/成功”的最小必要证据。

- **v1.4.1 安全提速**：交付审核提示与内部裁决者 persona 要求「优先用主代理提供的 files/证据定位、避免全库 glob 与重复读文件、命令/测试只在缺证据时跑」，并把随调用附带的最近对话摘要由 6×1200 字降到 4×900 字、工具事实正文 6000→4000 字。属结构性提速（减少子代理模型往返与 token），**不改变**「必须独立读文件、不得凭空 ready」。具体幅度需部署后同模型可比任务实测。
- **没有做「同模型、同推理强度、可比任务」的端到端性能基准**（需要多次真实任务重放，成本高且会占用运行环境）。因此本版本**不宣称**具体的秒数或打回轮次下降百分比。
- 结构性事实（有测试守护）：宿主覆盖门禁在进程内执行、**不额外启动子代理**（`test/apply.test.mjs` 断言 `starts.length === 1`）；正常成功路径仍是 1 次 brief + 1 次 final；保留最多一次基础设施重试、取消/超时不重试。
- 设计目标是减少「无效补证」和「逐条挤牙膏」的轮次：一次审核一次性列全 fail/unverified/blocking，主代理一次改完再复审。
- 每次子代理调用都会写 `cross-review: <label> 用时 <ms>ms (stopReason=…)` 日志（从收集上下文到子代理返回的整段调用耗时）。要得到真实对比数据，请在同一模型/推理强度下记录：子代理启动数、final 提交次数、补证次数、累计审核耗时。
- 覆盖门禁只能保证「已知验收清单没有被跳过」，不能证明 `evidence` 内容为真；纯自然语言且无 brief 的显式 requirement 仍依赖模型在同一次审核内拆分标准。

## 文件

| 文件 | 作用 |
|---|---|
| `index.js` | Host 半：模型配置服务 `crossReviewConfig` + `/api/cross-review-config` 路由（含探测与重置） |
| `preset.js` | 预设内挂载：两个工具与协议提示词 |
| `internal-guard.js` | 内部子代理挂载：把裁决者会话钉到 `read-only` 并拒绝无法保证只读的 shell 调用 |
| `client.js` | Client 半：Settings 页（中英双语） |
| `cordis.patch.yml` | 两个 Agent Preset 声明 |
| `test/` | 纯函数、配置层、只读守卫、以及运行时 schema 契约测试 |

## 测试

```bash
node --test
```

覆盖结构化解析容错、`ready` 的 fail-closed 判定、工具调用事实提取（含命令退出状态）、协议状态文案、超时钳制、目录缓存、连通性探测、重试与取消、只读守卫，以及 `apply()` 的真实注册与 brief→final 端到端交接；v1.4.0 新增验收覆盖门禁（漏项 / 重复 / 无关 / 空证据 / 零工具调用）、显式 requirement 覆盖与会话隔离的回归用例。

### 运行时 schema 与组合契约测试

Desktop resolves bundled skills through `ctx.get('profileContext').installAnchor`.
`DSH_INSTALL_DIR` below is only an optional input to installation-aware tests;
Desktop does not need to export it. The missing-variable activation regression
runs under ordinary Node with the Desktop profile's `js-yaml` dependency.

两个测试文件需要能读到 DSH 安装目录（Desktop 的 `app.asar` 只有 asar-aware 运行时能穿透）：

```powershell
$env:DSH_INSTALL_DIR = "...\app.asar\dsh\node_modules\@deepseek-ai\dsh"
$env:DSH_PROFILE_DIR = "$env:USERPROFILE\.dsh\profiles\desktop"
$env:ELECTRON_RUN_AS_NODE = '1'
& $env:DSH_NODE_EXECUTABLE --test
```

- `test/schema-contract.test.mjs`：导入运行时真实校验器，对 `cross_review_final` 的每一条可达返回值做 `output.schema` 校验。上一版 36 项测试全绿却漏掉了枚举违约，原因是旧测试直接调 `execute()`，绕过了 pipeline 的返回值校验——这个文件补的正是那个缺口。
- `test/composition.test.mjs`：解析 `cordis.patch.yml` 并**实际求值**每一条 `!!js` 表达式。表达式写错时 Loader 会在激活阶段抛错，整个预设起不来，而这类错误静态检查看不出来。

普通 `node --test` 下这些安装相关断言会**干净跳过**（不是失败）。
