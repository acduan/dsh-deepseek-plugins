// @local/dsh-cross-review
// Host plugin for the "Cross-Verification Mode" (交叉复核模式) agent preset.
//
// It registers two model-facing tools on every Agent using this preset:
//   - cross_review: spawns an independent reviewer child on a different model
//     (default Hy4.WorkBuddy via `magpie`) and waits for its verdict.
//   - cross_review_arbitrate: when review and main disagree, spawns an arbiter
//     child on GPT-6.1 Sol (via `magpie-responses`) and returns a binding ruling.
//
// It also installs a small tool guard so write/edit/shell/ask-user/present/
// spawn-teammate calls consume a fresh `consensus` review, and a system-prompt
// protocol section that explains the mode. The plugin is mounted only inside a
// preset (never globally), so ordinary sessions are unaffected.
//
// No imports from the DSH installation are used on purpose: profile-installed
// plugins are resolved from the user profile, and importing dsh packages there
// would make the bundle fragile across app updates. The registry accepts this
// plain tool-definition shape.

export const name = 'cross-review'
export const inject = ['tools', 'subagents', 'systemPrompt']

const DEFAULT_REVIEWER = {
  provider: 'magpie',
  model: 'workbuddy/hy4free',
  reasoningEffort: 'high',
}

const DEFAULT_ARBITER = {
  provider: 'magpie-responses',
  model: 'packycode1/gpt-6.1-sol',
  reasoningEffort: 'high',
}

const REVIEW_TTL_MS = 20 * 60 * 1000

// Tools that require a fresh consensus review before a call is dispatched.
const ENFORCED_TOOLS = new Set([
  'write',
  'edit',
  'apply_patch',
  'bash',
  'pwsh',
  'ask_user_question',
  'present',
  'spawn_teammate',
])

const TARGETS_BY_CATEGORY = {
  command: ['bash', 'pwsh'],
  user_choice: ['ask_user_question'],
  final: ['present'],
}

// Per-session proof of the last consensus review. The guard consumes it on the
// first matching enforced tool call, so one review authorizes one action.
const reviews = new Map()

function routeOf(value, fallback) {
  const hasRoute = value !== null && typeof value === 'object' && !Array.isArray(value)
  const candidate = hasRoute ? value : {}
  const provider =
    typeof candidate.provider === 'string' && candidate.provider.trim() !== ''
      ? candidate.provider.trim()
      : fallback.provider
  const model =
    typeof candidate.model === 'string' && candidate.model.trim() !== ''
      ? candidate.model.trim()
      : fallback.model
  const reasoningEffort = hasRoute
    ? typeof candidate.reasoningEffort === 'string' && candidate.reasoningEffort.trim() !== ''
      ? candidate.reasoningEffort.trim()
      : undefined
    : fallback.reasoningEffort
  // Route-level policy from the settings page: a disabled role short-circuits
  // its tool, and the timeout overrides the deployment default per role.
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled !== false
  const timeoutMs =
    Number.isFinite(candidate.timeoutMs) && candidate.timeoutMs > 0 ? candidate.timeoutMs : fallback.timeoutMs
  return {
    enabled,
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
  }
}

function routeTimeout(route, fallbackMs) {
  if (Number.isFinite(route?.timeoutMs) && route.timeoutMs > 0) return route.timeoutMs
  return Number.isFinite(fallbackMs) && fallbackMs > 0 ? fallbackMs : 180000
}

function routeLabel(route) {
  return `${route.provider}/${route.model}`
}

function truncate(text, max = 12000) {
  if (typeof text !== 'string') return ''
  return text.length <= max ? text : `${text.slice(0, max)}\n[truncated ${text.length - max} chars]`
}

function toStrArray(value) {
  if (!Array.isArray(value)) return []
  return value
    .map((item) => {
      if (typeof item === 'string') return item.trim()
      if (item === null || item === undefined) return ''
      try {
        return JSON.stringify(item)
      } catch {
        return String(item)
      }
    })
    .filter((item) => item.length > 0)
}

function bulletList(items, emptyText = '（无）') {
  return items.length === 0 ? emptyText : items.map((item) => `- ${item}`).join('\n')
}

