import assert from 'node:assert/strict'
import { test } from 'node:test'

import { apply } from '../preset.js'

function makeHarness(options = {}) {
  const tools = new Map()
  const sections = []
  const starts = []
  const ctx = {
    tools: {
      register: (definition) => {
        tools.set(definition.name, definition)
        return () => {}
      },
    },
    systemPrompt: {
      section: (section) => {
        sections.push(section)
        return () => {}
      },
    },
    get: (key) => {
      if (key === 'subagents') {
        return {
          startActivation: async (spec) => {
            starts.push(spec)
            const attempt = starts.length
            const behaviour = options.onStart ? options.onStart(spec, attempt) : {}
            return {
              childId: 'child-1',
              result: Promise.resolve({
                output: [{ type: 'text', text: behaviour.text ?? '' }],
                structured: behaviour.structured,
                stopReason: behaviour.stopReason ?? 'completed',
                diagnostic: behaviour.diagnostic,
              }),
              dispose: async () => {},
            }
          },
        }
      }
      if (key === 'crossReviewConfig') {
        return options.routes === undefined ? undefined : { get: () => options.routes }
      }
      return undefined
    },
    effect: () => {},
  }
  return { ctx, tools, sections, starts }
}

function makeExec(sessionId = 'session-1', signal = new AbortController().signal) {
  return { agent: { session: { id: sessionId } }, signal }
}

test('apply registers the two tools and the protocol section', () => {
  const { ctx, tools, sections } = makeHarness()
  apply(ctx, {})
  assert.deepEqual([...tools.keys()].sort(), ['cross_review_brief', 'cross_review_final'])
  assert.equal(sections.length, 1)
  assert.equal(sections[0].name, 'cross-review:protocol')
  const schema = tools.get('cross_review_final').parameters
  assert.deepEqual(schema.required, ['claim'])
})

test('cross_review_brief asks the child for structured output', async () => {
  const { ctx, tools, starts } = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ctx, {})
  const brief = await tools.get('cross_review_brief').execute(
    { requirement: '修好登录', files: ['src/login.js'] },
    makeExec('brief-session'),
  )
  assert.equal(brief.goal, '修登录')
  assert.deepEqual(brief.acceptance_criteria, ['能登录'])
  assert.equal(starts.length, 1)
  assert.equal(starts[0].agentPreset, 'cross-review-internal')
  assert.equal(starts[0].delivery, 'caller')
  assert.equal(starts[0].outputSchema.type, 'object')
  assert.equal(starts[0].agentOptions.provider, 'magpie-responses')
})

test('cross_review_final reuses the brief and passes the stored criteria', async () => {
  const { ctx, tools, starts } = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录', '错误提示可见'],
        in_scope: ['登录页'],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
      text: '',
    }),
  })
  apply(ctx, {})
  const exec = makeExec('final-session')
  await tools.get('cross_review_brief').execute({ requirement: '修好登录' }, exec)
  starts.length = 0

  const harnessFinal = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: '通过',
        criteria: [
          { item: '能登录', status: 'pass', evidence: 'curl 登录返回 200' },
          { item: '错误提示可见', status: 'pass', evidence: '截图 logs/err.png' },
        ],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  // A fresh harness has its own tool set but shares the plugin's per-session
  // brief store, so the handoff still applies.
  apply(harnessFinal.ctx, {})
  const audit = await harnessFinal.tools
    .get('cross_review_final')
    .execute({ claim: '登录已修好' }, exec)
  assert.equal(audit.ruling, 'ready')
  const prompt = harnessFinal.starts[0].prompt[0].text
  assert.match(prompt, /验收标准/)
  assert.match(prompt, /能登录/)
  assert.equal(harnessFinal.starts[0].outputSchema.type, 'object')
  // Normal success path stays one brief child + one final child.
  assert.equal(harnessFinal.starts.length, 1)
})

test('cross_review_final refuses to audit without any criteria', async () => {
  const { ctx, tools, starts } = makeHarness()
  apply(ctx, {})
  const audit = await tools.get('cross_review_final').execute({ claim: '做完了' }, makeExec('empty-session'))
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.summary, /缺少验收标准/)
  assert.equal(starts.length, 0)
})

