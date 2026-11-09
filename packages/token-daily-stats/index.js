// @local/token-daily-stats — Host half (v1.2: ported to DSH 0.2.x).
//
// Aggregates daily token consumption from every `assistant/message` durable
// event (the provider-reported `usage`), folded BOTH into per-day totals AND
// into per-model sub-buckets keyed by `<provider>/<model>`, taken from
// `event.data.message.source` (ModelMessageSource) with a fallback to the
// session's latest `request/header` and finally a synthetic legacy bucket.
//
// Persists the per-day buckets through the `storageDomain` facility (when
// present) and serves the aggregate to the browser over an authenticated
// `/api` route registered with the Connection fetch registry.
//
// On activation it RECONCILES against the full session corpus via `sessionQuery`
// (live-preferred cold reads), so "today" and every historical day reflect the
// complete usage — including per-model attribution rebuilt from the logs —
// rather than only events observed after this plugin started.
//
// ---------------------------------------------------------------------------
// VERSION-UPDATE CONTRACT (why this file looks the way it does)
// ---------------------------------------------------------------------------
// This plugin is a third-party profile plugin: it is linked from a user-owned
// directory into `~/.dsh/profiles/<profile>`, so a DSH app update replaces the
// installation but never the plugin. What an update CAN change is the API
// surface below, so every seam is used defensively:
//
//   * Host services are reached through `ctx.get(name)` + a capability check
//     instead of a hard import, so a renamed/absent optional service degrades
//     to "in-memory only" instead of failing activation.
//   * `inject = ['connection']` stays a HARD dependency on purpose: if that
//     seam ever disappears, Cordis leaves this plugin pending rather than
//     crashing it — fail-closed, never fail-loud.
//   * The storage-domain value schema is DUCK-TYPED, never imported: it offers
//     both `parse` (DSH 0.2.x, which calls `valueSchema.parse`) and `safeParse`
//     (older/defensive callers). Importing `zod` or `@deepseek-ai/dsh-*` would
//     tie the plugin to a version that a DSH update is free to replace.
//   * Disposers are Promise-safe: DSH 0.2.x returns Promises from
//     `connection.fetch.register` and `domain.close`; 0.1.x returned void.
//   * The persisted domain name and `version: 1` are FROZEN. Changing either
//     makes `storage-json` report `version-mismatch` and the history is lost.
//
// Known limitation (unchanged from v1.1): events shadowed by a surface
// `replace` (compaction/rewind) are counted alongside their replacement, so a
// day spanning a rewrite can over-report. Reconciliation rebuilds from the raw
// log on every activation, so the figure is stable, not drifting.
// ---------------------------------------------------------------------------

export const name = 'token-daily-stats'

// Hard dependency: `connection` provides `ctx.connection.fetch.register`, the
// cookie-authenticated Fetch-route registry. Persistence (`storageDomain`) and
// reconciliation (`sessionQuery`) are optional and read through `ctx.get` so a
// profile missing either still gets a live (in-memory, forward-only) counter.
export const inject = ['connection']

/** Local calendar day of a millisecond epoch, as `YYYY-MM-DD`. */
function dayKey(timeMs) {
  const d = new Date(timeMs)
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

/** A fresh zeroed flat bucket (day total or one model). */
function emptyBucket() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    reasoning: 0,
    total: 0,
    requests: 0,
  }
}

/** A fresh day bucket: flat totals plus the per-model map. */
function emptyDay() {
  return { ...emptyBucket(), models: {} }
}

/**
 * Stable per-model storage key `<provider>/<model>`; missing pieces degrade to
 * `unknown` so the key never collides with the legacy key.
 */
function modelKey(provider, model) {
  const p = typeof provider === 'string' && provider !== '' ? provider : 'unknown'
  const m = typeof model === 'string' && model !== '' ? model : 'unknown'
  return `${p}/${m}`
}

/** Synthetic bucket for pre-v1.1 persisted days and unattributable events. */
const LEGACY_KEY = 'legacy/legacy'

