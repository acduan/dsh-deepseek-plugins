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
  return {
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
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
  else if (['fail', 'failed', 'disagree', 'objection', 'reject', 'blocked'].includes(verdict)) verdict = 'objection'
  else if (record.agree === true || record.passed === true) verdict = 'consensus'
  else if (record.agree === false || record.passed === false) verdict = 'objection'
  else verdict = 'unstructured'

  const objections = toStrArray(record.objections)
  const omissions = toStrArray(record.omissions)
  const risks = toStrArray(record.risks)
  const alternatives = toStrArray(record.alternatives)
  const requiredFixes = toStrArray(record.required_fixes ?? record.requiredFixes)
  const evidence = toStrArray(record.evidence)
  const summary =
    (typeof record.summary === 'string' && record.summary.trim()) ||
    (typeof record.reasoning === 'string' && record.reasoning.trim()) ||
    (typeof record.comment === 'string' && record.comment.trim()) ||
    (verdict === 'unstructured'
      ? `复核者返回了非结构化结论，按未达成共识处理。原文：${truncate(rawText, 1200)}`
      : verdict === 'consensus'
        ? '复核者未发现实质性反对意见。'
        : '复核者提出了反对意见。')

  // A "consensus" verdict cannot carry blocking objections: fail closed.
  const blocking = objections.length + omissions.length + risks.length + requiredFixes.length
  if (verdict === 'consensus' && blocking > 0) verdict = 'objection'

  return {
    verdict,
    summary: truncate(summary, 2000),
    objections,
    omissions,
    risks,
    alternatives,
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
  return `你是「复核者」（adversarial reviewer）。你不是主代理的助手，你的职责是主动寻找主代理决策中的幻觉、遗漏、绕路、错误、过度自信和“未验证就打勾”。

主代理即将执行或已经形成的步骤（只以这段材料为准，你无法看到主代理的对话）：
---BEGIN SUBJECT---
${args.subject}
---END SUBJECT---

审查类别：${category}
${checklistFor(category, args.role)}
${options.length > 0 ? `\n主代理准备让用户选择的选项（请检查选项本身是否成立，并补充选项之外的替代方案）：\n${bulletList(options)}` : ''}
${args.context ? `\n主代理补充的上下文：\n${args.context}` : ''}
${args.evidence ? `\n主代理声称已经完成的验证：\n${args.evidence}` : ''}

工作要求：
1. 不要相信主代理的结论。能验证的必须独立验证：用 web_search/web_fetch 查外部事实与最新行为；用 read/glob/grep 检查工作区真实代码与文件；可以运行只读命令或测试来复核，但绝对不要修改任何文件、不要安装依赖、不要执行有副作用的命令。
2. 只提出具体、可操作、有证据的反对意见。不要为了反对而编造问题，也不要因为“看起来差不多”就放行。
3. 如果某项关键事实无法验证，把它列为 required_fixes，要求主代理补充证据或缩小结论范围。
4. 如果主代理的步骤确实成立且证据充分，返回 consensus；否则返回 objection。
5. 最后只输出一个 JSON 对象，不要输出 Markdown 代码围栏，不要输出 JSON 之外的文字：
{"verdict":"consensus|objection","summary":"一句话结论","objections":["..."],"omissions":["..."],"risks":["..."],"alternatives":["..."],"required_fixes":["..."],"evidence":["你实际验证了什么，结论是什么"]}`
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

async function runChild(ctx, exec, preset, route, prompt, label) {
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
  try {
    const result = await activation.result
    return { result, childId: activation.childId }
  } catch (error) {
    try {
      await activation.dispose?.()
    } catch {
      // Cancellation cleanup failure must not hide the original failure.
    }
    throw error
  }
}

function rememberReview(sessionId, args) {
  const explicit = toStrArray(args.target_tools)
  const categoryTargets = TARGETS_BY_CATEGORY[args.category]
  const targets =
    explicit.length > 0
      ? new Set(explicit)
      : Array.isArray(categoryTargets) && categoryTargets.length > 0
        ? new Set(categoryTargets)
        : null
  reviews.set(sessionId, { targets, at: Date.now() })
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
    reviews.delete(sessionId)
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
            enum: ['consensus', 'objection', 'error', 'unstructured'],
          },
          summary: { type: 'string' },
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
      try {
        const prompt = buildReviewPrompt(args)
        const { result } = await runChild(ctx, exec, 'cross-review-reviewer', routes.reviewer, prompt, '交叉复核')
        const rawText = extractText(result)
        if (result?.stopReason !== undefined && result.stopReason !== 'completed') {
          const diagnostic = typeof result.diagnostic === 'string' ? `：${result.diagnostic}` : ''
          return errorReview(`复核子代理未正常完成（stopReason=${result.stopReason}）${diagnostic}`, modelLabel)
        }
        const parsed = parseJsonLoose(rawText)
        const normalized = normalizeReview(parsed, rawText, modelLabel)
        if (
          config.enforceGuard !== false &&
          normalized.verdict === 'consensus' &&
          typeof sessionId === 'string' &&
          sessionId.length > 0
        ) {
          rememberReview(sessionId, args)
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
      try {
        const prompt = buildArbitrationPrompt(args)
        const { result } = await runChild(ctx, exec, 'cross-review-arbiter', routes.arbiter, prompt, '交叉复核裁决')
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

function buildProtocol(routes) {
  return `## 交叉复核模式协议（Cross-Verification Mode，强制）

你是主代理（main agent），但你的结论默认不可信，直到经过独立的「复核者」审查。这个模式存在的目的，是防止模型把幻觉、遗漏、绕路、错误或未完成的验证当成“已完成”打勾。

### 必须调用 \`cross_review\` 的时机
1. 形成或改变方案、架构、需求理解、任务拆分、范围与验收标准时。
2. 执行任何会修改文件/配置/环境/仓库的命令之前：write、edit、apply_patch、bash/pwsh、安装依赖、git commit/push、部署、删除、移动等。
3. 对用户或团队宣称“完成/通过/修复/已测试/没问题/已交付”之前。
4. 调用 \`ask_user_question\` 之前：把每个问题、全部选项、推荐项与理由交给复核者。复核者可以质疑选项本身、补充选项之外的方案、指出伪二选一或遗漏的用户决策。
5. 团队模式下，leader 的每个关键决策、分工、进度判断和最终答复。

### 调用方式
\`cross_review\` 会新开一个独立复核子代理（默认模型：${routeLabel(routes.reviewer)}）。它看不到你的对话，所以 subject 必须自包含：目标、当前方案/命令原文、相关文件路径、已运行过的验证、你的依据。只读检索可以合并审查，但每个写操作/危险命令/用户问题/交付声明必须单独审查。

### 共识与裁决规则
- \`consensus\`：可以继续。仍需按复核者提出的非阻塞建议调整。
- \`objection\`：不得继续。按 \`required_fixes\` 修改后，对同一 subject 重新调用 \`cross_review\`，同一事项最多 3 轮。
- 3 轮后仍 \`objection\`，或涉及安全、不可逆、重大范围分歧：调用 \`cross_review_arbitrate\`，提交主代理立场与复核者意见。裁决由 ${routeLabel(routes.arbiter)} 作出，具有约束力，必须执行 \`required_actions\`。
- \`error\` 或 \`unstructured\`：视为未达成共识；补齐信息后重试，绝不能当作通过。

### 团队模式（Agent Teams）
- 团队任务开始时，Lead 必须创建一个名为 \`leader1\` 的常驻复核队友。leader1 只做质疑与验收，不执行主任务，对 Lead 的决策、分工、进度和最终答复提出反对意见。
- 每个职能队友对应一个复核角色：需求分析→需求质疑者；前端开发→前端体验质疑者（重点：美观、简洁、一致性、可访问性、响应式、交互细节）；后端开发→后端健壮性/安全性质疑者；测试→测试有效性质疑者（覆盖、边界、假阳性）；文档→文档准确性质疑者；交付→交付验收质疑者。
- 队友提交交付物前必须调用 \`cross_review\`（或由 Lead 为其创建对应 reviewer 队友）。复核者只读、可联网、可运行只读验证命令，不得修改交付物。
- 任何成员不得用“已打勾”代替证据；没有交叉复核记录的完成声明无效。

### 行为准则
- 先证据后结论；不确定就说不确定并补验证。
- 不允许绕过审查：不得把写操作拆成更小命令来规避，不得以“只是小改动”跳过。
- 审查后必须显式记录本步结论（通过/修改/裁决）再继续。`
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
  const policy = { enforceGuard: config?.enforceGuard !== false }
  const getRoutes = () => liveRoutes(ctx, config)
  ctx.tools.register(makeReviewTool(ctx, policy, getRoutes))
  ctx.tools.register(makeArbitrateTool(ctx, policy, getRoutes))
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
  normalizeReview,
  normalizeArbitration,
  parseJsonLoose,
  routeOf,
}
