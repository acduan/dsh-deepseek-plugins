import assert from 'node:assert/strict'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const clientUrl = pathToFileURL(path.join(root, '..', 'client.js')).href

/** Load the browser half through the module-loader seam it targets. */
async function loadPlugin() {
  let captured
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry
      },
    },
  }
  await import(clientUrl + '?t=' + Math.random())
  assert.equal(captured.id, '@local/dsh-codex-theme')
  const React = {
    createElement: () => null,
    Fragment: 'Fragment',
    useEffect() {},
    useMemo: (factory) => factory(),
    useRef: (value) => ({ current: value }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const module = captured.factory(() => React)
  return module.internals
}

const api = await loadPlugin()

// ── Preset data ─────────────────────────────────────────────────────────────

test('every preset exposes a label and at least one variant', () => {
  const ids = Object.keys(api.PRESETS)
  assert.ok(ids.length >= 25, `expected the Codex preset list, got ${ids.length}`)
  for (const id of ids) {
    const preset = api.PRESETS[id]
    assert.equal(typeof preset.label, 'string', `${id} has a label`)
    assert.ok(preset.label.length > 0, `${id} label is not empty`)
    assert.ok(preset.light !== undefined || preset.dark !== undefined, `${id} ships a variant`)
  }
})

test('preset colors are valid six-digit hex values', () => {
  for (const id of Object.keys(api.PRESETS)) {
    for (const variant of ['light', 'dark']) {
      if (api.PRESETS[id][variant] === undefined) continue
      const colors = api.presetColors(id, variant)
      for (const key of ['accent', 'ink', 'surface']) {
        assert.match(colors[key], /^#[0-9a-f]{6}$/i, `${id}/${variant}.${key}`)
      }
      assert.ok(colors.contrast >= 0 && colors.contrast <= 100, `${id}/${variant}.contrast`)
    }
  }
})

test('the preset list only offers variants the preset actually ships', () => {
  const lightIds = api.presetIdsFor('light')
  const darkIds = api.presetIdsFor('dark')
  assert.ok(lightIds.includes('absolutely'))
  assert.ok(darkIds.includes('absolutely'))
  assert.ok(!lightIds.includes('dracula'), 'Dracula is dark-only in Codex')
  assert.ok(darkIds.includes('dracula'))
  assert.ok(!darkIds.includes('proof'), 'Proof is light-only in Codex')
  assert.ok(lightIds.includes('proof'))
  // Sorted by display label so the menu reads like Codex's.
  const labels = lightIds.map((id) => api.PRESETS[id].label)
  assert.deepEqual(labels, [...labels].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })))
})

test('a preset missing the requested variant falls back to the Codex default colors', () => {
  const colors = api.presetColors('dracula', 'light')
  assert.equal(colors.surface, '#ffffff')
  assert.equal(colors.accent, '#339cff')
})

test('Absolutely matches the palette shown in the reference screenshot', () => {
  const light = api.presetColors('absolutely', 'light')
  assert.equal(light.accent, '#cc7d5e')
  assert.equal(light.surface, '#f9f9f7')
  assert.equal(light.ink, '#2d2d2b')
  const dark = api.presetColors('absolutely', 'dark')
  assert.equal(dark.surface, '#2d2d2b')
  assert.equal(dark.ink, '#f9f9f7')
})

// ── Color math ──────────────────────────────────────────────────────────────

test('hex parsing accepts both short and long forms and rejects junk', () => {
  assert.deepEqual(api.parseHex('#ffffff'), { red: 255, green: 255, blue: 255 })
  assert.deepEqual(api.parseHex('fff'), { red: 255, green: 255, blue: 255 })
  assert.deepEqual(api.parseHex('#000000'), { red: 0, green: 0, blue: 0 })
  assert.equal(api.parseHex('rgba(0,0,0,1)'), null)
  assert.equal(api.parseHex('#ffff'), null)
  assert.equal(api.parseHex(null), null)
})

test('on-color picks readable ink for both light and dark fills', () => {
  assert.equal(api.toHex(api.onColor(api.parseHex('#ffffff'))), '#000000')
  assert.equal(api.toHex(api.onColor(api.parseHex('#181818'))), '#ffffff')
  // Codex keeps white on its own saturated blue accent rather than switching to black.
  assert.equal(api.toHex(api.onColor(api.parseHex('#339cff'))), '#ffffff')
})

