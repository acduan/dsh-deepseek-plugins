import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_ARBITER,
  FINAL_CHILD_RULINGS,
  FINAL_TOOL_RULINGS,
  FINAL_TOOL_SCHEMA,
  ROUND_CAP,
  applyRoundCap,
  buildProtocol,
  buildFinalAuditPrompt,
  clipMiddle,
  collectSessionContext,
  criteriaWithIds,
  criterionCovered,
  errorFinalAudit,
  extractCriteriaFromRequirement,
  normalizeBrief,
  normalizeCriterionText,
  normalizeFinalAudit,
  parseExitCode,
  parseJsonLoose,
  renderBriefSpec,
  renderToolFacts,
  routeOf,
  skippedFinalAudit,
  stripCriterionLabel,
  summarizeToolFacts,
} from '../preset.js'

// A local mirror of the runtime's schema validator, limited to the keywords this
// plugin actually declares (object/array/string/enum/required). It exists because
// the real validator lives inside the DSH installation, which a profile plugin
// must not import; `test/schema-contract.test.mjs` re-checks the same values with
// the runtime's own validator when the installation is reachable.
function validateNode(schema, value, path = 'value') {
  const violations = []
  if (schema.enum !== undefined && !schema.enum.includes(value)) {
    violations.push(`${path} must be one of ${JSON.stringify(schema.enum)}`)
  }
  if (schema.type === 'object') {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      return [...violations, `${path} must be an object`]
    }
    for (const key of schema.required ?? []) {
      if (!(key in value)) violations.push(`${path}.${key} is required`)
    }
    const properties = schema.properties ?? {}
    for (const [key, child] of Object.entries(value)) {
      if (!(key in properties)) {
        if (schema.additionalProperties === false) violations.push(`${path}.${key} is not allowed`)
        continue
      }
      violations.push(...validateNode(properties[key], child, `${path}.${key}`))
    }
  } else if (schema.type === 'array') {
    if (!Array.isArray(value)) return [...violations, `${path} must be an array`]
    for (let i = 0; i < value.length; i += 1) {
      violations.push(...validateNode(schema.items ?? {}, value[i], `${path}[${i}]`))
    }
  } else if (schema.type === 'string' && typeof value !== 'string') {
    violations.push(`${path} must be a string`)
  }
  return violations
}

test('every cross_review_final result satisfies its declared output schema', () => {
  // Regression for the defect where `error`/`unstructured` were returned but the
  // declared enum only allowed three verdicts: the runtime validates tool return
  // values, so those paths were rejected as ToolOutputError and the caller never
  // saw the ruling, summary, or required_actions at all.
  const cases = {
    'arbiter disabled': skippedFinalAudit('裁决者已在设置中停用'),
    'audit duty disabled': skippedFinalAudit('交付审核已在设置中关闭'),
    'child failed': errorFinalAudit('无法完成交付审核：交叉复核超时（180s）', 'magpie/x'),
    'undecidable verdict': normalizeFinalAudit(undefined, 'not json', 'm'),
    'unknown ruling': normalizeFinalAudit({ ruling: 'probably fine' }, '', 'm'),
    ready: normalizeFinalAudit({ ruling: 'ready' }, '', 'm'),
    'not ready': normalizeFinalAudit({ ruling: 'not_ready' }, '', 'm'),
    'need more evidence': normalizeFinalAudit({ ruling: 'need_more_evidence' }, '', 'm'),
    'ready downgraded by a failed criterion': normalizeFinalAudit(
      { ruling: 'ready', criteria: [{ item: 'x', status: 'fail', evidence: 'y' }] },
      '',
      'm',
    ),
  }
  for (const [label, value] of Object.entries(cases)) {
    assert.deepEqual(validateNode(FINAL_TOOL_SCHEMA, value), [], `${label} must satisfy output.schema`)
  }
})