function extractText(result) {
  if (result === null || result === undefined) return ''
  if (typeof result.output === 'string') return result.output.trim()
  if (!Array.isArray(result.output)) return ''
  return result.output
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function parseJsonLoose(text) {
  const cleaned = String(text ?? '')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
  try {
    return JSON.parse(cleaned)
  } catch {
    // Fall through to a brace slice: models sometimes wrap JSON in prose.
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start >= 0 && end > start) {
    try {
      return JSON.parse(cleaned.slice(start, end + 1))
    } catch {
      // Fall through to unstructured.
    }
  }
  return undefined
}

function normalizeReview(parsed, rawText, modelLabel) {
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  let verdict = typeof record.verdict === 'string' ? record.verdict.toLowerCase() : ''
  if (['pass', 'passed', 'agree', 'agreed', 'consensus', 'ok'].includes(verdict)) verdict = 'consensus'
  else if (['caution', 'proceed_with_caution', 'conditional', 'proceed', 'watch'].includes(verdict)) {
    verdict = 'proceed_with_caution'
  } else if (['fail', 'failed', 'disagree', 'objection', 'reject', 'blocked'].includes(verdict)) verdict = 'objection'
  else if (record.agree === true || record.passed === true) verdict = 'consensus'
  else if (record.agree === false || record.passed === false) verdict = 'objection'
  else verdict = 'unstructured'

  const objections = toStrArray(record.objections)
  const omissions = toStrArray(record.omissions)
  const risks = toStrArray(record.risks)
  const alternatives = toStrArray(record.alternatives)
  const requiredFixes = toStrArray(record.required_fixes ?? record.requiredFixes)
  const evidence = toStrArray(record.evidence)
  // Supervision + guidance output. These are advisory: they never block a step,
  // but they are surfaced back to the main agent so it keeps them in view.
  const guidance = toStrArray(record.guidance ?? record.direction)
  const focusNext = toStrArray(record.focus_next ?? record.focusNext)
  const watchpoints = toStrArray(record.watchpoints ?? record.watch)
  const summary =
    (typeof record.summary === 'string' && record.summary.trim()) ||
    (typeof record.reasoning === 'string' && record.reasoning.trim()) ||
    (typeof record.comment === 'string' && record.comment.trim()) ||
    (verdict === 'unstructured'
      ? `复核者返回了非结构化结论，按未达成共识处理。原文：${truncate(rawText, 1200)}`
      : verdict === 'consensus'
        ? '复核者未发现实质性反对意见。'
        : verdict === 'proceed_with_caution'
          ? '复核者允许继续，但要求主代理盯住若干风险点。'
          : '复核者提出了反对意见。')

  // Only a real blocker blocks. Warnings and suggestions are guidance, not gates:
  // treating every remark as an objection is what made this mode feel slow.
  const blocking = objections.length + requiredFixes.length
  if (verdict === 'consensus' && blocking > 0) verdict = 'objection'
  if (verdict === 'proceed_with_caution' && blocking > 0) verdict = 'objection'

  return {
    verdict,
    summary: truncate(summary, 2000),
    objections,
    omissions,
    risks,
    alternatives,
    guidance,
    focus_next: focusNext,
    watchpoints,
    required_fixes: requiredFixes,
    evidence,
    reviewer_model: modelLabel,
    raw: truncate(rawText, 12000),
  }
}

function normalizeArbitration(parsed, rawText, modelLabel) {
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  let ruling = typeof record.ruling === 'string' ? record.ruling.toLowerCase() : ''
  if (['uphold_main', 'main', 'allow', 'approve', 'approved'].includes(ruling)) ruling = 'uphold_main'
  else if (['uphold_reviewer', 'reviewer', 'block', 'reject', 'rejected'].includes(ruling)) ruling = 'uphold_reviewer'
  else if (['modified', 'modify', 'revise', 'revised'].includes(ruling)) ruling = 'modified'
  else if (['need_more_evidence', 'insufficient', 'more_evidence'].includes(ruling)) ruling = 'need_more_evidence'
  else ruling = 'unstructured'

  const requiredActions = toStrArray(record.required_actions ?? record.requiredActions)
  const decision =
    (typeof record.decision === 'string' && record.decision.trim()) ||
    (typeof record.summary === 'string' && record.summary.trim()) ||
    (typeof record.reasoning === 'string' && record.reasoning.trim()) ||
    (ruling === 'unstructured'
      ? `裁决者返回了非结构化结论。原文：${truncate(rawText, 1200)}`
      : '裁决完成。')

  return {
    ruling,
    decision: truncate(decision, 2000),
    reasoning: truncate(
      (typeof record.reasoning === 'string' && record.reasoning.trim()) || '',
      4000,
    ),
    required_actions: requiredActions,
    arbiter_model: modelLabel,
    raw: truncate(rawText, 12000),
  }
}

function errorReview(message, modelLabel) {
  return {
    verdict: 'error',
    summary: truncate(message, 2000),
    guidance: [],
    focus_next: [],
    watchpoints: [],
    objections: [],
    omissions: [],
    risks: [],
    alternatives: [],
    required_fixes: [],
    evidence: [],
    reviewer_model: modelLabel,
    raw: '',
  }
}

function errorArbitration(message, modelLabel) {
  return {
    ruling: 'error',
    decision: truncate(message, 2000),
    reasoning: '',
    required_actions: [],
    arbiter_model: modelLabel,
    raw: '',
  }
}

function checklistFor(category, role) {
  const byCategory = {
    plan: [
      '目标是否被准确理解？成功标准是否可验证？',
      '是否存在更短、更直接、依赖更少的路线？是否在绕路？',
      '是否遗漏了关键约束、边界条件、回滚方案或依赖顺序？',
      '计划中哪些结论只是假设，尚未用仓库/文档/网页证据证明？',
    ],
    command: [
      '命令的原文、工作目录、参数与副作用是否明确？',
      '是否可能删除/覆盖/提交/推送/安装/联网或改变用户环境？是否可逆？',
      '是否能用只读命令或更小范围的检查替代？',
      '失败时会发生什么？是否有回滚或恢复路径？',
    ],
    requirements: [
      '需求是否完整、无歧义、无内部矛盾？隐含假设是什么？',
      '是否把用户没说的东西当成了需求？是否遗漏非功能需求？',
      '验收标准是否可测试、可观察？',
      '范围边界与不做的事情是否说清楚？',
    ],
    frontend: [
      '页面是否美观、简洁、层次清晰？留白、字体、间距、颜色是否协调一致？',
      '信息架构是否合理？用户的主要任务是否一眼可见？',
      '响应式、可访问性（对比度、键盘、语义）、空状态、加载态、错误态是否覆盖？',
      '是否存在过度设计、装饰堆砌、组件不一致或交互细节缺失？',
    ],
    backend: [
      '接口/数据模型是否一致？错误处理、并发、幂等、事务、资源释放是否考虑？',
      '安全边界、输入校验、权限、敏感信息、注入风险是否覆盖？',
      '性能与容量是否存在明显瓶颈？日志与可观测性是否足够？',
      '是否有未处理的失败路径或向后兼容问题？',
    ],
    test: [
      '测试是否真的覆盖了变更点与关键边界？是否存在假阳性/假阴性？',
      '测试是否只验证实现细节而没有验证用户行为？',
      '是否有未测试的错误路径、并发路径、回归风险？',
      '“通过”的证据是什么？命令、输出、环境是否可复现？',
    ],
    document: [
      '文档内容与代码/配置/实际行为是否一致？',
      '是否有过时示例、错误命令、缺失前置条件或误导性描述？',
      '术语、结构、可读性是否适合目标读者？',
    ],
    user_choice: [
      '问题是否真的需要用户决定，而不是可以通过检查得到答案？',
      '每个选项是否具体、互斥、可执行？是否存在伪二选一？',
      '是否遗漏了选项之外的更好方案、维持现状或暂缓决定？',
      '推荐项的理由是否成立？问题的措辞是否诱导？',
    ],
    final: [
      '所有声称“完成/通过/修复/已交付”的点是否有可复现证据？',
      '是否仍有未运行的测试、未检查的文件、未处理的警告或已知限制？',
      '交付物是否真实存在、路径正确、内容与声明一致？',
      '是否存在把“打勾”当成证据、把部分完成说成全部完成的情况？',
    ],
    other: [
      '结论的事实依据是什么？哪些是假设？',
      '是否存在遗漏、绕路、错误或过度自信？',
      '下一步最小可验证动作是什么？',
    ],
  }
  const items = byCategory[category] ?? byCategory.other
  const roleLine = role ? `本次审查角色：${role}\n` : ''
  return `${roleLine}请逐项检查：\n${bulletList(items)}`
}

function buildReviewPrompt(args) {
  const category = typeof args.category === 'string' ? args.category : 'other'
  const options = Array.isArray(args.options) ? args.options.filter((item) => typeof item === 'string') : []
  return `你是「复核者」（supervisor）。你在过程中的角色是**监督 + 引导**，不是拦路审批。

主代理当前所处的步骤或决定（只以这段材料为准，你看不到主代理的对话）：
---BEGIN SUBJECT---
${args.subject}
---END SUBJECT---

审查类别：${category}
${checklistFor(category, args.role)}
${options.length > 0 ? `\n主代理准备让用户选择的选项（请检查选项本身是否成立，并补充选项之外的替代方案）：\n${bulletList(options)}` : ''}
${args.context ? `\n主代理补充的上下文：\n${args.context}` : ''}
${args.evidence ? `\n主代理声称已经完成的验证：\n${args.evidence}` : ''}

你的职责分三层，按重要性排序：
1. **引导（guidance）**：告诉主代理下一步最该做什么、最省力的正确路径是什么、有哪些现成的东西可以直接用而不必重造。这是你最有价值的输出。
2. **监督（watchpoints）**：指出这条路上最容易翻车的点，让主代理在过程中自己盯住，而不是等出错再返工。
3. **拦截（objections）**：只在**会导致返工、数据损坏、安全风险、或明显与用户目标相反**时才提出。措辞偏好、可优化但非必须、锦上添花的建议一律放进 guidance，不要放这里。

判定规则（很重要，不要过度拦截）：
- consensus：步骤可行，没有阻塞问题。即使你有改进建议也用这个，建议写进 guidance。
- proceed_with_caution：可以做，但存在需要盯住的风险。把风险写进 watchpoints。
- objection：**仅当**继续下去一定会出错或造成不可逆后果时才用。此时必须在 objections 里写清"会发生什么"。

工作要求：
1. 能验证的独立验证：用 read/glob/grep 看真实代码与文件；只读命令或测试可以跑，但绝对不要修改任何文件、不要安装依赖、不要执行有副作用的命令。
2. 不要为了显得严格而编造问题；也不要因为"看起来差不多"就放过真实缺陷。
3. 如果某项关键事实你无法验证，写进 watchpoints 提醒主代理自己补证据，而不是直接判 objection。
4. 最后只输出一个 JSON 对象，不要 Markdown 代码围栏，不要 JSON 之外的文字：
{"verdict":"consensus|proceed_with_caution|objection","summary":"一句话结论","guidance":["下一步该做什么、更省力的路径"],"focus_next":["接下来最该优先处理的事项"],"watchpoints":["过程中要盯住的风险点"],"objections":["仅限会导致返工/损坏/安全问题的阻塞项"],"risks":["..."],"alternatives":["..."],"required_fixes":["仅限 objection 时必须先修的项"],"evidence":["你实际验证了什么，结论是什么"]}`
}

function buildArbitrationPrompt(args) {
  return `你是「裁决者」（arbiter）。主代理与复核者无法达成共识，现在由你做最终裁决。你必须独立验证，而不是简单支持任何一方。

步骤/决策：
---BEGIN SUBJECT---
${args.subject}
---END SUBJECT---

主代理立场：
${args.main_position}

复核者立场：
${args.reviewer_position}

${args.context ? `补充上下文：\n${args.context}\n` : ''}
${args.evidence ? `已有证据：\n${args.evidence}\n` : ''}
裁决规则：
1. 用你被授予的工具独立核查关键事实（网页、文件、只读命令/测试）；不要修改任何文件。
2. 判断主代理是否可以按原方案继续，还是必须采纳复核者意见/修改方案，还是证据不足需要补充。
3. 你的裁决是最终结果，主代理必须执行 required_actions。
4. 最后只输出一个 JSON 对象，不要输出 Markdown 代码围栏，不要输出 JSON 之外的文字：
{"ruling":"uphold_main|uphold_reviewer|modified|need_more_evidence","decision":"最终决定","reasoning":"裁决理由","required_actions":["主代理必须执行的动作"]}`
}

function buildBriefPrompt(args) {
  return `你是「裁决者」（arbiter），本次担任**需求解析**。主代理还没开工，你先把需求整理成可执行、可验收的规格，避免主代理理解偏差后返工。

用户原始需求（只以这段材料为准，你看不到用户与主代理的对话）：
---BEGIN SUBJECT---
${args.requirement}
---END SUBJECT---

${args.context ? `补充上下文：\n${args.context}\n` : ''}
${args.constraints ? `已知约束：\n${args.constraints}\n` : ''}
工作要求：
1. 用 read/glob/grep 查看工作区真实现状，把需求落到具体文件/模块上；不要凭空假设。
2. 只做需求解析，不要开始实现，不要修改任何文件。
3. 明确指出需求中模糊、矛盾、缺失的地方：能合理推断的写进 assumptions，不能推断的写进 open_questions。
4. 验收标准必须可观察、可验证，不要写"体验良好"这类无法检验的条目。
5. 最后只输出一个 JSON 对象，不要 Markdown 代码围栏，不要 JSON 之外的文字：
{"goal":"一句话目标","in_scope":["必须做的"],"out_of_scope":["明确不做的"],"acceptance_criteria":["可验证的验收标准"],"assumptions":["你做的合理推断"],"open_questions":["必须问用户才能确定的"],"risks":["主要风险"],"suggested_steps":["建议的执行顺序"]}`
}

function buildFinalAuditPrompt(args) {
  return `你是「裁决者」（arbiter），本次担任**交付审核**。主代理声称已经完成，你要逐条对照验收标准核查，而不是听它自己说"做完了"。

需求与验收标准：
---BEGIN SUBJECT---
${args.requirement}
---END SUBJECT---

主代理的交付声明：
${args.claim}

${args.evidence ? `主代理提供的证据：\n${args.evidence}\n` : ''}
${args.context ? `补充上下文：\n${args.context}\n` : ''}
审核规则：
1. **必须自己验证**，不要相信主代理的声明。用 read/glob/grep 检查真实文件；只读命令或测试可以跑；不要修改任何文件。
2. 逐条核对验收标准，每条给出 pass / fail / unverified 与依据。
3. 特别检查这些常见虚假完成：声称改了但文件没变、声称测试通过但没有输出、只做了一部分却说全部完成、把"能编译"当成"功能正确"、留下未处理的警告或 TODO 却报告已完成。
4. 只要有任何一条验收标准 fail 或关键项 unverified，就返回 not_ready。
5. 最后只输出一个 JSON 对象，不要 Markdown 代码围栏，不要 JSON 之外的文字：
{"ruling":"ready|not_ready|need_more_evidence","summary":"一句话结论","criteria":[{"item":"验收标准原文","status":"pass|fail|unverified","evidence":"你验证了什么"}],"blocking_issues":["必须修完才能交付的"],"required_actions":["主代理接下来必须做的"],"reasoning":"审核理由"}`
}

function abortError(signal) {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error('交叉复核已取消')
  error.name = 'AbortError'
  return error
}

async function runChild(ctx, exec, preset, route, prompt, label, timeoutMs) {
  const subagents = ctx.get('subagents')
  if (subagents === undefined || typeof subagents.startActivation !== 'function') {
    throw new Error('交叉复核模式需要 subagents 服务，但当前组合没有挂载该服务')
  }
  if (exec.agent === undefined) {
    throw new Error('交叉复核模式工具必须由 Agent 调用（exec.agent 缺失）')
  }
  const activation = await subagents.startActivation({
    provider: 'spawn',
    label,
    request: {
      prompt: [{ type: 'text', text: prompt }],
      parent: exec.agent,
      agentPreset: preset,
      agentOptions: route,
    },
    signal: exec.signal,
    delivery: 'caller',
  })

  // The child runs independently of this tool call, so cancellation and the
  // deadline must be observed here: a bare `await activation.result` would keep
  // the tool — and the user's Stop button — waiting until the child settles.
  let timer
  let onAbort
  const stopped = new Promise((_resolve, reject) => {
    const signal = exec.signal
    if (signal !== undefined) {
      if (signal.aborted) {
        reject(abortError(signal))
        return
      }
      onAbort = () => reject(abortError(signal))
      signal.addEventListener('abort', onAbort, { once: true })
    }
    if (Number.isFinite(timeoutMs) && timeoutMs > 0) {
      timer = setTimeout(() => {
        const error = new Error(`交叉复核超时（${Math.round(timeoutMs / 1000)}s）`)
        error.name = 'TimeoutError'
        reject(error)
      }, timeoutMs)
    }
  })

  try {
    const result = await Promise.race([activation.result, stopped])
    return { result, childId: activation.childId }
  } catch (error) {
    try {
      await activation.dispose?.()
    } catch {
      // Cancellation cleanup failure must not hide the original failure.
    }
    throw error
  } finally {
    if (timer !== undefined) clearTimeout(timer)
    if (onAbort !== undefined) exec.signal?.removeEventListener?.('abort', onAbort)
  }
}

function rememberReview(sessionId, args, uses) {
  const explicit = toStrArray(args.target_tools)
  const categoryTargets = TARGETS_BY_CATEGORY[args.category]
  const targets =
    explicit.length > 0
      ? new Set(explicit)
      : Array.isArray(categoryTargets) && categoryTargets.length > 0
        ? new Set(categoryTargets)
        : null
  reviews.set(sessionId, { targets, at: Date.now(), remaining: uses })
}

function forgetReview(sessionId) {
  reviews.delete(sessionId)
}

function guardBlockMessage(toolName) {
  return (
    `交叉复核模式（Cross-Verification Mode）拦截：调用 \`${toolName}\` 之前必须先完成一次针对该动作的 \`cross_review\`。` +
    `请把即将执行的完整内容放进 subject，并在 target_tools 中包含 "${toolName}"；只有 verdict 为 consensus 后才能重试该动作。`
  )
}

function installGuard(ctx, config) {
  if (config.enforceGuard === false) return
  ctx.tools.guard((exec) => {
    const toolName = typeof exec.name === 'string' ? exec.name : ''
    if (!ENFORCED_TOOLS.has(toolName)) return undefined
    const sessionId = exec.agent?.session?.id
    if (typeof sessionId !== 'string' || sessionId.length === 0) return undefined
    const record = reviews.get(sessionId)
    if (record === undefined || Date.now() - record.at > REVIEW_TTL_MS) {
      if (record !== undefined) reviews.delete(sessionId)
      return guardBlockMessage(toolName)
    }
    if (record.targets !== null && !record.targets.has(toolName)) {
      return `交叉复核模式（Cross-Verification Mode）拦截：最近的 cross_review 没有授权 \`${toolName}\`。请针对该动作重新审查，并在 target_tools 中包含 "${toolName}"。`
    }
    record.remaining -= 1
    if (record.remaining <= 0) reviews.delete(sessionId)
    return undefined
  })
}

function makeReviewTool(ctx, config, getRoutes) {
  return {
    name: 'cross_review',
    description:
      '交叉复核模式的核心工具：把当前步骤/决策/命令/交付物/用户问题交给一个独立的「复核者」子代理审查。' +
      '复核者使用独立模型（默认 Hy4.WorkBuddy），可联网搜索、读取文件并运行只读验证；它看不到本会话，所以 subject 必须自包含。' +
      '返回 verdict=consensus 才可继续；objection 时按 required_fixes 修改后复审；error/unstructured 视为未通过。' +
      '每个写操作、危险命令、用户提问和完成声明都必须先审核。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subject: {
          type: 'string',
          description: '被审查步骤的自包含描述：目标、当前方案或命令原文、相关文件路径、已有证据与假设。',
        },
        category: {
          type: 'string',
          enum: ['plan', 'command', 'requirements', 'frontend', 'backend', 'test', 'document', 'user_choice', 'final', 'other'],
          description: '审查类别；决定复核者使用的检查清单。',
        },
        role: {
          type: 'string',
          description: '可选：被审查的角色，例如 leader、需求分析、前端开发、后端开发、测试、交付。',
        },
        context: {
          type: 'string',
          description: '可选：补充上下文、约束、用户原话、已尝试过的做法。',
        },
        options: {
          type: 'array',
          items: { type: 'string' },
          description: '当 category=user_choice 时，主代理准备展示给用户的全部选项原文。',
        },
        evidence: {
          type: 'string',
          description: '可选：主代理已经完成的验证（命令、测试、阅读、URL）。',
        },
        target_tools: {
          type: 'array',
          items: { type: 'string' },
          description: '本次审查拟授权的工具名列表，例如 ["write"] 或 ["pwsh"]；建议填写，便于执行守卫逐个消耗。',
        },
      },
      required: ['subject', 'category'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          verdict: {
            type: 'string',
            enum: ['consensus', 'proceed_with_caution', 'objection', 'error', 'unstructured'],
          },
          summary: { type: 'string' },
          guidance: { type: 'array', items: { type: 'string' } },
          focus_next: { type: 'array', items: { type: 'string' } },
          watchpoints: { type: 'array', items: { type: 'string' } },
          objections: { type: 'array', items: { type: 'string' } },
          omissions: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          alternatives: { type: 'array', items: { type: 'string' } },
          required_fixes: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: { type: 'string' } },
          reviewer_model: { type: 'string' },
          raw: { type: 'string' },
        },
        required: [
          'verdict',
          'summary',
          'guidance',
          'focus_next',
          'watchpoints',
          'objections',
          'omissions',
          'risks',
          'alternatives',
          'required_fixes',
          'evidence',
          'reviewer_model',
        ],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.reviewer)
      const sessionId = exec.agent?.session?.id
      if (typeof sessionId === 'string' && sessionId.length > 0) forgetReview(sessionId)

      // A disabled reviewer must not spawn a child, and must not become a silent
      // gate either: it authorizes the guarded call and says so explicitly.
      if (routes.reviewer.enabled === false) {
        if (
          config.enforceGuard !== false &&
          typeof sessionId === 'string' &&
          sessionId.length > 0
        ) {
          rememberReview(sessionId, args, config.reviewUses)
        }
        return {
          verdict: 'consensus',
          summary: '复核者已在设置中停用，本次直接放行（未启动子代理）。',
          guidance: [],
          focus_next: [],
          watchpoints: [],
          objections: [],
          omissions: [],
          risks: [],
          alternatives: [],
          required_fixes: [],
          evidence: [],
          reviewer_model: '',
          raw: '',
        }
      }

      try {
        const prompt = buildReviewPrompt(args)
        const { result } = await runChild(
          ctx,
          exec,
          'cross-review-internal',
          routes.reviewer,
          prompt,
          '交叉复核',
          routeTimeout(routes.reviewer, config.reviewTimeoutMs),
        )
        const rawText = extractText(result)
        if (result?.stopReason !== undefined && result.stopReason !== 'completed') {
          const diagnostic = typeof result.diagnostic === 'string' ? `：${result.diagnostic}` : ''
          return errorReview(`复核子代理未正常完成（stopReason=${result.stopReason}）${diagnostic}`, modelLabel)
        }
        const parsed = parseJsonLoose(rawText)
        const normalized = normalizeReview(parsed, rawText, modelLabel)
        // Both outcomes authorize the guarded call: `proceed_with_caution`
        // carries supervision notes, not a blocker. Only `objection` refuses.
        if (
          config.enforceGuard !== false &&
          (normalized.verdict === 'consensus' || normalized.verdict === 'proceed_with_caution') &&
          typeof sessionId === 'string' &&
          sessionId.length > 0
        ) {
          rememberReview(sessionId, args, config.reviewUses)
        }
        return normalized
      } catch (error) {
        return errorReview(
          `无法完成交叉复核：${error instanceof Error ? error.message : String(error)}`,
          modelLabel,
        )
      }
    },
  }
}

