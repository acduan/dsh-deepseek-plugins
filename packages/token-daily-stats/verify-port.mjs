// End-to-end verification of the ported Host half against a fake Cordis
// runtime that reproduces the DSH 0.2.0-rc.2 contracts EXACTLY:
//
//   * storageDomain.open() validates every stored record with
//     `tableSpec.valueSchema.parse(raw)` and fails the whole open on a throw
//     (packages/host/storage-domain/src/index.ts, `open()`).
//   * connection.fetch.register returns a Promise-returning disposer
//     (HostConnectionFetch.register: () => Promise<void>).
//   * domain.close() returns a Promise.
//   * sessionQuery.listSessions() -> SessionRecord[] ({ header: { id } }),
//     readSession(id) -> { events: SessionEvent[] }.
//
// Two runtime profiles are exercised, because they take different paths:
//   A. NO sessionQuery  -> the persisted domain is the only source of truth,
//                          so the legacy-record migration must be visible.
//   B. sessionQuery     -> reconcile() rebuilds from the raw session logs and
//                          replaces the persisted cache (as designed).
//
// It reads the REAL persisted file so the legacy (pre-v1.1 flat) migration is
// exercised on real bytes.
//
// Usage: node verify-port.mjs [path/to/token_daily_usage.json]
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const storageFile = process.argv[2] ?? join(homedir(), '.dsh', 'storages', 'token_daily_usage.json')

let failures = 0
const check = (cond, msg) => {
  if (cond) console.log('ok  :', msg)
  else { failures += 1; console.error('FAIL:', msg) }
}
const section = (title) => console.log(`\n--- ${title} ---`)

// ---------------------------------------------------------------------------
// Real bytes on disk
// ---------------------------------------------------------------------------
const stored = JSON.parse(readFileSync(storageFile, 'utf8'))
const storedDays = stored.tables?.days ?? {}
const legacyKeys = Object.keys(storedDays)
console.log(`storage file: ${storageFile}`)
console.log(`stored days : ${legacyKeys.join(', ') || '(none)'} @ unit version ${stored.unit?.version}`)

// ---------------------------------------------------------------------------
// Fake runtime
// ---------------------------------------------------------------------------

/**
 * Reproduce 0.2.x `open()`: every record goes through
 * `tableSpec.valueSchema.parse(raw)`, and a throw fails the WHOLE open.
 * The 0.1.x-era hand-rolled schema only had `safeParse`, which is exactly the
 * incompatibility this port fixes — so this fake is the regression guard.
 */
function makeStorageDomain(records, state) {
  return {
    async open(spec) {
      const { valueSchema } = spec.tables.days
      if (typeof valueSchema.parse !== 'function') {
        throw new Error(`invalid-record: valueSchema.parse is not a function`)
      }
      for (const [key, raw] of Object.entries(storedDays)) {
        let parsed
        try {
          parsed = valueSchema.parse(raw)
        } catch (error) {
          throw new Error(`invalid-record: day '${key}': ${error.message}`)
        }
        records.set(key, parsed)
      }
      state.openedSpec = spec
      return {
        name: spec.name,
        table: (name) => {
          if (name !== 'days') throw new Error(`unknown table ${name}`)
          return {
            get: (key) => records.get(key),
            entries: () => records.entries(),
            keys: () => records.keys(),
            get size() { return records.size },
            put: async (key, value) => { records.set(key, value) },
            delete: async (key) => records.delete(key),
            update: async (key, fn) => { const next = fn(records.get(key)); records.set(key, next); return next },
          }
        },
        // 0.2.x: Promise-returning.
        close: async () => { state.closed = true },
      }
    },
  }
}

