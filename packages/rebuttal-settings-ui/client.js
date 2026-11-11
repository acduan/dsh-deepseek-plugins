// @local/dsh-rebuttal-mode/client
// Browser half: a Settings section page with provider/model dropdowns for the
// Rebuttal Mode critic and arbiter. The model catalog is read from the Host
// route /api/rebuttal-config, which in turn reads the live DSH LLM provider
// registry. The page writes the same route, so the selected routes persist in
// the Host storage domain and are picked up by new tool calls immediately.

window.__ModuleLoader__.load({
  id: '@local/dsh-rebuttal-settings-ui',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    const CSS = `
      .rbm-root { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 28px; max-width: 860px; }
      .rbm-header { display: flex; flex-direction: column; gap: 4px; }
      .rbm-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 18px; font-weight: 600; line-height: 1.4; }
      .rbm-sub { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
      .rbm-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
      .rbm-card-head { display: flex; flex-direction: column; gap: 3px; }
      .rbm-card-title { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; line-height: 1.4; }
      .rbm-card-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
      .rbm-row { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 10px; }
      .rbm-label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .rbm-select { width: 100%; min-width: 0; box-sizing: border-box; appearance: auto; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 6px 8px; }
      .rbm-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .rbm-current { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
      .rbm-current code { color: var(--dsw-alias-label-primary); font-size: 11px; }
      .rbm-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .rbm-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; font-weight: 600; padding: 7px 16px; cursor: pointer; line-height: 1.2; }
      .rbm-btn:hover { border-color: var(--dsw-alias-brand-primary); }
      .rbm-btn:disabled { cursor: not-allowed; opacity: .55; }
      .rbm-btn-primary { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); color: #fff; }
      .rbm-btn-primary:hover { color: #fff; }
      .rbm-status { font-size: 12px; line-height: 1.4; }
      .rbm-status-ok { color: var(--dsw-alias-state-success-primary); }
      .rbm-status-error { color: var(--dsw-alias-state-error-primary); }
      .rbm-status-muted { color: var(--dsw-alias-label-secondary); }
      .rbm-note { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.55; }
      .rbm-empty { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      @media (max-width: 600px) { .rbm-row { grid-template-columns: 1fr; gap: 4px; } }
    `

    function cloneRoute(route) {
      return {
        provider: route && typeof route.provider === 'string' ? route.provider : '',
        model: route && typeof route.model === 'string' ? route.model : '',
        reasoningEffort: route && typeof route.reasoningEffort === 'string' ? route.reasoningEffort : '',
      }
    }

    function cloneDraft(config) {
      return { critic: cloneRoute(config && config.critic), arbiter: cloneRoute(config && config.arbiter) }
    }

    function modelOptions(groups, provider, currentModel) {
      const group = (groups || []).find((entry) => entry.id === provider)
      const rows = group && Array.isArray(group.models) ? group.models : []
      const options = rows.map((model) => ({ value: model.id, label: model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id }))
      if (currentModel && !options.some((option) => option.value === currentModel)) {
        options.unshift({ value: currentModel, label: `${currentModel}（当前保存，当前不可用）` })
      }
      return options
    }

    function providerOptions(groups, currentProvider) {
      const options = (groups || []).map((group) => ({ value: group.id, label: group.name && group.name !== group.id ? `${group.name} (${group.id})` : group.id }))
      if (currentProvider && !options.some((option) => option.value === currentProvider)) {
        options.unshift({ value: currentProvider, label: `${currentProvider}（当前保存，当前不可用）` })
      }
      return options
    }

    function effortOptions(groups, route) {
      const group = (groups || []).find((entry) => entry.id === route.provider)
      const model = group && Array.isArray(group.models) ? group.models.find((entry) => entry.id === route.model) : undefined
      const efforts = model && Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts : []
      const options = [{ value: '', label: '模型默认' }]
      for (const effort of efforts) options.push({ value: effort, label: effort })
      if (route.reasoningEffort && !options.some((option) => option.value === route.reasoningEffort)) {
        options.push({ value: route.reasoningEffort, label: `${route.reasoningEffort}（当前保存）` })
      }
      return options
    }

    function RouteCard(props) {
      const { title, description, route, groups, onChange } = props
      const providers = providerOptions(groups, route.provider)
      const models = modelOptions(groups, route.provider, route.model)
      const efforts = effortOptions(groups, route)
      const providerName = (providers.find((option) => option.value === route.provider) || {}).label || route.provider
      const modelName = (models.find((option) => option.value === route.model) || {}).label || route.model
      return h('section', { className: 'rbm-card' },
        h('div', { className: 'rbm-card-head' },
          h('div', { className: 'rbm-card-title' }, title),
          h('div', { className: 'rbm-card-desc' }, description)),
        h('div', { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: `rbm-provider-${title}` }, 'Provider'),
          h('select', {
            id: `rbm-provider-${title}`,
            className: 'rbm-select',
            value: route.provider,
            onChange: (event) => onChange('provider', event.target.value),
          }, providers.length > 0 ? providers.map((option) => h('option', { key: option.value, value: option.value }, option.label)) : h('option', { value: '' }, '（无可用 provider）'))),
        h('div', { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: `rbm-model-${title}` }, '模型'),
          h('select', {
            id: `rbm-model-${title}`,
            className: 'rbm-select',
            value: route.model,
            onChange: (event) => onChange('model', event.target.value),
          }, models.length > 0 ? models.map((option) => h('option', { key: option.value, value: option.value }, option.label)) : h('option', { value: '' }, '（该 provider 无可用模型）'))),
        h('div', { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: `rbm-effort-${title}` }, '推理强度'),
          h('select', {
            id: `rbm-effort-${title}`,
            className: 'rbm-select',
            value: route.reasoningEffort || '',
            onChange: (event) => onChange('reasoningEffort', event.target.value),
          }, efforts.map((option) => h('option', { key: option.value || 'default', value: option.value }, option.label)))),
        h('div', { className: 'rbm-current' }, '当前：', h('code', null, providerName + ' / ' + modelName + (route.reasoningEffort ? ' / ' + route.reasoningEffort : ''))))
    }

    function RebuttalSettingsPage() {
      const [data, setData] = useState(null)
      const [draft, setDraft] = useState(null)
      const [loading, setLoading] = useState(true)
      const [saving, setSaving] = useState(false)
      const [error, setError] = useState(null)
      const [status, setStatus] = useState(null)

      async function load() {
        setLoading(true)
        setError(null)
        try {
          const response = await fetch('/api/rebuttal-config', { credentials: 'same-origin' })
          const body = await response.json()
          if (!response.ok || !body.ok) throw new Error(body.error || 'HTTP ' + response.status)
          setData(body)
          setDraft(cloneDraft(body.config))
        } catch (loadError) {
          setError(loadError instanceof Error ? loadError.message : String(loadError))
        } finally {
          setLoading(false)
        }
      }

      useEffect(() => {
        load()
      }, [])

      const groups = data && data.models && Array.isArray(data.models.groups) ? data.models.groups : []
      const failures = data && data.models && Array.isArray(data.models.failures) ? data.models.failures : []

      function onChange(side, field, value) {
        setStatus(null)
        setDraft((previous) => {
          if (previous === null) return previous
          const next = cloneDraft(previous)
          const route = next[side]
          route[field] = value
          if (field === 'provider') {
            const group = groups.find((entry) => entry.id === value)
            const firstModel = group && Array.isArray(group.models) && group.models.length > 0 ? group.models[0].id : ''
            route.model = firstModel
            route.reasoningEffort = ''
          } else if (field === 'model') {
            route.reasoningEffort = ''
          }
          return next
        })
      }

      async function save() {
        if (draft === null || saving) return
        setSaving(true)
        setStatus(null)
        try {
          const payload = {
            critic: { ...draft.critic, reasoningEffort: draft.critic.reasoningEffort || undefined },
            arbiter: { ...draft.arbiter, reasoningEffort: draft.arbiter.reasoningEffort || undefined },
          }
          const response = await fetch('/api/rebuttal-config', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(payload),
          })
          const body = await response.json()
          if (!response.ok || !body.ok) throw new Error(body.error || 'HTTP ' + response.status)
          setData((previous) => ({ ...previous, config: body.config, persistent: body.persistent }))
          setDraft(cloneDraft(body.config))
          setStatus({ kind: 'ok', text: body.persistent ? '已保存，立即用于后续 rebuttal_review / rebuttal_arbitrate 调用。' : '已保存到当前进程（存储不可用，重启后会恢复默认值）。' })
        } catch (saveError) {
          setStatus({ kind: 'error', text: '保存失败：' + (saveError instanceof Error ? saveError.message : String(saveError)) })
        } finally {
          setSaving(false)
        }
      }

      const modelSummary = useMemo(() => {
        if (data === null) return ''
        return `${groups.length} 个 provider，${groups.reduce((count, group) => count + (Array.isArray(group.models) ? group.models.length : 0), 0)} 个模型`
      }, [data, groups])

      return h('div', { className: 'rbm-root' },
        h('style', null, CSS),
        h('div', { className: 'rbm-header' },
          h('h1', { className: 'rbm-title' }, '反驳式模式'),
          h('p', { className: 'rbm-sub' }, '配置「反驳者」与「裁决者」使用的模型。选项来自当前 DSH 已配置且注册的 LLM providers，保存后立即作用于本模式的后续审查与裁决。')),
        loading ? h('div', { className: 'rbm-empty' }, '正在读取当前可用模型…') : null,
        error ? h('div', { className: 'rbm-status rbm-status-error' }, '读取失败：' + error) : null,
        !loading && error ? h('div', { className: 'rbm-footer' }, h('button', { className: 'rbm-btn', onClick: load }, '重试')) : null,
        !loading && !error && draft !== null ? h(React.Fragment, null,
          h(RouteCard, {
            title: '反驳模型（rebuttal_review）',
            description: '独立反驳子代理使用的模型；默认 Hy4 · WorkBuddy，可改为当前 DSH 中任意可用模型。',
            route: draft.critic,
            groups,
            onChange: (field, value) => onChange('critic', field, value),
          }),
          h(RouteCard, {
            title: '裁决模型（rebuttal_arbitrate）',
            description: '主代理与反驳者无法达成共识时，由该模型做最终裁决；默认 GPT-6.1 Sol · PackyCode1。',
            route: draft.arbiter,
            groups,
            onChange: (field, value) => onChange('arbiter', field, value),
          }),
          failures.length > 0 ? h('div', { className: 'rbm-status rbm-status-muted' }, '部分 provider 读取失败：' + failures.map((failure) => failure.provider).join('、')) : null,
          h('div', { className: 'rbm-footer' },
            h('button', { className: 'rbm-btn rbm-btn-primary', disabled: saving, onClick: save }, saving ? '保存中…' : '保存'),
            h('button', { className: 'rbm-btn', disabled: saving, onClick: load }, '刷新模型列表'),
            h('span', { className: 'rbm-note' }, modelSummary + (data && data.persistent === false ? ' · 存储不可用' : '')),
            status !== null ? h('span', { className: 'rbm-status ' + (status.kind === 'ok' ? 'rbm-status-ok' : 'rbm-status-error') }, status.text) : null)) : null,
        h('div', { className: 'rbm-note' }, '提示：修改只影响新产生的审查/裁决调用，不会改写已经记录的历史工具结果。'))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined || typeof slots.inject !== 'function') return
        try {
          slots.inject('settings.section', () => slots.register({
            name: 'settings.section',
            id: 'rebuttal-mode',
            order: 25,
            label: '反驳式模式',
          }, RebuttalSettingsPage))
        } catch (error) {
          console.warn('dsh-rebuttal-mode: settings section registration failed:', error)
        }
      },
    }
  },
})