function makeArbitrateTool(ctx, config, getRoutes) {
  return {
    name: 'cross_review_arbitrate',
    description:
      '当主代理与复核者无法达成共识时调用：把双方立场交给独立「裁决者」子代理，由默认 GPT-6.1 Sol 的模型做最终裁决。' +
      '裁决结果具有约束力，主代理必须执行 required_actions。只有在前述 cross_review 多轮仍为 objection、或涉及安全/不可逆/重大范围分歧时使用。',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        subject: {
          type: 'string',
          description: '争议所涉步骤/决策的自包含描述。',
        },
        main_position: {
          type: 'string',
          description: '主代理的立场：主张、依据、已做验证、拟执行动作。',
        },
        reviewer_position: {
          type: 'string',
          description: '复核者的完整反对意见（可粘贴 cross_review 的 JSON 摘要）。',
        },
        context: {
          type: 'string',
          description: '可选：补充上下文、约束、用户原话。',
        },
        evidence: {
          type: 'string',
          description: '可选：双方已收集的证据、命令输出、测试结果、网页来源。',
        },
      },
      required: ['subject', 'main_position', 'reviewer_position'],
    },
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ruling: {
            type: 'string',
            enum: ['uphold_main', 'uphold_reviewer', 'modified', 'need_more_evidence', 'error', 'unstructured'],
          },
          decision: { type: 'string' },
          reasoning: { type: 'string' },
          required_actions: { type: 'array', items: { type: 'string' } },
          arbiter_model: { type: 'string' },
          raw: { type: 'string' },
        },
        required: ['ruling', 'decision', 'reasoning', 'required_actions', 'arbiter_model'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.arbiter)
      if (routes.arbiter.enabled === false) {
        return {
          ruling: 'uphold_main',
          decision: '裁决者已在设置中停用，按主代理方案继续（未启动子代理）。',
          reasoning: '',
          required_actions: [],
          arbiter_model: '',
          raw: '',
        }
      }
      try {
        const prompt = buildArbitrationPrompt(args)
        const { result } = await runChild(
          ctx,
          exec,
          'cross-review-internal',
          routes.arbiter,
          prompt,
          '交叉复核裁决',
          routeTimeout(routes.arbiter, config.reviewTimeoutMs),
        )
        const rawText = extractText(result)
        if (result?.stopReason !== undefined && result.stopReason !== 'completed') {
          const diagnostic = typeof result.diagnostic === 'string' ? `：${result.diagnostic}` : ''
          return errorArbitration(`裁决子代理未正常完成（stopReason=${result.stopReason}）${diagnostic}`, modelLabel)
        }
        const parsed = parseJsonLoose(rawText)
        return normalizeArbitration(parsed, rawText, modelLabel)
      } catch (error) {
        return errorArbitration(
          `无法完成裁决：${error instanceof Error ? error.message : String(error)}`,
          modelLabel,
        )
      }
    },
  }
}

