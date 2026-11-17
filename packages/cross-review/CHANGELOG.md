# Changelog

## 1.4.2

继续精简随调用附带的上下文（纯减法，仍保留“可判定成功”的关键证据）。

- **删除「最近对话摘要」**（原 4 条×900 字）：契约本就要求 `requirement`/`claim` 自包含，摘要多为重复、且可能把无关旧对话带入审核。用户决策由主代理通过 `context` 显式携带。
- **精简 `evidence`**：主代理证据超过 4000 字会截断并标 `[truncated]`，提示主代理“粘关键片段、勿贴全量日志”。
- **精简工具事实**：不再单独输出「失败调用」列表（重复——shell 行已带 `[失败]/[退出码 N]`）；shell 输出摘要由“头 200 字”改为“头 60%+尾 40% 共 ≤120 字”（保留结尾结论，如 `N passed`）；shell 历史由最近 10 条降为 6 条。
- 仍保留：写操作文件、命令状态/退出码、命令输出摘要、工作目录、files——即“判定是否真的改了/跑了/成功”的最小必要证据。
- **说明**：属结构性精简（减少 token 与子代理处理量），不改审核结论逻辑；具体提速需部署后实测。

## 1.4.1

安全提速（不牺牲正确性，不改审核结论逻辑）：减少裁决子代理的无效探索，收紧随调用附带的上下文体积。

- **子代理少探索**：交付审核提示与内部裁决者 persona 增加「效率要求」——优先用主代理已提供的 `files`、证据与工具事实定位目标，避免全库 glob、避免重复读取同一文件、能一次 read/grep 确认就不要反复探索、命令/测试只在缺少关键证据时运行；同时强调「效率不降低核实强度，每条标准至少一次针对性 read/grep 作为 pass 依据」。
- **缩减自动上下文**：随调用附带的最近对话摘要由 6 条×1200 字降为 4 条×900 字；工具事实正文截断 6000→4000 字。主代理显式提供的 `files`/`evidence` 不受影响。
- **说明**：这是**结构性提速**（减少子代理模型往返次数与 token），默认不改变「必须独立读文件、不得凭空 ready」。具体端到端提速幅度需在部署后同模型、可比任务实测（本仓库未做真实基准）。

## 1.4.0

针对「太慢、交付要打回好几次、部分未修复的项也通过审核」三个反馈的优化。核心思路：**一次审核把问题列全、宿主强制逐条覆盖、提交前先备齐证据**——减少无效补证与逐条打回，同时堵住漏审造成的虚假通过。

### 修复（虚假通过）

- **宿主侧验收覆盖门禁（关键）**：`cross_review_final` 现在拿到本会话 brief 的完整验收清单（渲染时编号为 `AC1…`），逐条核对审核结果。任何一条验收标准没有对应的 `criteria` 行都不能返回 `ready`。匹配规则：**完整原文（去首尾空白/换行）必须相等**才是覆盖，`criterion_id` 只作辅助定位、不能替代原文（带 AC3 编号但文本写 D，仍判 C 缺项）；且**一对一**分配——同一行不能同时覆盖两条标准。缺项降级为 `need_more_evidence` 并列出缺项。
- **无 brief 的显式清单也进门禁**：显式 `requirement` 没有会话 brief 时，若需求里有结构化的验收清单（`ACn` 标注或在「验收标准」标题下的列表），宿主会提取出来套用同一覆盖门禁；纯自然语言仍由模型在同一次审核内拆分（文档注明语义边界）。
- **失败优先级与输入结论无关**：无论子代理最初返回 `ready` 还是 `need_more_evidence`，只要存在已知 `fail` 或 `blocking_issues` 就判 `not_ready`；`criteria` 中 `item` 为空但 `status=fail` 的行不再被丢弃（保留失败事实）。
- **空证据不算 pass**：`status=pass` 但 `evidence` 去掉空白后为空，自动降为 `unverified`，避免「口头通过」。
- **零工具调用不算通过**：本会话没有记录任何工具调用时，`ready` 降级为 `need_more_evidence`——没有工具使用就无法证明改了文件或跑过测试。
- **空验收标准不是基线**：brief 若没有可验证的验收项，不再把「需求已解析」当作有效基线保存，并清掉本会话此前的旧基线，避免后续 final 误用旧标准或默认通过；brief 以非正常 `stopReason` 结束（含连续基础设施失败）、或因设置在停用/关闭 brief 而直接跳过时，同样清掉旧基线。
- **空逐条结论不算通过**：`ready` 但 `criteria` 为空（没有任何逐条结论）——包括只给显式 requirement 的路径——降级为 `need_more_evidence`，要求逐条给出结论与证据。
- **客观事实缺失要显式标注**：无法读取会话查询服务 / 事件提取失败 / 查询异常时，明确告诉裁决者「工具调用事实不可用」，与「已知零调用」区分，不把未知当成没改动；命令事实同时转交有界输出摘要，并标明「结果正文缺失」「已截断」。
- **决策回传与提交前材料**：协议要求把 open_questions 的用户答复与当前 assumptions 写进 final 的 context；提交前逐项准备「证据位置、验证方法、实际结果、必要执行环境」，已有失败/未完成/关键输出缺失先处理再提交；`renderBriefSpec` 也会把假设与待确认项一并带入审核提示。
- **显式 requirement 不能绕过已知 brief**：即使 `cross_review_final` 显式传入 requirement，只要本会话存在有效 brief，仍按其验收清单做覆盖核对，防止只提交一部分标准来「缩小审核范围」。