/** Fold one provider `TokenUsage` into a flat bucket (mutates the bucket). */
function foldInto(bucket, usage) {
  bucket.input += usage.inputTokens || 0
  bucket.output += usage.outputTokens || 0
  bucket.cacheRead += usage.cacheReadTokens || 0
  bucket.cacheWrite += usage.cacheWriteTokens || 0
  bucket.reasoning += usage.reasoningTokens || 0
  // DeepSeek's total already spans prompt (incl. cache) + completion; fall back
  // to input+output for providers that omit it.
  bucket.total += typeof usage.totalTokens === 'number'
    ? usage.totalTokens
    : ((usage.inputTokens || 0) + (usage.outputTokens || 0))
  bucket.requests += 1
}

/**
 * Fold one usage sample into a day-keyed bucket map, under both the day total
 * and the model sub-bucket, keeping `sum(models) == day totals` invariant.
 */
function addUsage(map, key, usage, model) {
  const day = map.get(key) ?? emptyDay()
  foldInto(day, usage)
  const mk = model || LEGACY_KEY
  const mb = day.models[mk] ?? emptyBucket()
  foldInto(mb, usage)
  day.models[mk] = mb
  map.set(key, day)
  return day
}

/**
 * Best-effort model identity for one `assistant/message` event. The per-message
 * `source` is authoritative; `fallbackHeader` is the session's latest
 * `request/header` (EpochHeader), used when older logs lack the source.
 */
function modelOf(event, fallbackHeader) {
  const data = event.data
  const source = data && data.message && data.message.source
  if (source && typeof source.model === 'string' && source.model !== '') {
    return modelKey(source.provider, source.model)
  }
  const header = fallbackHeader && fallbackHeader.config
  if (header && typeof header.model === 'string' && header.model !== '') {
    return modelKey(header.provider, header.model)
  }
  return LEGACY_KEY
}

/** Read one numeric field, defaulting to 0 for anything non-finite. */
function num(value, key) {
  return typeof value[key] === 'number' && Number.isFinite(value[key]) ? value[key] : 0
}

/** Normalize any stored value into a flat bucket. */
function parseFlat(value) {
  return {
    input: num(value, 'input'),
    output: num(value, 'output'),
    cacheRead: num(value, 'cacheRead'),
    cacheWrite: num(value, 'cacheWrite'),
    reasoning: num(value, 'reasoning'),
    total: num(value, 'total'),
    requests: num(value, 'requests'),
  }
}

/**
 * Normalize one stored day into the current (nested, per-model) shape,
 * migrating the pre-v1.1 flat bucket in place by attributing its day totals to
 * the synthetic legacy model key. Returns `undefined` for a non-object.
 */
function normalizeDay(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  const day = parseFlat(value)
  const models = {}
  if (value.models !== null && typeof value.models === 'object' && !Array.isArray(value.models)) {
    for (const [key, entry] of Object.entries(value.models)) {
      if (entry !== null && typeof entry === 'object' && !Array.isArray(entry)) {
        models[String(key)] = parseFlat(entry)
      }
    }
  }
  if (Object.keys(models).length === 0) {
    // Legacy flat bucket (pre-v1.1): keep the day totals and attribute them
    // to the synthetic legacy model so per-model sums still equal the day.
    models[LEGACY_KEY] = parseFlat(value)
  }
  return { ...day, models }
}

/**
 * Domain value schema, duck-typed instead of imported (see the version-update
 * contract above). DSH 0.2.x validates stored records with
 * `valueSchema.parse(raw)`; the older/defensive path calls `safeParse`. Both
 * are implemented, and BOTH are tolerant: the schema normalizes the pre-v1.1
 * flat bucket and the v2 nested shape into the current shape, so previously
 * persisted days are never discarded.
 */
const bucketSchema = {
  parse(value) {
    const day = normalizeDay(value)
    if (day === undefined) {
      throw new Error('token-daily-stats: expected an object bucket')
    }
    return day
  },
  safeParse(value) {
    const day = normalizeDay(value)
    if (day === undefined) {
      return { success: false, error: new Error('token-daily-stats: expected an object bucket') }
    }
    return { success: true, data: day }
  },
}