function normalizeBrief(parsed, rawText, modelLabel) {
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  return {
    goal: truncate(
      (typeof record.goal === 'string' && record.goal.trim()) ||
        (typeof record.summary === 'string' && record.summary.trim()) ||
        '需求已解析',
      1200,
    ),
    in_scope: toStrArray(record.in_scope ?? record.inScope),
    out_of_scope: toStrArray(record.out_of_scope ?? record.outOfScope),
    acceptance_criteria: toStrArray(record.acceptance_criteria ?? record.acceptanceCriteria),
    assumptions: toStrArray(record.assumptions),
    open_questions: toStrArray(record.open_questions ?? record.openQuestions),
    risks: toStrArray(record.risks),
    suggested_steps: toStrArray(record.suggested_steps ?? record.suggestedSteps),
    arbiter_model: modelLabel,
    raw: truncate(rawText, 12000),
  }
}

function normalizeFinalAudit(parsed, rawText, modelLabel) {
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  let ruling = typeof record.ruling === 'string' ? record.ruling.toLowerCase() : ''
  if (['ready', 'pass', 'passed', 'approved', 'ok'].includes(ruling)) ruling = 'ready'
  else if (['not_ready', 'notready', 'fail', 'failed', 'rejected', 'block'].includes(ruling)) ruling = 'not_ready'
  else if (['need_more_evidence', 'insufficient', 'unverified'].includes(ruling)) ruling = 'need_more_evidence'
  else ruling = 'unstructured'

  const criteria = []
  if (Array.isArray(record.criteria)) {
    for (const item of record.criteria) {
      if (item === null || typeof item !== 'object') continue
      const label = typeof item.item === 'string' ? item.item : ''
      if (label === '') continue
      let status = typeof item.status === 'string' ? item.status.toLowerCase() : ''
      if (!['pass', 'fail', 'unverified'].includes(status)) status = 'unverified'
      criteria.push({
        item: truncate(label, 500),
        status,
        evidence: truncate(typeof item.evidence === 'string' ? item.evidence : '', 1000),
      })
    }
  }

  const blocking = toStrArray(record.blocking_issues ?? record.blockingIssues)
  const requiredActions = toStrArray(record.required_actions ?? record.requiredActions)
  const hardFailures = criteria.filter((item) => item.status === 'fail').length
  const unverified = criteria.filter((item) => item.status === 'unverified').length

  // Fail closed: a "ready" verdict contradicting its own criteria is refused.
  // A proven failure means the work is not done; only missing evidence means we
  // cannot tell yet, which is a different answer for the caller.
  if (ruling === 'ready') {
    if (hardFailures > 0 || blocking.length > 0) ruling = 'not_ready'
    else if (unverified > 0) ruling = 'need_more_evidence'
  }

  return {
    ruling,
    summary: truncate(
      (typeof record.summary === 'string' && record.summary.trim()) ||
        (typeof record.reasoning === 'string' && record.reasoning.trim()) ||
        (ruling === 'ready' ? '交付审核通过。' : '交付审核未通过。'),
      2000,
    ),
    criteria,
    blocking_issues: blocking,
    required_actions: requiredActions,
    reasoning: truncate(typeof record.reasoning === 'string' ? record.reasoning : '', 4000),
    arbiter_model: modelLabel,
    raw: truncate(rawText, 12000),
  }
}

