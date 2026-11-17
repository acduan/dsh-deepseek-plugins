// @local/dsh-cross-review
// Host plugin for the "Cross-Verification Mode" (交叉复核模式) agent preset.
//
// It registers two model-facing tools and one system-prompt protocol section:
//
//   cross_review_brief : opening requirement brief, executed by the arbiter.
//   cross_review_final : closing delivery audit, executed by the arbiter. It
//                        reuses the brief this plugin remembered for the session,
//                        so the main agent does not have to copy criteria around.
//
// There is no reviewer role and no mid-task review tool: the only judgement in
// this mode happens at the two ends of the task.
//
// There is deliberately no execution guard: an earlier revision gated write,
// shell, ask-user and present calls behind a fresh consensus review, which
// multiplied child agents and made the mode unusably slow. Nothing in this file
// tracks review state for enforcement; a verdict is advice the main agent obeys
// because the protocol tells it to, not a lock.
//
// Every call receives objective, plugin-derived facts about what the session has
// actually done (files written, commands run, failed calls) extracted from the
// session event log, so the child does not have to take the caller's word for it.
//
// No imports from the DSH installation are used on purpose: profile-installed
// plugins are resolved from the user profile, and importing dsh packages there
// would make the bundle fragile across app updates. The registry accepts this
// plain tool-definition shape.

export const name = 'cross-review'
// `subagents` is intentionally not a hard dependency: without it the plugin still
// mounts and each tool returns an actionable error instead of breaking the whole
// preset composition.
export const inject = ['tools', 'systemPrompt']

const DEFAULT_ARBITER = {
  provider: 'magpie-responses',
  model: 'packycode1/gpt-6.1-sol',
  reasoningEffort: 'high',
  // Both duties default to on; the settings page can switch each one off.
  briefEnabled: true,
  auditEnabled: true,
}

const DEFAULT_TIMEOUT_MS = 180000
// One retry is enough: a second consecutive infrastructure failure is reported
// rather than paid for twice.
const RETRY_DELAY_MS = 900
const RETRYABLE_ERROR = /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|socket hang up|\b(408|429|500|502|503|504)\b|rate.?limit|overloaded|temporar|timeout/i

// The brief is remembered per session so the closing audit can reuse its
// acceptance criteria verbatim. Twelve hours is longer than any realistic task and
// short enough that a stale entry cannot leak into an unrelated session.
const BRIEF_TTL_MS = 12 * 60 * 60 * 1000
const briefs = new Map()

const WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch'])
const SHELL_TOOLS = new Set(['bash', 'pwsh'])

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
  // The arbiter owns two optional duties; each is switched independently so a
  // user can keep only the requirement briefing, for example.
  const hasDuties = fallback.briefEnabled !== undefined || fallback.auditEnabled !== undefined
  const duty = (key) =>
    typeof candidate[key] === 'boolean' ? candidate[key] : fallback[key] !== false
  return {
    enabled,
    ...(hasDuties ? { briefEnabled: duty('briefEnabled'), auditEnabled: duty('auditEnabled') } : {}),
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
    ...(Number.isFinite(timeoutMs) && timeoutMs > 0 ? { timeoutMs } : {}),
  }
}

function routeTimeout(route, fallbackMs) {
  if (Number.isFinite(route?.timeoutMs) && route.timeoutMs > 0) return route.timeoutMs
  return Number.isFinite(fallbackMs) && fallbackMs > 0 ? fallbackMs : DEFAULT_TIMEOUT_MS
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

function safeJsonParse(text) {
  if (typeof text !== 'string' || text.trim() === '') return undefined
  try {
    return JSON.parse(text)
  } catch {
    return undefined
  }
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

// Structured output is requested from the child through `outputSchema`, so the
// normalizers only have to cope with a legacy/text fallback. The child-facing
// schemas omit plugin-owned bookkeeping fields (model label, raw text), and the
// tool-facing schemas add them back.
function withToolFields(childSchema, extraProperties, extraRequired = []) {
  return {
    ...childSchema,
    properties: { ...childSchema.properties, ...extraProperties },
    required: [...(childSchema.required ?? []), ...extraRequired],
  }
}

const BRIEF_CHILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    goal: { type: 'string', description: '一句话目标' },
    in_scope: { type: 'array', items: { type: 'string' } },
    out_of_scope: { type: 'array', items: { type: 'string' } },
    acceptance_criteria: {
      type: 'array',
      items: { type: 'string' },
      description: '可观察、可验证的验收标准；不要写"体验良好"这类无法检验的条目',
    },
    assumptions: { type: 'array', items: { type: 'string' } },
    open_questions: { type: 'array', items: { type: 'string' } },
    risks: { type: 'array', items: { type: 'string' } },
    suggested_steps: { type: 'array', items: { type: 'string' } },
  },
  required: ['goal', 'acceptance_criteria', 'in_scope', 'out_of_scope', 'assumptions', 'open_questions', 'risks', 'suggested_steps'],
}