// `version: 1` and the domain name `token_daily_usage` are FROZEN: they are the
// stored unit identity. `invalidRecords: 'backup-and-skip'` keeps one
// unreadable day from bricking the whole domain (the json backend moves it to
// `<key>.json.bak.<stamp>` and reports it as absent).
const domainSpec = {
  name: 'token_daily_usage',
  version: 1,
  invalidRecords: 'backup-and-skip',
  tables: { days: { valueSchema: bucketSchema } },
}

/** Split a stored `<provider>/<model>` key back into its display parts. */
function splitModelKey(key) {
  const idx = key.indexOf('/')
  if (idx < 0) return { provider: '', model: key }
  return { provider: key.slice(0, idx), model: key.slice(idx + 1) }
}

/** Structural check for an optional service reached through `ctx.get`. */
function hasMethods(value, ...methods) {
  if (value === null || typeof value !== 'object') return false
  return methods.every((method) => typeof value[method] === 'function')
}

export async function apply(ctx) {
  // Authoritative in-memory state: day -> bucket (with per-model sub-buckets).
  const daily = new Map()
  let daysTable = undefined
  let closeDomain = undefined
  let persistTimer = undefined
  const warn = (message) => {
    try {
      ctx.logger?.warn?.(`token-daily-stats: ${message}`)
    } catch {
      // A logger whose shape drifted must never take the plugin down.
    }
  }

  // --- 1. Observe usage events (registered synchronously, before any await,
  //        so no assistant message is missed after activation). ---
  const offEvent = ctx.on('session/event', (session, event) => {
    try {
      if (!event || event.type !== 'assistant/message') return
      const data = event.data
      const usage = data && data.usage
      if (usage === undefined || usage === null) return
      let header
      try {
        header = typeof session?.requestHeader === 'function' ? session.requestHeader() : undefined
      } catch {
        header = undefined
      }
      addUsage(
        daily,
        dayKey(typeof event.time === 'number' ? event.time : Date.now()),
        usage,
        modelOf(event, header),
      )
      schedulePersist()
    } catch (error) {
      warn(`event fold failed: ${error}`)
    }
  })

  function schedulePersist() {
    if (daysTable === undefined) return
    if (persistTimer !== undefined) return
    persistTimer = setTimeout(() => {
      persistTimer = undefined
      persistNow()
    }, 1000)
  }

  function persistNow() {
    if (daysTable === undefined) return
    for (const [key, bucket] of daily) {
      try {
        const write = daysTable.put(key, { ...bucket, models: { ...bucket.models } })
        // `put` is async in every version seen so far; tolerate a sync one.
        if (write !== undefined && typeof write.catch === 'function') write.catch(() => {})
      } catch (error) {
        warn(`persist failed: ${error}`)
      }
    }
  }

  // --- 2. Persistence (optional). ---
  const facility = ctx.get('storageDomain')
  if (hasMethods(facility, 'open')) {
    try {
      const domain = await facility.open(domainSpec)
      if (hasMethods(domain, 'table')) {
        daysTable = domain.table('days')
        closeDomain = () => domain.close()
        for (const [key, bucket] of daysTable.entries()) {
          if (!daily.has(key)) daily.set(key, bucket)
        }
      } else {
        warn('storage domain handle has no table() — running in-memory only')
      }
    } catch (error) {
      warn(`storage unavailable, running in-memory only: ${error}`)
      daysTable = undefined
      closeDomain = undefined
    }
  }

  // --- 3. Reconcile against the full session corpus (authoritative backfill),
  //        then keep the forward listener for live increments. ---
  await reconcile()

  // --- 4. Authenticated read route for the browser. ---
  let offRoute
  try {
    offRoute = ctx.connection.fetch.register({
      path: '/api/token-daily-stats',
      methods: ['GET'],
      requestBody: 'buffered',
      fetch: async (request) => {
        const url = new URL(request.url)
        const from = url.searchParams.get('from')
        const to = url.searchParams.get('to')
        const days = []
        const modelRollup = new Map() // modelKey -> { provider, model, ...totals, days }
        for (const [key, bucket] of daily) {
          // `YYYY-MM-DD` compares lexicographically, so string range checks are safe.
          if (from !== null && key < from) continue
          if (to !== null && key > to) continue
          const models = []
          for (const [mk, mb] of Object.entries(bucket.models ?? {})) {
            const { provider, model } = splitModelKey(mk)
            models.push({ provider, model, ...mb })
            const rollup = modelRollup.get(mk)
            if (rollup === undefined) {
              modelRollup.set(mk, { provider, model, ...{ ...mb }, days: 1 })
            } else {
              rollup.input += mb.input
              rollup.output += mb.output
              rollup.cacheRead += mb.cacheRead
              rollup.cacheWrite += mb.cacheWrite
              rollup.reasoning += mb.reasoning
              rollup.total += mb.total
              rollup.requests += mb.requests
              rollup.days += 1
            }
          }
          models.sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
          days.push({ day: key, input: bucket.input, output: bucket.output, cacheRead: bucket.cacheRead, cacheWrite: bucket.cacheWrite, reasoning: bucket.reasoning, total: bucket.total, requests: bucket.requests, models })
        }
        days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
        const models = [...modelRollup.values()].sort((a, b) => (b.total ?? 0) - (a.total ?? 0))
        const body = JSON.stringify({ days, models, today: dayKey(Date.now()) })
        return new Response(body, {
          status: 200,
          headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
        })
      },
    })
  } catch (error) {
    // The counter still works in-process; only the browser readback is lost.
    warn(`fetch route registration failed: ${error}`)
    offRoute = undefined
  }

  // --- 5. One activation line. This is the first thing to look at when the
  //        settings page is empty after a DSH update: it says exactly which
  //        seams attached and how much history the Host is holding. ---
  try {
    ctx.logger?.info?.(
      'token-daily-stats: active — storage ' +
      (daysTable === undefined ? 'unavailable (in-memory only)' : `domain '${domainSpec.name}'`) +
      ', route ' +
      (offRoute === undefined ? 'unavailable' : 'registered at /api/token-daily-stats') +
      `, ${daily.size} day(s) tracked`,
    )
  } catch { /* logging must never break activation */ }

  // --- 6. Fiber-scoped cleanup. Disposers are awaited: DSH 0.2.x returns
  //        Promises from both `offRoute` and `domain.close`. ---
  ctx.effect(() => async () => {
    try {
      offEvent()
    } catch { /* already detached */ }
    if (persistTimer !== undefined) clearTimeout(persistTimer)
    if (offRoute !== undefined) {
      try {
        await offRoute()
      } catch { /* route already gone */ }
    }
    if (closeDomain !== undefined) {
      try {
        await closeDomain()
      } catch { /* domain already closed */ }
    }
  }, 'token-daily-stats: lifecycle')

  /**
   * Rebuild the daily buckets from every readable session log. This replaces
   * (never adds to) the in-memory map, so re-activation or a drift never
   * double-counts; the forward listener then carries live deltas from here on.
   * Each session tracks its latest `request/header` as a model fallback for
   * logs that predate per-message source metadata.
   */
  async function reconcile() {
    const query = ctx.get('sessionQuery')
    if (!hasMethods(query, 'listSessions', 'readSession')) return
    let fresh
    try {
      const records = await query.listSessions()
      fresh = new Map()
      for (const record of records) {
        try {
          const id = record?.header?.id
          if (id === undefined) continue
          const snapshot = await query.readSession(id)
          const events = Array.isArray(snapshot?.events) ? snapshot.events : []
          let lastHeader
          for (const event of events) {
            if (!event) continue
            if (event.type === 'request/header') {
              lastHeader = event.data && event.data.header
              continue
            }
            if (event.type !== 'assistant/message') continue
            const usage = event.data && event.data.usage
            if (usage === undefined || usage === null) continue
            addUsage(
              fresh,
              dayKey(typeof event.time === 'number' ? event.time : Date.now()),
              usage,
              modelOf(event, lastHeader),
            )
          }
        } catch {
          // One unreadable session must not abort the whole reconciliation.
        }
      }
    } catch (error) {
      warn(`reconciliation failed, keeping forward-only counts: ${error}`)
      return
    }
    daily.clear()
    for (const [key, bucket] of fresh) daily.set(key, bucket)
    persistNow()
  }
}