function errorBrief(message, modelLabel) {
  return {
    goal: truncate(message, 1200),
    in_scope: [],
    out_of_scope: [],
    acceptance_criteria: [],
    assumptions: [],
    open_questions: [],
    risks: [],
    suggested_steps: [],
    arbiter_model: modelLabel,
    raw: '',
  }
}

function errorFinalAudit(message, modelLabel) {
  return {
    ruling: 'error',
    summary: truncate(message, 2000),
    criteria: [],
    blocking_issues: [],
    required_actions: [],
    reasoning: '',
    arbiter_model: modelLabel,
    raw: '',
  }
}

function makeBriefTool(ctx, config, getRoutes) {
  return {
    name: 'cross_review_brief',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requirement: {
          type: 'string',
          description: '用户的原始需求原文（自包含）。',
        },
        context: { type: 'string', description: '可选：补充上下文、已有约定、相关文件路径。' },
        constraints: { type: 'string', description: '可选：已知约束（技术栈、时间、不可改动的部分）。' },
      },
      required: ['requirement'],
    },
    description:
      '开工前的需求解析（由裁决者执行）：把用户原始需求整理成可执行、可验收的规格，明确范围、验收标准、假设和必须确认的问题。' +
      '目的是让主代理一开始就理解正确，避免做完才发现方向错、返工重做。任务开始时调用一次即可，不要每步都调用。',
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          goal: { type: 'string' },
          in_scope: { type: 'array', items: { type: 'string' } },
          out_of_scope: { type: 'array', items: { type: 'string' } },
          acceptance_criteria: { type: 'array', items: { type: 'string' } },
          assumptions: { type: 'array', items: { type: 'string' } },
          open_questions: { type: 'array', items: { type: 'string' } },
          risks: { type: 'array', items: { type: 'string' } },
          suggested_steps: { type: 'array', items: { type: 'string' } },
          arbiter_model: { type: 'string' },
          raw: { type: 'string' },
        },
        required: [
          'goal',
          'in_scope',
          'out_of_scope',
          'acceptance_criteria',
          'assumptions',
          'open_questions',
          'risks',
          'suggested_steps',
          'arbiter_model',
        ],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.arbiter)
      if (routes.arbiter.enabled === false) {
        return {
          goal: '裁决者已在设置中停用，跳过需求解析（未启动子代理）。',
          in_scope: [],
          out_of_scope: [],
          acceptance_criteria: [],
          assumptions: [],
          open_questions: [],
          risks: [],
          suggested_steps: [],
          arbiter_model: '',
          raw: '',
        }
      }
      try {
        const prompt = buildBriefPrompt(args)
        const { result } = await runChild(
          ctx,
          exec,
          'cross-review-internal',
          routes.arbiter,
          prompt,
          '需求解析',
          routeTimeout(routes.arbiter, config.reviewTimeoutMs),
        )
        const rawText = extractText(result)
        if (result?.stopReason !== undefined && result.stopReason !== 'completed') {
          return errorBrief(`需求解析未正常完成（stopReason=${result.stopReason}）`, modelLabel)
        }
        return normalizeBrief(parseJsonLoose(rawText), rawText, modelLabel)
      } catch (error) {
        return errorBrief(
          `无法完成需求解析：${error instanceof Error ? error.message : String(error)}`,
          modelLabel,
        )
      }
    },
  }
}