test('the tool ruling vocabulary is a superset of what the arbiter may submit', () => {
  for (const ruling of FINAL_CHILD_RULINGS) {
    assert.ok(FINAL_TOOL_RULINGS.includes(ruling), `${ruling} must stay valid for the tool`)
  }
  assert.ok(FINAL_TOOL_RULINGS.includes('error'))
  assert.ok(FINAL_TOOL_RULINGS.includes('skipped'))
})

test('a switched-off audit is recorded as skipped, never as a pass', () => {
  const skipped = skippedFinalAudit('交付审核已在设置中关闭')
  assert.equal(skipped.ruling, 'skipped')
  assert.notEqual(skipped.ruling, 'ready')
})

test('routeOf falls back to the deployment defaults', () => {
  const route = routeOf(undefined, DEFAULT_ARBITER)
  assert.equal(route.provider, DEFAULT_ARBITER.provider)
  assert.equal(route.model, DEFAULT_ARBITER.model)
  assert.equal(route.reasoningEffort, DEFAULT_ARBITER.reasoningEffort)
  assert.equal(route.enabled, true)
})

test('routeOf keeps an explicit route without an effort', () => {
  const route = routeOf({ provider: 'p', model: 'm' }, DEFAULT_ARBITER)
  assert.equal(route.provider, 'p')
  assert.equal(route.model, 'm')
  assert.equal(route.reasoningEffort, undefined)
  assert.equal(route.briefEnabled, true)
  assert.equal(route.auditEnabled, true)
})

test('routeOf honours the disabled switch', () => {
  const route = routeOf({ enabled: false }, DEFAULT_ARBITER)
  assert.equal(route.enabled, false)
})

test('routeOf clamps an out-of-range timeout instead of trusting it', () => {
  // A hand-written YAML config never passes through the Host store, so the
  // preset has to enforce the same bounds.
  assert.equal(routeOf({ timeoutMs: 42 }, DEFAULT_ARBITER).timeoutMs, 10000)
  assert.equal(routeOf({ timeoutMs: 9_000_000 }, DEFAULT_ARBITER).timeoutMs, 3600000)
  assert.equal(routeOf({ timeoutMs: 120000 }, DEFAULT_ARBITER).timeoutMs, 120000)
  // Regression: a 3600s budget must not be clamped back to 1800s.
  assert.equal(routeOf({ timeoutMs: 3_600_000 }, DEFAULT_ARBITER).timeoutMs, 3_600_000)
})

test('parseJsonLoose accepts fenced and prose-wrapped JSON', () => {
  assert.deepEqual(parseJsonLoose('```json\n{"a":1}\n```'), { a: 1 })
  assert.deepEqual(parseJsonLoose('结论如下 {"b":2} 以上'), { b: 2 })
  assert.equal(parseJsonLoose('not json at all'), undefined)
})

test('normalizeFinalAudit refuses ready when a criterion failed', () => {
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '测试通过', status: 'fail', evidence: '断言失败' }] },
    '',
    'm',
  )
  assert.equal(audit.ruling, 'not_ready')
})

test('normalizeFinalAudit downgrades ready to need_more_evidence', () => {
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '测试通过', status: 'unverified', evidence: '' }] },
    '',
    'm',
  )
  assert.equal(audit.ruling, 'need_more_evidence')
})

test('normalizeFinalAudit refuses ready with blocking issues', () => {
  const audit = normalizeFinalAudit({ ruling: 'ready', blocking_issues: ['构建失败'] }, '', 'm')
  assert.equal(audit.ruling, 'not_ready')
})

test('normalizeFinalAudit reports an undecidable verdict as error, not a pass', () => {
  // `unstructured` used to be returned here, which violated the tool's declared
  // output enum and made the runtime reject the whole result.
  assert.equal(normalizeFinalAudit({ ruling: 'probably fine' }, '', 'm').ruling, 'error')
  assert.equal(normalizeFinalAudit(undefined, 'not json at all', 'm').ruling, 'error')
  assert.equal(normalizeFinalAudit({}, '', 'm').ruling, 'error')
})