/** Two synthetic sessions exercising source attribution and header fallback. */
const SESSIONS = [
  {
    header: { id: 'session-a' },
    events: [
      { type: 'request/header', time: 1, data: { header: { config: { provider: 'bailian', model: 'fallback-model' } } } },
      {
        type: 'assistant/message',
        time: Date.parse('2026-01-02T10:00:00'),
        data: {
          message: { source: { kind: 'model', provider: 'deepseek', model: 'deepseek-chat' } },
          usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 900, totalTokens: 150 },
        },
      },
      { type: 'tool/result', time: 3, data: {} },
      {
        // No per-message source: must attribute via the latest request/header.
        type: 'assistant/message',
        time: Date.parse('2026-01-02T11:00:00'),
        data: { message: { source: {} }, usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 } },
      },
      {
        // No usage at all: must be skipped.
        type: 'assistant/message',
        time: Date.parse('2026-01-03T10:00:00'),
        data: { message: { source: {} } },
      },
    ],
  },
  {
    header: { id: 'session-b' },
    events: [
      {
        type: 'assistant/message',
        time: Date.parse('2026-01-03T09:00:00'),
        data: {
          message: { source: { kind: 'model', provider: 'packyapi', model: 'gpt-6-sol' } },
          usage: { inputTokens: 1, outputTokens: 1 },
        },
      },
    ],
  },
]

/** Build a fake ctx. `withQuery: false` omits sessionQuery entirely. */
function makeCtx({ withQuery }) {
  const listeners = new Map()
  const state = { closed: false, routes: [], disposer: undefined, openedSpec: undefined }
  const records = new Map()
  const ctx = {
    on(type, fn) {
      const set = listeners.get(type) ?? new Set()
      set.add(fn)
      listeners.set(type, set)
      return () => set.delete(fn)
    },
    get(name) {
      if (name === 'storageDomain') return makeStorageDomain(records, state)
      if (name === 'sessionQuery' && withQuery) {
        return {
          listSessions: async () => SESSIONS.map((s) => ({ header: s.header, live: false, persisted: true })),
          readSession: async (id) => SESSIONS.find((s) => s.header.id === id),
        }
      }
      return undefined
    },
    effect(fn) { state.disposer = fn(); return () => state.disposer?.() },
    logger: { warn: (m) => console.log('     warn:', m) },
    connection: {
      fetch: {
        register(route) {
          for (const field of ['path', 'methods', 'requestBody', 'fetch']) {
            if (route[field] === undefined) throw new Error(`route is missing ${field}`)
          }
          state.routes.push(route)
          // 0.2.x: Promise-returning disposer.
          return async () => { state.routes.pop() }
        },
      },
    },
  }
  const emit = (session, event) => {
    for (const fn of listeners.get('session/event') ?? []) fn(session, event)
  }
  const read = async (from, to) => {
    const qs = [from ? `from=${from}` : '', to ? `to=${to}` : ''].filter(Boolean).join('&')
    const res = await state.routes[0].fetch(
      new Request(`http://x/api/token-daily-stats${qs ? '?' + qs : ''}`),
    )
    if (res.status !== 200) throw new Error(`unexpected status ${res.status}`)
    return res.json()
  }
  return { ctx, state, emit, read }
}

const mod = await import('./index.js')
check(mod.name === 'token-daily-stats', 'plugin exports its name')
check(Array.isArray(mod.inject) && mod.inject.includes('connection'), 'plugin hard-depends on connection')

