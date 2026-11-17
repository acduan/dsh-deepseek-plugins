import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_ARBITER,
  buildProtocol,
  normalizeBrief,
  normalizeFinalAudit,
  parseJsonLoose,
  renderBriefSpec,
  renderToolFacts,
  routeOf,
  summarizeToolFacts,
} from '../preset.js'

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

test('routeOf honours the disabled switch and timeout override', () => {
  const route = routeOf({ enabled: false, timeoutMs: 42 }, DEFAULT_ARBITER)
  assert.equal(route.enabled, false)
  assert.equal(route.timeoutMs, 42)
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

test('normalizeFinalAudit maps unknown rulings to unstructured', () => {
  assert.equal(normalizeFinalAudit({ ruling: 'probably fine' }, '', 'm').ruling, 'unstructured')
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
  assert.deepEqual(facts.shells, ['pwsh（失败）: Get-ChildItem'])
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

test('renderBriefSpec carries the acceptance criteria forward', () => {
  const text = renderBriefSpec({
    goal: '修登录',
    in_scope: ['登录页'],
    out_of_scope: ['注册'],
    acceptance_criteria: ['能登录', '错误提示可见'],
  })
  assert.match(text, /目标：修登录/)
  assert.match(text, /- 能登录/)
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