test('an error ruling always carries an actionable next step', () => {
  const audit = normalizeFinalAudit(undefined, '', 'm')
  assert.ok(audit.required_actions.length > 0, 'error must tell the caller what to do')
  assert.match(audit.required_actions[0], /重试|披露/)
})

test('normalizeBrief accepts camelCase keys from a text fallback', () => {
  const brief = normalizeBrief({ goal: '修登录', acceptanceCriteria: ['能登录'], inScope: ['a'] }, '', 'm')
  assert.deepEqual(brief.acceptance_criteria, ['能登录'])
  assert.deepEqual(brief.in_scope, ['a'])
})

test('summarizeToolFacts extracts writes, commands and failures', () => {
  const facts = summarizeToolFacts([
    { type: 'tool/call', data: { callId: 'c1', name: 'write', arguments: JSON.stringify({ file_path: 'a.js' }) } },
    { type: 'tool/result', data: { message: { source: { callId: 'c1' }, isError: false } } },
    { type: 'tool/call', data: { callId: 'c2', name: 'pwsh', arguments: JSON.stringify({ command: 'Get-ChildItem' }) } },
    {
      type: 'tool/result',
      data: { message: { source: { callId: 'c2' }, isError: true }, error: { code: 'EFAIL', reason: 'boom' } },
    },
  ])
  assert.equal(facts.total, 2)
  assert.deepEqual(facts.writes, ['write → a.js'])
  assert.deepEqual(facts.shells, ['pwsh: Get-ChildItem [失败]；结果正文缺失'])
  assert.deepEqual(facts.failed, ['pwsh: boom'])
})

test('summarizeToolFacts ignores events without calls', () => {
  const facts = summarizeToolFacts([{ type: 'turn/start', data: { turn: 1 } }])
  assert.equal(facts.total, 0)
  assert.deepEqual(facts.writes, [])
})

test('renderToolFacts says so when nothing was recorded', () => {
  const text = renderToolFacts({ writes: [], shells: [], failed: [], total: 0 })
  assert.match(text, /尚未记录任何工具调用/)
})

test('renderBriefSpec carries the acceptance criteria forward with stable ids', () => {
  const text = renderBriefSpec({
    goal: '修登录',
    in_scope: ['登录页'],
    out_of_scope: ['注册'],
    acceptance_criteria: ['能登录', '错误提示可见'],
  })
  assert.match(text, /目标：修登录/)
  assert.match(text, /AC1: 能登录/)
  assert.match(text, /AC2: 错误提示可见/)
  assert.match(text, /范围外（不做）/)
})

test('buildProtocol announces a disabled arbiter', () => {
  const text = buildProtocol({
    arbiter: { ...DEFAULT_ARBITER, enabled: false },
  })
  assert.match(text, /裁决者：\*\*当前已在设置中停用/)
  assert.match(text, /cross_review_brief \/ cross_review_final 会直接放行/)
})

test('buildProtocol announces a disabled closing audit', () => {
  const text = buildProtocol({
    arbiter: { ...DEFAULT_ARBITER, enabled: true, briefEnabled: true, auditEnabled: false },
  })
  assert.match(text, /交付审核：\*\*当前已在设置中关闭/)
})

test('buildProtocol keeps the light-task exemption and error semantics', () => {
  const text = buildProtocol({ arbiter: { ...DEFAULT_ARBITER } })
  assert.match(text, /轻量豁免/)
  assert.match(text, /既不是通过也不是不通过/)
  assert.match(text, /两个角色/)
  assert.doesNotMatch(text, /复核者/)
})

test('parseExitCode reads only the known exit-code marker', () => {
  assert.equal(parseExitCode('done\n[exit code: 0]'), 0)
  assert.equal(parseExitCode('[exit code: 3] failed'), 3)
  assert.equal(parseExitCode('processed 200 files in 500 ms'), undefined)
})

