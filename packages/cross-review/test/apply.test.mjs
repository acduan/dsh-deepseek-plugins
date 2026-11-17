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
        criteria: [{ item: '能登录', status: 'pass', evidence: '手动验证' }],
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
              criteria: [],
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