const BRIEF_TOOL_SCHEMA = withToolFields(
  BRIEF_CHILD_SCHEMA,
  {
    acceptance_criteria: { type: 'array', items: { type: 'string' } },
    arbiter_model: { type: 'string' },
    raw: { type: 'string' },
  },
  ['arbiter_model'],
)

const FINAL_CHILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ruling: {
      type: 'string',
      enum: ['ready', 'not_ready', 'need_more_evidence'],
      description: 'ready=可交付；not_ready=有验收标准 fail；need_more_evidence=关键项无法验证',
    },
    summary: { type: 'string' },
    criteria: {
      type: 'array',
      description: '逐条对应验收标准；每条给出 pass / fail / unverified 与依据',
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
  },
  required: ['ruling', 'summary', 'criteria', 'blocking_issues', 'required_actions', 'reasoning'],
}

const FINAL_TOOL_SCHEMA = withToolFields(
  FINAL_CHILD_SCHEMA,
  {
    arbiter_model: { type: 'string' },
    raw: { type: 'string' },
  },
  ['arbiter_model'],
)

function buildBriefPrompt(args) {
  return `你是「裁决者」（arbiter），本次担任**需求解析**。主代理还没开工，你先把需求整理成可执行、可验收的规格，避免主代理理解偏差后返工。

用户原始需求（下面是显式材料与系统自动附带的主会话摘要；你看不到主代理的实时对话）：
---BEGIN SUBJECT---
${args.requirement}
---END SUBJECT---

${args.context ? `补充上下文：\n${args.context}\n` : ''}
${args.constraints ? `已知约束：\n${args.constraints}\n` : ''}
${renderFiles(args.files)}
工作要求：
1. 用 read/glob/grep 查看工作区真实现状，把需求落到具体文件/模块上；不要凭空假设。
2. 只做需求解析，不要开始实现，不要修改任何文件。
3. 明确指出需求中模糊、矛盾、缺失的地方：能合理推断的写进 assumptions，不能推断的写进 open_questions。
4. 验收标准必须可观察、可验证，不要写"体验良好"这类无法检验的条目。
5. 用给定的结构化结果字段返回结论。`
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
${renderFiles(args.files)}
${args.context ? `补充上下文：\n${args.context}\n` : ''}
审核规则：
1. **必须自己验证**，不要相信主代理的声明。用 read/glob/grep 检查真实文件；只读命令或测试可以跑；不要修改任何文件。
2. 逐条核对验收标准，每条给出 pass / fail / unverified 与依据。
3. 特别检查这些常见虚假完成：声称改了但文件没变、声称测试通过但没有输出、只做了一部分却说全部完成、把"能编译"当成"功能正确"、留下未处理的警告或 TODO 却报告已完成。
4. 有验收标准 fail 时返回 not_ready；关键项无法验证时返回 need_more_evidence——两者都不要返回 ready。
5. 用给定的结构化结果字段返回结论。`
}

function renderFiles(files) {
  const list = toStrArray(files)
  if (list.length === 0) return ''
  return `相关文件/目录（请用 read/glob/grep 自行核对，不要凭空假设）：\n${list.map((item) => `- ${item}`).join('\n')}\n`
}

function extractBlockText(message) {
  if (message === null || typeof message !== 'object') return ''
  if (!Array.isArray(message.content)) return ''
  return message.content
    .filter((block) => block !== null && typeof block === 'object' && block.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join(' ')
    .trim()
}

/**
 * Turn the raw session log into objective facts about what the session actually
 * did. The child cannot see the caller's conversation, and the caller's own
 * delivery claim is exactly the thing under audit — so the plugin supplies the
 * tool-call trace instead of trusting either side.
 */
function summarizeToolFacts(events) {
  const calls = new Map()
  const failed = []
  for (const event of events ?? []) {
    if (event?.type === 'tool/call') {
      const data = event.data ?? {}
      calls.set(data.callId, { name: String(data.name ?? ''), args: safeJsonParse(data.arguments) })
    } else if (event?.type === 'tool/result') {
      const data = event.data ?? {}
      const callId = data.message?.source?.callId
      const call = calls.get(callId)
      if (call === undefined) continue
      call.isError = data.message?.isError === true
      if (call.isError) {
        const reason =
          (typeof data.error?.reason === 'string' && data.error.reason) ||
          (typeof data.error?.code === 'string' && data.error.code) ||
          extractBlockText(data.message) ||
          '（无错误详情）'
        failed.push(`${call.name}: ${truncate(String(reason), 200)}`)
      }
    }
  }

  const writes = []
  const seenWrite = new Set()
  const shells = []
  for (const call of calls.values()) {
    if (WRITE_TOOLS.has(call.name)) {
      const candidate = [call.args?.file_path, call.args?.path, call.args?.filename].find(
        (value) => typeof value === 'string' && value.trim() !== '',
      )
      const label = `${call.name} → ${candidate ?? '（未记录路径）'}${call.isError ? '（失败）' : ''}`
      if (seenWrite.has(label)) continue
      seenWrite.add(label)
      writes.push(label)
    } else if (SHELL_TOOLS.has(call.name)) {
      const command = call.args?.command ?? call.args?.script ?? call.args?.cmd
      shells.push(
        `${call.name}${call.isError ? '（失败）' : ''}: ${truncate(String(command ?? '（未记录命令）'), 240)}`,
      )
    }
  }

  return {
    writes: writes.slice(-25),
    shells: shells.slice(-10),
    failed: failed.slice(-8),
    total: calls.size,
  }
}

function renderToolFacts(facts) {
  const lines = ['===== 客观事实：本会话已记录的工具调用（系统从会话日志提取，主代理无法改写）=====']
  if (facts.total === 0) {
    lines.push('本会话尚未记录任何工具调用。如果交付声明里包含"改了文件/跑了测试"，那它与日志不符。')
  } else {
    lines.push(`共 ${facts.total} 次工具调用。`)
    lines.push(`写操作（最后 ${facts.writes.length} 条去重记录）：\n${bulletList(facts.writes)}`)
    lines.push(`命令（最后 ${facts.shells.length} 条）：\n${bulletList(facts.shells)}`)
    if (facts.failed.length > 0) lines.push(`失败的调用（最后 ${facts.failed.length} 条）：\n${bulletList(facts.failed)}`)
  }
  lines.push('===== 客观事实结束 =====')
  return lines.join('\n')
}

async function collectSessionContext(ctx, exec) {
  const parts = []
  const imageRefs = []
  let toolFactsText = ''
  let cwd = ''
  try {
    const wd = ctx.get('workingDirectory')
    const session = exec?.agent?.session
    if (wd !== undefined && typeof wd.get === 'function' && session !== undefined) {
      const dir = wd.get(session)
      if (typeof dir === 'string' && dir.length > 0) cwd = dir
    }
    if (cwd === '' && typeof session?.header?.cwd === 'string' && session.header.cwd.length > 0) {
      cwd = session.header.cwd
    }
  } catch {
    // working directory is best effort
  }
  if (cwd !== '') parts.push(`工作目录：${cwd}`)
  try {
    const query = ctx.get('sessionQuery')
    const sessionId = exec?.agent?.session?.id
    if (
      query !== undefined &&
      typeof query.inspectSession === 'function' &&
      typeof sessionId === 'string' &&
      sessionId.length > 0
    ) {
      let facts
      const messages = await query.inspectSession(sessionId, (session) => {
        try {
          facts = summarizeToolFacts(session.snapshotEvents())
        } catch {
          facts = undefined
        }
        return session.deriveMessages().map((message) => ({
          role: message.role,
          text: Array.isArray(message.content)
            ? message.content
                .map((block) => {
                  if (block === null || typeof block !== 'object') return ''
                  if (block.type === 'image') {
                    const name = block.attachment && block.attachment.name ? `：${block.attachment.name}` : ''
                    return `[图片${name}]`
                  }
                  if (block.type === 'file') {
                    const name = block.attachment && block.attachment.name ? `：${block.attachment.name}` : ''
                    return `[附件${name}]`
                  }
                  if (typeof block.text === 'string') return block.text
                  return ''
                })
                .filter((text) => text.length > 0)
                .join('\n')
            : '',
          images: Array.isArray(message.content)
            ? message.content
                .filter(
                  (block) =>
                    block !== null && typeof block === 'object' && block.type === 'image' && block.attachment,
                )
                .map((block) => block.attachment)
            : [],
        }))
      })
      if (facts !== undefined) toolFactsText = truncate(renderToolFacts(facts), 6000)
      const relevant = (Array.isArray(messages) ? messages : [])
        .filter(
          (message) =>
            (message.role === 'user' || message.role === 'assistant') &&
            typeof message.text === 'string' &&
            message.text.trim().length > 0 &&
            !message.text.includes('<system-reminder>') &&
            !message.text.startsWith('Time sampled while preparing turn'),
        )
        .slice(-6)
      if (relevant.length > 0) {
        const digest = relevant.map((message) => `[${message.role}] ${truncate(message.text, 1200)}`).join('\n\n')
        parts.push(`最近对话（自动摘要，可能已截断；请以工作区真实文件为准）：\n${digest}`)
      }
      const userImageMessages = (Array.isArray(messages) ? messages : [])
        .filter((message) => message.role === 'user' && Array.isArray(message.images) && message.images.length > 0)
        .slice(-2)
      const seen = new Set()
      const attachments = ctx.get('attachments')
      const imageLines = []
      for (const message of userImageMessages) {
        for (const ref of message.images) {
          if (ref === null || typeof ref !== 'object') continue
          const key = ref.attachmentId
          if (key === undefined || seen.has(key)) continue
          seen.add(key)
          let hostPath
          try {
            if (attachments !== undefined && typeof attachments.imageHostPath === 'function') {
              hostPath = attachments.imageHostPath(ref)
            }
          } catch {
            hostPath = undefined
          }
          if (imageRefs.length < 6) imageRefs.push(ref)
          const label = ref.name ? `（${ref.name}）` : ''
          const size = ref.width && ref.height ? ` ${ref.width}x${ref.height}` : ''
          imageLines.push(
            `- 图片${imageRefs.length}${label}${size}${
              typeof hostPath === 'string' && hostPath.length > 0 ? `：${hostPath}` : ''
            }`,
          )
        }
      }
      if (imageLines.length > 0) {
        parts.push(
          `主会话最近图片（已随本次调用转交，可直接查看；如仍需本机文件可用 read_image 读取下列路径）：\n${imageLines.join('\n')}`,
        )
      }
    }
  } catch {
    // conversation digest and image forwarding are best effort
  }
  const body = parts.length === 0 ? '' : parts.join('\n\n')
  const text =
    body === '' && toolFactsText === ''
      ? ''
      : `\n\n===== 主会话自动上下文（系统只读附带；用于定位资源，最终以你实际读到的文件为准）=====\n${body}${
          toolFactsText === '' ? '' : `\n\n${toolFactsText}`
        }\n===== 自动上下文结束 =====`
  return { text, images: imageRefs }
}

function abortError(signal) {
  const reason = signal?.reason
  if (reason instanceof Error) return reason
  const error = new Error('交叉复核已取消')
  error.name = 'AbortError'
  return error
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function runChild(ctx, exec, preset, route, prompt, label, timeoutMs, options = {}) {
  const subagents = ctx.get('subagents')
  if (subagents === undefined || typeof subagents.startActivation !== 'function') {
    throw new Error('交叉复核模式需要 subagents 服务，但当前组合没有挂载该服务')
  }
  if (exec.agent === undefined) {
    throw new Error('交叉复核模式工具必须由 Agent 调用（exec.agent 缺失）')
  }
  // Never start a child for a call the user already cancelled: the activation
  // would begin work that nothing can consume.
  if (exec.signal?.aborted) throw abortError(exec.signal)
  // The DSH subagent runtime expects a FLAT activation spec: `parent`, `prompt`,
  // `agentPreset` and `agentOptions` are top-level fields, not a nested `request`
  // object. Passing them nested leaves `spec.parent` undefined, and the runtime
  // then throws "Cannot read properties of undefined (reading 'id')" when it
  // authorizes the child. Route policy fields (enabled / briefEnabled /
  // auditEnabled / timeoutMs) are also stripped here: only model identity may be
  // forwarded to the child agent's options.
  const childAgentOptions = {
    ...(typeof route?.provider === 'string' ? { provider: route.provider } : {}),
    ...(typeof route?.model === 'string' ? { model: route.model } : {}),
    ...(typeof route?.reasoningEffort === 'string' ? { reasoningEffort: route.reasoningEffort } : {}),
  }
  let promptWithContext = prompt
  const promptBlocks = []
  try {
    const collected = await collectSessionContext(ctx, exec)
    promptWithContext = `${prompt}${collected.text}`
    promptBlocks.push({ type: 'text', text: promptWithContext })
    for (const ref of Array.isArray(collected.images) ? collected.images : []) {
      if (ref !== null && typeof ref === 'object') promptBlocks.push({ type: 'image', attachment: ref })
    }
  } catch {
    promptBlocks.push({ type: 'text', text: prompt })
  }
  const activation = await subagents.startActivation({
    provider: 'spawn',
    label,
    prompt: promptBlocks,
    parent: exec.agent,
    agentPreset: preset,
    agentOptions: childAgentOptions,
    // Ask the child to submit a validated object instead of asking it in prose to
    // "output only JSON": the runtime owns validation and the terminal guard.
    ...(options.outputSchema === undefined ? {} : { outputSchema: options.outputSchema }),
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

function isAbortError(error) {
  return error?.name === 'AbortError'
}

/**
 * One bounded retry for infrastructure failures. A cancellation or timeout is
 * never retried: the user asked to stop, or the budget is already spent. A
 * provider error is retried once because a single 429 or dropped socket used to
 * destroy the whole audit.
 */
async function runChildWithRetry(ctx, exec, preset, route, prompt, label, timeoutMs, options = {}) {
  let lastError
  for (let attempt = 0; attempt < 2; attempt += 1) {
    if (attempt > 0) {
      if (exec.signal?.aborted) throw abortError(exec.signal)
      await delay(RETRY_DELAY_MS)
    }
    try {
      const outcome = await runChild(ctx, exec, preset, route, prompt, label, timeoutMs, options)
      // A child that stopped with `error` after publishing produced no verdict.
      // Retrying once is the difference between "the model is down" and "this
      // task cannot be reviewed".
      if (outcome.result?.stopReason === 'error' && attempt === 0) {
        lastError = new Error(
          `子代理执行失败（stopReason=error）${typeof outcome.result?.diagnostic === 'string' ? `：${outcome.result.diagnostic}` : ''}`,
        )
        continue
      }
      return outcome
    } catch (error) {
      if (isAbortError(error) || error?.name === 'TimeoutError') throw error
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      if (attempt === 0 && RETRYABLE_ERROR.test(message)) continue
      throw error
    }
  }
  throw lastError ?? new Error('交叉复核子代理多次失败')
}

function structuredOf(result) {
  const value = result?.structured
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function stopReasonFailure(result) {
  if (result?.stopReason === undefined || result.stopReason === 'completed') return undefined
  const diagnostic = typeof result.diagnostic === 'string' ? `：${result.diagnostic}` : ''
  return `子代理未正常完成（stopReason=${result.stopReason}）${diagnostic}`
}

function briefKey(exec) {
  const sessionId = exec?.agent?.session?.id
  return typeof sessionId === 'string' && sessionId.length > 0 ? sessionId : undefined
}

function rememberBrief(exec, value, args) {
  const key = briefKey(exec)
  if (key === undefined) return
  briefs.set(key, {
    goal: value.goal,
    in_scope: value.in_scope,
    out_of_scope: value.out_of_scope,
    acceptance_criteria: value.acceptance_criteria,
    files: toStrArray(args.files),
    at: Date.now(),
  })
}

function readBrief(exec) {
  const key = briefKey(exec)
  if (key === undefined) return undefined
  const record = briefs.get(key)
  if (record === undefined) return undefined
  if (Date.now() - record.at > BRIEF_TTL_MS) {
    briefs.delete(key)
    return undefined
  }
  return record
}

function renderBriefSpec(brief) {
  const lines = [`目标：${brief.goal}`]
  if (brief.acceptance_criteria.length > 0) {
    lines.push(`验收标准：\n${bulletList(brief.acceptance_criteria)}`)
  }
  if (brief.in_scope.length > 0) lines.push(`范围内：\n${bulletList(brief.in_scope)}`)
  if (brief.out_of_scope.length > 0) lines.push(`范围外（不做）：\n${bulletList(brief.out_of_scope)}`)
  return lines.join('\n')
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

function errorFinalAudit(message, modelLabel) {
  return {
    // `error` is a distinct ruling on purpose: the protocol tells the main agent
    // to disclose the unverified state instead of reading it as a pass.
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
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            '本轮涉及的工作区文件/目录路径（相对或绝对均可）。子代理看不到你的实时对话，会按这些路径用 read/glob/grep 自行核对；强烈建议填写用户 @ 引用的文件、待改文件和相关模块。',
        },
      },
      required: ['requirement'],
    },
    description:
      '开工前的需求解析（由裁决者执行）：把用户原始需求整理成可执行、可验收的规格，明确范围、验收标准、假设和必须确认的问题。' +
      '结果是"可验收"的唯一依据：插件会按会话记住它，交付审核 cross_review_final 会自动复用，你不需要再抄一遍。' +
      '纯问答、只读检索、单行格式确认这类没有文件改动也没有外部副作用的请求可以跳过；其余任务开始时调用一次即可。',
    output: {
      schema: BRIEF_TOOL_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.arbiter)
      // Requirement briefing can be switched off on its own, leaving the closing
      // audit enabled (or the reverse).
      if (routes.arbiter.enabled === false || routes.arbiter.briefEnabled === false) {
        return {
          goal:
            routes.arbiter.enabled === false
              ? '裁决者已在设置中停用，跳过需求解析（未启动子代理）。'
              : '需求解析已在设置中关闭，跳过（未启动子代理）。',
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
        const { result } = await runChildWithRetry(
          ctx,
          exec,
          'cross-review-internal',
          routes.arbiter,
          buildBriefPrompt(args),
          '需求解析',
          routeTimeout(routes.arbiter, config.reviewTimeoutMs),
          { outputSchema: BRIEF_CHILD_SCHEMA },
        )
        const failure = stopReasonFailure(result)
        if (failure !== undefined) return errorBrief(failure, modelLabel)
        const rawText = extractText(result)
        const parsed = structuredOf(result) ?? parseJsonLoose(rawText)
        const brief = normalizeBrief(parsed, rawText, modelLabel)
        rememberBrief(exec, brief, args)
        return brief
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
          description:
            '可选：需求与验收标准原文。省略时自动使用本会话 cross_review_brief 的结果（推荐，省去抄写且不会被改写）。',
        },
        claim: {
          type: 'string',
          description: '主代理的交付声明：声称完成了什么、改了哪些文件、跑了哪些验证。',
        },
        evidence: { type: 'string', description: '可选：命令输出、测试结果、文件路径等证据。' },
        context: { type: 'string', description: '可选：补充上下文。' },
        files: {
          type: 'array',
          items: { type: 'string' },
          description:
            '交付审核涉及的工作区文件/目录路径。省略时使用 brief 阶段登记的路径。子代理会按这些路径用 read/glob/grep 自行核对。',
        },
      },
      required: ['claim'],
    },
    description:
      '交付前的终局审核（由裁决者执行）：逐条核对验收标准，自己验证文件与测试，识别"声称完成但实际没做"的情况。' +
      '省略 requirement 时会自动复用本会话 cross_review_brief 的验收标准；系统还会额外附带主会话真实的写操作/命令记录，主代理无法改写它。' +
      '返回 ready 才可向用户宣布交付；not_ready 按 required_actions 修完再审核；need_more_evidence 先补证据；error 表示审核本身没跑成，必须向用户披露"未复核"而不是当作通过。' +
      '任务收尾调用一次，不要每步都调用。',
    output: {
      schema: FINAL_TOOL_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.arbiter)
      // Closing audit can be switched off on its own.
      if (routes.arbiter.enabled === false || routes.arbiter.auditEnabled === false) {
        return {
          ruling: 'ready',
          summary:
            routes.arbiter.enabled === false
              ? '裁决者已在设置中停用，跳过交付审核（未启动子代理）。'
              : '交付审核已在设置中关闭，跳过（未启动子代理）。',
          criteria: [],
          blocking_issues: [],
          required_actions: [],
          reasoning: '',
          arbiter_model: '',
          raw: '',
        }
      }

      const explicitRequirement = typeof args.requirement === 'string' ? args.requirement.trim() : ''
      const brief = readBrief(exec)
      const requirement = explicitRequirement === '' && brief !== undefined ? renderBriefSpec(brief) : explicitRequirement
      if (requirement === '') {
        return {
          ruling: 'need_more_evidence',
          summary:
            '缺少验收标准：本次调用没有 requirement，本会话也没有可复用的 cross_review_brief 结果。请先调用 cross_review_brief，或在 requirement 里写明验收标准。',
          criteria: [],
          blocking_issues: [],
          required_actions: ['调用 cross_review_brief，或在 cross_review_final 的 requirement 中写明验收标准'],
          reasoning: '',
          arbiter_model: '',
          raw: '',
        }
      }
      const briefSection =
        brief === undefined || explicitRequirement === ''
          ? ''
          : `\n\n【系统补充：本会话 cross_review_brief 产出的验收标准（主代理未改写；若与你本次提交的范围不一致，请指出差异并以用户最新意图为准）】\n${renderBriefSpec(brief)}`
      const files =
        Array.isArray(args.files) && args.files.length > 0 ? args.files : (brief?.files ?? [])

      try {
        const { result } = await runChildWithRetry(
          ctx,
          exec,
          'cross-review-internal',
          routes.arbiter,
          buildFinalAuditPrompt({ ...args, requirement: `${requirement}${briefSection}`, files }),
          '交付审核',
          routeTimeout(routes.arbiter, config.reviewTimeoutMs),
          { outputSchema: FINAL_CHILD_SCHEMA },
        )
        const failure = stopReasonFailure(result)
        if (failure !== undefined) return errorFinalAudit(failure, modelLabel)
        const rawText = extractText(result)
        const parsed = structuredOf(result) ?? parseJsonLoose(rawText)
        return normalizeFinalAudit(parsed, rawText, modelLabel)
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
  const arbiterOff = routes.arbiter.enabled === false
  const briefOff = !arbiterOff && routes.arbiter.briefEnabled === false
  const auditOff = !arbiterOff && routes.arbiter.auditEnabled === false
  const statusLines = [
    arbiterOff
      ? '- 裁决者：**当前已在设置中停用**，cross_review_brief / cross_review_final 会直接放行。'
      : null,
    briefOff ? '- 裁决者·需求解析：**当前已在设置中关闭**，cross_review_brief 会直接放行，按你自己的理解开工。' : null,
    auditOff ? '- 裁决者·交付审核：**当前已在设置中关闭**，cross_review_final 会直接放行，交付前请自行逐条核对验收标准。' : null,
  ].filter((line) => line !== null)
  const statusSection = statusLines.length > 0 ? '\n### 当前生效状态\n' + statusLines.join('\n') + '\n' : ''

  return `## 交叉复核模式协议（Cross-Verification Mode）

两个角色：**裁决者在首尾判定需求与交付，你（主代理）负责执行与取证。**

### 角色分工
- **裁决者**（${routeLabel(routes.arbiter)}）：开工前解析需求（cross_review_brief），收尾时审核交付（cross_review_final）。只在首尾各一次。
- **主代理**（你）：按规格执行，并提供可复现证据（命令、输出、文件路径）；**验收判定由裁决者完成，你不自行下「通过/不通过」的结论**。
${statusSection}
### 任务开始时：cross_review_brief（一次）
把用户原始需求交给裁决者，得到 goal / 范围 / 验收标准 / 假设 / 待确认问题。
若 open_questions 里有必须用户决定的事项，先用 ask_user_question 问清楚再开工；其余按 assumptions 推进并在最终回复里说明。
结果会被本插件按会话记住，收尾审核自动复用，**不需要你抄一遍**。

**轻量豁免**：纯问答、只读检索、单行格式确认这类**没有文件改动、也没有外部副作用**的请求，可以跳过 brief 与 final；此时要在回复里说明「本次未走交叉复核」，不要假装复核过。

### 任务结束时：cross_review_final（一次）——唯一的验收关
把交付声明与**可复现证据**（改了哪些文件、跑了什么命令、关键输出）交给裁决者。调用时可以不传 requirement，它会自动使用 brief 的验收标准；系统还会附带主会话真实的写操作/命令记录，你无法改写它——所以不要声称做过日志里没有的事。
- ready：才可以向用户宣布交付。
- not_ready / need_more_evidence：按 required_actions 修完或补证据再审核，不要跳过直接报告完成。
- error：审核本身没跑成（超时、模型故障、被取消）。**这既不是通过也不是不通过**：要么重试一次，要么在最终回复里明确写出「交付审核未完成，以下为未复核内容」。

### 行为准则
- 先证据后结论；不确定就说不确定并补验证。验收判定交给裁决者，你只提供可复现证据（命令 + 输出 + 文件路径），不自行下验收结论。
- 主会话最近粘贴的图片会自动转交给裁决者（需求解析/交付审核）；视觉核对（配色、布局截图等）可交给 cross_review_final 完成。
- 调用上面两个工具时，务必把涉及的工作区文件/目录路径填进 files，把工作目录、附件说明和会话背景填进 context。子代理看不到你的实时对话，只能用你给的材料和系统自动附带的会话摘要与工具调用记录。
- 不要以「只是小改动」跳过交付前的 cross_review_final 审核（轻量豁免除外）。
- 最终回复里要写清：做了什么、验证了什么、还有哪些未验证或已知限制。`
}

function liveRoutes(ctx, config) {
  const service = ctx.get('crossReviewConfig')
  const live = service !== undefined && typeof service.get === 'function' ? service.get() : undefined
  const source = live !== null && typeof live === 'object' ? live : config
  return {
    arbiter: routeOf(source?.arbiter, DEFAULT_ARBITER),
  }
}

export function apply(ctx, config = {}) {
  const policy = {
    reviewTimeoutMs:
      Number.isFinite(config?.reviewTimeoutMs) && config.reviewTimeoutMs > 0
        ? config.reviewTimeoutMs
        : DEFAULT_TIMEOUT_MS,
  }
  const getRoutes = () => liveRoutes(ctx, config)
  ctx.tools.register(makeBriefTool(ctx, policy, getRoutes))
  ctx.tools.register(makeFinalAuditTool(ctx, policy, getRoutes))
  ctx.systemPrompt.section({
    name: 'cross-review:protocol',
    order: 150,
    text: () => buildProtocol(getRoutes()),
  })
}

// Exported for local unit checks; not part of the Cordis contract.
export {
  DEFAULT_ARBITER,
  buildBriefPrompt,
  buildFinalAuditPrompt,
  buildProtocol,
  normalizeBrief,
  normalizeFinalAudit,
  summarizeToolFacts,
  renderToolFacts,
  renderBriefSpec,
  parseJsonLoose,
  routeOf,
  runChild,
}