test('normalizeCriterionText unifies whitespace and strips the AC prefix', () => {
  assert.equal(normalizeCriterionText('AC2:  能\r\n登录 '), normalizeCriterionText('能登录'))
  assert.notEqual(normalizeCriterionText('能登录'), normalizeCriterionText('能注册'))
})

test('criterionCovered requires exact normalized text; an id alone does not cover', () => {
  const expected = { id: 'AC1', text: '顶栏背景为 #ebeef3' }
  assert.equal(criterionCovered({ item: '顶栏背景为 #ebeef3' }, expected), true)
  assert.equal(criterionCovered({ item: '顶栏背景为#ebeef3 ' }, expected), true)
  // A criterion_id on its own must not stand in for the required text.
  assert.equal(criterionCovered({ item: '别的内容', criterionId: 'AC1' }, expected), false)
  assert.equal(criterionCovered({ item: '顶栏改成浅灰' }, expected), false)
})

test('extractCriteriaFromRequirement reads AC labels and 验收标准 lists', () => {
  assert.deepEqual(extractCriteriaFromRequirement('验收标准：\n- 能登录\n- 错误提示可见'), ['能登录', '错误提示可见'])
  assert.deepEqual(extractCriteriaFromRequirement('AC1 甲\nAC2 乙'), ['甲', '乙'])
  // Blank lines inside the list must not end it.
  assert.deepEqual(extractCriteriaFromRequirement('验收标准：\n1. A\n\n2. B'), ['A', 'B'])
  // Mixed AC-labelled and numbered items in one list are all captured.
  assert.deepEqual(extractCriteriaFromRequirement('AC1: A\n2. B'), ['A', 'B'])
  // A Markdown criteria heading must still open the list.
  assert.deepEqual(extractCriteriaFromRequirement('## 验收标准\n1. A\n2. B'), ['A', 'B'])
  // A list item that merely mentions the word must not be mistaken for a heading.
  assert.deepEqual(extractCriteriaFromRequirement('验收标准：\n1. A\n2. 所有验收标准需有日志'), ['A', '所有验收标准需有日志'])
  // A continuation line of a list item is kept with that item, not dropped.
  assert.deepEqual(extractCriteriaFromRequirement('验收标准：\n1. A\n   必须同时满足 B\n2. C'), ['A 必须同时满足 B', 'C'])
  // A continuation that itself begins with "验收标准" is still a continuation, not a heading.
  assert.deepEqual(
    extractCriteriaFromRequirement('验收标准：\n1. A\n   验收标准还必须同时满足 B\n2. C'),
    ['A 验收标准还必须同时满足 B', 'C'],
  )
  assert.deepEqual(extractCriteriaFromRequirement('这是一段没有结构的自然语言需求'), [])
})

test('summarizeToolFacts distinguishes command states and excerpts bounded output', () => {
  const facts = summarizeToolFacts([
    { type: 'tool/call', data: { callId: 'c1', name: 'pwsh', arguments: JSON.stringify({ command: 'run tests' }) } },
    { type: 'tool/result', data: { message: { source: { callId: 'c1' }, isError: false, content: [{ type: 'text', text: 'PASS 78\n[exit code: 0]' }] } } },
    { type: 'tool/call', data: { callId: 'c2', name: 'pwsh', arguments: JSON.stringify({ command: 'deploy' }) } },
    { type: 'tool/result', data: { message: { source: { callId: 'c2' }, isError: false, content: [{ type: 'text', text: 'boom\n[exit code: 3]' }] } } },
    { type: 'tool/call', data: { callId: 'c3', name: 'pwsh', arguments: JSON.stringify({ command: 'sleep 1' }) } },
  ])
  assert.equal(facts.total, 3)
  assert.match(facts.shells[0], /\[退出码 0\]；输出：PASS 78/)
  assert.match(facts.shells[1], /\[退出码 3，失败\]/)
  assert.match(facts.shells[2], /\[未返回结果，不能视为成功\]/)
  assert.ok(facts.failed.some((entry) => /退出码 3/.test(entry)))
})

