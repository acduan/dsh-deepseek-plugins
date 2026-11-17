import assert from 'node:assert/strict'
import { test } from 'node:test'

import {
  DEFAULT_CONFIG,
  TIMEOUT_MAX_MS,
  TIMEOUT_MIN_MS,
  buildCatalog,
  invalidateCatalog,
  normalizeConfig,
  probeRoute,
  sameRoute,
} from '../index.js'

async function* okStream() {
  yield { type: 'text-delta', text: 'O' }
  yield { type: 'text-delta', text: 'K' }
  yield { type: 'finish', reason: { kind: 'stop' } }
}

async function* failingStream() {
  yield { type: 'finish', reason: { kind: 'error', failure: { code: 'EPROVIDER', message: 'boom' } } }
}

function makeLlm(overrides = {}) {
  const state = { resolveCalls: 0, streamCalls: 0 }
  const llm = {
    listProviders: () => [
      { id: 'magpie', name: 'Magpie' },
      { id: 'magpie-responses', name: 'Magpie Responses' },
    ],
    listModels: async (provider) => [{ id: provider === 'magpie' ? 'm1' : 'm2', name: 'Model' }],
    resolveModelInfo: async () => {
      state.resolveCalls += 1
      return { reasoning: { efforts: [{ id: 'high' }] } }
    },
    stream: () => {
      state.streamCalls += 1
      return okStream()
    },
    ...overrides,
  }
  return { llm, state }
}

function makeCtx(llm) {
  return { get: (key) => (key === 'llm' ? llm : undefined) }
}

test('normalizeConfig fills in the deployment defaults', () => {
  const config = normalizeConfig({})
  assert.equal(config.arbiter.model, DEFAULT_CONFIG.arbiter.model)
  assert.equal(config.arbiter.briefEnabled, true)
  assert.equal(config.arbiter.auditEnabled, true)
  assert.equal('reviewer' in config, false)
})

test('normalizeConfig rejects a non-object payload', () => {
  assert.throws(() => normalizeConfig(null), /必须是对象/)
  assert.throws(() => normalizeConfig([]), /必须是对象/)
})

test('normalizeConfig clamps the timeout into the shared bounds', () => {
  assert.equal(normalizeConfig({ arbiter: { timeoutMs: 1 } }).arbiter.timeoutMs, TIMEOUT_MIN_MS)
  assert.equal(normalizeConfig({ arbiter: { timeoutMs: 9_000_000 } }).arbiter.timeoutMs, TIMEOUT_MAX_MS)
})

test('normalizeConfig keeps an explicitly cleared reasoning effort cleared', () => {
  const config = normalizeConfig({ arbiter: { provider: 'magpie', model: 'm1' } })
  assert.equal(config.arbiter.reasoningEffort, undefined)
})

test('buildCatalog probes providers concurrently and caches the result', async () => {
  invalidateCatalog()
  const { llm, state } = makeLlm()
  const ctx = makeCtx(llm)

  const first = await buildCatalog(ctx)
  assert.equal(first.groups.length, 2)
  assert.deepEqual(first.failures, [])
  assert.deepEqual(first.groups[0].models[0].reasoningEfforts, ['high'])
  assert.equal(state.resolveCalls, 2)

  const second = await buildCatalog(ctx)
  assert.equal(second, first, 'the cached catalog is reused')
  assert.equal(state.resolveCalls, 2)

  invalidateCatalog()
  await buildCatalog(ctx)
  assert.equal(state.resolveCalls, 4)
})

test('buildCatalog reports one failing provider without hiding the others', async () => {
  invalidateCatalog()
  const { llm } = makeLlm({
    listModels: async (provider) => {
      if (provider === 'magpie') throw new Error('adapter down')
      return [{ id: 'm2', name: 'Model' }]
    },
  })
  const catalog = await buildCatalog(makeCtx(llm))
  assert.equal(catalog.groups.length, 1)
  assert.equal(catalog.groups[0].id, 'magpie-responses')
  assert.deepEqual(
    catalog.failures.map((failure) => failure.provider),
    ['magpie'],
  )
})

test('buildCatalog degrades when the llm service is missing', async () => {
  invalidateCatalog()
  const catalog = await buildCatalog({ get: () => undefined })
  assert.deepEqual(catalog.groups, [])
  assert.equal(catalog.failures.length, 1)
})

test('probeRoute reports what the configured route answered', async () => {
  const { llm, state } = makeLlm()
  const probe = await probeRoute(makeCtx(llm), { provider: 'magpie', model: 'm1' }, 'arbiter')
  assert.equal(probe.text, 'OK')
  assert.equal(probe.provider, 'magpie')
  assert.equal(probe.model, 'm1')
  assert.equal(probe.reasoningEffort, null)
  assert.equal(typeof probe.latencyMs, 'number')
  assert.equal(state.streamCalls, 1)
})

test('probeRoute rejects an unknown provider before calling the model', async () => {
  const { llm, state } = makeLlm()
  await assert.rejects(
    probeRoute(makeCtx(llm), { provider: 'nope', model: 'm1' }, 'arbiter'),
    /未在当前 DSH 中配置/,
  )
  assert.equal(state.streamCalls, 0)
})

test('probeRoute surfaces a provider failure as a readable error', async () => {
  const { llm } = makeLlm({ stream: () => failingStream() })
  await assert.rejects(probeRoute(makeCtx(llm), { provider: 'magpie', model: 'm1' }), /模型调用失败/)
})

test('sameRoute treats an untouched card as unchanged', () => {
  const stored = normalizeConfig({}).arbiter
  const submitted = {
    enabled: stored.enabled,
    briefEnabled: stored.briefEnabled,
    auditEnabled: stored.auditEnabled,
    provider: stored.provider,
    model: stored.model,
    reasoningEffort: stored.reasoningEffort,
    timeoutMs: stored.timeoutMs,
  }
  assert.equal(sameRoute(submitted, stored), true)
  assert.equal(sameRoute({ ...submitted, model: 'other' }, stored), false)
  assert.equal(sameRoute({ ...submitted, reasoningEffort: undefined }, stored), false)
  assert.equal(sameRoute(null, stored), false)
})