### 改善（减少打回轮次 / 提速）

- **一次性全量反馈**：交付审核提示词要求遍历全部验收标准、即使发现第一个失败也继续核查其余项，一次性返回所有 `fail`/`unverified`/`blocking` 与 `required_actions`，主代理据此一次改完再复审，避免「挤牙膏」式多轮打回。
- **提交前自检**：主代理协议新增「对照每条验收标准备齐证据（文件路径+行号、命令+关键输出/退出码、截图或测量值），证据不齐先补齐再提交」，正常路径只需一次 brief + 一次 final。
- **开工前先定清歧义**：需求解析要求把影响验收、只能由用户决定的事项（配色、视觉取舍、范围、参考对象）写进 `open_questions`，主代理须先用 `ask_user_question` 问清楚再动手；验收标准要写清对象/范围、可观察预期与验证方法，视觉类区分顶栏/外层容器/iframe 内容/业务页通用背景。
- **工具事实更准**：命令记录区分「未返回结果 / 失败 / 非零退出码 / 退出码 0」，只有退出码 0 才算命令正常结束；不再把「跑过命令」当作「验证成功」。
- **耗时观测**：每次子代理调用记录用时与 stopReason（`cross-review:` 日志），便于按实际任务衡量审核成本。

### 兼容

- 两个工具的调用契约不变：`cross_review_brief` 仍只要求 `requirement`；`cross_review_final` 仍只要求 `claim`，`requirement` 仍可省略并复用 brief。输出字段为**增补**（`criteria[]` 增加可选 `criterion_id`），结论枚举不变。
- 显式 requirement 且本会话无 brief 的旧路径仍然可用；此路径的逐条覆盖依赖模型在同一次审核内拆分，文档已注明这一语义边界，宿主不额外启动子代理。

### 测试

- 新增/改写用例覆盖：漏项、重复项、无关项、空清单、空证据、零工具调用、显式 requirement 覆盖、fail+缺项优先级、会话隔离、退出码解析。
- 原本两个「两条标准只审一条仍 ready」「空 criteria 仍 ready」的成功断言，改为拒绝通过的回归用例，并保留「全部覆盖且证据齐全 → ready」的正例。
- `node --test`：**89/89 通过，0 跳过**（在 Electron/ASAR 感知运行时下；普通 `node --test` 为 85 通过、4 跳过，跳过的是需要安装目录的运行时 schema/组合用例）。

## Local Fix - 2026-11-17

- Fix Desktop conversation creation failing with `agent-preset/invalid` and
  `Received 'undefined/package.json'`: resolve bundled skills from
  `ctx.get('profileContext').installAnchor`, not the unset `DSH_INSTALL_DIR`.
- Add a regression test with no installation environment variable and with a
  stale variable. The running profile's anchor must win in both cases.
- The installation variable below is a test harness input, not a Desktop runtime
  contract. Existing conversation data and model settings are unchanged.

## 1.3.0

修掉三条会让这个模式在关键时刻失效的缺陷，并补齐与 `standard` 预设的漂移。

### 修复