test('a ready audit missing a brief criterion is downgraded to need_more_evidence', () => {
  const expectedCriteria = criteriaWithIds(['能登录', '错误提示可见'])
  const audit = normalizeFinalAudit(
    { ruling: 'ready', summary: 'ok', criteria: [{ item: '能登录', status: 'pass', evidence: '实测可登录' }] },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /AC2: 错误提示可见/)
})

test('a ready audit covering every criterion with evidence stays ready', () => {
  const expectedCriteria = criteriaWithIds(['能登录', '错误提示可见'])
  const audit = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        { item: '能登录', status: 'pass', evidence: '运行登录成功' },
        { item: '错误提示可见', status: 'pass', evidence: '截图见 logs/x.png' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'ready')
})

test('duplicate rows cannot stand in for a missing criterion', () => {
  const expectedCriteria = criteriaWithIds(['A', 'B', 'C'])
  const audit = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        { item: 'A', status: 'pass', evidence: 'e1' },
        { item: 'A', status: 'pass', evidence: 'e2' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /AC2: B/)
  assert.match(audit.required_actions.join('\n'), /AC3: C/)
})

test('a pass with empty evidence is treated as unverified, never ready', () => {
  const expectedCriteria = criteriaWithIds(['能登录'])
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '能登录', status: 'pass', evidence: '   ' }] },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.equal(audit.criteria[0].status, 'unverified')
})

test('an unrelated row does not cover a missing criterion', () => {
  const expectedCriteria = criteriaWithIds(['顶层容器背景', 'iframe 内容背景'])
  const audit = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        { item: '顶层容器背景', status: 'pass', evidence: 'e' },
        { item: '某个无关的按钮颜色', status: 'pass', evidence: 'e' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /AC2: iframe 内容背景/)
})

test('a ready audit with zero recorded tool calls is downgraded', () => {
  const expectedCriteria = criteriaWithIds(['测试通过'])
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '测试通过', status: 'pass', evidence: '跑了 56 个测试' }] },
    '',
    'm',
    { expectedCriteria, noToolCalls: true },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /未记录任何工具调用/)
})

test('a fail plus a missing criterion is not_ready and keeps both problems', () => {
  const expectedCriteria = criteriaWithIds(['A', 'B'])
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: 'A', status: 'fail', evidence: 'boom' }] },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'not_ready')
  assert.match(audit.required_actions.join('\n'), /AC2: B/)
})

test('final audit prompt asks for economical verification without lowering rigor', () => {
  const text = buildFinalAuditPrompt({ requirement: 'AC1: A', claim: 'done' })
  assert.match(text, /效率要求/)
  assert.match(text, /全库 glob/)
  assert.match(text, /至少要有一次针对性/)
})

test('collectSessionContext no longer attaches the conversation digest', async () => {
  const raw = Array.from({ length: 8 }, (_v, i) => ({
    role: 'user',
    content: [{ type: 'text', text: `msg-${i}` }],
  }))
  const ctx = {
    get: (key) =>
      key === 'sessionQuery'
        ? { inspectSession: async (_id, fn) => fn({ snapshotEvents: () => [], deriveMessages: () => raw }) }
        : undefined,
  }
  const exec = { agent: { session: { id: 'trim-session' } } }
  const out = await collectSessionContext(ctx, exec)
  // The digest is intentionally gone; only objective tool facts remain.
  assert.doesNotMatch(out.text, /最近对话/)
  assert.doesNotMatch(out.text, /msg-7/)
  assert.equal(out.toolFactTotal, 0)
})

test('clipMiddle keeps the head and tail within the cap', () => {
  const long = `${'a'.repeat(200)}END`
  const clipped = clipMiddle(long, 120)
  assert.ok(clipped.length <= 121)
  assert.match(clipped, /…/)
  assert.match(clipped, /END$/)
  assert.equal(clipMiddle('short', 120), 'short')
})

