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
// There is deliberately no execution guard *in this file*: an earlier revision
// gated write, shell, ask-user and present calls behind a fresh consensus review,
// which multiplied child agents and made the mode unusably slow. Nothing here
// tracks review state for enforcement; a verdict is advice the main agent obeys
// because the protocol tells it to, not a lock.
//
// The one guard in this bundle lives in `internal-guard.js`, and it protects the
// opposite side: it confines the arbiter's own shell to read-only. That is a
// capability guarantee for the child, not a review gate on the caller.
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
// Shared with the Host config store and the settings page: a sub-second budget
// would kill every call, and a child that cannot answer in half an hour will not
// answer. Clamping here too keeps a hand-written YAML config honest, not just
// the values that travel through /api/cross-review-config.
const TIMEOUT_MIN_MS = 10000
const TIMEOUT_MAX_MS = 3600000
// One retry is enough: a second consecutive infrastructure failure is reported
// rather than paid for twice.
const RETRY_DELAY_MS = 900
// Deliberately narrow: a bare "500" or "timeout" also appears in ordinary tool
// output (a port, a line number, a file size, a test name), so matching those
// would retry a deterministic failure and pay for the child twice. Only phrases
// that name a transport or provider condition are accepted.
const RETRYABLE_ERROR =
  /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|EPIPE|socket hang up|upstream connect|bad gateway|service unavailable|gateway time-?out|rate.?limit|too many requests|overloaded|provider (?:error|unavailable)/i

// The brief is remembered per session so the closing audit can reuse its
// acceptance criteria verbatim. Twelve hours is longer than any realistic task and
// short enough that a stale entry cannot leak into an unrelated session.
const BRIEF_TTL_MS = 12 * 60 * 60 * 1000
const briefs = new Map()

/**
 * Drop expired briefs. The map is keyed by session id in a long-lived desktop
 * process, so a session whose audit never runs would otherwise keep its entry
 * forever; pruning on write bounds the map without a background timer.
 */
function pruneBriefs(now = Date.now()) {
  for (const [key, record] of briefs) {
    if (now - record.at > BRIEF_TTL_MS) briefs.delete(key)
  }
}

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
  // Clamp here as well as in the Host store: a hand-written YAML config never
  // passes through that store, and `timeoutMs: 1000` would otherwise leave the
  // arbiter one second to answer.
  const rawTimeout = Number.isFinite(candidate.timeoutMs) && candidate.timeoutMs > 0 ? candidate.timeoutMs : fallback.timeoutMs
  const timeoutMs = Number.isFinite(rawTimeout) && rawTimeout > 0
    ? Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.round(rawTimeout)))
    : undefined
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
    ...(timeoutMs === undefined ? {} : { timeoutMs }),
  }
}

function routeTimeout(route, fallbackMs) {
  const candidate =
    Number.isFinite(route?.timeoutMs) && route.timeoutMs > 0
      ? route.timeoutMs
      : Number.isFinite(fallbackMs) && fallbackMs > 0
        ? fallbackMs
        : DEFAULT_TIMEOUT_MS
  // Every path into a child call goes through here, so this is the last place
  // that can guarantee the bounds hold.
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.round(candidate)))
}

function routeLabel(route) {
  return `${route.provider}/${route.model}`
}

function truncate(text, max = 12000) {
  if (typeof text !== 'string') return ''
  return text.length <= max ? text : `${text.slice(0, max)}\n[truncated ${text.length - max} chars]`
}

/**
 * Keep the head and tail of a long string within `max` characters, so a command
 * output's conclusion (usually at the end, e.g. "N passed") survives alongside
 * its beginning. Short strings are returned unchanged.
 */