test('a disabled arbiter short-circuits without starting a child', async () => {
  const harness = makeHarness({
    routes: {
      arbiter: { enabled: false, briefEnabled: true, auditEnabled: true, provider: 'p', model: 'm' },
    },
  })
  apply(harness.ctx, {})
  const brief = await harness.tools
    .get('cross_review_brief')
    .execute({ requirement: '修好登录' }, makeExec('disabled-session'))
  assert.match(brief.goal, /停用/)
  assert.equal(harness.starts.length, 0)
})

test('a failed child is retried once before the audit is abandoned', async () => {
  const harness = makeHarness({
    onStart: (_spec, attempt) =>
      attempt === 1
        ? { stopReason: 'error', diagnostic: 'upstream 502' }
        : {
            structured: {
              ruling: 'ready',
              summary: '通过',
              criteria: [{ item: '能登录', status: 'pass', evidence: '登录返回 200' }],
              blocking_issues: [],
              required_actions: [],
              reasoning: '',
            },
          },
  })
  apply(harness.ctx, {})
  const audit = await harness.tools
    .get('cross_review_final')
    .execute({ requirement: '验收标准：能登录', claim: '已修好' }, makeExec('retry-session'))
  assert.equal(audit.ruling, 'ready')
  assert.equal(harness.starts.length, 2)
})

test('a cancelled call is not retried and reports the failure', async () => {
  const harness = makeHarness({
    onStart: () => {
      throw new Error('这个调用本不该发生')
    },
  })
  apply(harness.ctx, {})
  const controller = new AbortController()
  controller.abort()
  const brief = await harness.tools
    .get('cross_review_brief')
    .execute({ requirement: 'x' }, makeExec('abort-session', controller.signal))
  assert.match(brief.goal, /无法完成需求解析/)
  assert.equal(harness.starts.length, 0)
})

test('a final that skips a brief criterion cannot pass (host coverage gate)', async () => {
  const { ctx, tools } = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录', '错误提示可见'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ctx, {})
  const exec = makeExec('coverage-session')
  await tools.get('cross_review_brief').execute({ requirement: '修好登录' }, exec)

  const harnessFinal = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: '看似通过',
        criteria: [{ item: '能登录', status: 'pass', evidence: '手动验证' }],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(harnessFinal.ctx, {})
  const audit = await harnessFinal.tools.get('cross_review_final').execute({ claim: '登录已修好' }, exec)
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /AC2: 错误提示可见/)
  // The host coverage gate runs in-process: it must not spawn an extra subagent.
  assert.equal(harnessFinal.starts.length, 1)
})

test('a brief with no acceptance criteria is not stored as a baseline', async () => {
  const { ctx, tools } = makeHarness({
    onStart: () => ({
      structured: {
        goal: '需求已解析',
        acceptance_criteria: [],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ctx, {})
  const exec = makeExec('empty-brief-session')
  const brief = await tools.get('cross_review_brief').execute({ requirement: '随便做点' }, exec)
  assert.deepEqual(brief.acceptance_criteria, [])
  assert.ok(brief.open_questions.some((q) => q.includes('验收标准')))

  // A later final must not fall back to the empty/no baseline and pass.
  const harnessFinal = makeHarness()
  apply(harnessFinal.ctx, {})
  const audit = await harnessFinal.tools.get('cross_review_final').execute({ claim: '做完了' }, exec)
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.summary, /缺少验收标准/)
  assert.equal(harnessFinal.starts.length, 0)
})

test('a brief in one session does not leak into another session', async () => {
  const { ctx, tools } = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ctx, {})
  await tools.get('cross_review_brief').execute({ requirement: '修好登录' }, makeExec('session-A'))

  const harnessFinal = makeHarness()
  apply(harnessFinal.ctx, {})
  const audit = await harnessFinal.tools.get('cross_review_final').execute({ claim: '做完了' }, makeExec('session-B'))
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.summary, /缺少验收标准/)
})

test('explicit requirement cannot narrow away a stored brief criterion', async () => {
  const { ctx, tools } = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录', '错误提示可见'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ctx, {})
  const exec = makeExec('narrow-session')
  await tools.get('cross_review_brief').execute({ requirement: '修好登录' }, exec)

  const harnessFinal = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: 'ok',
        criteria: [{ item: '能登录', status: 'pass', evidence: 'e' }],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(harnessFinal.ctx, {})
  const audit = await harnessFinal.tools
    .get('cross_review_final')
    .execute({ requirement: '只验收：能登录', claim: '已修好' }, exec)
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.required_actions.join('\n'), /错误提示可见/)
})

