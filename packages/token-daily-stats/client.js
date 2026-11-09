// @local/token-daily-stats — Client half (v1.2: ported to DSH 0.2.x).
//
// Registers a Settings section ("Token 用量统计") that polls the Host half's
// authenticated `/api/token-daily-stats` route every two seconds, so the page
// updates live without a manual refresh. A time-range selector filters the
// query by `from`/`to` (YYYY-MM-DD), with quick presets. On top of the range
// totals, a per-model table breaks the range down by `<provider>/<model>`, and
// a model filter narrows the trend chart and the daily detail table to one
// model.
//
// ---------------------------------------------------------------------------
// VERSION-UPDATE CONTRACT
// ---------------------------------------------------------------------------
// `window.__ModuleLoader__.load({ id, factory })` is the documented browser
// bundle protocol (dsh-client-modules): running a bundle only registers a
// factory, and the factory body runs at materialization. The plugin body below
// therefore touches nothing global at load time, and `apply` guards the one
// service it needs:
//
//   * `slots` is declared in the returned `inject`, so Cordis gates activation
//     on that service — if a future DSH renames the slot service, this plugin
//     simply never activates instead of throwing during boot.
//   * `ctx.slots.inject(...)` is wrapped so an unknown slot key or a changed
//     slot-registration signature degrades to "settings section missing"
//     rather than a failed client boot.
//   * Only `react` is required, which is part of the frozen platform module
//     table. No `dsh.client.external` entry is needed (the legacy
//     `dsh.client.inject` field was never part of the declaration schema and
//     has been dropped from package.json).
// ---------------------------------------------------------------------------