test('contrast normalization keeps the variant baseline neutral and expands both directions', () => {
  assert.equal(api.normalizeContrast(45, 'light'), 0.45)
  assert.equal(api.normalizeContrast(60, 'dark'), 0.6)
  assert.ok(api.normalizeContrast(20, 'light') < 0.45)
  assert.ok(api.normalizeContrast(80, 'light') > 0.45)
  assert.ok(api.normalizeContrast(20, 'dark') < 0.6)
  assert.ok(api.normalizeContrast(90, 'dark') > 0.6)
})

// ── Derivation ──────────────────────────────────────────────────────────────

test('derivation produces a complete palette for both variants', () => {
  for (const variant of ['light', 'dark']) {
    const colors = api.presetColors('absolutely', variant)
    const palette = api.derivePalette(colors, variant)
    assert.equal(palette.variant, variant)
    assert.equal(palette.isLight, variant === 'light')
    for (const key of [
      'surface', 'ink', 'accent', 'surfaceUnder', 'editorBackground', 'panel',
      'onAccent', 'diffAdded', 'diffRemoved', 'border', 'borderLight', 'borderHeavy',
      'textForeground', 'textForegroundSecondary', 'textForegroundTertiary',
      'accentBackground', 'controlBackgroundOpaque', 'elevatedPrimaryOpaque',
    ]) {
      assert.equal(typeof palette[key], 'string', `${variant}.${key}`)
      assert.ok(palette[key].length > 0, `${variant}.${key} is not empty`)
    }
  }
})

test('a darker surface makes dark mode and a lighter one makes light mode', () => {
  const dark = api.derivePalette(api.presetColors('absolutely', 'dark'), 'dark')
  const light = api.derivePalette(api.presetColors('absolutely', 'light'), 'light')
  // The dark canvas is darker than its own ink; the light canvas is lighter.
  assert.ok(dark.surface < dark.ink, 'dark surface sits below its ink')
  assert.ok(light.surface > light.ink, 'light surface sits above its ink')
})

test('raising contrast strengthens borders and secondary text', () => {
  const base = { accent: '#cc7d5e', ink: '#2d2d2b', surface: '#f9f9f7', semantic: {} }
  const low = api.derivePalette({ ...base, contrast: 10 }, 'light')
  const high = api.derivePalette({ ...base, contrast: 90 }, 'light')
  const alpha = (value) => Number(value.match(/rgba\([^)]*,\s*([\d.]+)\)/)[1])
  assert.ok(alpha(high.border) > alpha(low.border), 'border grows with contrast')
  assert.ok(alpha(high.borderHeavy) > alpha(low.borderHeavy), 'heavy border grows with contrast')
  assert.ok(alpha(high.textForegroundTertiary) > alpha(low.textForegroundTertiary), 'tertiary text grows with contrast')
})

test('every preset derives without throwing and keeps its own accent', () => {
  for (const id of Object.keys(api.PRESETS)) {
    for (const variant of ['light', 'dark']) {
      const colors = api.presetColors(id, variant)
      const palette = api.derivePalette(colors, variant)
      assert.equal(palette.accent, colors.accent, `${id}/${variant} keeps its accent`)
      assert.equal(palette.surface, colors.surface, `${id}/${variant} keeps its surface`)
    }
  }
})

test('the semantic diff colors come from the preset, not from a guess', () => {
  const absolutely = api.derivePalette(api.presetColors('absolutely', 'light'), 'light')
  assert.equal(absolutely.diffAdded, '#00c853')
  assert.equal(absolutely.diffRemoved, '#ff5f38')
  const github = api.derivePalette(api.presetColors('github', 'dark'), 'dark')
  assert.equal(github.diffAdded, '#3fb950')
  assert.equal(github.diffRemoved, '#f85149')
})

// ── Token map ───────────────────────────────────────────────────────────────