// ---------------------------------------------------------------------------
// Profile A — no sessionQuery: the persisted domain is the source of truth
// ---------------------------------------------------------------------------
section('A. persisted-only runtime (no sessionQuery)')
{
  const { ctx, state, emit, read } = makeCtx({ withQuery: false })
  await mod.apply(ctx)

  check(state.openedSpec?.name === 'token_daily_usage', 'domain name is the frozen token_daily_usage')
  check(state.openedSpec?.version === 1, 'domain version is the frozen 1')
  check(state.openedSpec?.invalidRecords === 'backup-and-skip', 'invalidRecords: backup-and-skip declared')
  check(state.routes.length === 1, 'fetch route registered')
  check(state.routes[0].path === '/api/token-daily-stats', 'route path')
  check(state.routes[0].methods.join() === 'GET', 'route method GET')
  check(state.routes[0].requestBody === 'buffered', 'route requestBody buffered')

  const all = await read()
  for (const key of legacyKeys) {
    const day = all.days.find((d) => d.day === key)
    check(day !== undefined, `persisted legacy day ${key} survived the 0.2.x parse-based open`)
    if (!day) continue
    const legacy = day.models.find((m) => m.provider === 'legacy' && m.model === 'legacy')
    check(legacy !== undefined, `legacy day ${key} migrated into the synthetic legacy model bucket`)
    check(
      legacy !== undefined && legacy.total === day.total && legacy.requests === day.requests,
      `legacy day ${key} invariant: sum(models) == day totals`,
    )
    check(
      day.models.reduce((acc, m) => acc + m.total, 0) === day.total,
      `legacy day ${key} invariant holds across every model bucket`,
    )
  }

  // Live fold, ignore-rules, and a throwing requestHeader().
  const today = all.today
  emit({ requestHeader: () => undefined }, {
    type: 'assistant/message', time: Date.now(),
    data: { message: { source: { kind: 'model', provider: 'live', model: 'live-model' } }, usage: { inputTokens: 7, outputTokens: 3, totalTokens: 10 } },
  })
  emit({ requestHeader: () => undefined }, { type: 'assistant/message', time: Date.now(), data: { message: {} } })
  emit({ requestHeader: () => undefined }, { type: 'tool/result', time: Date.now(), data: {} })
  emit({ requestHeader: () => { throw new Error('drifted session API') } }, {
    type: 'assistant/message', time: Date.now(),
    data: { message: { source: { kind: 'model', provider: 'live', model: 'live-model' } }, usage: { inputTokens: 1, outputTokens: 0, totalTokens: 1 } },
  })

  const afterLive = await read()
  const liveDay = afterLive.days.find((d) => d.day === today)
  check(liveDay?.total === 11, 'live events folded into today (usage-less and non-assistant events ignored)')
  check(
    liveDay?.models.some((m) => m.provider === 'live' && m.model === 'live-model' && m.total === 11),
    'live events attributed to their model bucket',
  )
  check(liveDay?.requests === 2, 'exactly two live requests counted')
  check(typeof afterLive.today === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(afterLive.today), 'today is a local YYYY-MM-DD')

  const ranged = await read('2099-01-01', '2099-01-02')
  check(ranged.days.length === 0, 'from/to range excludes everything outside it')

  await state.disposer()
  check(state.closed === true, 'domain.close() (a Promise) was awaited on dispose')
  check(state.routes.length === 0, 'route disposer (a Promise) was awaited on dispose')
}

// ---------------------------------------------------------------------------
// Profile B — full runtime: reconcile rebuilds the corpus from session logs
// ---------------------------------------------------------------------------
section('B. full runtime (sessionQuery present)')
{
  const { ctx, state, emit, read } = makeCtx({ withQuery: true })
  await mod.apply(ctx)

  const all = await read()
  check(
    legacyKeys.every((key) => all.days.find((d) => d.day === key) === undefined),
    'reconcile replaced the persisted cache (persisted days absent from the fake corpus)',
  )

  const jan2 = all.days.find((d) => d.day === '2026-01-02')
  check(jan2 !== undefined, 'reconcile rebuilt 2026-01-02 from the session logs')
  check(jan2?.total === 165, 'reconcile day total = 150 + 15')
  check(jan2?.requests === 2, 'reconcile counted only usage-bearing events')
  check(jan2?.models.reduce((a, m) => a + m.total, 0) === jan2?.total, 'reconcile keeps sum(models) == day total')

  const byKey = Object.fromEntries((jan2?.models ?? []).map((m) => [`${m.provider}/${m.model}`, m]))
  check(byKey['deepseek/deepseek-chat']?.total === 150, 'per-message source attributed deepseek/deepseek-chat')
  check(byKey['bailian/fallback-model']?.total === 15, 'request/header fallback attributed bailian/fallback-model')

  const jan3 = all.days.find((d) => d.day === '2026-01-03')
  check(jan3?.total === 2, 'second session attributed to 2026-01-03')

  check(all.models.length >= 3, 'models rollup spans the whole range')
  check(
    all.models.every((m, i, a) => i === 0 || (a[i - 1].total ?? 0) >= (m.total ?? 0)),
    'models rollup sorted by total desc',
  )

  // Regression guard: reconciliation must never double-count on re-activation.
  await state.disposer()
  const second = makeCtx({ withQuery: true })
  await mod.apply(second.ctx)
  const again = await second.read()
  check(
    again.days.find((d) => d.day === '2026-01-02')?.total === 165,
    're-activation does not double-count (reconcile replaces, never adds)',
  )
  await second.state.disposer()
}

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECKS FAILED`)
process.exit(failures === 0 ? 0 : 1)