function makeFinalAuditTool(ctx, config, getRoutes) {
  return {
    name: 'cross_review_final',
    parameters: {
      type: 'object',
      additionalProperties: false,
      properties: {
        requirement: {
          type: 'string',
          description: '需求与验收标准原文（可粘贴 cross_review_brief 的 goal + acceptance_criteria）。',
        },
        claim: {
          type: 'string',
          description: '主代理的交付声明：声称完成了什么、改了哪些文件、跑了哪些验证。',
        },
        evidence: { type: 'string', description: '可选：命令输出、测试结果、文件路径等证据。' },
        context: { type: 'string', description: '可选：补充上下文。' },
      },
      required: ['requirement', 'claim'],
    },
    description:
      '交付前的终局审核（由裁决者执行）：逐条核对验收标准，自己验证文件与测试，识别"声称完成但实际没做"的情况。' +
      '返回 ready 才可向用户宣布交付；not_ready 时按 required_actions 修完再审核。任务收尾调用一次，不要每步都调用。',
    output: {
      schema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          ruling: {
            type: 'string',
            enum: ['ready', 'not_ready', 'need_more_evidence', 'error', 'unstructured'],
          },
          summary: { type: 'string' },
          criteria: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              properties: {
                item: { type: 'string' },
                status: { type: 'string', enum: ['pass', 'fail', 'unverified'] },
                evidence: { type: 'string' },
              },
              required: ['item', 'status', 'evidence'],
            },
          },
          blocking_issues: { type: 'array', items: { type: 'string' } },
          required_actions: { type: 'array', items: { type: 'string' } },
          reasoning: { type: 'string' },
          arbiter_model: { type: 'string' },
          raw: { type: 'string' },
        },
        required: ['ruling', 'summary', 'criteria', 'blocking_issues', 'required_actions', 'arbiter_model'],
      },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.arbiter)
      if (routes.arbiter.enabled === false) {
        return {
          ruling: 'ready',
          summary: '裁决者已在设置中停用，跳过交付审核（未启动子代理）。',
          criteria: [],
          blocking_issues: [],
          required_actions: [],
          reasoning: '',
          arbiter_model: '',
          raw: '',
        }
      }
      try {
        const prompt = buildFinalAuditPrompt(args)
        const { result } = await runChild(
          ctx,
          exec,
          'cross-review-internal',
          routes.arbiter,
          prompt,
          '交付审核',
          routeTimeout(routes.arbiter, config.reviewTimeoutMs),
        )
        const rawText = extractText(result)
        if (result?.stopReason !== undefined && result.stopReason !== 'completed') {
          return errorFinalAudit(`交付审核未正常完成（stopReason=${result.stopReason}）`, modelLabel)
        }
        return normalizeFinalAudit(parseJsonLoose(rawText), rawText, modelLabel)
      } catch (error) {
        return errorFinalAudit(
          `无法完成交付审核：${error instanceof Error ? error.message : String(error)}`,
          modelLabel,
        )
      }
    },
  }
}