window.__ModuleLoader__.load({
  id: '@local/token-daily-stats',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useState, useEffect, useMemo } = React

    const CSS = `
      .tds-root { display: flex; flex-direction: column; gap: 16px; padding: 4px 2px 24px; }
      .tds-header { display: flex; align-items: baseline; gap: 10px; }
      .tds-title { font-size: 18px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 0; }
      .tds-sub { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .tds-live { font-size: 11px; font-weight: 600; color: var(--dsw-alias-state-success-primary); }
      .tds-live::before { content: ""; display: inline-block; width: 7px; height: 7px; border-radius: 50%;
        background: var(--dsw-alias-state-success-primary); margin-right: 5px; vertical-align: 1px; }

      .tds-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .tds-presets { display: flex; flex-wrap: wrap; gap: 6px; }
      .tds-chip { appearance: none; border: 1px solid var(--dsw-alias-border-l2);
        background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-secondary);
        font-size: 12px; padding: 5px 11px; border-radius: 999px; cursor: pointer; line-height: 1; }
      .tds-chip:hover { color: var(--dsw-alias-label-primary); }
      .tds-chip-active { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary);
        color: #fff; font-weight: 600; }
      .tds-chip-active:hover { color: #fff; }
      .tds-daterow { display: flex; align-items: center; gap: 6px; }
      .tds-datelabel { font-size: 12px; color: var(--dsw-alias-label-secondary); }
      .tds-date { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l2);
        border-radius: 8px; color: var(--dsw-alias-label-primary); font-size: 12px; padding: 5px 8px;
        font-family: inherit; }
      .tds-date:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }

      .tds-cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(128px, 1fr)); gap: 10px; }
      .tds-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px; padding: 12px 14px; }
      .tds-card-value { font-size: 18px; font-weight: 700; color: var(--dsw-alias-label-primary); line-height: 1.2; }
      .tds-card-label { font-size: 11px; color: var(--dsw-alias-label-secondary); margin-top: 4px; }
      .tds-section-title { font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); margin: 4px 0 8px; }
      .tds-chart { display: flex; align-items: flex-end; gap: 6px; height: 132px;
        background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1);
        border-radius: 10px; padding: 12px 12px 8px; }
      .tds-bar-col { flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: flex-end;
        height: 100%; min-width: 0; }
      .tds-bar-track { width: 100%; height: 96px; display: flex; align-items: flex-end; justify-content: center; }
      .tds-bar { width: 70%; min-width: 8px; border-radius: 4px 4px 0 0;
        background: var(--dsw-alias-brand-primary); opacity: 0.9; }
      .tds-bar-empty { height: 2px; width: 70%; background: var(--dsw-alias-border-l2); border-radius: 1px; }
      .tds-bar-day { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 5px; }
      .tds-bar-val { font-size: 9px; color: var(--dsw-alias-label-secondary); margin-top: 2px; max-width: 100%;
        overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .tds-table { width: 100%; border-collapse: collapse; font-size: 12px; }
      .tds-table th, .tds-table td { text-align: right; padding: 7px 8px; border-bottom: 1px solid var(--dsw-alias-border-l1); }
      .tds-table th:first-child, .tds-table td:first-child { text-align: left; }
      .tds-table th { color: var(--dsw-alias-label-secondary); font-weight: 600; }
      .tds-table td { color: var(--dsw-alias-label-primary); }
      .tds-table tr.tds-today td { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 10%, transparent); }
      .tds-model-name { font-weight: 600; color: var(--dsw-alias-label-primary); }
      .tds-model-provider { font-size: 10px; color: var(--dsw-alias-label-secondary); margin-top: 2px; }
      .tds-share { color: var(--dsw-alias-brand-primary); font-weight: 600; }
      .tds-note { font-size: 11px; color: var(--dsw-alias-label-secondary); }
      .tds-error { color: var(--dsw-alias-state-error-primary); font-size: 12px; }
      .tds-empty { color: var(--dsw-alias-label-secondary); font-size: 12px; }
    `

    function formatNumber(n) {
      const v = Number(n) || 0
      if (v >= 1e9) return (v / 1e9).toFixed(2) + 'B'
      if (v >= 1e6) return (v / 1e6).toFixed(2) + 'M'
      if (v >= 1e3) return (v / 1e3).toFixed(1) + 'K'
      return String(Math.round(v))
    }

    function zeroBucket() {
      return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, reasoning: 0, total: 0, requests: 0 }
    }

    function dayKey(d) {
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${d.getFullYear()}-${m}-${day}`
    }

    function addDays(dayStr, delta) {
      const [y, m, d] = dayStr.split('-').map(Number)
      return dayKey(new Date(y, m - 1, d + delta))
    }

    /** Local calendar day at page load; the default query window. */
    const TODAY = dayKey(new Date())

    const ALL = '__all__'

    /** Rebuild the host's `<provider>/<model>` key from a rollup entry. */
    function modelKeyOf(m) {
      return (m.provider || '') + '/' + (m.model || '')
    }

    /** Human label for one model entry. */
    function modelLabel(m) {
      if (m.provider === 'legacy') return '历史未归因'
      const name = m.model && m.model !== 'unknown' ? m.model : '未知模型'
      if (m.provider && m.provider !== 'unknown' && m.provider !== 'legacy') {
        return name + ' · ' + m.provider
      }
      return name
    }

    const PRESETS = [
      { id: 'today', label: '今天', days: 1 },
      { id: '7d', label: '近 7 天', days: 7 },
      { id: '14d', label: '近 14 天', days: 14 },
      { id: '30d', label: '近 30 天', days: 30 },
      { id: 'all', label: '全部', days: null },
    ]

    function TokenDailyStats() {
      const [data, setData] = useState(null)
      const [error, setError] = useState(null)
      const [preset, setPreset] = useState('today')
      const [from, setFrom] = useState(TODAY)
      const [to, setTo] = useState(TODAY)
      const [modelSel, setModelSel] = useState(ALL)

      useEffect(() => {
        let alive = true
        const load = () => {
          const params = new URLSearchParams()
          if (from) params.set('from', from)
          if (to) params.set('to', to)
          const qs = params.toString()
          fetch('/api/token-daily-stats' + (qs ? '?' + qs : ''), { credentials: 'same-origin' })
            .then((r) => {
              if (!r.ok) throw new Error('HTTP ' + r.status)
              return r.json()
            })
            .then((json) => { if (alive) { setData(json); setError(null) } })
            .catch((e) => { if (alive) setError(e && e.message ? e.message : String(e)) })
        }
        load()
        const id = setInterval(load, 2000)
        return () => { alive = false; clearInterval(id) }
      }, [from, to])

      const days = useMemo(() => {
        if (!data || !Array.isArray(data.days)) return []
        return [...data.days].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))
      }, [data])

      const today = data ? data.today : undefined

      const models = useMemo(() => {
        if (!data || !Array.isArray(data.models)) return []
        return data.models
      }, [data])

      // Resolve the current selection against the range rollup, so a model that
      // dropped out of the range (e.g. after a preset switch) falls back to all.
      const selModel = useMemo(() => {
        if (modelSel === ALL) return null
        return models.find((m) => modelKeyOf(m) === modelSel) || null
      }, [modelSel, models])

      const totals = useMemo(() => {
        const s = zeroBucket()
        for (const d of days) {
          s.input += d.input || 0
          s.output += d.output || 0
          s.cacheRead += d.cacheRead || 0
          s.cacheWrite += d.cacheWrite || 0
          s.reasoning += d.reasoning || 0
          s.total += d.total || 0
          s.requests += d.requests || 0
        }
        return s
      }, [days])

      const cacheHitRate = (totals.cacheRead + totals.input) > 0
        ? Math.round((totals.cacheRead / (totals.cacheRead + totals.input)) * 100)
        : 0

      /** The per-day bucket to plot: day totals, or one model's sub-bucket. */
      const dayBucket = (d) => {
        if (!selModel) return d
        const list = Array.isArray(d.models) ? d.models : []
        const hit = list.find((m) => m.provider === selModel.provider && m.model === selModel.model)
        return hit || zeroBucket()
      }

      const chartDays = useMemo(() => days.slice(-60), [days])
      const maxTotal = useMemo(() => {
        let m = 0
        for (const d of chartDays) m = Math.max(m, dayBucket(d).total || 0)
        return m
      }, [chartDays, selModel])

      const newestFirst = useMemo(() => [...days].reverse(), [days])

      const applyPreset = (p) => {
        setPreset(p.id)
        if (p.days === null) { setFrom(''); setTo('') }
        else {
          // Anchor relative presets to the current local day at click time,
          // not the page-load constant, so the range stays correct across a
          // midnight rollover.
          const anchor = dayKey(new Date())
          setTo(anchor)
          setFrom(addDays(anchor, -(p.days - 1)))
        }
      }

      const onFromChange = (e) => { setFrom(e.target.value); setPreset('custom') }
      const onToChange = (e) => { setTo(e.target.value); setPreset('custom') }

      const rangeTitle = (() => {
        if (preset === 'custom') {
          if (from && to) return `区间合计（${from} ~ ${to}）`
          if (from) return `自 ${from} 起合计`
          if (to) return `截至 ${to} 合计`
          return '累计合计'
        }
        const p = PRESETS.find((x) => x.id === preset)
        return p && p.days !== null ? `${p.label}合计` : '累计合计'
      })()

      const metric = (label, value, accent) => h('div', { className: 'tds-card' },
        h('div', { className: 'tds-card-value', style: accent ? { color: accent } : undefined },
          typeof value === 'string' ? value : formatNumber(value)),
        h('div', { className: 'tds-card-label' }, label))

      const chartBars = chartDays.map((d) => {
        const bucket = dayBucket(d)
        const pct = maxTotal > 0 ? Math.max(2, Math.round((bucket.total || 0) / maxTotal * 100)) : 0
        const dayLabel = d.day.slice(5)
        return h('div', { className: 'tds-bar-col', key: d.day },
          h('div', { className: 'tds-bar-val' }, formatNumber(bucket.total)),
          h('div', { className: 'tds-bar-track' },
            (bucket.total || 0) > 0
              ? h('div', { className: 'tds-bar', style: { height: pct + '%' } })
              : h('div', { className: 'tds-bar-empty' })),
          h('div', { className: 'tds-bar-day' }, dayLabel))
      })

      const detailHeader = selModel
        ? '每日明细（' + modelLabel(selModel) + '）'
        : '每日明细（全部模型）'

      const rows = newestFirst.map((d) => {
        const bucket = dayBucket(d)
        const isToday = d.day === today
        return h('tr', { className: isToday ? 'tds-today' : undefined, key: d.day },
          h('td', null, d.day),
          h('td', null, formatNumber(bucket.input)),
          h('td', null, formatNumber(bucket.output)),
          h('td', null, formatNumber(bucket.cacheRead)),
          h('td', null, formatNumber(bucket.cacheWrite)),
          h('td', null, formatNumber(bucket.reasoning)),
          h('td', null, formatNumber(bucket.total)),
          h('td', null, formatNumber(bucket.requests)))
      })

      const presetChips = PRESETS.map((p) => h('button', {
        className: 'tds-chip' + (preset === p.id ? ' tds-chip-active' : ''),
        key: p.id,
        onClick: () => applyPreset(p),
      }, p.label))

      const modelChips = [
        h('button', {
          className: 'tds-chip' + (modelSel === ALL ? ' tds-chip-active' : ''),
          key: ALL,
          onClick: () => setModelSel(ALL),
        }, '全部模型'),
        ...models.map((m) => {
          const key = modelKeyOf(m)
          return h('button', {
            className: 'tds-chip' + (modelSel === key ? ' tds-chip-active' : ''),
            key,
            onClick: () => setModelSel(key),
          }, modelLabel(m))
        }),
      ]

      const modelRows = models.map((m) => {
        const share = totals.total > 0 ? Math.round((m.total || 0) / totals.total * 100) : 0
        return h('tr', { key: modelKeyOf(m) },
          h('td', null,
            h('div', { className: 'tds-model-name' }, modelLabel(m)),
            (m.provider && m.provider !== 'legacy' && m.provider !== 'unknown'
              ? h('div', { className: 'tds-model-provider' }, 'provider: ' + m.provider)
              : null)),
          h('td', null, formatNumber(m.input)),
          h('td', null, formatNumber(m.output)),
          h('td', null, formatNumber(m.cacheRead)),
          h('td', null, formatNumber(m.cacheWrite)),
          h('td', null, formatNumber(m.reasoning)),
          h('td', null, formatNumber(m.total)),
          h('td', null, formatNumber(m.requests)),
          h('td', null, formatNumber(m.days)),
          h('td', { className: 'tds-share' }, share + '%'))
      })

      return h('div', { className: 'tds-root' },
        h('style', null, CSS),
        h('div', { className: 'tds-header' },
          h('h1', { className: 'tds-title' }, '每日 Token 用量统计'),
          h('span', { className: 'tds-live' }, '实时更新')),
        h('div', { className: 'tds-sub' }, '统计所有会话（含子代理）每日模型调用消耗的 token 数量，支持按模型细分'),

        h('div', { className: 'tds-toolbar' },
          h('div', { className: 'tds-presets' }, presetChips),
          h('div', { className: 'tds-daterow' },
            h('span', { className: 'tds-datelabel' }, '自定义'),
            h('input', { type: 'date', className: 'tds-date', value: from, onChange: onFromChange }),
            h('span', { className: 'tds-datelabel' }, '至'),
            h('input', { type: 'date', className: 'tds-date', value: to, onChange: onToChange }))),

        error ? h('div', { className: 'tds-error' }, '加载失败：' + error) : null,

        h('div', { className: 'tds-section-title' }, rangeTitle),
        h('div', { className: 'tds-cards' },
          metric('未缓存输入', totals.input),
          metric('缓存命中率', cacheHitRate + '%'),
          metric('缓存读取', totals.cacheRead),
          metric('输出 tokens', totals.output),
          metric('缓存写入', totals.cacheWrite),
          metric('推理 tokens', totals.reasoning),
          metric('总计 tokens', totals.total),
          metric('请求次数', totals.requests)),

        h('div', { className: 'tds-section-title' }, '按模型统计（' + rangeTitle + '）'),
        models.length > 0
          ? h('table', { className: 'tds-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, '模型'),
                h('th', null, '输入'),
                h('th', null, '输出'),
                h('th', null, '缓存读'),
                h('th', null, '缓存写'),
                h('th', null, '推理'),
                h('th', null, '总计'),
                h('th', null, '请求'),
                h('th', null, '活跃天数'),
                h('th', null, '占比'))),
            h('tbody', null, modelRows))
          : h('div', { className: 'tds-empty' }, '该时间范围内暂无数据。'),

        models.length > 1 ? h('div', { className: 'tds-toolbar' },
          h('div', { className: 'tds-presets' }, modelChips)) : null,

        h('div', { className: 'tds-section-title' },
          selModel ? '每日趋势 · ' + modelLabel(selModel) + '（总计 tokens）' : '每日趋势（总计 tokens）'),
        h('div', { className: 'tds-chart' },
          chartBars.length > 0 ? chartBars : h('div', { className: 'tds-empty' }, '暂无数据')),
        days.length > 60 ? h('div', { className: 'tds-note' }, '图表仅显示最近 60 天，完整数据见下方明细。') : null,

        h('div', { className: 'tds-section-title' }, detailHeader),
        days.length > 0
          ? h('table', { className: 'tds-table' },
            h('thead', null,
              h('tr', null,
                h('th', null, '日期'),
                h('th', null, '输入'),
                h('th', null, '输出'),
                h('th', null, '缓存读'),
                h('th', null, '缓存写'),
                h('th', null, '推理'),
                h('th', null, '总计'),
                h('th', null, '请求'))),
            h('tbody', null, rows))
          : h('div', { className: 'tds-empty' }, '该时间范围内暂无数据。'))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined || typeof slots.inject !== 'function') {
          // A DSH build without the slot service: activate quietly and render
          // nothing rather than failing the client boot.
          return
        }
        try {
          slots.inject('settings.section', () => slots.register({
            name: 'settings.section',
            id: 'token-usage',
            order: 30,
            label: 'Token 用量统计',
          }, TokenDailyStats))
        } catch (error) {
          console.warn('token-daily-stats: settings section registration failed:', error)
        }
      },
    }
  },
})