test('a non-normal brief completion clears the previous baseline', async () => {
  const ok = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ok.ctx, {})
  const exec = makeExec('clear-session')
  await ok.tools.get('cross_review_brief').execute({ requirement: '修好登录' }, exec)

  // Second brief in the SAME session ends with stopReason=error (both attempts).
  const bad = makeHarness({ onStart: () => ({ stopReason: 'error', diagnostic: 'upstream 502' }) })
  apply(bad.ctx, {})
  const failed = await bad.tools.get('cross_review_brief').execute({ requirement: '再修一次' }, exec)
  assert.match(failed.goal, /未正常完成|无法完成需求解析/)

  // A later final in that session must not reuse the old criteria.
  const finalHarness = makeHarness()
  apply(finalHarness.ctx, {})
  const audit = await finalHarness.tools.get('cross_review_final').execute({ claim: '做完了' }, exec)
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.match(audit.summary, /缺少验收标准/)
  assert.equal(finalHarness.starts.length, 0)
})

test('a disabled brief clears the previous baseline for that session', async () => {
  const ok = makeHarness({
    onStart: () => ({
      structured: {
        goal: '修登录',
        acceptance_criteria: ['能登录'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(ok.ctx, {})
  const exec = makeExec('disabled-brief-session')
  await ok.tools.get('cross_review_brief').execute({ requirement: '修好登录' }, exec)

  const offRoutes = { arbiter: { enabled: true, briefEnabled: false, auditEnabled: true, provider: 'p', model: 'm' } }
  const off = makeHarness({ routes: offRoutes })
  apply(off.ctx, {})
  const skipped = await off.tools.get('cross_review_brief').execute({ requirement: '新任务' }, exec)
  assert.match(skipped.goal, /关闭|停用/)

  const finalHarness = makeHarness({ routes: offRoutes })
  apply(finalHarness.ctx, {})
  const audit = await finalHarness.tools.get('cross_review_final').execute({ claim: '做完了' }, exec)
  assert.equal(audit.ruling, 'need_more_evidence')
  assert.equal(finalHarness.starts.length, 0)
})

test('explicit requirement with a numbered list enforces coverage without a brief', async () => {
  const only = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: 'ok',
        criteria: [{ item: '甲', status: 'pass', evidence: 'e' }],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(only.ctx, {})
  const a1 = await only.tools
    .get('cross_review_final')
    .execute({ requirement: '验收标准：\nAC1 甲\nAC2 乙', claim: 'done' }, makeExec('explicit-list-1'))
  assert.equal(a1.ruling, 'need_more_evidence')
  assert.match(a1.required_actions.join('\n'), /AC2/)

  const full = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: 'ok',
        criteria: [
          { item: '甲', status: 'pass', evidence: 'e' },
          { item: '乙', status: 'pass', evidence: 'e' },
        ],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(full.ctx, {})
  const a2 = await full.tools
    .get('cross_review_final')
    .execute({ requirement: '验收标准：\nAC1 甲\nAC2 乙', claim: 'done' }, makeExec('explicit-list-2'))
  assert.equal(a2.ruling, 'ready')
})

test('edge-case explicit lists (blank lines, mixed labels) still gate every item', async () => {
  const blank = makeHarness({
    onStart: () => ({
      structured: { ruling: 'ready', summary: 'ok', criteria: [{ item: 'A', status: 'pass', evidence: 'e' }], blocking_issues: [], required_actions: [], reasoning: '' },
    }),
  })
  apply(blank.ctx, {})
  const b = await blank.tools.get('cross_review_final').execute({ requirement: '验收标准：\n1. A\n\n2. B', claim: 'done' }, makeExec('edge-blank'))
  assert.equal(b.ruling, 'need_more_evidence')
  assert.match(b.required_actions.join('\n'), /AC2: B/)

  const mixed = makeHarness({
    onStart: () => ({
      structured: { ruling: 'ready', summary: 'ok', criteria: [{ item: 'A', status: 'pass', evidence: 'e' }], blocking_issues: [], required_actions: [], reasoning: '' },
    }),
  })
  apply(mixed.ctx, {})
  const m = await mixed.tools.get('cross_review_final').execute({ requirement: 'AC1: A\n2. B', claim: 'done' }, makeExec('edge-mixed'))
  assert.equal(m.ruling, 'need_more_evidence')
  assert.match(m.required_actions.join('\n'), /AC2: B/)

  const md = makeHarness({
    onStart: () => ({
      structured: { ruling: 'ready', summary: 'ok', criteria: [{ item: 'A', status: 'pass', evidence: 'e' }], blocking_issues: [], required_actions: [], reasoning: '' },
    }),
  })
  apply(md.ctx, {})
  const mdAudit = await md.tools.get('cross_review_final').execute({ requirement: '## 验收标准\n1. A\n2. B', claim: 'done' }, makeExec('edge-md'))
  assert.equal(mdAudit.ruling, 'need_more_evidence')
  assert.match(mdAudit.required_actions.join('\n'), /AC2: B/)

  const cont = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: 'ok',
        criteria: [
          { item: 'A', status: 'pass', evidence: 'e' },
          { item: 'C', status: 'pass', evidence: 'e' },
        ],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(cont.ctx, {})
  const contAudit = await cont.tools
    .get('cross_review_final')
    .execute({ requirement: '验收标准：\n1. A\n   必须同时满足 B\n2. C', claim: 'done' }, makeExec('edge-cont'))
  assert.equal(contAudit.ruling, 'need_more_evidence')
  assert.match(contAudit.required_actions.join('\n'), /AC1/)

  // A continuation line that itself begins with "验收标准" must still be kept.
  const cont2 = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: 'ok',
        criteria: [
          { item: 'A', status: 'pass', evidence: 'e' },
          { item: 'C', status: 'pass', evidence: 'e' },
        ],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(cont2.ctx, {})
  const cont2Audit = await cont2.tools
    .get('cross_review_final')
    .execute({ requirement: '验收标准：\n1. A\n   验收标准还必须同时满足 B\n2. C', claim: 'done' }, makeExec('edge-cont2'))
  assert.equal(cont2Audit.ruling, 'need_more_evidence')
  assert.match(cont2Audit.required_actions.join('\n'), /AC1/)

  const full = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: 'ok',
        criteria: [{ item: 'A', status: 'pass', evidence: 'e' }, { item: 'B', status: 'pass', evidence: 'e' }],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(full.ctx, {})
  const f = await full.tools.get('cross_review_final').execute({ requirement: '验收标准：\n1. A\n\n2. B', claim: 'done' }, makeExec('edge-full'))
  assert.equal(f.ruling, 'ready')
})

test('controlled tool pipeline: partial fix rejected, full fix ready', async () => {
  const briefHarness = makeHarness({
    onStart: () => ({
      structured: {
        goal: '主页修复',
        acceptance_criteria: ['顶栏背景改为 #3a807e', '首页 iframe 内容背景改为 #ebeef3', '移除首页占位卡'],
        in_scope: [],
        out_of_scope: [],
        assumptions: [],
        open_questions: [],
        risks: [],
        suggested_steps: [],
      },
    }),
  })
  apply(briefHarness.ctx, {})
  const exec = makeExec('controlled-pipeline')
  await briefHarness.tools.get('cross_review_brief').execute({ requirement: '修主页' }, exec)

  const partial = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: '部分完成',
        criteria: [
          { item: '顶栏背景改为 #3a807e', status: 'pass', evidence: 'rgb(58,128,126)' },
          { item: '首页 iframe 内容背景改为 #ebeef3', status: 'fail', evidence: '仍是 #f4f6fa' },
          { item: '移除首页占位卡', status: 'fail', evidence: '仍有 4 个' },
        ],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(partial.ctx, {})
  const p = await partial.tools.get('cross_review_final').execute({ claim: '部分完成' }, exec)
  assert.equal(p.ruling, 'not_ready')
  assert.equal(p.criteria.filter((c) => c.status === 'fail').length, 2)

  const full = makeHarness({
    onStart: () => ({
      structured: {
        ruling: 'ready',
        summary: '全部完成',
        criteria: [
          { item: '顶栏背景改为 #3a807e', status: 'pass', evidence: 'rgb(58,128,126)' },
          { item: '首页 iframe 内容背景改为 #ebeef3', status: 'pass', evidence: 'rgb(235,238,243)' },
          { item: '移除首页占位卡', status: 'pass', evidence: 'DOM 无 .qmx-cards' },
        ],
        blocking_issues: [],
        required_actions: [],
        reasoning: '',
      },
    }),
  })
  apply(full.ctx, {})
  const f = await full.tools.get('cross_review_final').execute({ claim: '全部完成' }, exec)
  assert.equal(f.ruling, 'ready')
})