test('the token map covers the tokens DSH actually paints with', () => {
  const palette = api.derivePalette(api.presetColors('absolutely', 'light'), 'light')
  const tokens = api.buildTokenMap(palette)
  for (const name of [
    '--dsw-alias-bg-base',
    '--dsw-alias-bg-layer-1',
    '--dsw-alias-bg-layer-2',
    '--dsw-alias-bg-overlay',
    '--dsw-alias-border-l1',
    '--dsw-alias-border-l2',
    '--dsw-alias-brand-primary',
    '--dsw-alias-label-primary',
    '--dsw-alias-label-secondary',
    '--dsw-alias-state-error-primary',
    '--dsw-alias-state-idle-primary',
    '--dsw-alias-state-success-primary',
    '--dsw-alias-state-warn-primary',
    '--dsw-specific-sidebar-fill',
    '--dsw-alias-button-info-fill',
    '--dsw-alias-label-on-color',
    '--dsw-specific-menu',
    '--dsw-alias-markdown-code-block',
  ]) {
    assert.equal(typeof tokens[name], 'string', `${name} is mapped`)
    assert.ok(tokens[name].length > 0, `${name} is not empty`)
  }
})

test('the canvas token is the preset surface, so the app matches the theme', () => {
  for (const id of ['absolutely', 'github', 'nord', 'solarized']) {
    for (const variant of ['light', 'dark']) {
      if (api.PRESETS[id][variant] === undefined) continue
      const palette = api.derivePalette(api.presetColors(id, variant), variant)
      const tokens = api.buildTokenMap(palette)
      assert.equal(tokens['--dsw-alias-bg-base'], api.presetColors(id, variant).surface, `${id}/${variant} canvas`)
    }
  }
})

test('mapped values are all valid CSS colors', () => {
  const palette = api.derivePalette(api.presetColors('catppuccin', 'dark'), 'dark')
  const tokens = api.buildTokenMap(palette)
  for (const [name, value] of Object.entries(tokens)) {
    const ok =
      /^#[0-9a-f]{3,8}$/i.test(value) ||
      /^rgba?\([\d\s,.]+\)$/.test(value) ||
      /^transparent$/.test(value)
    assert.ok(ok, `${name} is a CSS color, got ${value}`)
  }
})

// ── Override layer ──────────────────────────────────────────────────────────

test('every override is a light/dark pair, as the theme service requires', () => {
  const overrides = api.buildOverrides(api.defaultState())
  const names = Object.keys(overrides)
  assert.ok(names.length > 80, `expected a broad token layer, got ${names.length}`)
  for (const name of names) {
    const pair = overrides[name]
    assert.equal(typeof pair, 'object', `${name} is a pair`)
    assert.equal(typeof pair.light, 'string', `${name}.light`)
    assert.equal(typeof pair.dark, 'string', `${name}.dark`)
    assert.ok(pair.light.length > 0 && pair.dark.length > 0, `${name} has both modes`)
  }
})

test('light and dark layers differ, so switching mode repaints', () => {
  const overrides = api.buildOverrides(api.defaultState())
  assert.notEqual(overrides['--dsw-alias-bg-base'].light, overrides['--dsw-alias-bg-base'].dark)
  assert.notEqual(overrides['--dsw-alias-label-primary'].light, overrides['--dsw-alias-label-primary'].dark)
})

test('font tokens appear only when a font is set, and are normalized', () => {
  const plain = api.buildOverrides(api.defaultState())
  assert.equal(plain['--dsw-font-family'], undefined)
  assert.equal(plain['--ds-font-family-code'], undefined)

  const state = api.defaultState()
  state.fontText = 'Inter, system-ui'
  state.fontCode = 'JetBrains Mono'
  const fonts = api.buildOverrides(state)
  assert.equal(fonts['--dsw-font-family'].light, '"Inter", system-ui')
  assert.equal(fonts['--dsw-font-family'].dark, '"Inter", system-ui')
  assert.equal(fonts['--ds-font-family-code'].light, '"JetBrains Mono"')
})

test('font normalization drops quotes and control characters and keeps generics bare', () => {
  assert.equal(api.normalizeFontFamily('"Inter"'), '"Inter"')
  assert.equal(api.normalizeFontFamily('Inter,monospace'), '"Inter", monospace')
  assert.equal(api.normalizeFontFamily('  '), '')
  assert.equal(api.normalizeFontFamily(null), '')
  assert.equal(api.normalizeFontFamily('a<b>c'), '"abc"')
})

// ── State ───────────────────────────────────────────────────────────────────

test('the default state uses Absolutely for both modes', () => {
  const state = api.defaultState()
  assert.equal(state.mode, 'system')
  assert.equal(state.light.preset, api.DEFAULT_PRESET)
  assert.equal(state.dark.preset, api.DEFAULT_PRESET)
  assert.equal(state.light.surface, '#f9f9f7')
  assert.equal(state.dark.surface, '#2d2d2b')
  assert.equal(state.fontText, '')
  assert.equal(state.fontCode, '')
})

