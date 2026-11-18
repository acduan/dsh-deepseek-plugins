// @local/dsh-cross-review/config
// Host-side model configuration store for Cross-Verification Mode.
//
// This row is mounted once at profile level (outside any Agent preset). It:
//   - persists the chosen arbiter route in a storage domain;
//   - exposes the current value as the `crossReviewConfig` service for the
//     preset-scoped tool plugin;
//   - serves the authenticated browser settings page through
//     /api/cross-review-config with the model catalog of currently configured DSH
//     LLM providers;
//   - answers a POST connectivity probe so the settings page can prove that the
//     chosen route actually answers before a task depends on it.
//
// It intentionally imports nothing from the DSH installation: all seams are
// reached through ctx.get() and the documented connection.fetch/storageDomain
// contracts, so a DSH update cannot break this local bundle by moving a symbol.

export const name = 'cross-review-config'
// Wait for the Web carrier so /api/cross-review-config is registered in desktop /
// web profiles. The preset-scoped tool plugin only consumes the service; it
// still falls back to its static config if this row is unavailable.
export const inject = ['connection']

export const DEFAULT_CONFIG = Object.freeze({
  arbiter: Object.freeze({
    enabled: true,
    // The arbiter serves two separate duties; each can be switched off
    // independently so a user can keep, for example, only the requirement
    // briefing without paying for the closing audit.
    briefEnabled: true,
    auditEnabled: true,
    provider: 'magpie-responses',
    model: 'packycode1/gpt-6.1-sol',
    reasoningEffort: 'high',
    timeoutMs: 180000,
  }),
})

// Timeout bounds shared with the settings page: a child that cannot answer in
// ten minutes will not answer, and a sub-second budget would kill every call.
export const TIMEOUT_MIN_MS = 10000
// Upper bound raised to 3600s (1h): 30min was too tight for slow providers. A
// value above this is still clamped, so the settings page must advertise it.
export const TIMEOUT_MAX_MS = 3600000

// The model catalog is expensive (one adapter round trip per model), so it is
// cached briefly. The settings page can force a refresh, and a successful save
// invalidates the cache because the provider set may have changed.
const CATALOG_TTL_MS = 60_000
const PROBE_TIMEOUT_MS = 45_000
let catalogCache = { at: 0, value: undefined }

const DOMAIN_SPEC = {
  name: 'cross_review_config',
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: {
    settings: {
      valueSchema: {
        parse(value) {
          return normalizeConfig(value)
        },
        safeParse(value) {
          try {
            return { success: true, data: normalizeConfig(value) }
          } catch (error) {
            return { success: false, error }
          }
        },
      },
    },
  },
}

function normalizeRoute(route, fallback) {
  const hasRoute = route !== null && typeof route === 'object' && !Array.isArray(route)
  const candidate = hasRoute ? route : {}
  const provider =
    typeof candidate.provider === 'string' && candidate.provider.trim() !== ''
      ? candidate.provider.trim()
      : fallback.provider
  const model =
    typeof candidate.model === 'string' && candidate.model.trim() !== ''
      ? candidate.model.trim()
      : fallback.model
  // A missing route gets the deployment default effort. An explicit route
  // without an effort means "use the model's own default", so do not
  // resurrect the fallback effort after the user chooses it in the UI.
  const reasoningEffort = hasRoute
    ? typeof candidate.reasoningEffort === 'string' && candidate.reasoningEffort.trim() !== ''
      ? candidate.reasoningEffort.trim()
      : undefined
    : fallback.reasoningEffort
  // `enabled` and `timeoutMs` are route-level policy, not model identity, so an
  // explicit value always wins and omission inherits the deployment default.
  const enabled = typeof candidate.enabled === 'boolean' ? candidate.enabled : fallback.enabled
  const timeoutMs = normalizeTimeout(candidate.timeoutMs, fallback.timeoutMs)
  // The arbiter's two duties are optional independently of the role switch.
  // A route that did not carry these keys simply does not gain them.
  const duty = (key) =>
    typeof candidate[key] === 'boolean' ? candidate[key] : fallback[key] !== false
  const duties =
    fallback.briefEnabled === undefined && fallback.auditEnabled === undefined
      ? {}
      : { briefEnabled: duty('briefEnabled'), auditEnabled: duty('auditEnabled') }
  return {
    enabled,
    ...duties,
    provider,
    model,
    timeoutMs,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

function normalizeTimeout(value, fallback) {
  const candidate = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(candidate) || candidate <= 0) return fallback
  return Math.min(TIMEOUT_MAX_MS, Math.max(TIMEOUT_MIN_MS, Math.round(candidate)))
}

export function normalizeConfig(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('交叉复核模式配置必须是对象')
  }
  return {
    arbiter: normalizeRoute(value.arbiter, DEFAULT_CONFIG.arbiter),
  }
}

function cloneConfig(value) {
  return JSON.parse(JSON.stringify(value))
}

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  })
}

function errorMessage(error) {
  return error instanceof Error ? error.message : String(error)
}