test('long evidence is truncated with a marker', () => {
  const text = buildFinalAuditPrompt({ requirement: 'AC1: A', claim: 'done', evidence: 'x'.repeat(5000) })
  assert.match(text, /请精简粘贴关键片段/)
  assert.match(text, /\[truncated \d+ chars\]/)
})

test('renderToolFacts no longer prints a separate failed list', () => {
  const text = renderToolFacts({
    writes: ['write → a.js'],
    shells: ['pwsh: x [失败]'],
    failed: ['pwsh: boom'],
    total: 2,
  })
  assert.doesNotMatch(text, /失败的调用/)
  assert.match(text, /\[失败\]/)
})

test('a ready with no per-criterion rows is not a verified pass', () => {
  const audit = normalizeFinalAudit({ ruling: 'ready', summary: 'done' }, '', 'm')
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /没有任何逐条结论/)
  // One concrete row with evidence (no expected list) is an acceptable pass.
  const ok = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '能登录', status: 'pass', evidence: 'curl 200' }] },
    '',
    'm',
  )
  assert.equal(ok.ruling, 'ready')
})

test('one row cannot cover two criteria (id-primary stays one-to-one)', () => {
  const expectedCriteria = criteriaWithIds(['A', 'B', 'C'])
  const audit = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        // Both rows claim AC1; one-to-one means only one may cover it, so B and C
        // must still be reported missing even though a row's text also says A.
        { criterion_id: 'AC1', item: 'A', status: 'pass', evidence: 'e' },
        { criterion_id: 'AC1', item: 'A again', status: 'pass', evidence: 'e' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /AC2: B/)
  assert.match(audit.required_actions.join('\n'), /AC3: C/)
})

test('a need_more_evidence verdict carrying a known fail is upgraded to not_ready', () => {
  const audit = normalizeFinalAudit(
    { ruling: 'need_more_evidence', criteria: [{ item: 'A', status: 'fail', evidence: 'boom' }] },
    '',
    'm',
  )
  assert.equal(audit.ruling, 'not_ready')
})

test('a malformed row with empty item but fail status still blocks', () => {
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '   ', status: 'fail', evidence: 'boom' }] },
    '',
    'm',
  )
  assert.equal(audit.ruling, 'not_ready')
})

test('long criteria are compared on full text (not after the 500-char display truncation)', () => {
  const prefix = '很长的验收标准'.repeat(100) // 700 chars, identical prefix for both
  const first = `${prefix}结尾甲`
  const second = `${prefix}结尾乙`
  const expectedCriteria = criteriaWithIds([first, second])
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: first, status: 'pass', evidence: 'e' }] },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.summary, /1 条验收标准未逐条覆盖/)
})

test('an unknown criterion_id falls back to text and cannot cover by itself', () => {
  const expectedCriteria = criteriaWithIds(['A', 'B', 'C'])
  const audit = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        { item: 'A', status: 'pass', evidence: 'e' },
        { item: 'B', status: 'pass', evidence: 'e' },
        // Out-of-range id (AC9) must NOT cover any real criterion; its unrelated
        // text D matches nothing either, so C is still missing.
        { criterion_id: 'AC9', item: 'D', status: 'pass', evidence: 'e' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /AC3: C/)
})

test('collectSessionContext marks tool facts unavailable without a session query', async () => {
  const ctx = { get: () => undefined }
  const exec = { agent: { session: { id: 'ctx-s1' } } }
  const out = await collectSessionContext(ctx, exec)
  assert.equal(out.toolFactTotal, null)
  assert.match(out.text, /未能读取本会话工具调用记录|工具调用事实不可用/)
})

test('collectSessionContext marks tool facts unavailable when the query throws', async () => {
  const ctx = {
    get: (key) => (key === 'sessionQuery' ? { inspectSession: async () => { throw new Error('boom') } } : undefined),
  }
  const exec = { agent: { session: { id: 'ctx-s2' } } }
  const out = await collectSessionContext(ctx, exec)
  assert.equal(out.toolFactTotal, null)
  assert.match(out.text, /工具调用事实不可用/)
})