function clipMiddle(text, max = 120) {
  if (typeof text !== 'string') return ''
  if (text.length <= max) return text
  const head = Math.ceil(max * 0.6)
  const tail = Math.max(1, max - head - 1)
  return `${text.slice(0, head)}…${text.slice(-tail)}`
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

// The arbiter may only ever return these three verdicts: "the audit itself did
// not run" is not something a model gets to decide.
const FINAL_CHILD_RULINGS = ['ready', 'not_ready', 'need_more_evidence']

// The tool returns a wider vocabulary than the child may submit. `error` (the
// audit did not run: timeout, cancellation, provider failure, no parseable
// verdict) and `skipped` (the duty is switched off in settings) are produced by
// this plugin, never by the arbiter — and the runtime validates every tool
// return value against `output.schema`, so they must be declared here or the
// result is rejected as a ToolOutputError before the caller ever sees it.
const FINAL_TOOL_RULINGS = [...FINAL_CHILD_RULINGS, 'error', 'skipped']

const FINAL_CHILD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ruling: {
      type: 'string',
      enum: FINAL_CHILD_RULINGS,
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
          criterion_id: {
            type: 'string',
            description: '对应验收标准的编号（如 AC1）；文本完全一致时可省略',
          },
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

// The tool-facing schema overrides the child's `ruling` enum with the wider
// tool vocabulary, so every value this file can return validates.
const FINAL_TOOL_SCHEMA = {
  ...withToolFields(
    FINAL_CHILD_SCHEMA,
    {
      ruling: {
        type: 'string',
        enum: FINAL_TOOL_RULINGS,
        description:
          'ready=可交付；not_ready=有验收标准 fail；need_more_evidence=关键项无法验证；error=审核本身没跑成；skipped=审核已在设置中关闭',
      },
      arbiter_model: { type: 'string' },
      raw: { type: 'string' },
    },
    ['arbiter_model'],
  ),
}

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
3. 明确指出需求中模糊、矛盾、缺失的地方：能合理推断的写进 assumptions；**会影响验收结果、只能由用户拍板的事项（配色、视觉取舍、范围边界、参考对象）必须写进 open_questions**，不要替用户决定。
4. 验收标准必须可观察、可验证：每条都写清「对象/范围 + 预期结果 + 验证方法」（命令、文件路径、选择器、具体颜色值、截图对比等），不要写"体验良好"这类无法检验的条目。视觉类需求要区分顶栏、外层容器、iframe 内容、业务页通用背景，并写明参考对象、页面状态与取色/测量口径。
5. 宁少而准：不要把无关建议或无法验证的条目写进验收标准。
6. 用给定的结构化结果字段返回结论。`
}

function buildFinalAuditPrompt(args) {
  return `你是「裁决者」（arbiter），本次担任**交付审核**。主代理声称已经完成，你要逐条对照验收标准核查，而不是听它自己说"做完了"。

需求与验收标准：
---BEGIN SUBJECT---
${args.requirement}
---END SUBJECT---

主代理的交付声明：
${args.claim}

${args.evidence ? `主代理提供的证据（请精简粘贴关键片段，勿贴全量日志；超出会被截断）：\n${truncate(args.evidence, 4000)}\n` : ''}
${renderFiles(args.files)}
${args.context ? `补充上下文：\n${args.context}\n` : ''}
效率要求：优先用上面提供的 files、主代理证据与工具事实定位目标；**避免全库 glob 和重复读取同一文件**；能一次 read/grep 确认的就不要反复探索；命令/测试只在缺少关键证据时运行。但效率不降低核实强度——每条验收标准至少要有一次针对性的 read/grep 作为 pass 依据。
审核规则：
1. **必须自己验证**，不要相信主代理的声明。用 read/glob/grep 检查真实文件；只读命令或测试可以跑；不要修改任何文件。
2. **逐条全覆盖**：需求里的每一条验收标准（AC1、AC2……）都必须在 criteria 中有一行，criterion_id 填对应编号、item 与原文一致。**一次性遍历全部条目**，即使已经发现某个失败，也要继续核查其余条目，不要只报第一个就停下。若需求是自然语言、没有编号清单，先在同一次审核内把它拆成完整的验收清单（逐条列出），再逐条核对，不要只挑其中几条。
3. 每条给出 pass / fail / unverified 与依据。**status=pass 必须给出具体证据**（文件路径+行号、命令+关键输出或退出码、截图、测量值）；没有证据的请标 unverified，不要标 pass。
4. **把所有 fail / unverified / blocking 一次性列全**，并为每一项给出 required_actions，让主代理能一次修完，减少来回。
5. 特别检查这些常见虚假完成：声称改了但文件没变、声称测试通过但没有输出、只做了一部分却说全部完成、把"能编译"当成"功能正确"、留下未处理的警告或 TODO 却报告已完成。
6. 若附带了参考截图/参考对象，必须把实际实现（截图或计算样式、颜色值、尺寸位置）与参考逐项对比；只读源码不足以判定视觉一致性。缺少运行界面证据时保留 unverified，不要猜。
7. 证据不足时明确缺少哪个页面、文件、输出或测量条件，不要只写"继续检查"。
8. 不把范围外的一般改进建议升级为阻塞项。
9. 判定：有验收标准 fail 或存在 blocking_issues → not_ready；没有已知失败但有关键项 unverified / 缺证据 → need_more_evidence；两者都不要返回 ready。
10. 用给定的结构化结果字段返回结论。`
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
 * Pull a process exit code out of a tool-result body. DSH reports shell exits as
 * a literal `[exit code: N]` marker; only that known shape is parsed, so a stray
 * number in ordinary output is never mistaken for a failure. Returns undefined
 * when no marker is present.
 */
function parseExitCode(text) {
  if (typeof text !== 'string') return undefined
  const match = /\[exit code:\s*(-?\d+)\]/i.exec(text)
  if (match === null) return undefined
  const value = Number(match[1])
  return Number.isFinite(value) ? value : undefined
}

/**
 * Turn the raw session log into objective facts about what the session actually
 * did. The child cannot see the caller's conversation, and the caller's own
 * delivery claim is exactly the thing under audit — so the plugin supplies the
 * tool-call trace instead of trusting either side.
 *
 * A shell line reports whether a result came back at all and, when it did,
 * whether it failed or exited non-zero. "Ran a command" is deliberately NOT the
 * same as "the command proved success": a command with no recorded result, a
 * tool error, or a parsed non-zero exit is never presented as a completed one.
 */
function summarizeToolFacts(events) {
  const calls = new Map()
  for (const event of events ?? []) {
    if (event?.type === 'tool/call') {
      const data = event.data ?? {}
      calls.set(data.callId, {
        name: String(data.name ?? ''),
        args: safeJsonParse(data.arguments),
        hasResult: false,
        isError: false,
        resultText: '',
        errorReason: '',
      })
    } else if (event?.type === 'tool/result') {
      const data = event.data ?? {}
      const callId = data.message?.source?.callId
      const call = calls.get(callId)
      if (call === undefined) continue
      call.hasResult = true
      call.isError = data.message?.isError === true
      call.resultText = extractBlockText(data.message)
      call.errorReason =
        (typeof data.error?.reason === 'string' && data.error.reason) ||
        (typeof data.error?.code === 'string' && data.error.code) ||
        ''
    }
  }

  const writes = []
  const seenWrite = new Set()
  const shells = []
  const failed = []
  for (const call of calls.values()) {
    if (WRITE_TOOLS.has(call.name)) {
      const candidate = [call.args?.file_path, call.args?.path, call.args?.filename].find(
        (value) => typeof value === 'string' && value.trim() !== '',
      )
      const label = `${call.name} → ${candidate ?? '（未记录路径）'}${call.isError ? '（失败）' : ''}`
      if (seenWrite.has(label)) continue
      seenWrite.add(label)
      writes.push(label)
      if (call.isError) failed.push(`${call.name}: ${truncate(call.errorReason || '写入失败', 200)}`)
    } else if (SHELL_TOOLS.has(call.name)) {
      const command = call.args?.command ?? call.args?.script ?? call.args?.cmd
      const exit = call.hasResult ? parseExitCode(call.resultText) : undefined
      let status
      if (!call.hasResult) status = '未返回结果，不能视为成功'
      else if (call.isError) status = '失败'
      else if (exit !== undefined && exit !== 0) status = `退出码 ${exit}，失败`
      else if (exit === 0) status = '退出码 0'
      else status = '已返回结果（未见退出码）'
      // Hand over a bounded excerpt of the actual result text so the arbiter can
      // judge success itself, and say explicitly when the body is missing or
      // truncated instead of implying a complete output.
      let resultNote = ''
      if (call.hasResult) {
        const body = String(call.resultText ?? '').trim()
        if (body === '') resultNote = '；结果正文缺失'
        else {
          // v1.4.2: shorter head+tail excerpt (was 200 head-only) — keep enough to
          // judge success/failure while trimming tokens.
          resultNote = `；输出：${clipMiddle(body, 120)}`
        }
      }
      shells.push(`${call.name}: ${truncate(String(command ?? '（未记录命令）'), 220)} [${status}]${resultNote}`)
      if (call.isError || (exit !== undefined && exit !== 0)) {
        failed.push(`${call.name}: ${truncate(call.errorReason || (exit !== undefined && exit !== 0 ? `退出码 ${exit}` : '命令失败'), 200)}`)
      }
    }
  }

  return {
    writes: writes.slice(-25),
    shells: shells.slice(-6),
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
    lines.push('（方括号内是命令结果状态：只有“退出码 0”表示命令正常结束；“未返回结果”“失败”“退出码 N”都不能当作验证成功的证据。）')
  }
  lines.push('===== 客观事实结束 =====')
  return lines.join('\n')
}

async function collectSessionContext(ctx, exec) {
  const parts = []
  const imageRefs = []
  let toolFactsText = ''
  let toolFactTotal = null
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
      if (facts !== undefined) {
        toolFactsText = truncate(renderToolFacts(facts), 4000)
        toolFactTotal = facts.total
      } else {
        parts.push(
          '（系统未能从会话事件日志提取工具调用记录，无法据此判断是否改过文件或跑过测试；这不代表没有改动，请以你实际读到的文件为准。）',
        )
      }
      // v1.4.2: the auto conversation digest is intentionally NOT attached. The
      // contract already requires `requirement`/`claim` to be self-contained and
      // the main agent carries user decisions through `context`; the digest was
      // mostly redundant and could inject unrelated earlier turns into the audit.
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
    } else {
      // Distinguish "no tool records available" from a verified zero-call
      // session: an unreadable log is not proof that nothing was changed.
      parts.push(
        '（系统未能读取本会话工具调用记录：当前组合缺少会话查询服务或会话标识；这不代表没有改动，请以你实际读到的文件为准。）',
      )
    }
  } catch {
    // Conversation digest and image forwarding are best effort. Still mark that
    // the objective tool-call facts are unavailable rather than implying zero.
    parts.push(
      '（系统读取会话上下文或工具调用记录时出错，工具调用事实不可用；这不代表没有改动，请以你实际读到的文件为准。）',
    )
  }
  const body = parts.length === 0 ? '' : parts.join('\n\n')
  const text =
    body === '' && toolFactsText === ''
      ? ''
      : `\n\n===== 主会话自动上下文（系统只读附带；用于定位资源，最终以你实际读到的文件为准）=====\n${body}${
          toolFactsText === '' ? '' : `\n\n${toolFactsText}`
        }\n===== 自动上下文结束 =====`
  return { text, images: imageRefs, toolFactTotal }
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
  // Total cost of one arbiter call, including context collection + child run.
  const waitStarted = Date.now()
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
  let toolFactTotal = null
  const promptBlocks = []
  try {
    const collected = await collectSessionContext(ctx, exec)
    promptWithContext = `${prompt}${collected.text}`
    toolFactTotal = collected.toolFactTotal
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
    try {
      ctx.logger?.info?.(
        `cross-review: ${label} 用时 ${Date.now() - waitStarted}ms (stopReason=${result?.stopReason ?? 'completed'})`,
      )
    } catch {
      // Logging must never affect the verdict.
    }
    return { result, childId: activation.childId, toolFactTotal }
  } catch (error) {
    try {
      ctx.logger?.warn?.(
        `cross-review: ${label} 中止/失败，用时 ${Date.now() - waitStarted}ms：${error instanceof Error ? error.message : String(error)}`,
      )
    } catch {
      // Logging must never affect the verdict.
    }
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
  pruneBriefs()
  briefs.set(key, {
    goal: value.goal,
    in_scope: value.in_scope,
    out_of_scope: value.out_of_scope,
    acceptance_criteria: value.acceptance_criteria,
    // Keep the decision context so the closing audit can tell the arbiter which
    // open questions were supposed to be resolved with the user. A brief with no
    // acceptance criteria is never stored (see execute): it is not a baseline.
    assumptions: value.assumptions,
    open_questions: value.open_questions,
    requirement: typeof args?.requirement === 'string' ? truncate(args.requirement, 4000) : '',
    files: toStrArray(args?.files),
    at: Date.now(),
  })
}

function forgetBrief(exec) {
  const key = briefKey(exec)
  if (key !== undefined) briefs.delete(key)
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

/**
 * Number the acceptance criteria (AC1, AC2, …) so the rendered spec and the
 * host-side coverage check refer to the same stable identifiers.
 */
function criteriaWithIds(acceptanceCriteria) {
  return (Array.isArray(acceptanceCriteria) ? acceptanceCriteria : []).map((text, index) => ({
    id: `AC${index + 1}`,
    text,
  }))
}

/**
 * Normalize a criterion for exact comparison: strip a leading "ACn:", unify line
 * breaks and collapse all whitespace. Coverage uses this deterministic rule on
 * the full text; fuzzy similarity is deliberately NOT used, because it would let
 * an unrelated or paraphrased item stand in for a missing one — exactly the
 * false pass this guard exists to prevent.
 */
function normalizeCriterionText(value) {
  // Only whitespace/newlines are unified and a leading "ACn:" stripped. Case is
  // preserved so case-sensitive identifiers (e.g. tokens, paths) are not conflated.
  return String(value ?? '')
    .replace(/^AC\d+\s*[:：]\s*/i, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\s+/g, '')
}

function criterionCovered(row, expected) {
  if (row === null || typeof row !== 'object') return false
  // Coverage requires the criterion TEXT to match exactly. A criterion_id is only
  // a cross-reference; on its own it can never stand in for the required text.
  const a = normalizeCriterionText(row.item)
  const b = normalizeCriterionText(expected.text)
  return a !== '' && b !== '' && a === b
}

/**
 * Resolve which expected criterion one result row may cover.
 *
 * The full criterion text is authoritative; `criterion_id` is auxiliary only. A
 * row covers a standard when its normalized text equals that standard's text —
 * and, if the row also carries an id, that id must agree with the matched
 * standard. A row whose text matches nothing covers nothing, even with a valid
 * AC id (an id alone must never substitute for the original text). When two
 * standards share identical text, the id disambiguates; otherwise it is
 * ambiguous and covers neither. Returns at most one target index.
 */
function rowTarget(row, expected) {
  const rowId = typeof row?.criterionId === 'string' ? row.criterionId.trim().toUpperCase() : ''
  const rowText = normalizeCriterionText(row?.item)
  if (rowText === '') return -1
  const textMatches = []
  expected.forEach((exp, index) => {
    if (normalizeCriterionText(exp.text) === rowText) textMatches.push(index)
  })
  if (textMatches.length === 0) return -1
  if (textMatches.length === 1) {
    const target = textMatches[0]
    if (rowId !== '' && rowId !== expected[target].id.toUpperCase()) return -1
    return target
  }
  // Duplicate texts: the id may disambiguate, otherwise the row is ambiguous.
  if (rowId !== '') {
    const byId = textMatches.find((index) => expected[index].id.toUpperCase() === rowId)
    if (byId !== undefined) return byId
  }
  return -1
}

/**
 * Maximum bipartite matching (Kuhn's algorithm) between result rows and expected
 * criteria: each row covers at most one criterion and each criterion needs its
 * own distinct row, so one row can never stand in for two standards. Returns the
 * set of covered expected indices.
 */
function matchCoverage(rows, expected) {
  const adjacency = rows.map((row) => {
    const target = rowTarget(row, expected)
    return target >= 0 ? [target] : []
  })
  const matchToRow = new Array(expected.length).fill(-1)
  function tryAssign(rowIndex, seen) {
    for (const target of adjacency[rowIndex]) {
      if (seen.has(target)) continue
      seen.add(target)
      if (matchToRow[target] === -1 || tryAssign(matchToRow[target], seen)) {
        matchToRow[target] = rowIndex
        return true
      }
    }
    return false
  }
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    if (adjacency[rowIndex].length === 0) continue
    tryAssign(rowIndex, new Set())
  }
  const covered = new Set()
  for (let i = 0; i < matchToRow.length; i += 1) if (matchToRow[i] !== -1) covered.add(i)
  return covered
}

function renderBriefSpec(brief) {
  const lines = [`目标：${brief.goal}`]
  if (brief.acceptance_criteria.length > 0) {
    lines.push(
      `验收标准（最终审核时请在 criteria 中逐条给出结论：criterion_id 填对应编号，item 与原文保持一致）：\n${bulletList(
        criteriaWithIds(brief.acceptance_criteria).map((c) => `${c.id}: ${c.text}`),
      )}`,
    )
  }
  if (brief.in_scope.length > 0) lines.push(`范围内：\n${bulletList(brief.in_scope)}`)
  if (brief.out_of_scope.length > 0) lines.push(`范围外（不做）：\n${bulletList(brief.out_of_scope)}`)
  if (Array.isArray(brief.assumptions) && brief.assumptions.length > 0) {
    lines.push(`当前采用的假设：\n${bulletList(brief.assumptions)}`)
  }
  if (Array.isArray(brief.open_questions) && brief.open_questions.length > 0) {
    lines.push(`开工前应与用户确认的待定项（主代理须在 context 里带回用户答复）：\n${bulletList(brief.open_questions)}`)
  }
  return lines.join('\n')
}

/**
 * Best-effort extraction of an explicit acceptance list from a passed requirement
 * when no brief exists, so the host coverage gate still applies.
 *
 * Robustness rules (learned from audit findings):
 *  - A blank line does NOT end the list (users separate criteria with blank lines).
 *  - Once an item is seen (AC-labelled OR under a "验收标准" heading) the list stays
 *    open and collects BOTH `ACn` labels and `n.` / `-` / `*` / `•` items, so a
 *    mixed "AC1: A / 2. B" list is fully captured rather than only the AC-labelled
 *    prefix.
 *  - Only a markdown heading or a known next-section heading (范围/假设/约束/…)
 *    closes the list.
 * Free-form prose yields [] and falls back to model-side splitting.
 */
function extractCriteriaFromRequirement(text) {
  if (typeof text !== 'string' || text.trim() === '') return []
  const lines = text.split(/\r?\n/)
  const results = []
  let inCriteria = false
  const pushItem = (value) => {
    const item = String(value ?? '').trim()
    if (item !== '') results.push(item)
  }
  for (const raw of lines) {
    const line = raw.trim()
    if (line === '') continue // blank lines never end a list
    const ac = /^AC\s*\d+\s*(?:[:：.)、-]\s*|\s+)(.+)$/i.exec(line)
    if (ac !== null) {
      pushItem(ac[1])
      inCriteria = true
      continue
    }
    // A criteria heading: a Markdown heading whose text starts with "验收标准",
    // or a standalone "验收标准" / "验收标准：" / "验收标准（…）：" line. Anchored to
    // the WHOLE line so a continuation like "验收标准还必须同时满足 B" is not
    // mistaken for a heading (it is joined to the previous item below).
    if (
      /^#{1,6}\s*验收标准/.test(line) ||
      /^验收标准\s*[:：]?\s*$/.test(line) ||
      /^验收标准\s*[（(][^)）]*[)）]\s*[:：]?\s*$/.test(line)
    ) {
      inCriteria = true
      continue
    }
    // Any other Markdown heading closes the section.
    if (/^#{1,6}\s/.test(line)) {
      inCriteria = false
      continue
    }
    // A known next-section heading closes the section.
    if (/^(范围外|范围内|范围|假设|约束|背景|上下文|目标|风险|备注|非目标|不做)\s*[:：]/.test(line)) {
      inCriteria = false
      continue
    }
    if (inCriteria) {
      const item = /^(?:[-*•]|\d+[.、)]|[（(]\d+[）)])\s*(.+)$/.exec(line)
      if (item !== null) pushItem(item[1])
      // A non-item line inside the list is a continuation (wrapped/indented) of
      // the previous criterion. Join it rather than silently dropping it, so a
      // multi-line requirement cannot be truncated into a partial baseline.
      else if (results.length > 0) results[results.length - 1] = `${results[results.length - 1]} ${line}`
    }
  }
  return results
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

function normalizeFinalAudit(parsed, rawText, modelLabel, options = {}) {
  const record = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  const rawRuling = typeof record.ruling === 'string' ? record.ruling.trim().toLowerCase() : ''
  let ruling
  if (['ready', 'pass', 'passed', 'approved', 'ok'].includes(rawRuling)) ruling = 'ready'
  else if (['not_ready', 'notready', 'fail', 'failed', 'rejected', 'block'].includes(rawRuling)) ruling = 'not_ready'
  else if (['need_more_evidence', 'insufficient', 'unverified'].includes(rawRuling)) ruling = 'need_more_evidence'
  // No usable verdict: the child ran but never produced a decidable answer. That
  // is an audit that did not happen, so it reports `error` (retry or disclose
  // "not reviewed") rather than inventing a pass or a failure.
  else ruling = 'error'

  const criteria = []
  const coverageRows = []
  if (Array.isArray(record.criteria)) {
    for (const item of record.criteria) {
      if (item === null || typeof item !== 'object') continue
      const rawLabel = typeof item.item === 'string' ? item.item : ''
      let status = typeof item.status === 'string' ? item.status.toLowerCase() : ''
      if (!['pass', 'fail', 'unverified'].includes(status)) status = 'unverified'
      const evidenceRaw = typeof item.evidence === 'string' ? item.evidence : ''
      const criterionId =
        typeof item.criterion_id === 'string'
          ? item.criterion_id.trim()
          : typeof item.criterionId === 'string'
            ? item.criterionId.trim()
            : ''
      if (rawLabel.trim() === '') {
        // A malformed row with no standard name must not silently disappear: keep
        // a known failure (so it blocks), and anything else as unverified so it
        // cannot pass on a blank label.
        criteria.push({
          item: '（未指明验收标准，结构异常）',
          status: status === 'fail' ? 'fail' : 'unverified',
          evidence: truncate(evidenceRaw, 1000),
          ...(criterionId === '' ? {} : { criterion_id: criterionId }),
        })
        continue
      }
      // A "pass" with no evidence is not a verified pass: downgrade it so it can
      // never let a `ready` through on faith alone.
      if (status === 'pass' && evidenceRaw.trim() === '') status = 'unverified'
      criteria.push({
        item: truncate(rawLabel, 500),
        status,
        evidence: truncate(evidenceRaw, 1000),
        ...(criterionId === '' ? {} : { criterion_id: criterionId }),
      })
      // Keep the untruncated text for exact coverage matching, so a long
      // criterion is not mismatched by the display truncation above.
      coverageRows.push({ item: rawLabel, criterionId })
    }
  }

  const blocking = toStrArray(record.blocking_issues ?? record.blockingIssues)
  const requiredActions = toStrArray(record.required_actions ?? record.requiredActions)
  const hardFailures = criteria.filter((item) => item.status === 'fail').length
  const unverified = criteria.filter((item) => item.status === 'unverified').length

  // Any known failure or blocking issue forces not_ready regardless of the
  // arbiter's submitted ruling (ready OR need_more_evidence). A plugin-level
  // error is never converted into ready.
  if ((hardFailures > 0 || blocking.length > 0) && (ruling === 'ready' || ruling === 'need_more_evidence')) {
    ruling = 'not_ready'
  } else if (ruling === 'ready') {
    if (unverified > 0) ruling = 'need_more_evidence'
    // A `ready` with no per-criterion conclusion at all is never a verified pass,
    // even when no expected list is available (explicit-requirement path): the
    // arbiter must have split the requirement into rows it actually checked.
    else if (criteria.length === 0) {
      ruling = 'need_more_evidence'
      requiredActions.push('审核没有任何逐条结论（criteria 为空），无法证明已完成；请逐条给出结论与证据后重审。')
    }
  }

  // Host-side coverage gate. The expected list comes from the stored brief; a
  // ready verdict that never ruled on one of those criteria is exactly the
  // "unfixed item passed review" false pass this mode must stop. Matching is
  // one-to-one so a single row cannot satisfy two standards.
  const expected = Array.isArray(options.expectedCriteria)
    ? options.expectedCriteria.filter((c) => c && typeof c.text === 'string' && c.text.trim() !== '')
    : []
  const coveredIndices = matchCoverage(coverageRows, expected)
  const uncovered = expected.filter((_exp, index) => !coveredIndices.has(index))
  if (uncovered.length > 0) {
    if (ruling === 'ready') ruling = 'need_more_evidence'
    const names = uncovered.map((c) => `${c.id}: ${c.text}`).join('；')
    requiredActions.push(`以下验收标准没有得到逐条结论或其结论为空，请补齐后重审：${names}`)
  }

  // A session with no recorded tool call at all cannot have verified a file change
  // or a test run. A `ready` there is unsupported by evidence.
  if (ruling === 'ready' && options.noToolCalls === true) {
    ruling = 'need_more_evidence'
    requiredActions.push('本会话未记录任何工具调用，无法证明已改文件或跑过测试；请补充可复现证据后重审。')
  }

  const noVerdictNote =
    ruling === 'error'
      ? `裁决者没有返回可判定的结论${rawRuling === '' ? '' : `（收到 ruling=${truncate(rawRuling, 80)}）`}，本次审核视为未完成。`
      : ''
  if (ruling === 'error' && requiredActions.length === 0) {
    requiredActions.push('重试 cross_review_final，或向用户披露本次交付未复核')
  }

  const coverageNote = uncovered.length > 0 ? `（另有 ${uncovered.length} 条验收标准未逐条覆盖）` : ''
  const baseSummary =
    (typeof record.summary === 'string' && record.summary.trim()) ||
    (typeof record.reasoning === 'string' && record.reasoning.trim()) ||
    noVerdictNote ||
    (ruling === 'ready' ? '交付审核通过。' : '交付审核未通过。')

  return {
    ruling,
    summary: truncate(`${baseSummary}${coverageNote}`, 2000),
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
    // Always actionable: an audit that did not run is retried or disclosed.
    required_actions: ['重试 cross_review_final，或向用户披露本次交付未复核'],
    reasoning: '',
    arbiter_model: modelLabel,
    raw: '',
  }
}

// A duty switched off in settings produces `skipped`, never `ready`: recording
// "not audited" as "passed" makes the history unable to tell the two apart.
function skippedFinalAudit(summary) {
  return {
    ruling: 'skipped',
    summary,
    criteria: [],
    blocking_issues: [],
    required_actions: [],
    reasoning: '',
    arbiter_model: '',
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
      '开工前的需求解析（由裁决者执行）：把用户原始需求整理成可执行、可验收的规格，返回目标、范围、验收标准、假设与待确认问题。' +
      '结果按会话记住，交付审核会自动复用。协议见系统提示中的「交叉复核模式协议」。',
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
        // A disabled briefing cannot produce a trustworthy baseline for this
        // session; drop any earlier one so a later final cannot reuse stale
        // criteria from a previous task.
        forgetBrief(exec)
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
        if (failure !== undefined) {
          // A non-normal completion leaves no trustworthy criteria; drop any
          // earlier baseline so a later final cannot reuse stale standards.
          forgetBrief(exec)
          return errorBrief(failure, modelLabel)
        }
        const rawText = extractText(result)
        const parsed = structuredOf(result) ?? parseJsonLoose(rawText)
        const brief = normalizeBrief(parsed, rawText, modelLabel)
        if (brief.acceptance_criteria.length === 0) {
          // An empty criterion list is not a usable baseline: drop any earlier
          // brief for this session so a later final cannot silently reuse stale
          // criteria, and tell the coordinator what is missing.
          forgetBrief(exec)
          if (!brief.open_questions.some((q) => q.includes('验收标准'))) {
            brief.open_questions = [
              ...brief.open_questions,
              '裁决者未给出可验证的验收标准，请补充具体、可观察的验收项后再开工/交付。',
            ]
          }
          return brief
        }
        rememberBrief(exec, brief, args)
        return brief
      } catch (error) {
        // A failed brief must not leave an older baseline in place either.
        forgetBrief(exec)
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
      '交付前的终局审核（由裁决者执行）：逐条核对验收标准、自行验证文件与测试，返回逐条结论与必要的修复动作。' +
      '省略 requirement 时自动复用本会话 cross_review_brief 的验收标准；系统会附带主代理无法改写的写操作与命令记录。' +
      '各结论的处理方式见系统提示中的「交叉复核模式协议」。',
    output: {
      schema: FINAL_TOOL_SCHEMA,
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    },
    isConcurrencySafe: () => false,
    async execute(args, exec) {
      const routes = getRoutes()
      const modelLabel = routeLabel(routes.arbiter)
      // Closing audit can be switched off on its own. It reports `skipped`, not
      // `ready`: "not audited" must stay distinguishable from "passed" in the
      // session history and in the caller's final report.
      if (routes.arbiter.enabled === false || routes.arbiter.auditEnabled === false) {
        return skippedFinalAudit(
          routes.arbiter.enabled === false
            ? '裁决者已在设置中停用，跳过交付审核（未启动子代理）。'
            : '交付审核已在设置中关闭，跳过（未启动子代理）。',
        )
      }

      const explicitRequirement = typeof args.requirement === 'string' ? args.requirement.trim() : ''
      const brief = readBrief(exec)
      const requirement = explicitRequirement === '' && brief !== undefined ? renderBriefSpec(brief) : explicitRequirement
      if (requirement === '') {
        // A closed brief duty cannot be "fixed" by calling it again, so the
        // guidance must not tell the caller to do that: it would loop forever.
        const briefClosed = routes.arbiter.briefEnabled === false
        return {
          ruling: 'need_more_evidence',
          summary: briefClosed
            ? '缺少验收标准：需求解析（cross_review_brief）已在设置中关闭，不会留下可复用的验收标准，因此本次交付审核必须显式传入 requirement。'
            : '缺少验收标准：本次调用没有 requirement，本会话也没有可复用的 cross_review_brief 结果。请先调用 cross_review_brief，或在 requirement 里写明验收标准。',
          criteria: [],
          blocking_issues: [],
          required_actions: [
            briefClosed
              ? '在 cross_review_final 的 requirement 参数中写明验收标准后重试'
              : '调用 cross_review_brief，或在 cross_review_final 的 requirement 中写明验收标准',
          ],
          reasoning: '',
          arbiter_model: '',
          raw: '',
        }
      }
      const briefSection =
        brief === undefined || explicitRequirement === ''
          ? ''
          : `\n\n【系统补充：本会话 cross_review_brief 产出的验收标准（主代理未改写；若与你本次提交的范围不一致，请指出差异并以用户最新意图为准，但仍需对下列每一条给出结论）】\n${renderBriefSpec(brief)}`
      const files =
        Array.isArray(args.files) && args.files.length > 0 ? args.files : (brief?.files ?? [])
      // Coverage is checked against the stored brief even when an explicit
      // requirement is supplied: passing a narrower excerpt must not hide a
      // criterion the brief already recorded (the "unfixed item passed" case).
      // With no brief, fall back to a clearly-structured explicit list when one
      // is present, so a numbered requirement is still gated host-side.
      const expectedCriteria =
        brief !== undefined
          ? criteriaWithIds(brief.acceptance_criteria)
          : criteriaWithIds(extractCriteriaFromRequirement(requirement))

      try {
        const { result, toolFactTotal } = await runChildWithRetry(
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
        return normalizeFinalAudit(parsed, rawText, modelLabel, {
          expectedCriteria,
          noToolCalls: toolFactTotal === 0,
        })
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
    briefOff ? '- 裁决者·需求解析：**当前已在设置中关闭**，cross_review_brief 会直接放行，按你自己的理解开工；此时收尾审核必须由你在 requirement 里显式写明验收标准。' : null,
    auditOff ? '- 裁决者·交付审核：**当前已在设置中关闭**，cross_review_final 返回 skipped，交付前请自行逐条核对验收标准。' : null,
  ].filter((line) => line !== null)
  const statusSection = statusLines.length > 0 ? '\n### 当前生效状态\n' + statusLines.join('\n') + '\n' : ''

  return `## 交叉复核模式协议（Cross-Verification Mode）

两个角色：**裁决者在首尾判定需求与交付，你（主代理）负责执行与取证。**

### 角色分工
- **裁决者**（${routeLabel(routes.arbiter)}）：开工前解析需求（cross_review_brief），收尾时审核交付（cross_review_final）。正常路径各一次；收尾未通过时，把修复动作一次改完再复审。
- **主代理**（你）：按规格执行，并提供可复现证据（命令、输出、文件路径）；**验收判定由裁决者完成，你不自行下「通过/不通过」的结论**。
${statusSection}
### 任务开始时：cross_review_brief（正常路径一次）
把用户原始需求交给裁决者，得到 goal / 范围 / 验收标准 / 假设 / 待确认问题。验收标准会带上 AC1、AC2… 编号。
**开工前先把 open_questions 里影响验收、只能由用户决定的事项（配色、视觉取舍、范围边界、参考对象）用 ask_user_question 问清楚，再动手**；带着猜测实现，交付审核必然返工。把用户对这些问题的答复与你当前采用的 assumptions 记下来，并在 cross_review_final 的 context 里如实带上（含用户最新取舍），作为审核依据。其余按 assumptions 推进并在最终回复里说明。
结果会被本插件按会话记住，收尾审核自动复用，**不需要你抄一遍**。若需求解析已在设置中关闭，收尾时你必须自己把验收标准写进 requirement（并尽量给出可逐条核对的编号）。

**轻量豁免**：纯问答、只读检索、单行格式确认这类**没有文件改动、也没有外部副作用**的请求，可以跳过 brief 与 final；此时要在回复里说明「本次未走交叉复核」，不要假装复核过。

### 任务结束时：cross_review_final（唯一的验收关）
把交付声明与**可复现证据**（改了哪些文件、跑了什么命令、关键输出）交给裁决者。调用时可以不传 requirement，它会自动使用 brief 的验收标准；系统还会附带主会话真实的写操作/命令记录，你无法改写它——所以不要声称做过日志里没有的事。
**提交前先自检**：对照每一条验收标准（AC1…）逐项准备「证据位置（文件+行号 / 截图 / 数据文件）、验证方法（命令或检查手段）、实际结果、必要执行环境（版本 / 端口 / 登录态等）」；把 open_questions 的用户答复与当前 assumptions 写进 context。已有失败、未完成动作或关键输出缺失时，先处理完再提交；证据不齐不要提交。裁决者会一次性返回**全部** fail / unverified 与 required_actions；请把它们**一次改完再复审**，不要只修一条就重审，避免多次打回。宿主会按完整原文校验每条验收标准是否被逐条覆盖，遗漏、空证据或未经工具验证不会被判 ready。
- ready：才可以向用户宣布交付。
- not_ready / need_more_evidence：按 required_actions 修完或补证据再审核，不要跳过直接报告完成。
- error：审核本身没跑成（超时、模型故障、被取消、裁决者没给出可判定结论）。**这既不是通过也不是不通过**：要么重试一次，要么在最终回复里明确写出「交付审核未完成，以下为未复核内容」。
- skipped：该职责已在设置中关闭，本次**没有审核**。不要把它当成通过：最终回复里要说明「本次未走交叉复核」。

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
  FINAL_CHILD_RULINGS,
  FINAL_TOOL_RULINGS,
  FINAL_TOOL_SCHEMA,
  TIMEOUT_MAX_MS,
  TIMEOUT_MIN_MS,
  RETRYABLE_ERROR,
  buildBriefPrompt,
  buildFinalAuditPrompt,
  buildProtocol,
  clipMiddle,
  collectSessionContext,
  criterionCovered,
  criteriaWithIds,
  errorFinalAudit,
  extractCriteriaFromRequirement,
  matchCoverage,
  normalizeBrief,
  normalizeCriterionText,
  normalizeFinalAudit,
  parseExitCode,
  rowTarget,
  skippedFinalAudit,
  summarizeToolFacts,
  renderToolFacts,
  renderBriefSpec,
  parseJsonLoose,
  routeOf,
  routeTimeout,
  runChild,
}