- **`cross_review_final` 的失败路径被运行时拒绝（严重）**：工具声明的 `output.schema` 只允许 `ready` / `not_ready` / `need_more_evidence`，但超时、取消、子代理失败、以及"裁决者没给出可判定结论"都会返回枚举之外的 `error` / `unstructured`。DSH 的工具管线会校验返回值（`createSuccessResult` → `ToolOutputError`），因此这些路径下主代理**根本拿不到** `summary`、`required_actions` 和逐条结论，只看到一个工具报错——恰恰是本模式最需要说清楚的场景。现在：
  - 子代理可提交的结论仍是三个（`FINAL_CHILD_RULINGS`），工具可返回的结论是五个（`FINAL_TOOL_RULINGS`），两套 schema 分开声明；
  - `unstructured` 改为 `error`，并自动补一条 `required_actions`（重试或披露未复核）；
  - 新增 `skipped` 结论：职责在设置中关闭时不再谎报 `ready`。
- **内部"只读"子代理的 shell 实际可写（严重）**：`write` / `edit` / `applyPatch` 关闭只移除了文件工具，shell 仍在，且**不读预设级默认值**——`sandboxPolicy.resolve()` 是 `request.mode ?? overrideOf(session) ?? defaultMode`，而子代理运行时会把自己父会话的显式模式写进子会话（`source: 'delegation'`）。实测本机 91 个历史子会话全部携带继承来的 `danger-full-access`，所以预设里写 `mode: read-only` 是**死配置**。改为新增 `internal-guard.js`：在 shell 执行前把该会话钉到 `read-only`（写入真实 `sandbox/mode` 事件），并在无法保证只读时直接拒绝该次 shell 调用。隔离由运行时沙箱执行，不再依赖提示词。
- **`briefEnabled: false` + `auditEnabled: true` 是死循环**：brief 关闭后不写会话记录，final 省略 `requirement` 时返回"请先调用 cross_review_brief"，但那个工具已被关闭、再调仍然为空。现在 final 能识别 brief 已关闭，直接要求显式传入 `requirement`。

### 变更

- 预设补齐到与 `standard` 一致：新增 `tool-jobs`、`tool-schedule`、`command-goal`、`tool-goal`、`workflow-ptc`、`tool-workflow`、`tool-office`、`tool-plugin-manager`、`tool-plugin-market`，并补回 `tool-subagent-control.interrupt: false`。
- **`skill-filesystem.customSkillDirs` 补回**：缺这一项时内置 `dsh-doc` 技能不可见，等于让复核场景失去查文档的能力。
- `routeOf` 与 `routeTimeout` 现在都钳制 `timeoutMs` 到 10s–1800s；此前只有 Host 配置层钳制，手写 YAML 里的 `timeoutMs: 1000` 会得到一个 1 秒就超时的裁决者。
- 重试正则收紧：不再匹配裸的 `500`/`502`/`timeout`（会命中端口号、行号、文件大小、测试名），只保留明确指向传输或 provider 状况的短语。
- `briefs` 在写入时按 TTL 清理，长期运行的桌面进程不会因未收尾的会话持续堆积。
- 工具描述去重：行为约束只留在协议段落，工具描述只说明"做什么、返回什么"。

### 测试

- 新增 `test/internal-guard.test.mjs`（8 项）：继承的宽模式被收窄、已只读时不重复写事件、日志不可写时拒绝 shell、无沙箱策略时拒绝 shell、只读工具不被拦、`pinReadOnly` 幂等。
- 新增 `test/schema-contract.test.mjs`：从**运行中的 DSH 安装**导入真实校验器（`validateJsonSchemaValue`），对 `cross_review_final` 的每一条可达返回值做 `output.schema` 校验。这是本次枚举违约能漏过 36 项测试的根因——旧测试直接调 `execute()`，绕过了 pipeline 的返回值校验。该文件在安装不可达时干净跳过。
- 新增 `test/composition.test.mjs`（5 项）：解析 `cordis.patch.yml` 并**实际求值每一条 `!!js` 表达式**，断言解析出的路径存在、`dsh-doc` 技能可见、只读守卫是内部预设的最后一行、以及预设仍保留 `standard` 的关键能力行。
- 测试从 36 项增至 56 项；在 DSH 运行时下（`ELECTRON_RUN_AS_NODE=1`，可穿透 app.asar）56/56 全通过，0 跳过。

### 修复（补充）

- **`customSkillDirs` 表达式会在激活时抛错**：最初照搬 `standard` 预设的写法，但 `createRequire(baseUrl)` 是相对**声明它的 patch 文件**解析的。本插件位于安装目录之外，该表达式在这里抛 `MODULE_NOT_FOUND`，会让整个预设激活失败（不只是少一个技能目录）。改为从 `DSH_INSTALL_DIR` 锚点解析，并由 `test/composition.test.mjs` 实测求值守住。

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