test('stored state is repaired rather than trusted', () => {
  const repaired = api.normalizeState({
    mode: 'nonsense',
    light: { preset: 'not-a-preset', accent: 'red', ink: '#ABCDEF', surface: '#fff', contrast: 999 },
    dark: 'garbage',
    fontText: 42,
  })
  assert.equal(repaired.mode, 'system', 'unknown mode falls back')
  assert.equal(repaired.light.preset, api.DEFAULT_PRESET, 'unknown preset falls back')
  assert.equal(repaired.light.accent, api.defaultState().light.accent, 'invalid hex falls back')
  assert.equal(repaired.light.ink, '#abcdef', 'valid hex is normalized to lowercase')
  assert.equal(repaired.light.contrast, 100, 'contrast is clamped')
  assert.equal(repaired.dark.preset, api.DEFAULT_PRESET, 'a non-object variant falls back whole')
  assert.equal(repaired.fontText, '', 'a non-string font falls back')
})

test('a missing or corrupt stored value still yields a usable state', () => {
  for (const value of [null, undefined, 42, 'text', [], { light: null }]) {
    const state = api.normalizeState(value)
    assert.equal(state.mode, 'system')
    assert.equal(state.light.preset, api.DEFAULT_PRESET)
  }
})

test('round-tripping a state through normalization is stable', () => {
  const state = api.defaultState()
  state.mode = 'dark'
  state.light.accent = '#123456'
  state.dark.contrast = 72
  state.fontText = 'Inter'
  const once = api.normalizeState(JSON.parse(JSON.stringify(state)))
  const twice = api.normalizeState(JSON.parse(JSON.stringify(once)))
  assert.deepEqual(twice, once)
})

// ── Registration ────────────────────────────────────────────────────────────

test('the client half declares its services and registers a settings section', async () => {
  let captured
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry
      },
    },
  }
  await import(clientUrl + '?t=' + Math.random())
  const React = {
    createElement: () => null,
    Fragment: 'Fragment',
    useEffect() {},
    useMemo: (factory) => factory(),
    useRef: (value) => ({ current: value }),
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
  }
  const module = captured.factory(() => React)
  assert.deepEqual(module.inject, ['slots', 'theme'])
  assert.equal(typeof module.apply, 'function')

  const registrations = []
  const layers = []
  const effects = []
  const ctx = {
    get: (key) => {
      if (key === 'slots') {
        return {
          inject: (_name, fn) => fn(),
          register: (meta, component) => registrations.push({ meta, component }),
        }
      }
      if (key === 'theme') {
        return {
          getTheme: () => ({ preference: 'light', colorScheme: 'light' }),
          setTheme: () => {},
          overrideTokens: (source, tokens) => {
            layers.push({ source, tokens })
            return () => {}
          },
        }
      }
      return undefined
    },
    on: () => () => {},
    effect: (fn) => effects.push(fn),
  }
  module.apply(ctx)

  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].meta.name, 'settings.section')
  assert.equal(registrations[0].meta.id, 'codex-theme')
  assert.equal(typeof registrations[0].component, 'function')

  assert.equal(layers.length, 1, 'the token layer is installed on apply')
  assert.equal(layers[0].source, '@local/dsh-codex-theme')
  assert.ok(Object.keys(layers[0].tokens).length > 80)
  assert.equal(typeof effects[0], 'function', 'the token layer is owned by an effect')
})

test('apply stays inert when the theme service is missing', () => {
  const module = (() => {
    let captured
    globalThis.window = { __ModuleLoader__: { load: (entry) => { captured = entry } } }
    return captured
  })()
  void module
  let applied = false
  const ctx = {
    get: (key) => (key === 'slots' ? undefined : undefined),
    on: () => () => {},
    effect: () => { applied = true },
  }
  // Reload through the loader seam to get the factory.
  return (async () => {
    let captured
    globalThis.window = { __ModuleLoader__: { load: (entry) => { captured = entry } } }
    await import(clientUrl + '?t=' + Math.random())
    const React = { createElement: () => null, Fragment: 'Fragment', useEffect() {}, useMemo: (f) => f(), useRef: () => ({ current: null }), useState: (v) => [v, () => {}] }
    const mod = captured.factory(() => React)
    mod.apply(ctx)
    assert.equal(applied, false, 'no token layer is created without the theme service')
  })()
})