function buildProtocol(routes) {
  const reviewerOff = routes.reviewer.enabled === false
  const arbiterOff = routes.arbiter.enabled === false
  const statusLines = [
    reviewerOff ? '- 复核者：**当前已在设置中停用**，`cross_review` 会直接放行且不启动子代理。' : null,
    arbiterOff
      ? '- 裁决者：**当前已在设置中停用**，`cross_review_brief` / `cross_review_final` / `cross_review_arbitrate` 会直接放行。'
      : null,
  ].filter((line) => line !== null)

  return `## 交叉复核模式协议（Cross-Verification Mode）

本模式有三个角色，分工固定：**裁决者做需求解析与交付审核，主代理干活，复核者做过程监督与引导。**

### 角色分工
- **裁决者**（${routeLabel(routes.arbiter)}）：任务开始时解析需求，任务结束时审核交付。只在首尾各调用一次。
- **主代理**（你）：按解析出的规格执行，过程中保持自检。
- **复核者**（${routeLabel(routes.reviewer)}）：过程中给方向、盯风险，不替你做决定。
${statusLines.length > 0 ? `\n### 当前生效状态\n${statusLines.join('\n')}\n` : ''}
### 任务开始时：调用 \`cross_review_brief\`（一次）
把用户原始需求交给裁决者，得到 goal / 范围 / 验收标准 / 假设 / 待确认问题。
若 open_questions 里有必须用户决定的事项，先用 ask_user_question 问清楚再开工；其余按 assumptions 推进并在最终回复里说明。

### 执行过程中：按需调用 \`cross_review\`（监督 + 引导）
触发时机（不需要每步都调，挑真正有判断成本的节点）：
1. 方案定稿、架构选择、需求理解出现分歧时。
2. 要执行不可逆或影响面大的操作之前：删除、覆盖、批量改写、git push、安装依赖、部署。
3. 连续两次尝试都没解决问题时——此时更需要方向而不是再审一遍。

复核者返回三种结论：
- \`consensus\`：按它的 guidance 优化后继续。
- \`proceed_with_caution\`：**可以继续**，但必须把 watchpoints 当成执行时的检查清单。
- \`objection\`：只在会导致返工/损坏/安全问题时出现，按 required_fixes 修完再继续，同一事项最多 3 轮；仍不通过再调 \`cross_review_arbitrate\`。

读结果时优先看 **guidance 和 focus_next**——那是复核者给你的方向，比挑错更有价值。

### 任务结束时：调用 \`cross_review_final\`（一次）
把需求验收标准和你的交付声明交给裁决者，它会自己核对文件与测试。
- \`ready\`：才可以向用户宣布交付。
- \`not_ready\` / \`need_more_evidence\`：按 required_actions 修完再审核，不要跳过直接报告完成。

### 行为准则
- 先证据后结论；不确定就说不确定并补验证。
- 不允许绕过：不得把写操作拆成更小命令规避审查，不得以"只是小改动"跳过关键节点。
- 不要把复核者的每条建议都当成阻塞项；只有 objection 才阻塞。
- 最终回复里要写清：做了什么、验证了什么、还有哪些未验证或已知限制。`
}