test('controlled scope: partial fixes never pass (topbar / iframe / KPI)', () => {
  const expectedCriteria = criteriaWithIds([
    '顶栏背景色改为 #3a807e',
    '首页 iframe 内容背景改为 #ebeef3',
    '移除首页硬编码「—」占位卡',
  ])
  // Only the top bar was fixed; the other two still fail → not_ready.
  const partial = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        { item: '顶栏背景色改为 #3a807e', status: 'pass', evidence: '截图+计算色' },
        { item: '首页 iframe 内容背景改为 #ebeef3', status: 'fail', evidence: '仍是 #f4f6fa' },
        { item: '移除首页硬编码「—」占位卡', status: 'fail', evidence: '仍有 4 个占位卡' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(partial.ruling, 'not_ready')

  // The arbiter ruled on only one item and skipped the other two → not ready.
  const missed = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '顶栏背景色改为 #3a807e', status: 'pass', evidence: 'x' }] },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(missed.ruling, 'need_more_evidence')
  assert.match(missed.required_actions.join('\n'), /AC2/)
  assert.match(missed.required_actions.join('\n'), /AC3/)

  // All three fixed with evidence → ready.
  const done = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        { criterion_id: 'AC1', item: '顶栏背景色改为 #3a807e', status: 'pass', evidence: 'rgb(58,128,126)' },
        { criterion_id: 'AC2', item: '首页 iframe 内容背景改为 #ebeef3', status: 'pass', evidence: 'rgb(235,238,243)' },
        { criterion_id: 'AC3', item: '移除首页硬编码「—」占位卡', status: 'pass', evidence: 'DOM 无 .qmx-cards' },
      ],
    },
    '',
    'm',
    { expectedCriteria },
  )
  assert.equal(done.ruling, 'ready')
})

// ---------------------------------------------------------------------------
// P0-1: id-primary coverage + robust label stripping.
// ---------------------------------------------------------------------------

test('criteriaWithIds strips an embedded AC label so the body is compared', () => {
  const withIds = criteriaWithIds(['AC1 详情弹窗初始状态=隐藏', 'AC2（配色）：顶栏为 #ebeef3'])
  assert.deepEqual(withIds, [
    { id: 'AC1', text: '详情弹窗初始状态=隐藏' },
    { id: 'AC2', text: '顶栏为 #ebeef3' },
  ])
  // Rendering therefore does not double-label.
  const text = renderBriefSpec({
    goal: 'g',
    in_scope: [],
    out_of_scope: [],
    acceptance_criteria: ['AC1 详情弹窗初始状态=隐藏'],
  })
  assert.match(text, /AC1: 详情弹窗初始状态=隐藏/)
  assert.doesNotMatch(text, /AC1: AC1/)
})

test('normalizeCriterionText strips the space, colon and parenthetical label forms', () => {
  const body = normalizeCriterionText('详情弹窗初始状态=隐藏')
  assert.equal(normalizeCriterionText('AC1 详情弹窗初始状态=隐藏'), body) // bare space
  assert.equal(normalizeCriterionText('AC7：详情弹窗初始状态=隐藏'), body) // full-width colon
  assert.equal(normalizeCriterionText('AC3（提示文案位置）：详情弹窗初始状态=隐藏'), body) // tag
  // A genuine token that merely starts with AC+digits must NOT be stripped.
  assert.equal(stripCriterionLabel('AC220V 电源'), 'AC220V 电源')
})