export function invalidateCatalog() {
  catalogCache = { at: 0, value: undefined }
}

async function describeProvider(llm, provider) {
  const models = await llm.listModels(provider.id)
  const rows = await Promise.all(
    models.map(async (model) => {
      // Reasoning efforts are metadata, not liveness: one adapter failure here
      // must not hide the model from the picker.
      let reasoningEfforts = []
      try {
        const info = await llm.resolveModelInfo(provider.id, model.id)
        reasoningEfforts = (info.reasoning?.efforts ?? []).map((effort) => effort.id)
      } catch {
        reasoningEfforts = []
      }
      return {
        id: model.id,
        name: model.name,
        ...(model.description === undefined ? {} : { description: model.description }),
        reasoningEfforts,
      }
    }),
  )
  return { id: provider.id, name: provider.name, models: rows }
}

/**
 * Enumerate every currently configured and registered LLM provider/model.
 * `llm.listProviders()` reports adapter-backed routes; `listModels`/`resolveModelInfo`
 * provide the exact catalog the model pickers should offer.
 *
 * Providers and models are probed concurrently: the previous sequential walk made
 * the settings page wait for one adapter round trip per model.
 */
export async function buildCatalog(ctx, options = {}) {
  const fresh = options.fresh === true
  if (!fresh && catalogCache.value !== undefined && Date.now() - catalogCache.at < CATALOG_TTL_MS) {
    return catalogCache.value
  }
  const llm = ctx.get('llm')
  if (llm === undefined) {
    return { groups: [], failures: [{ provider: '(llm)', error: 'LLM 服务不可用' }] }
  }
  const providers = llm.listProviders()
  const settled = await Promise.allSettled(providers.map((provider) => describeProvider(llm, provider)))
  const groups = []
  const failures = []
  settled.forEach((entry, index) => {
    if (entry.status === 'fulfilled') groups.push(entry.value)
    else failures.push({ provider: providers[index]?.id ?? '(unknown)', error: errorMessage(entry.reason) })
  })
  const value = { groups, failures }
  catalogCache = { at: Date.now(), value }
  return value
}

async function validateRoute(ctx, route, label = '裁决者') {
  const normalized = normalizeRoute(route, DEFAULT_CONFIG.arbiter)
  const llm = ctx.get('llm')
  if (llm === undefined) throw new Error('LLM 服务不可用，无法校验模型')
  const providers = llm.listProviders()
  if (!providers.some((provider) => provider.id === normalized.provider)) {
    throw new Error(`${label} provider "${normalized.provider}" 未在当前 DSH 中配置`)
  }
  const models = await llm.listModels(normalized.provider)
  if (!models.some((model) => model.id === normalized.model)) {
    throw new Error(`${label} 模型 "${normalized.provider}/${normalized.model}" 不在当前可用模型列表中`)
  }
  if (normalized.reasoningEffort !== undefined) {
    const info = await llm.resolveModelInfo(normalized.provider, normalized.model)
    const efforts = (info.reasoning?.efforts ?? []).map((effort) => effort.id)
    if (!efforts.includes(normalized.reasoningEffort)) {
      throw new Error(
        `${label} 模型 "${normalized.provider}/${normalized.model}" 不支持推理强度 "${normalized.reasoningEffort}"`,
      )
    }
  }
  return normalized
}

export function sameRoute(submitted, stored) {
  if (submitted === null || typeof submitted !== 'object' || Array.isArray(submitted)) return false
  const keys = ['enabled', 'briefEnabled', 'auditEnabled', 'provider', 'model', 'reasoningEffort', 'timeoutMs']
  return keys.every((key) => (submitted[key] ?? undefined) === (stored[key] ?? undefined))
}

/**
 * Send one tiny prompt through a concrete route and report what came back.
 * This is the settings page's "test" button: it turns a silent misconfiguration
 * (dead gateway, wrong model id, rejected reasoning effort) into an immediate,
 * visible failure instead of a failed audit at the end of a task.
 */
export async function probeRoute(ctx, route, label = '裁决者') {
  const normalized = normalizeRoute(route, DEFAULT_CONFIG.arbiter)
  await validateRoute(ctx, normalized, label)
  const llm = ctx.get('llm')
  if (llm === undefined) throw new Error('LLM 服务不可用')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  const started = Date.now()
  let text = ''
  let usage
  let failure
  try {
    const stream = llm.stream({
      provider: normalized.provider,
      model: normalized.model,
      ...(normalized.reasoningEffort === undefined ? {} : { reasoningEffort: normalized.reasoningEffort }),
      messages: [
        {
          role: 'user',
          content: [{ type: 'text', text: '连通性测试。请只回复：OK' }],
        },
      ],
      maxTokens: 32,
      signal: controller.signal,
    })
    for await (const chunk of stream) {
      if (chunk?.type === 'text-delta' && typeof chunk.text === 'string') text += chunk.text
      else if (chunk?.type === 'usage' && chunk.usage !== undefined) usage = chunk.usage
      else if (chunk?.type === 'finish') {
        const reason = chunk.reason
        if (reason !== undefined && (reason.kind === 'error' || reason.kind === 'aborted')) {
          failure = reason.failure
        }
      }
    }
  } finally {
    clearTimeout(timer)
  }
  if (failure !== undefined) {
    const detail = [failure.code, failure.message].filter((part) => typeof part === 'string' && part !== '').join(': ')
    throw new Error(`模型调用失败：${detail || '未知错误'}`)
  }
  return {
    provider: normalized.provider,
    model: normalized.model,
    reasoningEffort: normalized.reasoningEffort ?? null,
    latencyMs: Date.now() - started,
    text: text.trim().slice(0, 200),
    usage: usage ?? null,
  }
}

