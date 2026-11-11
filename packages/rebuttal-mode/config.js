// @local/dsh-rebuttal-mode/config
// Host-side model configuration store for Rebuttal Mode.
//
// This row is mounted once at profile level (outside any Agent preset). It:
//   - persists the chosen critic/arbiter routes in a storage domain;
//   - exposes the current values as the `rebuttalConfig` service for the
//     preset-scoped tool plugin;
//   - serves the authenticated browser settings page through
//     /api/rebuttal-config with the model catalog of currently configured DSH
//     LLM providers.
//
// It intentionally imports nothing from the DSH installation: all seams are
// reached through ctx.get() and the documented connection.fetch/storageDomain
// contracts, so a DSH update cannot break this local bundle by moving a symbol.

export const name = 'rebuttal-config'
// Wait for the Web carrier so /api/rebuttal-config is registered in desktop /
// web profiles. The preset-scoped tool plugin only consumes the service; it
// still falls back to its static config if this row is unavailable.
export const inject = ['connection']

export const DEFAULT_CONFIG = Object.freeze({
  critic: Object.freeze({
    provider: 'magpie',
    model: 'workbuddy/hy4free',
    reasoningEffort: 'high',
  }),
  arbiter: Object.freeze({
    provider: 'magpie-responses',
    model: 'packycode1/gpt-6.1-sol',
    reasoningEffort: 'high',
  }),
})

const DOMAIN_SPEC = {
  name: 'rebuttal_mode_config',
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
  return {
    provider,
    model,
    ...(reasoningEffort === undefined ? {} : { reasoningEffort }),
  }
}

export function normalizeConfig(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('反驳式模式配置必须是对象')
  }
  return {
    critic: normalizeRoute(value.critic, DEFAULT_CONFIG.critic),
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

/**
 * Enumerate every currently configured and registered LLM provider/model.
 * `llm.listProviders()` reports adapter-backed routes; `listModels`/`resolveModelInfo`
 * provide the exact catalog the model pickers should offer.
 */
export async function buildCatalog(ctx) {
  const llm = ctx.get('llm')
  if (llm === undefined) {
    return { groups: [], failures: [{ provider: '(llm)', error: 'LLM 服务不可用' }] }
  }
  const groups = []
  const failures = []
  for (const provider of llm.listProviders()) {
    try {
      const models = await llm.listModels(provider.id)
      const rows = []
      for (const model of models) {
        let reasoningEfforts = []
        try {
          const info = await llm.resolveModelInfo(provider.id, model.id)
          reasoningEfforts = (info.reasoning?.efforts ?? []).map((effort) => effort.id)
        } catch {
          reasoningEfforts = []
        }
        rows.push({
          id: model.id,
          name: model.name,
          ...(model.description === undefined ? {} : { description: model.description }),
          reasoningEfforts,
        })
      }
      groups.push({ id: provider.id, name: provider.name, models: rows })
    } catch (error) {
      failures.push({ provider: provider.id, error: errorMessage(error) })
    }
  }
  return { groups, failures }
}

async function validateRoute(ctx, route, label) {
  const normalized = normalizeRoute(route, DEFAULT_CONFIG[label === 'critic' ? 'critic' : 'arbiter'])
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
      ctx.logger?.warn?.(`rebuttal-config: storage unavailable, using in-memory config: ${errorMessage(error)}`)
      table = undefined
      closeDomain = undefined
    }
  }

  ctx.provide('rebuttalConfig', {
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
      path: '/api/rebuttal-config',
      methods: ['GET', 'PUT'],
      requestBody: 'buffered',
      fetch: async (request) => {
        if (request.method === 'GET') {
          return jsonResponse({
            ok: true,
            config: currentConfig,
            defaults: DEFAULT_CONFIG,
            models: await buildCatalog(ctx),
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
        try {
          const next = {
            critic: await validateRoute(ctx, body.critic ?? currentConfig.critic, 'critic'),
            arbiter: await validateRoute(ctx, body.arbiter ?? currentConfig.arbiter, 'arbiter'),
          }
          if (table !== undefined) await table.put('config', next)
          currentConfig = next
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
    ctx.logger?.warn?.(`rebuttal-config: fetch route unavailable: ${errorMessage(error)}`)
    offRoute = undefined
  }

  ctx.logger?.info?.(
    `rebuttal-config: active — critic=${currentConfig.critic.provider}/${currentConfig.critic.model}, ` +
      `arbiter=${currentConfig.arbiter.provider}/${currentConfig.arbiter.model}, ` +
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
  }, 'rebuttal-config: cleanup')
}