function liveRoutes(ctx, config) {
  const service = ctx.get('crossReviewConfig')
  const live = service !== undefined && typeof service.get === 'function' ? service.get() : undefined
  const source = live !== null && typeof live === 'object' ? live : config
  return {
    reviewer: routeOf(source?.reviewer, DEFAULT_REVIEWER),
    arbiter: routeOf(source?.arbiter, DEFAULT_ARBITER),
  }
}

export function apply(ctx, config = {}) {
  const policy = {
    enforceGuard: config?.enforceGuard !== false,
    reviewUses: Number.isSafeInteger(config?.reviewUses) && config.reviewUses > 0 ? config.reviewUses : 8,
    reviewTimeoutMs:
      Number.isFinite(config?.reviewTimeoutMs) && config.reviewTimeoutMs > 0 ? config.reviewTimeoutMs : 180000,
  }
  const getRoutes = () => liveRoutes(ctx, config)
  ctx.tools.register(makeBriefTool(ctx, policy, getRoutes))
  ctx.tools.register(makeReviewTool(ctx, policy, getRoutes))
  ctx.tools.register(makeArbitrateTool(ctx, policy, getRoutes))
  ctx.tools.register(makeFinalAuditTool(ctx, policy, getRoutes))
  installGuard(ctx, policy)
  ctx.systemPrompt.section({
    name: 'cross-review:protocol',
    order: 150,
    text: () => buildProtocol(getRoutes()),
  })
}

// Exported for local unit checks; not part of the Cordis contract.
export {
  DEFAULT_REVIEWER,
  DEFAULT_ARBITER,
  buildReviewPrompt,
  buildArbitrationPrompt,
  buildBriefPrompt,
  buildFinalAuditPrompt,
  normalizeReview,
  normalizeArbitration,
  normalizeBrief,
  normalizeFinalAudit,
  parseJsonLoose,
  routeOf,
}
