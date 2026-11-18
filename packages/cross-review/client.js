// @local/dsh-cross-review/client
// Browser half: a Settings section page for the Cross-Verification Mode arbiter.
// The model catalog is read from the Host route /api/cross-review-config, which
// in turn reads the live DSH LLM provider registry. The page writes the same
// route, so the selected route persists in the Host storage domain and is picked
// up by new tool calls immediately.
//
// A "test" button runs a one-prompt connectivity probe through the Host route,
// so a dead gateway or an unsupported reasoning effort is visible here instead of
// surfacing as a failed audit at the end of a task.

window.__ModuleLoader__.load({
  id: '@local/dsh-cross-review',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const { useEffect, useMemo, useState } = React

    const ZH =
      typeof navigator === 'object' &&
      String(navigator.language || navigator.userLanguage || '').toLowerCase().startsWith('zh')
    const TEXT = ZH
      ? {
          title: '交叉复核模式',
          subtitle:
            '配置裁决者的启用状态、模型和超时时长。模型选项来自当前 DSH 已配置且注册的 LLM providers，保存后立即作用于后续调用。',
          arbiterTitle: '裁决者（需求解析 / 交付审核）',
          arbiterDesc: '开工前解析需求、收尾时审核交付。两项职责可分别关闭。',
          arbiterOff: '裁决者已停用：需求解析与交付审核将直接放行，不再启动子代理。',
          briefLabel: '需求解析',
          briefHint: '开工前整理规格与验收标准（cross_review_brief）',
          auditLabel: '交付审核',
          auditHint: '收尾时逐条核对验收标准（cross_review_final）',
          provider: 'Provider',
          model: '模型',
          effort: '推理强度',
          effortDefault: '模型默认',
          timeout: '超时',
          seconds: '秒',
          enabled: '已启用',
          disabled: '已停用',
          current: '当前：',
          test: '测试',
          testing: '测试中…',
          testOk: '连通正常',
          testFail: '测试失败',
          save: '保存',
          saving: '保存中…',
          refresh: '刷新模型列表',
          reset: '恢复默认',
          resetDone: '已恢复默认配置。',
          resetFail: '恢复默认失败：',
          loading: '正在读取当前可用模型…',
          loadFail: '读取失败：',
          retry: '重试',
          unsaved: '有未保存的修改',
          saved: '已保存，立即用于后续调用。',
          savedMemory: '已保存到当前进程（存储不可用，重启后会恢复默认值）。',
          saveFail: '保存失败：',
          noProvider: '（无可用 provider）',
          noModel: '（该 provider 无可用模型）',
          storedUnavailable: '当前保存，当前不可用',
          storedEffort: '当前保存',
          partialFail: '部分 provider 读取失败：',
          storageOff: '存储不可用',
          footer:
            '提示：停用裁决者后，对应工具会直接跳过而不启动子代理；超时按秒配置，范围 10–3600 秒。修改只影响新产生的调用，不改写已记录的历史工具结果。',
        }
      : {
          title: 'Cross-Verification Mode',
          subtitle:
            'Configure the enablement, model, and timeout of the arbiter. Model options come from the LLM providers currently configured and registered in DSH; saving applies to later calls immediately.',
          arbiterTitle: 'Arbiter (requirement brief / delivery audit)',
          arbiterDesc: 'Parses the requirement up front and audits delivery at the end. Each duty toggles separately.',
          arbiterOff: 'Arbiter disabled: requirement briefing and delivery audit both pass through without a child agent.',
          briefLabel: 'Requirement brief',
          briefHint: 'Turns the request into an acceptance spec before work starts (cross_review_brief)',
          auditLabel: 'Delivery audit',
          auditHint: 'Checks every acceptance criterion before delivery (cross_review_final)',
          provider: 'Provider',
          model: 'Model',
          effort: 'Reasoning',
          effortDefault: 'Model default',
          timeout: 'Timeout',
          seconds: 's',
          enabled: 'Enabled',
          disabled: 'Disabled',
          current: 'Current: ',
          test: 'Test',
          testing: 'Testing…',
          testOk: 'Reachable',
          testFail: 'Test failed',
          save: 'Save',
          saving: 'Saving…',
          refresh: 'Refresh models',
          reset: 'Restore defaults',
          resetDone: 'Defaults restored.',
          resetFail: 'Restore failed: ',
          loading: 'Reading the available models…',
          loadFail: 'Load failed: ',
          retry: 'Retry',
          unsaved: 'Unsaved changes',
          saved: 'Saved; applied to later calls.',
          savedMemory: 'Saved in this process only (storage unavailable, defaults return after restart).',
          saveFail: 'Save failed: ',
          noProvider: '(no provider available)',
          noModel: '(no model for this provider)',
          storedUnavailable: 'saved, currently unavailable',
          storedEffort: 'saved',
          partialFail: 'Some providers failed to list: ',
          storageOff: 'storage unavailable',
          footer:
            'Disabling the arbiter makes its tools pass through without starting a child agent. The timeout is 10–3600 seconds. Changes affect new calls only; recorded tool results are never rewritten.',
        }

    const CSS = `
      .rbm-root { display: flex; flex-direction: column; gap: 18px; padding: 4px 2px 28px; max-width: 860px; }
      .rbm-header { display: flex; flex-direction: column; gap: 4px; }
      .rbm-title { margin: 0; color: var(--dsw-alias-label-primary); font-size: 18px; font-weight: 600; line-height: 1.4; }
      .rbm-sub { margin: 0; color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.6; }
      .rbm-card { background: var(--dsw-alias-bg-layer-1); border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
      .rbm-card-off { opacity: .72; }
      .rbm-card-head { display: flex; flex-direction: column; gap: 3px; }
      .rbm-card-title-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
      .rbm-card-title { color: var(--dsw-alias-label-primary); font-size: 13px; font-weight: 600; line-height: 1.4; }
      .rbm-card-desc { color: var(--dsw-alias-label-secondary); font-size: 12px; line-height: 1.5; }
      .rbm-card-note { color: var(--dsw-alias-state-warn-primary); font-size: 11px; line-height: 1.5; }
      .rbm-switch { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; user-select: none; flex: none; }
      .rbm-switch input { position: absolute; opacity: 0; width: 0; height: 0; }
      .rbm-switch-track { position: relative; width: 34px; height: 19px; border-radius: 999px; background: var(--dsw-alias-border-l2); transition: background .15s ease; flex: none; }
      .rbm-switch-thumb { position: absolute; top: 2px; left: 2px; width: 15px; height: 15px; border-radius: 50%; background: var(--dsw-alias-bg-base); transition: transform .15s ease; }
      .rbm-switch input:checked + .rbm-switch-track { background: var(--dsw-alias-brand-primary); }
      .rbm-switch input:checked + .rbm-switch-track .rbm-switch-thumb { transform: translateX(15px); }
      .rbm-switch input:focus-visible + .rbm-switch-track { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .rbm-switch-label { color: var(--dsw-alias-label-secondary); font-size: 11px; }
      .rbm-check { display: inline-flex; align-items: center; gap: 7px; cursor: pointer; user-select: none; }
      .rbm-check input { position: absolute; opacity: 0; width: 0; height: 0; }
      .rbm-check-box { position: relative; width: 15px; height: 15px; border-radius: 4px; border: 1px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-base); flex: none; }
      .rbm-check input:checked + .rbm-check-box { background: var(--dsw-alias-brand-primary); border-color: var(--dsw-alias-brand-primary); }
      .rbm-check input:checked + .rbm-check-box::after { content: ""; position: absolute; left: 4px; top: 1px; width: 5px; height: 9px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
      .rbm-check input:focus-visible + .rbm-check-box { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
      .rbm-check input:disabled + .rbm-check-box { opacity: .5; cursor: not-allowed; }
      .rbm-check-text { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .rbm-row { display: grid; grid-template-columns: 92px minmax(0, 1fr); align-items: center; gap: 10px; }
      .rbm-label { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .rbm-select { width: 100%; min-width: 0; box-sizing: border-box; appearance: auto; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 6px 8px; }
      .rbm-select:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .rbm-select:disabled, .rbm-input:disabled { cursor: not-allowed; opacity: .6; }
      .rbm-timeout { display: flex; align-items: center; gap: 6px; }
      .rbm-input { width: 96px; box-sizing: border-box; background: var(--dsw-alias-bg-base); border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; padding: 6px 8px; }
      .rbm-input:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
      .rbm-unit { color: var(--dsw-alias-label-secondary); font-size: 12px; }
      .rbm-current { color: var(--dsw-alias-label-secondary); font-size: 11px; line-height: 1.5; }
      .rbm-current code { color: var(--dsw-alias-label-primary); font-size: 11px; }
      .rbm-footer { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .rbm-card-foot { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
      .rbm-btn { appearance: none; border: 1px solid var(--dsw-alias-border-l2); border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font: inherit; font-size: 12px; font-weight: 600; padding: 7px 16px; cursor: pointer; line-height: 1.2; }
      .rbm-btn:hover { border-color: var(--dsw-alias-brand-primary); }
      .rbm-btn:disabled { cursor: not-allowed; opacity: .55; }
      .rbm-btn-small { padding: 5px 12px; font-weight: 500; }
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
        enabled: route && typeof route.enabled === 'boolean' ? route.enabled : true,
        provider: route && typeof route.provider === 'string' ? route.provider : '',
        model: route && typeof route.model === 'string' ? route.model : '',
        reasoningEffort: route && typeof route.reasoningEffort === 'string' ? route.reasoningEffort : '',
        timeoutMs: route && typeof route.timeoutMs === 'number' ? route.timeoutMs : 180000,
        briefEnabled: !route || route.briefEnabled !== false,
        auditEnabled: !route || route.auditEnabled !== false,
      }
    }

    function cloneDraft(config) {
      return cloneRoute(config && config.arbiter)
    }

    // Timeout is edited in seconds for readability; the Host stores milliseconds.
    function toSeconds(ms) {
      return String(Math.round((typeof ms === 'number' && ms > 0 ? ms : 180000) / 1000))
    }

    function fromSeconds(text) {
      const parsed = Number.parseInt(String(text).trim(), 10)
      if (!Number.isFinite(parsed)) return undefined
      return parsed * 1000
    }

    function toRoutePayload(route) {
      return {
        enabled: route.enabled !== false,
        briefEnabled: route.briefEnabled !== false,
        auditEnabled: route.auditEnabled !== false,
        provider: route.provider,
        model: route.model,
        reasoningEffort: route.reasoningEffort || undefined,
        timeoutMs: route.timeoutMs,
      }
    }

    function modelOptions(groups, provider, currentModel) {
      const group = (groups || []).find((entry) => entry.id === provider)
      const rows = group && Array.isArray(group.models) ? group.models : []
      const options = rows.map((model) => ({
        value: model.id,
        label: model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id,
      }))
      if (currentModel && !options.some((option) => option.value === currentModel)) {
        options.unshift({ value: currentModel, label: `${currentModel}（${TEXT.storedUnavailable}）` })
      }
      return options
    }

    function providerOptions(groups, currentProvider) {
      const options = (groups || []).map((group) => ({
        value: group.id,
        label: group.name && group.name !== group.id ? `${group.name} (${group.id})` : group.id,
      }))
      if (currentProvider && !options.some((option) => option.value === currentProvider)) {
        options.unshift({ value: currentProvider, label: `${currentProvider}（${TEXT.storedUnavailable}）` })
      }
      return options
    }

    function effortOptions(groups, route) {
      const group = (groups || []).find((entry) => entry.id === route.provider)
      const model =
        group && Array.isArray(group.models) ? group.models.find((entry) => entry.id === route.model) : undefined
      const efforts = model && Array.isArray(model.reasoningEfforts) ? model.reasoningEfforts : []
      const options = [{ value: '', label: TEXT.effortDefault }]
      for (const effort of efforts) options.push({ value: effort, label: effort })
      if (route.reasoningEffort && !options.some((option) => option.value === route.reasoningEffort)) {
        options.push({ value: route.reasoningEffort, label: `${route.reasoningEffort}（${TEXT.storedEffort}）` })
      }
      return options
    }

    function ArbiterCard(props) {
      const { route, groups, onChange, probe, onProbe, testing } = props
      const providers = providerOptions(groups, route.provider)
      const models = modelOptions(groups, route.provider, route.model)
      const efforts = effortOptions(groups, route)
      const providerName = (providers.find((option) => option.value === route.provider) || {}).label || route.provider
      const modelName = (models.find((option) => option.value === route.model) || {}).label || route.model
      const off = route.enabled === false
      const dutyRows = [
        { field: 'briefEnabled', label: TEXT.briefLabel, hint: TEXT.briefHint },
        { field: 'auditEnabled', label: TEXT.auditLabel, hint: TEXT.auditHint },
      ].map((duty) =>
        h(
          'div',
          { className: 'rbm-row', key: duty.field },
          h('span', { className: 'rbm-label' }, duty.label),
          h(
            'label',
            { className: 'rbm-check' },
            h('input', {
              type: 'checkbox',
              checked: route[duty.field] !== false,
              disabled: off,
              onChange: (event) => onChange(duty.field, event.target.checked),
            }),
            h('span', { className: 'rbm-check-box' }),
            h('span', { className: 'rbm-check-text' }, duty.hint),
          ),
        ),
      )

      let probeLine = null
      if (probe !== null && probe !== undefined) {
        if (probe.kind === 'error') {
          probeLine = h('span', { className: 'rbm-status rbm-status-error' }, `${TEXT.testFail}：${probe.text}`)
        } else {
          const parts = [`${TEXT.testOk} · ${(probe.latencyMs / 1000).toFixed(1)}s`]
          if (probe.text) parts.push(`"${probe.text.slice(0, 60)}"`)
          probeLine = h('span', { className: 'rbm-status rbm-status-ok' }, parts.join(' · '))
        }
      }

      return h(
        'section',
        { className: 'rbm-card' + (off ? ' rbm-card-off' : '') },
        h(
          'div',
          { className: 'rbm-card-head' },
          h(
            'div',
            { className: 'rbm-card-title-row' },
            h('div', { className: 'rbm-card-title' }, TEXT.arbiterTitle),
            h(
              'label',
              { className: 'rbm-switch' },
              h('input', {
                type: 'checkbox',
                checked: !off,
                onChange: (event) => onChange('enabled', event.target.checked),
              }),
              h('span', { className: 'rbm-switch-track' }, h('span', { className: 'rbm-switch-thumb' })),
              h('span', { className: 'rbm-switch-label' }, off ? TEXT.disabled : TEXT.enabled),
            ),
          ),
          h('div', { className: 'rbm-card-desc' }, TEXT.arbiterDesc),
          off ? h('div', { className: 'rbm-card-note' }, TEXT.arbiterOff) : null,
        ),
        h(
          'div',
          { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: 'rbm-provider' }, TEXT.provider),
          h(
            'select',
            {
              id: 'rbm-provider',
              className: 'rbm-select',
              value: route.provider,
              disabled: off,
              onChange: (event) => onChange('provider', event.target.value),
            },
            providers.length > 0
              ? providers.map((option) => h('option', { key: option.value, value: option.value }, option.label))
              : h('option', { value: '' }, TEXT.noProvider),
          ),
        ),
        h(
          'div',
          { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: 'rbm-model' }, TEXT.model),
          h(
            'select',
            {
              id: 'rbm-model',
              className: 'rbm-select',
              value: route.model,
              disabled: off,
              onChange: (event) => onChange('model', event.target.value),
            },
            models.length > 0
              ? models.map((option) => h('option', { key: option.value, value: option.value }, option.label))
              : h('option', { value: '' }, TEXT.noModel),
          ),
        ),
        h(
          'div',
          { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: 'rbm-effort' }, TEXT.effort),
          h(
            'select',
            {
              id: 'rbm-effort',
              className: 'rbm-select',
              value: route.reasoningEffort || '',
              disabled: off,
              onChange: (event) => onChange('reasoningEffort', event.target.value),
            },
            efforts.map((option) => h('option', { key: option.value || 'default', value: option.value }, option.label)),
          ),
        ),
        h(
          'div',
          { className: 'rbm-row' },
          h('label', { className: 'rbm-label', htmlFor: 'rbm-timeout' }, TEXT.timeout),
          h(
            'div',
            { className: 'rbm-timeout' },
            h('input', {
              id: 'rbm-timeout',
              className: 'rbm-input',
              type: 'number',
              min: 10,
              max: 3600,
              step: 10,
              value: toSeconds(route.timeoutMs),
              disabled: off,
              onChange: (event) => onChange('timeoutMs', fromSeconds(event.target.value)),
            }),
            h('span', { className: 'rbm-unit' }, TEXT.seconds),
          ),
        ),
        ...dutyRows,
        h(
          'div',
          { className: 'rbm-card-foot' },
          h(
            'button',
            { type: 'button', className: 'rbm-btn rbm-btn-small', disabled: off || testing, onClick: onProbe },
            testing ? TEXT.testing : TEXT.test,
          ),
          probeLine,
        ),
        h(
          'div',
          { className: 'rbm-current' },
          TEXT.current,
          h(
            'code',
            null,
            providerName +
              ' / ' +
              modelName +
              (route.reasoningEffort ? ' / ' + route.reasoningEffort : '') +
              ' / ' +
              toSeconds(route.timeoutMs) +
              TEXT.seconds,
          ),
        ),
      )
    }

    function CrossReviewSettingsPage() {
      const [data, setData] = useState(null)
      const [draft, setDraft] = useState(null)
      const [loading, setLoading] = useState(true)
      const [saving, setSaving] = useState(false)
      const [dirty, setDirty] = useState(false)
      const [error, setError] = useState(null)
      const [status, setStatus] = useState(null)
      const [probe, setProbe] = useState(null)
      const [testing, setTesting] = useState(false)

      async function load(options) {
        const fresh = options !== null && options !== undefined && options.fresh === true
        setLoading(true)
        setError(null)
        try {
          const response = await fetch(`/api/cross-review-config${fresh ? '?fresh=1' : ''}`, {
            credentials: 'same-origin',
          })
          const body = await response.json()
          if (!response.ok || !body.ok) throw new Error(body.error || 'HTTP ' + response.status)
          setData(body)
          setDraft(cloneDraft(body.config))
          setDirty(false)
          setProbe(null)
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

      function onChange(field, value) {
        setStatus(null)
        setDirty(true)
        setDraft((previous) => {
          if (previous === null) return previous
          const next = cloneRoute(previous)
          next[field] = value
          if (field === 'provider') {
            const group = groups.find((entry) => entry.id === value)
            const firstModel = group && Array.isArray(group.models) && group.models.length > 0 ? group.models[0].id : ''
            next.model = firstModel
            next.reasoningEffort = ''
          } else if (field === 'model') {
            next.reasoningEffort = ''
          }
          return next
        })
      }

      async function runProbe() {
        if (draft === null || testing) return
        setTesting(true)
        setProbe(null)
        try {
          const response = await fetch('/api/cross-review-config', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ route: toRoutePayload(draft) }),
          })
          const body = await response.json()
          if (!response.ok || !body.ok) throw new Error(body.error || 'HTTP ' + response.status)
          setProbe({ kind: 'ok', latencyMs: body.probe.latencyMs, text: body.probe.text })
        } catch (probeError) {
          setProbe({
            kind: 'error',
            text: probeError instanceof Error ? probeError.message : String(probeError),
          })
        } finally {
          setTesting(false)
        }
      }

      async function resetDefaults() {
        if (saving) return
        setSaving(true)
        setStatus(null)
        try {
          const response = await fetch('/api/cross-review-config', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'reset' }),
          })
          const body = await response.json()
          if (!response.ok || !body.ok) throw new Error(body.error || 'HTTP ' + response.status)
          setData((previous) => ({ ...previous, config: body.config, persistent: body.persistent }))
          setDraft(cloneDraft(body.config))
          setDirty(false)
          setProbe(null)
          setStatus({ kind: 'ok', text: TEXT.resetDone })
        } catch (resetError) {
          setStatus({
            kind: 'error',
            text: TEXT.resetFail + (resetError instanceof Error ? resetError.message : String(resetError)),
          })
        } finally {
          setSaving(false)
        }
      }

      async function save() {
        if (draft === null || saving) return
        setSaving(true)
        setStatus(null)
        try {
          const response = await fetch('/api/cross-review-config', {
            method: 'PUT',
            credentials: 'same-origin',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ arbiter: toRoutePayload(draft) }),
          })
          const body = await response.json()
          if (!response.ok || !body.ok) throw new Error(body.error || 'HTTP ' + response.status)
          setData((previous) => ({ ...previous, config: body.config, persistent: body.persistent }))
          setDraft(cloneDraft(body.config))
          setDirty(false)
          setStatus({ kind: 'ok', text: body.persistent ? TEXT.saved : TEXT.savedMemory })
        } catch (saveError) {
          setStatus({
            kind: 'error',
            text: TEXT.saveFail + (saveError instanceof Error ? saveError.message : String(saveError)),
          })
        } finally {
          setSaving(false)
        }
      }

      const modelSummary = useMemo(() => {
        if (data === null) return ''
        const count = groups.reduce((total, group) => total + (Array.isArray(group.models) ? group.models.length : 0), 0)
        return ZH ? `${groups.length} 个 provider，${count} 个模型` : `${groups.length} providers, ${count} models`
      }, [data, groups])

      return h(
        'div',
        { className: 'rbm-root' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'rbm-header' },
          h('h1', { className: 'rbm-title' }, TEXT.title),
          h('p', { className: 'rbm-sub' }, TEXT.subtitle),
        ),
        loading ? h('div', { className: 'rbm-empty' }, TEXT.loading) : null,
        error ? h('div', { className: 'rbm-status rbm-status-error' }, TEXT.loadFail + error) : null,
        !loading && error
          ? h('div', { className: 'rbm-footer' }, h('button', { className: 'rbm-btn', onClick: () => load() }, TEXT.retry))
          : null,
        !loading && !error && draft !== null
          ? h(
              React.Fragment,
              null,
              h(ArbiterCard, {
                route: draft,
                groups,
                onChange,
                probe,
                testing,
                onProbe: runProbe,
              }),
              failures.length > 0
                ? h(
                    'div',
                    { className: 'rbm-status rbm-status-muted' },
                    TEXT.partialFail + failures.map((failure) => failure.provider).join('、'),
                  )
                : null,
              h(
                'div',
                { className: 'rbm-footer' },
                h(
                  'button',
                  { className: 'rbm-btn rbm-btn-primary', disabled: saving || !dirty, onClick: save },
                  saving ? TEXT.saving : TEXT.save,
                ),
                h(
                  'button',
                  { className: 'rbm-btn', disabled: saving || loading, onClick: () => load({ fresh: true }) },
                  TEXT.refresh,
                ),
                h('button', { className: 'rbm-btn', disabled: saving || loading, onClick: resetDefaults }, TEXT.reset),
                h(
                  'span',
                  { className: 'rbm-note' },
                  modelSummary + (data && data.persistent === false ? ' · ' + TEXT.storageOff : ''),
                ),
                dirty ? h('span', { className: 'rbm-note' }, TEXT.unsaved) : null,
                status !== null
                  ? h(
                      'span',
                      { className: 'rbm-status ' + (status.kind === 'ok' ? 'rbm-status-ok' : 'rbm-status-error') },
                      status.text,
                    )
                  : null,
              ),
            )
          : null,
        h('div', { className: 'rbm-note' }, TEXT.footer),
      )
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const slots = ctx.get('slots')
        if (slots === undefined || typeof slots.inject !== 'function') return
        try {
          slots.inject('settings.section', () =>
            slots.register(
              {
                name: 'settings.section',
                id: 'cross-review',
                order: 25,
                label: TEXT.title,
              },
              CrossReviewSettingsPage,
            ),
          )
        } catch (error) {
          console.warn('dsh-cross-review: settings section registration failed:', error)
        }
      },
    }
  },
})