export async function apply(ctx, config = {}) {
  let currentConfig = normalizeConfig(config)
  let table
  let closeDomain
  const facility = ctx.get('storageDomain')
  if (facility !== undefined && typeof facility.open === 'function') {
    try {
      const domain = await facility.open(DOMAIN_SPEC)
      table = domain.table('settings')
      const stored = table.get('config')
      if (stored !== undefined) currentConfig = normalizeConfig(stored)
      closeDomain = () => domain.close()
    } catch (error) {
      ctx.logger?.warn?.(`cross-review-config: storage unavailable, using in-memory config: ${errorMessage(error)}`)
      table = undefined
      closeDomain = undefined
    }
  }

  ctx.provide('crossReviewConfig', {
    get: () => cloneConfig(currentConfig),
    defaults: () => cloneConfig(DEFAULT_CONFIG),
  })

  let offRoute
  try {
    const connection = ctx.get('connection')
    if (connection === undefined || typeof connection.fetch?.register !== 'function') {
      throw new Error('connection.fetch is unavailable')
    }
    offRoute = connection.fetch.register({
      path: '/api/cross-review-config',
      methods: ['GET', 'PUT', 'POST'],
      requestBody: 'buffered',
      fetch: async (request) => {
        if (request.method === 'GET') {
          const fresh = new URL(request.url).searchParams.get('fresh') === '1'
          return jsonResponse({
            ok: true,
            config: currentConfig,
            defaults: DEFAULT_CONFIG,
            models: await buildCatalog(ctx, { fresh }),
            persistent: table !== undefined,
          })
        }

        let body
        try {
          body = await request.json()
        } catch {
          return jsonResponse({ ok: false, error: '请求体不是合法 JSON' }, 400)
        }
        if (body === null || typeof body !== 'object' || Array.isArray(body)) {
          return jsonResponse({ ok: false, error: '请求体必须是对象' }, 400)
        }

        if (request.method === 'POST') {
          if (body.action === 'reset') {
            try {
              const next = cloneConfig(DEFAULT_CONFIG)
              if (table !== undefined) await table.put('config', next)
              currentConfig = next
              invalidateCatalog()
              return jsonResponse({ ok: true, config: currentConfig, persistent: table !== undefined })
            } catch (error) {
              return jsonResponse({ ok: false, error: errorMessage(error) }, 400)
            }
          }
          const override = body.route !== undefined ? body.route : currentConfig.arbiter
          try {
            const probe = await probeRoute(ctx, override, '裁决者')
            return jsonResponse({ ok: true, probe })
          } catch (error) {
            return jsonResponse({ ok: false, error: errorMessage(error) }, 400)
          }
        }

        try {
          const next = { ...currentConfig }
          if (body.arbiter !== undefined) {
            // An unchanged payload is stored as-is even when it no longer
            // validates: a stale model left over from an older default must not
            // make saving impossible. The settings page shows it as unavailable
            // and offers a reset.
            next.arbiter = sameRoute(body.arbiter, currentConfig.arbiter)
              ? currentConfig.arbiter
              : await validateRoute(ctx, body.arbiter)
          }
          if (table !== undefined) await table.put('config', next)
          currentConfig = next
          // The provider set can change between saves; do not keep serving a
          // catalog that was collected before the save.
          invalidateCatalog()
          return jsonResponse({
            ok: true,
            config: currentConfig,
            persistent: table !== undefined,
          })
        } catch (error) {
          return jsonResponse({ ok: false, error: errorMessage(error) }, 400)
        }
      },
    })
  } catch (error) {
    ctx.logger?.warn?.(`cross-review-config: fetch route unavailable: ${errorMessage(error)}`)
    offRoute = undefined
  }

  ctx.logger?.info?.(
    `cross-review-config: active — arbiter=${currentConfig.arbiter.provider}/${currentConfig.arbiter.model}, ` +
      (table === undefined ? 'in-memory only' : 'persisted'),
  )

  ctx.effect(() => async () => {
    try {
      await offRoute?.()
    } catch {
      // The route may already be gone.
    }
    try {
      await closeDomain?.()
    } catch {
      // The domain may already be closed.
    }
  }, 'cross-review-config: cleanup')
}