test('an id-primary row covers its criterion even when the text is paraphrased', () => {
  const expectedCriteria = criteriaWithIds([
    'AC1 详情弹窗初始状态=隐藏：初始 HTML 不出现明文密钥',
    'AC2 「显示」返回真实明文：与重置时一次性展示逐字符一致',
  ])
  const audit = normalizeFinalAudit(
    {
      ruling: 'ready',
      criteria: [
        // Paraphrased and much shorter than the source, but the id is right.
        { criterion_id: 'AC1', item: '弹窗默认隐藏，无明文', status: 'pass', evidence: 'read detail.html:28' },
        { criterion_id: 'AC2', item: '显示得到真实明文', status: 'pass', evidence: 'hex 对比一致' },
      ],
    },
    '',
    'm',
    { expectedCriteria, coverageEnforced: true },
  )
  assert.equal(audit.ruling, 'ready')
  assert.equal(audit.coverage_enforced, true)
})

// ---------------------------------------------------------------------------
// P0-2 / P2-2: free-form requirement is disclosed, never silently "verified".
// ---------------------------------------------------------------------------

test('a free-form requirement is disclosed as coverage-not-enforced, not silently passed', () => {
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ item: '能登录', status: 'pass', evidence: 'curl 200' }] },
    '',
    'm',
    { expectedCriteria: [], coverageEnforced: false },
  )
  // It may still be ready (the arbiter did review), but the caller is told the
  // host could not machine-check completeness.
  assert.equal(audit.coverage_enforced, false)
  assert.match(audit.summary, /未做逐条覆盖校验/)
})

test('when coverage IS enforced and a criterion is missing, it stays a hard downgrade', () => {
  const expectedCriteria = criteriaWithIds(['A', 'B'])
  const audit = normalizeFinalAudit(
    { ruling: 'ready', criteria: [{ criterion_id: 'AC1', item: 'A', status: 'pass', evidence: 'e' }] },
    '',
    'm',
    { expectedCriteria, coverageEnforced: true },
  )
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.equal(audit.coverage_enforced, true)
  assert.match(audit.required_actions.join('\n'), /AC2: B/)
})

// ---------------------------------------------------------------------------
// P1-1: read-only forensics guidance in the audit prompt.
// ---------------------------------------------------------------------------

test('the final audit prompt warns that some cmdlets are sandbox-limited and lists safe ones', () => {
  const text = buildFinalAuditPrompt({ requirement: 'AC1: A', claim: 'done' })
  assert.match(text, /只读取证命令/)
  assert.match(text, /不代表被检查的对象异常/)
  assert.match(text, /netstat -ano/)
  assert.match(text, /tasklist/)
  // It must not tell the arbiter to reproduce the item verbatim any more.
  assert.doesNotMatch(text, /item 与原文一致/)
})

// ---------------------------------------------------------------------------
// P2-1: round cap escalates evidence-only loops to the user.
// ---------------------------------------------------------------------------

test('applyRoundCap escalates after consecutive evidence-only need_more_evidence rounds', () => {
  const exec = { agent: { session: { id: 'round-cap-session' } } }
  const makeAudit = () => ({
    ruling: 'need_more_evidence',
    criteria: [{ item: 'AC3 生产库执行', status: 'unverified', evidence: '缺生产库' }],
    blocking_issues: [],
    required_actions: ['补生产库证据'],
    escalated: false,
  })
  for (let i = 1; i < ROUND_CAP; i += 1) {
    const a = applyRoundCap(exec, makeAudit())
    assert.equal(a.escalated, false, `round ${i} must not escalate yet`)
  }
  const escalated = applyRoundCap(exec, makeAudit())
  assert.equal(escalated.escalated, true)
  assert.match(escalated.required_actions.join('\n'), /停止重复提交 cross_review_final/)

  // A real fail (or a ready) resets the counter.
  const failAudit = {
    ruling: 'not_ready',
    criteria: [{ item: 'x', status: 'fail', evidence: 'boom' }],
    blocking_issues: [],
    required_actions: [],
    escalated: false,
  }
  applyRoundCap(exec, failAudit)
  const afterReset = applyRoundCap(exec, makeAudit())
  assert.equal(afterReset.escalated, false, 'a fail must reset the strike counter')
})
