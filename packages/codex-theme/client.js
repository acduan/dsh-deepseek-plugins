// @local/dsh-codex-theme/client
//
// Codex appearance for DSH.
//
// Codex Desktop exposes four appearance controls: mode, theme preset, accent,
// surface (background), ink (foreground), plus contrast and fonts. A preset is
// only three colors (accent / ink / surface); every other surface, border, and
// text tone in the app is derived from them by one algorithm, and `contrast`
// is the single dial that pushes that derivation.
//
// This plugin ports that algorithm (see derivePalette below, a direct
// translation of Codex's own palette derivation) and maps its output onto every
// --dsw-alias-* / --dsw-specific-* token DSH uses. The preset table is Codex's
// own, taken from the installed Codex build, so a preset here is the same three
// colors Codex uses for the same preset name.
//
// The plugin never writes host settings for colors: they are applied through
// ctx.theme.overrideTokens, which stacks a reversible token layer. Only the
// light/dark/system preference goes through ctx.theme.setTheme (the one
// documented preference write).

window.__ModuleLoader__.load({
  id: '@local/dsh-codex-theme',
  factory(require) {
    'use strict'

    const React = require('react')
    const h = React.createElement
    const { useEffect, useRef, useState } = React

    const PLUGIN_ID = '@local/dsh-codex-theme'
    const SETTINGS_STORE = 'codex-appearance-v1'
    const OVERRIDE_SOURCE = PLUGIN_ID

    // ---- Codex preset table -------------------------------------------------
    // Transcribed from the installed Codex build. Each entry holds the variants
    // Codex actually ships (some presets are dark-only or light-only).
    const PRESETS = {
      absolutely: {
        label: 'Absolutely',
        light: { accent: '#cc7d5e', ink: '#2d2d2b', surface: '#f9f9f7', semantic: { diffAdded: '#00c853', diffRemoved: '#ff5f38' } },
        dark: { accent: '#cc7d5e', ink: '#f9f9f7', surface: '#2d2d2b', semantic: { diffAdded: '#00c853', diffRemoved: '#ff5f38' } },
      },
      ayu: {
        label: 'Ayu',
        dark: { accent: '#e6b450', ink: '#bfbdb6', surface: '#10141c', semantic: { diffAdded: '#70bf56', diffRemoved: '#f26d78' } },
      },
      catppuccin: {
        label: 'Catppuccin',
        light: {
          accent: '#8839ef', ink: '#4c4f69', surface: '#eff1f5',
          semantic: { diffAdded: '#40a02b', diffRemoved: '#d20f39' },
          palette: { blue: '#1e66f5', green: '#40a02b', orange: '#fe640b', purple: '#8839ef', red: '#d20f39', yellow: '#df8e1d' },
        },
        dark: {
          accent: '#cba6f7', ink: '#cdd6f4', surface: '#1e1e2e',
          semantic: { diffAdded: '#a6e3a1', diffRemoved: '#f38ba8' },
          palette: { blue: '#89b4fa', green: '#a6e3a1', orange: '#fab387', purple: '#cba6f7', red: '#f38ba8', yellow: '#f9e2af' },
        },
      },
      codex: {
        label: 'Codex',
        light: { accent: '#339cff', ink: '#1a1c1f', surface: '#ffffff', semantic: { diffAdded: '#00a240', diffRemoved: '#ba2623' } },
        dark: { accent: '#339cff', ink: '#ffffff', surface: '#181818', semantic: { diffAdded: '#40c977', diffRemoved: '#fa423e' } },
      },
      dracula: {
        label: 'Dracula',
        dark: { accent: '#ff79c6', ink: '#f8f8f2', surface: '#282a36', semantic: { diffAdded: '#50fa7b', diffRemoved: '#ff5555' } },
      },
      everforest: {
        label: 'Everforest',
        light: {
          accent: '#93b259', ink: '#5c6a72', surface: '#fdf6e3',
          semantic: { diffAdded: '#8da101', diffRemoved: '#f85552' },
          palette: { blue: '#3a94c5', green: '#8da101', orange: '#f57d26', purple: '#df69ba', red: '#f85552', yellow: '#dfa000' },
        },
        dark: {
          accent: '#a7c080', ink: '#d3c6aa', surface: '#2d353b',
          semantic: { diffAdded: '#a7c080', diffRemoved: '#e67e80' },
          palette: { blue: '#7fbbb3', green: '#a7c080', orange: '#e69875', purple: '#d699b6', red: '#e67e80', yellow: '#dbbc7f' },
        },
      },
      github: {
        label: 'GitHub',
        light: { accent: '#0969da', ink: '#1f2328', surface: '#ffffff', semantic: { diffAdded: '#1a7f37', diffRemoved: '#cf222e' } },
        dark: { accent: '#1f6feb', ink: '#e6edf3', surface: '#0d1117', semantic: { diffAdded: '#3fb950', diffRemoved: '#f85149' } },
      },
      gruvbox: {
        label: 'Gruvbox',
        light: { accent: '#458588', ink: '#3c3836', surface: '#fbf1c7', semantic: { diffAdded: '#3c3836', diffRemoved: '#cc241d' } },
        dark: { accent: '#458588', ink: '#ebdbb2', surface: '#282828', semantic: { diffAdded: '#ebdbb2', diffRemoved: '#cc241d' } },
      },
      linear: {
        label: 'Linear',
        light: { accent: '#5e6ad2', ink: '#1b1b1b', surface: '#fcfcfd', semantic: { diffAdded: '#52a450', diffRemoved: '#c94446' }, font: 'Inter' },
        dark: { accent: '#606acc', ink: '#e3e4e6', surface: '#0f0f11', semantic: { diffAdded: '#69c967', diffRemoved: '#ff7e78' }, font: 'Inter' },
      },
      lobster: {
        label: 'Lobster',
        dark: { accent: '#ff5c5c', ink: '#e4e4e7', surface: '#111827', semantic: { diffAdded: '#22c55e', diffRemoved: '#ff5c5c' }, font: 'Satoshi' },
      },
      material: {
        label: 'Material',
        dark: { accent: '#80cbc4', ink: '#eeffff', surface: '#212121', semantic: { diffAdded: '#c3e88d', diffRemoved: '#f07178' } },
      },
      matrix: {
        label: 'Matrix',
        dark: { accent: '#1eff5a', ink: '#b8ffca', surface: '#040805', semantic: { diffAdded: '#1eff5a', diffRemoved: '#ff5f38' } },
      },
      monokai: {
        label: 'Monokai',
        dark: { accent: '#99947c', ink: '#f8f8f2', surface: '#272822', semantic: { diffAdded: '#86b42b', diffRemoved: '#c4265e' } },
      },
      'night-owl': {
        label: 'Night Owl',
        dark: { accent: '#44596b', ink: '#d6deeb', surface: '#011627', semantic: { diffAdded: '#c5e478', diffRemoved: '#ef5350' } },
      },
      nord: {
        label: 'Nord',
        dark: {
          accent: '#88c0d0', ink: '#d8dee9', surface: '#2e3440',
          semantic: { diffAdded: '#a3be8c', diffRemoved: '#bf616a' },
          palette: { blue: '#81a1c1', green: '#a3be8c', orange: '#d08770', purple: '#b48ead', red: '#bf616a', yellow: '#ebcb8b' },
        },
      },
      notion: {
        label: 'Notion',
        light: { accent: '#3183d8', ink: '#37352f', surface: '#ffffff', semantic: { diffAdded: '#008000', diffRemoved: '#a31515' } },
        dark: { accent: '#3183d8', ink: '#d9d9d8', surface: '#191919', semantic: { diffAdded: '#4ec9b0', diffRemoved: '#ff5f38' } },
      },
      og: {
        label: 'OG',
        dark: { accent: '#10a37f', ink: '#d1d5db', surface: '#343541', semantic: { diffAdded: '#65c99a', diffRemoved: '#f28b82' }, font: 'Arial' },
      },
      one: {
        label: 'One',
        light: { accent: '#526fff', ink: '#383a42', surface: '#fafafa', semantic: { diffAdded: '#3bba54', diffRemoved: '#e45649' } },
        dark: { accent: '#4d78cc', ink: '#abb2bf', surface: '#282c34', semantic: { diffAdded: '#8cc265', diffRemoved: '#e05561' } },
      },
      oscurange: {
        label: 'Oscurange',
        dark: { accent: '#f9b98c', ink: '#e6e6e6', surface: '#0b0b0f', semantic: { diffAdded: '#40c977', diffRemoved: '#fa423e' } },
      },
      proof: {
        label: 'Proof',
        light: { accent: '#3d755d', ink: '#2f312d', surface: '#f5f3ed', semantic: { diffAdded: '#3d755d', diffRemoved: '#ff5f38' } },
      },
      raycast: {
        label: 'Raycast',
        light: { accent: '#ff6363', ink: '#030303', surface: '#ffffff', semantic: { diffAdded: '#006b4f', diffRemoved: '#b12424' }, font: 'Inter' },
        dark: { accent: '#ff6363', ink: '#fefefe', surface: '#101010', semantic: { diffAdded: '#59d499', diffRemoved: '#ff6363' }, font: 'Inter' },
      },
      'rose-pine': {
        label: 'Rose Pine',
        light: {
          accent: '#d7827e', ink: '#575279', surface: '#faf4ed',
          semantic: { diffAdded: '#56949f', diffRemoved: '#797593' },
          palette: { blue: '#56949f', green: '#286983', orange: '#d7827e', purple: '#907aa9', red: '#b4637a', yellow: '#ea9d34' },
        },
        dark: {
          accent: '#ea9a97', ink: '#e0def4', surface: '#232136',
          semantic: { diffAdded: '#9ccfd8', diffRemoved: '#908caa' },
          palette: { blue: '#9ccfd8', green: '#3e8fb0', orange: '#ea9a97', purple: '#c4a7e7', red: '#eb6f92', yellow: '#f6c177' },
        },
      },
      sentry: {
        label: 'Sentry',
        dark: { accent: '#7055f6', ink: '#e6dff9', surface: '#2d2935', semantic: { diffAdded: '#8ee6d7', diffRemoved: '#ff5f38' } },
      },
      solarized: {
        label: 'Solarized',
        light: { accent: '#b58900', ink: '#657b83', surface: '#fdf6e3', semantic: { diffAdded: '#859900', diffRemoved: '#dc322f' } },
        dark: { accent: '#d30102', ink: '#839496', surface: '#002b36', semantic: { diffAdded: '#859900', diffRemoved: '#dc322f' } },
      },
      temple: {
        label: 'Temple',
        dark: { accent: '#e4f222', ink: '#c7e6da', surface: '#02120c', semantic: { diffAdded: '#40c977', diffRemoved: '#fa423e' } },
      },
      'tokyo-night': {
        label: 'Tokyo Night',
        dark: {
          accent: '#3d59a1', ink: '#a9b1d6', surface: '#1a1b26',
          semantic: { diffAdded: '#449dab', diffRemoved: '#914c54' },
          palette: { blue: '#7aa2f7', green: '#41a6b5', orange: '#ff9e64', purple: '#9d7cd8', red: '#f7768e', yellow: '#e0af68' },
        },
      },
      vercel: {
        label: 'Vercel',
        light: { accent: '#006aff', ink: '#171717', surface: '#ffffff', contrast: 40, semantic: { diffAdded: '#28A948', diffRemoved: '#EB001D' } },
        dark: { accent: '#006efe', ink: '#ededed', surface: '#000000', contrast: 50, semantic: { diffAdded: '#00AD3A', diffRemoved: '#F13342' } },
      },
      'vscode-plus': {
        label: 'VS Code Plus',
        light: { accent: '#007acc', ink: '#000000', surface: '#ffffff', semantic: { diffAdded: '#008000', diffRemoved: '#ee0000' } },
        dark: { accent: '#007acc', ink: '#d4d4d4', surface: '#1e1e1e', semantic: { diffAdded: '#369432', diffRemoved: '#f44747' } },
      },
      xcode: {
        label: 'Xcode',
        light: { accent: '#0e0eff', ink: '#000000', surface: '#ffffff', semantic: { diffAdded: '#00a240', diffRemoved: '#c41a16' } },
        dark: { accent: '#5482ff', ink: '#ffffff', surface: '#1f1f24', semantic: { diffAdded: '#67b7a4', diffRemoved: '#fc6a5d' } },
      },
    }

    // Codex's own defaults for a variant, used when a preset lacks that variant.
    const VARIANT_DEFAULT = {
      light: { accent: '#339cff', ink: '#1a1c1f', surface: '#ffffff', contrast: 45, semantic: { diffAdded: '#00a240', diffRemoved: '#ba2623' } },
      dark: { accent: '#339cff', ink: '#ffffff', surface: '#181818', contrast: 60, semantic: { diffAdded: '#40c977', diffRemoved: '#fa423e' } },
    }

    // The reference screenshots show Codex running Absolutely, so that is the
    // shipped default and what "reset" restores.
    const DEFAULT_PRESET = 'absolutely'

    const collator = new Intl.Collator(undefined, { sensitivity: 'base' })
    const PRESET_IDS = Object.keys(PRESETS).sort((a, b) => collator.compare(PRESETS[a].label, PRESETS[b].label))

    /** Preset ids that ship the given variant, in label order. */
    function presetIdsFor(variant) {
      return PRESET_IDS.filter((id) => PRESETS[id][variant] !== undefined)
    }

    /** Resolve one variant's three colors, falling back to the variant default. */
    function presetColors(presetId, variant) {
      const preset = PRESETS[presetId]
      const variantColors = preset === undefined ? undefined : preset[variant]
      const base = variantColors === undefined ? VARIANT_DEFAULT[variant] : variantColors
      return {
        preset: presetId,
        accent: base.accent,
        ink: base.ink,
        surface: base.surface,
        contrast: typeof base.contrast === 'number' ? base.contrast : variant === 'light' ? 45 : 60,
        semantic: base.semantic === undefined ? VARIANT_DEFAULT[variant].semantic : base.semantic,
        palette: base.palette === undefined ? {} : base.palette,
        font: base.font === undefined ? '' : base.font,
      }
    }

    // ---- Color math (ported from Codex) ------------------------------------
    const WHITE = { red: 255, green: 255, blue: 255 }
    const BLACK = { red: 0, green: 0, blue: 0 }

    function clamp(value, min, max) {
      return Math.min(max, Math.max(min, value))
    }

    /** Parse #rgb or #rrggbb; returns null for anything else. */
    function parseHex(value) {
      if (typeof value !== 'string') return null
      const text = value.trim().replace(/^#/, '')
      if (!/^[0-9a-fA-F]{3}$/.test(text) && !/^[0-9a-fA-F]{6}$/.test(text)) return null
      const full = text.length === 3 ? text.split('').map((ch) => ch + ch).join('') : text
      return {
        red: parseInt(full.slice(0, 2), 16),
        green: parseInt(full.slice(2, 4), 16),
        blue: parseInt(full.slice(4, 6), 16),
      }
    }

    function toHex(color) {
      const part = (value) => Math.round(value).toString(16).padStart(2, '0')
      return '#' + part(color.red) + part(color.green) + part(color.blue)
    }

    /** rgb(r, g, b) exactly as Codex emits it. */
    function rgbString(color) {
      return 'rgb(' + color.red + ', ' + color.green + ', ' + color.blue + ')'
    }

    /**
     * rgba(r, g, b, a) with Codex's alpha formatting: three decimals, then
     * trailing zeros and a trailing dot stripped, so 0.5 prints as 0.5.
     */
    function rgbaString(color, alpha) {
      const text = clamp(alpha, 0, 1).toFixed(3).replace(/0+$/, '').replace(/\.$/, '')
      return 'rgba(' + color.red + ', ' + color.green + ', ' + color.blue + ', ' + text + ')'
    }

    /** Linear channel blend with Codex's final rounding. */
    function mix(from, to, amount) {
      const t = clamp(amount, 0, 1)
      const channel = (a, b) => Math.round(a + (b - a) * t)
      return { red: channel(from.red, to.red), green: channel(from.green, to.green), blue: channel(from.blue, to.blue) }
    }

    /** Opaque #rrggbb of a blend, matching Codex's g() helper. */
    function mixHex(from, to, amount) {
      return toHex(mix(from, to, amount))
    }

    function channelLuminance(value) {
      const v = value / 255
      return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }

    function luminance(color) {
      return 0.2126 * channelLuminance(color.red) + 0.7152 * channelLuminance(color.green) + 0.0722 * channelLuminance(color.blue)
    }

    /**
     * Pick black or white ink for a fill. Codex keeps white on the saturated
     * blues it ships (its own accent family) even when luminance would say
     * otherwise, so the same two hue windows are honoured here.
     */
    function onColor(color) {
      if (color.blue > color.red && color.blue > color.green) {
        const spread = color.blue - Math.min(color.red, color.green)
        const hue = ((color.red - color.green) / spread + 4) * 60
        const saturatedBlue = spread / color.blue >= 0.8 && hue >= 205 && hue <= 212
        const lighterBlue = spread / color.blue >= 0.6 && hue >= 218 && hue <= 233 && luminance(color) <= 0.21
        if (saturatedBlue || lighterBlue) return WHITE
      }
      return luminance(color) > 0.179 ? BLACK : WHITE
    }

    /**
     * Codex's contrast normalization: raw 0-100 becomes a multiplier around the
     * variant's own default, so "contrast 45" on light and "contrast 60" on dark
     * both mean "as shipped", and values on either side push every derived
     * alpha proportionally (clamped later by mix/rgba).
     */
    function normalizeContrast(raw, variant) {
      const baseline = variant === 'light' ? 45 : 60
      const below = raw <= baseline
      const shifted = raw / 100 + ((raw - baseline) / 60) * 0.7
      return below ? shifted : baseline / 100 + (shifted - baseline / 100) * 2
    }

    /**
     * Derive the full palette for one variant from its three base colors.
     * This is a direct translation of Codex's derivation: every value below is
     * a blend of surface, ink, and accent at an alpha that contrast scales,
     * which is why one theme name yields a coherent whole app.
     */
    function derivePalette(state, variant) {
      const light = variant === 'light'
      const surface = parseHex(state.surface) || parseHex(VARIANT_DEFAULT[variant].surface)
      const ink = parseHex(state.ink) || parseHex(VARIANT_DEFAULT[variant].ink)
      const accent = parseHex(state.accent) || parseHex(VARIANT_DEFAULT[variant].accent)
      const rawContrast = typeof state.contrast === 'number' ? clamp(state.contrast, 0, 100) : light ? 45 : 60
      const c = normalizeContrast(rawContrast, variant)

      // Editor canvas and the recessed tone the sidebar and action bar sit on.
      const editorBackground = light ? mix(surface, WHITE, 0.12) : mix(surface, ink, 0.07)
      const underAlpha = (light ? 0.04 : 0.16) + (rawContrast - (light ? 45 : 60)) * (light ? 0.0012 : 0.0015)
      const surfaceUnder = light ? mix(surface, ink, underAlpha) : mix(surface, BLACK, underAlpha)
      // Large panel wash (Codex's --color-background-panel).
      const panel = mix(surface, light ? WHITE : ink, (light ? 0.18 : 0.03) + rawContrast * (light ? 0.008 : 0.03))

      let tokens
      if (light) {
        const controlBase = mix(surface, WHITE, 0.09 + 0.04 * c)
        const elevatedSecondaryBase = mix(surface, WHITE, 0.08 + 0.08 * c)
        const elevatedPrimaryBase = mix(surface, WHITE, 0.16 + 0.12 * c)
        const secondaryAlpha = 0.04 + 0.02 * c
        tokens = {
          accentBackground: mixHex(surface, accent, 0.11 + 0.04 * c),
          accentBackgroundActive: mixHex(surface, accent, 0.13 + 0.05 * c),
          accentBackgroundHover: mixHex(surface, accent, 0.12 + 0.045 * c),
          border: rgbaString(ink, 0.06 + 0.04 * c),
          borderFocus: toHex(accent),
          borderHeavy: rgbaString(ink, 0.09 + 0.06 * c),
          borderLight: rgbaString(ink, 0.04 + 0.02 * c),
          buttonPrimaryBackground: toHex(ink),
          buttonPrimaryBackgroundActive: rgbaString(ink, 0.1 + 0.12 * c),
          buttonPrimaryBackgroundHover: rgbaString(ink, 0.05 + 0.06 * c),
          buttonPrimaryBackgroundInactive: rgbaString(ink, 0.18 + 0.14 * c),
          buttonSecondaryBackground: rgbaString(ink, secondaryAlpha),
          buttonSecondaryBackgroundActive: rgbaString(ink, 0.03 + 0.02 * c),
          buttonSecondaryBackgroundHover: rgbaString(ink, 0.04 + 0.03 * c),
          buttonSecondaryBackgroundInactive: rgbaString(ink, 0.01 + 0.02 * c),
          buttonTertiaryBackground: rgbaString(ink, 0),
          buttonTertiaryBackgroundActive: rgbaString(ink, 0.16 + 0.08 * c),
          buttonTertiaryBackgroundHover: rgbaString(ink, 0.08 + 0.04 * c),
          controlBackground: rgbaString(controlBase, 0.96),
          controlBackgroundOpaque: rgbString(controlBase),
          elevatedPrimary: rgbaString(elevatedPrimaryBase, 0.96),
          elevatedPrimaryOpaque: rgbString(elevatedPrimaryBase),
          elevatedSecondary: rgbaString(elevatedSecondaryBase, 0.96),
          elevatedSecondaryOpaque: rgbString(elevatedSecondaryBase),
          elevatedTertiaryOpaque: mixHex(elevatedSecondaryBase, ink, secondaryAlpha),
          iconAccent: toHex(accent),
          iconPrimary: toHex(ink),
          iconSecondary: rgbaString(ink, 0.65 + 0.1 * c),
          iconTertiary: rgbaString(ink, 0.45 + 0.1 * c),
          simpleScrim: rgbaString(BLACK, 0.08 + 0.04 * c),
          textAccent: toHex(accent),
          textButtonPrimary: toHex(surface),
          textButtonSecondary: toHex(ink),
          textButtonTertiary: rgbaString(ink, 0.45 + 0.1 * c),
          textForeground: toHex(ink),
          textForegroundSecondary: rgbaString(ink, 0.65 + 0.1 * c),
          textForegroundTertiary: rgbaString(ink, 0.45 + 0.1 * c),
        }
      } else {
        const controlBase = mix(surface, ink, 0.06 + 0.05 * c)
        const accentBright = mix(accent, WHITE, 0.3 + 0.15 * c)
        const primaryBase = mix(surface, BLACK, 0.38 + 0.12 * c)
        const elevatedPrimaryBase = mix(surface, ink, 0.08 + 0.08 * c)
        tokens = {
          accentBackground: mixHex(BLACK, accent, 0.2 + 0.08 * c),
          accentBackgroundActive: mixHex(BLACK, accent, 0.22 + 0.12 * c),
          accentBackgroundHover: mixHex(BLACK, accent, 0.21 + 0.1 * c),
          border: rgbaString(ink, 0.06 + 0.04 * c),
          borderFocus: rgbaString(accentBright, 0.7 + 0.1 * c),
          borderHeavy: rgbaString(ink, 0.12 + 0.06 * c),
          borderLight: rgbaString(ink, 0.03 + 0.02 * c),
          buttonPrimaryBackground: rgbString(primaryBase),
          buttonPrimaryBackgroundActive: rgbaString(ink, 0.07 + 0.05 * c),
          buttonPrimaryBackgroundHover: rgbaString(ink, 0.04 + 0.03 * c),
          buttonPrimaryBackgroundInactive: rgbaString(ink, 0.02 + 0.02 * c),
          buttonSecondaryBackground: rgbaString(ink, 0.04 + 0.02 * c),
          buttonSecondaryBackgroundActive: rgbaString(ink, 0.09 + 0.05 * c),
          buttonSecondaryBackgroundHover: rgbaString(ink, 0.06 + 0.03 * c),
          buttonSecondaryBackgroundInactive: rgbaString(ink, 0.02 + 0.03 * c),
          buttonTertiaryBackground: rgbaString(ink, 0.02 + 0.015 * c),
          buttonTertiaryBackgroundActive: rgbaString(ink, 0.07 + 0.05 * c),
          buttonTertiaryBackgroundHover: rgbaString(ink, 0.05 + 0.03 * c),
          controlBackground: rgbaString(controlBase, 0.96),
          controlBackgroundOpaque: rgbString(controlBase),
          elevatedPrimary: rgbaString(elevatedPrimaryBase, 0.96),
          elevatedPrimaryOpaque: rgbString(elevatedPrimaryBase),
          elevatedSecondary: rgbaString(ink, 0.02 + 0.02 * c),
          elevatedSecondaryOpaque: mixHex(surface, ink, 0.04 + 0.05 * c),
          elevatedTertiaryOpaque: rgbString(editorBackground),
          iconAccent: rgbString(accentBright),
          iconPrimary: rgbaString(ink, 0.82 + 0.14 * c),
          iconSecondary: rgbaString(ink, 0.65 + 0.1 * c),
          iconTertiary: rgbaString(ink, 0.45 + 0.1 * c),
          simpleScrim: rgbaString(ink, 0.08 + 0.04 * c),
          textAccent: rgbString(accentBright),
          textButtonPrimary: rgbString(primaryBase),
          textButtonSecondary: mixHex(ink, surface, 0.7 + 0.1 * c),
          textButtonTertiary: rgbaString(ink, 0.45 + 0.1 * c),
          textForeground: toHex(ink),
          textForegroundSecondary: rgbaString(ink, 0.65 + 0.1 * c),
          textForegroundTertiary: rgbaString(ink, 0.42 + 0.13 * c),
        }
      }

      const diffAdded = parseHex(state.semantic && state.semantic.diffAdded) || parseHex(VARIANT_DEFAULT[variant].semantic.diffAdded)
      const diffRemoved = parseHex(state.semantic && state.semantic.diffRemoved) || parseHex(VARIANT_DEFAULT[variant].semantic.diffRemoved)
      const palette = state.palette === undefined ? {} : state.palette
      const warn = parseHex(palette.yellow) || parseHex(light ? '#b26a00' : '#e5c07b')
      const done = parseHex(palette.purple) || accent
      const info = parseHex(palette.blue) || accent

      return Object.assign(
        {
          variant,
          rawContrast,
          surface: toHex(surface),
          ink: toHex(ink),
          accent: toHex(accent),
          surfaceUnder: toHex(surfaceUnder),
          editorBackground: toHex(editorBackground),
          panel: toHex(panel),
          onAccent: toHex(onColor(accent)),
          diffAdded: toHex(diffAdded),
          diffRemoved: toHex(diffRemoved),
          warn: toHex(warn),
          done: toHex(done),
          info: toHex(info),
          isLight: light,
        },
        tokens,
      )
    }

    /**
     * Map one derived palette onto DSH's semantic tokens. Codex names its own
     * surfaces (surface / elevated-* / control / border-*); DSH names the roles
     * they are used for, so the table below is the join between the two.
     */
    function buildTokenMap(p) {
      const softInk = (alpha) => rgbaString(parseHex(p.ink), alpha)
      return {
        // Canvas and raised surfaces.
        '--dsw-alias-bg-base': p.surface,
        '--dsw-alias-bg-layer-1': p.surface,
        '--dsw-alias-bg-layer-2': p.elevatedPrimaryOpaque,
        '--dsw-alias-bg-layer-3': p.elevatedSecondaryOpaque,
        '--dsw-alias-bg-overlay': p.elevatedSecondaryOpaque,
        '--dsw-alias-bg-module-platform': p.panel,
        '--dsw-alias-bg-multi-select': p.controlBackgroundOpaque,
        '--dsw-alias-bg-skeleton': p.buttonSecondaryBackground,
        '--dsw-alias-bg-document-preview': p.surfaceUnder,
        '--dsw-alias-bg-document-selection': rgbaString(parseHex(p.accent), 0.4),
        '--dsw-alias-label-document-preview': p.textForegroundSecondary,
        '--dsw-alias-bg-mask-1': p.isLight ? 'rgba(0, 0, 0, 0.24)' : 'rgba(0, 0, 0, 0.5)',
        '--dsw-alias-bg-mask-2': p.isLight ? 'rgba(0, 0, 0, 0.12)' : 'rgba(0, 0, 0, 0.2)',
        '--dsw-alias-bg-mask-3': 'rgba(0, 0, 0, 0.48)',
        '--dsw-alias-bg-mask-drop': p.elevatedPrimary,
        '--dsw-alias-bg-mask-photo': 'rgba(0, 0, 0, 0.88)',

        // Text.
        '--dsw-alias-label-primary': p.textForeground,
        '--dsw-alias-label-primary-bluish': p.textForeground,
        '--dsw-alias-label-primary-dimmed': p.isLight ? softInk(0.75) : p.textForegroundSecondary,
        '--dsw-alias-label-primary-foreground': p.surface,
        '--dsw-alias-label-primary-inverted': p.isLight ? p.surface : p.elevatedSecondaryOpaque,
        '--dsw-alias-label-secondary': p.textForegroundSecondary,
        '--dsw-alias-label-tertiary': p.textForegroundTertiary,
        '--dsw-alias-label-caption': p.iconTertiary,
        '--dsw-alias-label-dimmed': p.borderLight,
        '--dsw-alias-label-on-color': p.onAccent,
        '--dsw-alias-label-shimmer': p.isLight ? 'rgba(0, 0, 0, 0.3)' : 'rgba(255, 255, 255, 0.45)',
        '--dsw-alias-label-deep-diving': p.textAccent,
        '--dsw-alias-label-deep-diving-shimmer': p.accentBackgroundActive,

        // Accent: DSH calls its accent role "business"; buttons use "info".
        '--dsw-alias-brand-primary': p.buttonPrimaryBackground,
        '--dsw-alias-brand-primary-invert': p.surface,
        '--dsw-alias-brand-text': p.surface,
        '--dsw-alias-state-business-primary': p.textAccent,
        '--dsw-alias-state-business-tertiary': p.accentBackground,
        '--dsw-alias-link': p.textAccent,
        '--dsw-alias-trajectory-accent': p.textAccent,
        '--dsw-focus-ring-color': p.borderFocus,
        '--dsw-alias-button-info-fill': p.textAccent,
        '--dsw-alias-button-info-hover': p.accentBackgroundHover,
        '--dsw-alias-button-primary-fill': p.buttonPrimaryBackground,
        '--dsw-alias-button-primary-hover': p.buttonPrimaryBackgroundHover,
        '--dsw-alias-button-primary-dimmed': p.buttonPrimaryBackgroundInactive,
        '--dsw-alias-button-contrast-fill': p.textForeground,
        '--dsw-alias-button-elevated-fill': p.elevatedPrimaryOpaque,
        '--dsw-alias-button-floating-fill': p.elevatedPrimaryOpaque,
        '--dsw-alias-button-floating-hover': p.elevatedSecondaryOpaque,
        '--dsw-alias-button-tool-bar-fill': p.controlBackground,
        '--dsw-alias-button-tool-bar-hover': p.buttonSecondaryBackgroundHover,
        '--dsw-alias-button-tool-bar-fill-invisible': p.buttonSecondaryBackground,
        '--dsw-alias-button-ghost-active-fill': p.accentBackground,
        '--dsw-alias-button-ghost-active-hover': p.accentBackgroundHover,
        '--dsw-alias-button-ghost-active-border': p.textAccent,

        // Borders.
        '--dsw-alias-border-l1': p.borderLight,
        '--dsw-alias-border-l2': p.border,
        '--dsw-alias-border-l2-darkmode-thin': p.borderLight,
        '--dsw-alias-border-l3': p.borderHeavy,
        '--dsw-alias-border-l4': p.borderHeavy,
        '--dsw-alias-border-selected': p.textAccent,
        '--dsw-alias-border-inverted': p.borderLight,
        '--dsw-alias-border-inverted2': p.borderLight,

        // Interaction.
        '--dsw-alias-interactive-bg-hover': p.buttonSecondaryBackground,
        '--dsw-alias-interactive-bg-hover-accent': p.accentBackground,
        '--dsw-alias-interactive-bg-hover-solid': p.buttonSecondaryBackgroundHover,
        '--dsw-alias-interactive-bg-active': p.buttonTertiaryBackgroundActive,
        '--dsw-alias-interactive-bg-hover-danger': rgbaString(parseHex(p.diffRemoved), 0.12),

        // States.
        '--dsw-alias-state-success-primary': p.diffAdded,
        '--dsw-alias-state-success-secondary': p.diffAdded,
        '--dsw-alias-state-success-tertiary': mixHex(parseHex(p.surface), parseHex(p.diffAdded), p.isLight ? 0.12 : 0.18),
        '--dsw-alias-state-error-primary': p.diffRemoved,
        '--dsw-alias-state-error-secondary': p.diffRemoved,
        '--dsw-alias-state-warn-primary': p.warn,
        '--dsw-alias-state-warn-secondary': p.warn,
        '--dsw-alias-state-warn-tertiary': mixHex(parseHex(p.surface), parseHex(p.warn), p.isLight ? 0.12 : 0.18),
        '--dsw-alias-state-warn-label': p.warn,
        '--dsw-alias-state-idle-primary': p.iconTertiary,
        '--dsw-alias-state-done-primary': p.done,
        '--dsw-alias-switch-thumb': p.isLight ? p.surface : p.iconSecondary,

        // Diffs.
        '--dsw-alias-code-diff-added': rgbaString(parseHex(p.diffAdded), p.isLight ? 0.08 : 0.12),
        '--dsw-alias-code-diff-deleted': rgbaString(parseHex(p.diffRemoved), p.isLight ? 0.08 : 0.12),
        '--dsw-alias-file-diff-added-bg': mixHex(parseHex(p.surface), parseHex(p.diffAdded), p.isLight ? 0.15 : 0.23),
        '--dsw-alias-file-diff-added-gutter': mixHex(parseHex(p.surface), parseHex(p.diffAdded), p.isLight ? 0.09 : 0.16),
        '--dsw-alias-file-diff-added-marker': p.diffAdded,
        '--dsw-alias-file-diff-deleted-bg': mixHex(parseHex(p.surface), parseHex(p.diffRemoved), p.isLight ? 0.15 : 0.23),
        '--dsw-alias-file-diff-deleted-gutter': mixHex(parseHex(p.surface), parseHex(p.diffRemoved), p.isLight ? 0.09 : 0.16),
        '--dsw-alias-file-diff-deleted-marker': p.diffRemoved,

        // Markdown and code.
        '--dsw-alias-markdown-code-block': p.editorBackground,
        '--dsw-alias-markdown-code-block-banner': p.elevatedSecondaryOpaque,
        '--dsw-alias-markdown-inline-code': p.elevatedTertiaryOpaque,
        '--dsw-alias-markdown-code-segment-selected': p.elevatedPrimaryOpaque,
        '--dsw-alias-markdown-code-segment-unselected': p.elevatedSecondaryOpaque,
        '--dsw-alias-markdown-tag': p.accentBackground,
        '--dsw-alias-markdown-citation': p.borderLight,
        '--dsw-alias-markdown-placeholder': p.borderLight,
        '--dsw-alias-turn-trigger-bg': p.elevatedSecondaryOpaque,
        '--dsw-alias-turn-trigger-bg-hover': p.buttonSecondaryBackgroundHover,

        // Chrome.
        '--dsw-alias-menu-icon': p.iconSecondary,
        '--dsw-alias-menu-group-header-fill': p.elevatedSecondaryOpaque,
        '--dsw-specific-menu': p.elevatedPrimary,
        '--dsw-menu-surface-fill': p.elevatedPrimary,
        '--dsw-alias-card-fill': p.elevatedPrimaryOpaque,
        '--dsw-alias-card-fill-hover': p.elevatedSecondaryOpaque,
        '--dsw-alias-card-tile-fill': p.buttonSecondaryBackground,
        '--dsw-alias-tooltip-bg': p.isLight ? p.textForeground : p.elevatedSecondaryOpaque,
        '--dsw-alias-tooltip-label': p.isLight ? p.surface : p.textForeground,
        '--dsw-alias-tooltip-key-bg': p.isLight ? softInk(0.16) : p.buttonSecondaryBackgroundHover,
        '--dsw-alias-toast-bg': p.isLight ? p.textForeground : p.elevatedSecondaryOpaque,
        '--dsw-alias-toast-label': p.isLight ? p.surface : p.textForeground,
        '--dsw-alias-toast-action': p.textAccent,
        '--dsw-alias-hovercard-bg': p.isLight ? p.textForeground : p.elevatedPrimaryOpaque,
        '--dsw-alias-hovercard-label-primary': p.isLight ? p.surface : p.textForeground,
        '--dsw-alias-hovercard-label-secondary': p.isLight ? softInk(0.7) : p.textForegroundSecondary,
        '--dsw-alias-hovercard-label-tertiary': p.isLight ? softInk(0.5) : p.textForegroundTertiary,
        '--dsw-alias-hovercard-state-done': p.done,
        '--dsw-alias-hovercard-state-error': p.diffRemoved,

        // Sidebar and composer.
        '--dsw-specific-sidebar-fill': p.surfaceUnder,
        '--dsw-specific-sidebar-nav-item-hover': p.buttonSecondaryBackground,
        '--dsw-specific-sidebar-nav-item-active': p.buttonSecondaryBackgroundHover,
        '--dsw-specific-sidebar-nav-item-active-accent': p.accentBackground,
        '--dsw-specific-sidebar-right-flash': p.textAccent,
        '--dsw-specific-bubble': mixHex(parseHex(p.surface), parseHex(p.textForeground), p.isLight ? 0.04 : 0.06),
        '--dsw-specific-bubble-highlight': p.accentBackground,
        '--dsw-specific-input-major': p.surface,
        '--dsw-specific-login-input': p.controlBackgroundOpaque,
        '--dsw-specific-selector': p.controlBackgroundOpaque,
        '--dsw-specific-tip': p.elevatedSecondaryOpaque,
        '--dsw-specific-guide-hero': p.elevatedSecondaryOpaque,
        '--dsw-specific-file-upload-track': p.borderLight,
        '--dsw-alias-settings-card-fill': p.elevatedPrimaryOpaque,
        '--dsw-alias-settings-card-stroke': p.border,

        // Scrollbars.
        '--dsw-alias-scrollbar-bg-l1': p.buttonSecondaryBackgroundHover,
        '--dsw-alias-scrollbar-bg-l2': p.buttonSecondaryBackgroundHover,
        '--dsw-alias-scrollbar-hover-l1': p.iconTertiary,
        '--dsw-alias-scrollbar-hover-l2': p.iconTertiary,

        // Charts and illustration.
        '--dsw-alias-chart-messages': p.info,
        '--dsw-alias-chart-system': p.iconTertiary,
        '--dsw-alias-chart-tools': p.done,
        '--dsw-alias-illustration-background': p.elevatedSecondaryOpaque,
        '--dsw-alias-illustration-surface': p.elevatedPrimaryOpaque,
        '--dsw-alias-illustration-backing': p.elevatedSecondaryOpaque,
        '--dsw-alias-illustration-inset': p.elevatedSecondaryOpaque,
        '--dsw-alias-illustration-detail': p.iconTertiary,
        '--dsw-alias-illustration-shadow': p.elevatedSecondaryOpaque,
      }
    }

    // ---- Fonts -------------------------------------------------------------
    const GENERIC_FAMILIES = new Set([
      'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif',
      'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong',
      '-apple-system', 'blinkmacsystemfont',
    ])

    /** Normalize a user or preset font list into a safe CSS font-family value. */
    function normalizeFontFamily(value) {
      if (typeof value !== 'string') return ''
      return value
        .split(',')
        .map((name) => name.replace(/["'\\<>\u0000-\u001f\u007f]/gu, '').replace(/\s+/gu, ' ').trim())
        .filter((name) => name !== '')
        .map((name) => (GENERIC_FAMILIES.has(name.toLowerCase()) ? name : '"' + name + '"'))
        .join(', ')
    }

    // ---- State -------------------------------------------------------------
    function defaultState() {
      const light = presetColors(DEFAULT_PRESET, 'light')
      const dark = presetColors(DEFAULT_PRESET, 'dark')
      return {
        version: 1,
        mode: 'system',
        light: { preset: light.preset, accent: light.accent, ink: light.ink, surface: light.surface, contrast: light.contrast },
        dark: { preset: dark.preset, accent: dark.accent, ink: dark.ink, surface: dark.surface, contrast: dark.contrast },
        fontText: '',
        fontCode: '',
      }
    }

    function clone(value) {
      return JSON.parse(JSON.stringify(value))
    }

    function isHex(value) {
      return typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)
    }

    /** Coerce anything read from storage into a complete, valid state. */
    function normalizeState(raw) {
      const base = defaultState()
      if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return base
      const mode = raw.mode === 'light' || raw.mode === 'dark' || raw.mode === 'system' ? raw.mode : base.mode
      const variant = (input, fallback) => {
        if (input === null || typeof input !== 'object' || Array.isArray(input)) return fallback
        const presetId = typeof input.preset === 'string' && PRESETS[input.preset] !== undefined ? input.preset : fallback.preset
        return {
          preset: presetId,
          accent: isHex(input.accent) ? input.accent.toLowerCase() : fallback.accent,
          ink: isHex(input.ink) ? input.ink.toLowerCase() : fallback.ink,
          surface: isHex(input.surface) ? input.surface.toLowerCase() : fallback.surface,
          contrast:
            typeof input.contrast === 'number' && Number.isFinite(input.contrast)
              ? clamp(Math.round(input.contrast), 0, 100)
              : fallback.contrast,
        }
      }
      return {
        version: 1,
        mode,
        light: variant(raw.light, base.light),
        dark: variant(raw.dark, base.dark),
        fontText: typeof raw.fontText === 'string' ? raw.fontText : '',
        fontCode: typeof raw.fontCode === 'string' ? raw.fontCode : '',
      }
    }

    function readState() {
      try {
        const text = window.localStorage.getItem(SETTINGS_STORE)
        if (text === null) return defaultState()
        return normalizeState(JSON.parse(text))
      } catch {
        return defaultState()
      }
    }

    function writeState(state) {
      try {
        window.localStorage.setItem(SETTINGS_STORE, JSON.stringify(state))
      } catch {
        // Private-mode storage failures must not break the settings page.
      }
    }

    // ---- Token layer -------------------------------------------------------
    /** The three base colors plus the preset's semantic colors for one variant. */
    function variantOf(state, variant) {
      const colors = state[variant]
      const preset = presetColors(colors.preset, variant)
      return {
        preset: colors.preset,
        accent: colors.accent,
        ink: colors.ink,
        surface: colors.surface,
        contrast: colors.contrast,
        semantic: preset.semantic,
        palette: preset.palette,
      }
    }

    /**
     * Build the { light, dark } token pairs ctx.theme.overrideTokens wants.
     * Font tokens are scheme-invariant; an empty font omits the token entirely
     * so the host's own stack applies again.
     */
    function buildOverrides(state) {
      const lightMap = buildTokenMap(derivePalette(variantOf(state, 'light'), 'light'))
      const darkMap = buildTokenMap(derivePalette(variantOf(state, 'dark'), 'dark'))
      const names = new Set(Object.keys(lightMap).concat(Object.keys(darkMap)))
      const overrides = {}
      for (const name of names) {
        overrides[name] = {
          light: lightMap[name] === undefined ? darkMap[name] : lightMap[name],
          dark: darkMap[name] === undefined ? lightMap[name] : darkMap[name],
        }
      }
      const textFont = normalizeFontFamily(state.fontText)
      const codeFont = normalizeFontFamily(state.fontCode)
      if (textFont !== '') overrides['--dsw-font-family'] = { light: textFont, dark: textFont }
      if (codeFont !== '') overrides['--ds-font-family-code'] = { light: codeFont, dark: codeFont }
      return overrides
    }

    // ---- Copy --------------------------------------------------------------
    const IS_ZH =
      typeof navigator === 'object' &&
      String(navigator.language || navigator.userLanguage || '').toLowerCase().startsWith('zh')

    const TEXT = IS_ZH
      ? {
          title: 'Codex 外观',
          subtitle: '沿用 Codex 的外观模型：主题只给三个颜色，其余层次由派生算法生成；对比度统一调节强度。',
          section: '视觉风格',
          mode: '模式',
          modeHint: '亮色、暗色，或跟随系统设置',
          modeLight: '亮色',
          modeDark: '暗色',
          modeSystem: '跟随系统',
          theme: '主题',
          themeHint: '从预设开始，再调整它的颜色与字体',
          accent: '强调色',
          accentHint: '高亮与选中控件的颜色',
          surface: '背景',
          surfaceHint: '应用内容背后的底色',
          ink: '前景',
          inkHint: '主要文字颜色',
          font: '字体',
          fontHint: '菜单与控件使用的字体',
          advanced: '高级',
          contrast: '对比度',
          contrastHint: '统一放大或收敛边框、层次与次级文字的强度',
          codeFont: '代码字体',
          codeFontHint: '代码块与行内代码使用的字体',
          reset: '重置为默认设置',
          custom: '自定义',
          followAppearance: '模式与 DSH 外观页共用同一偏好，两处改动同步生效。',
          fontPlaceholder: '系统默认',
          fontPlaceholderCode: '系统等宽字体',
        }
      : {
          title: 'Codex appearance',
          subtitle: 'The Codex appearance model: a theme is three colors, every other tone is derived, and contrast is the one strength dial.',
          section: 'Visual style',
          mode: 'Mode',
          modeHint: 'Use light or dark colors, or follow your system setting',
          modeLight: 'Light',
          modeDark: 'Dark',
          modeSystem: 'System',
          theme: 'Theme',
          themeHint: 'Start with a preset, then adjust its colors and fonts',
          accent: 'Accent',
          accentHint: 'The color for highlights and selected controls',
          surface: 'Background',
          surfaceHint: 'The color behind app content',
          ink: 'Foreground',
          inkHint: 'Choose the main text color',
          font: 'Font',
          fontHint: 'Set the font for menus and controls',
          advanced: 'Advanced',
          contrast: 'Contrast',
          contrastHint: 'Scale borders, layers, and secondary text together',
          codeFont: 'Code font',
          codeFontHint: 'The font used by code blocks and inline code',
          reset: 'Reset to defaults',
          custom: 'Custom',
          followAppearance: 'Mode is the same preference as the DSH Appearance page; changing either applies to both.',
          fontPlaceholder: 'System default',
          fontPlaceholderCode: 'System monospace',
        }

    // ---- Styles ------------------------------------------------------------
    const CSS = [
      '.cdxt{display:flex;flex-direction:column;gap:4px;color:var(--dsw-alias-label-primary);font-size:13px;line-height:1.45}',
      '.cdxt-head{padding:4px 0 14px}',
      '.cdxt-title{margin:0;font-size:20px;font-weight:600;letter-spacing:-.01em}',
      '.cdxt-sub{margin:6px 0 0;color:var(--dsw-alias-label-tertiary);font-size:12.5px}',
      '.cdxt-section{font-size:12.5px;font-weight:600;color:var(--dsw-alias-label-primary);padding:14px 0 6px}',
      '.cdxt-row{display:flex;align-items:center;gap:18px;padding:11px 0;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.cdxt-row-text{min-width:0;flex:1 1 auto}',
      '.cdxt-row-title{font-size:13px;font-weight:600}',
      '.cdxt-row-desc{font-size:12px;color:var(--dsw-alias-label-tertiary);margin-top:2px}',
      '.cdxt-row-ctrl{flex:0 0 auto;display:flex;align-items:center;gap:8px}',
      '.cdxt-cubes{display:flex;gap:8px}',
      '.cdxt-cube{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;width:76px;height:52px;border-radius:10px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-secondary);cursor:pointer;font:inherit;font-size:11px;transition:border-color .15s,color .15s}',
      '.cdxt-cube:hover{border-color:var(--dsw-alias-border-l4);color:var(--dsw-alias-label-primary)}',
      '.cdxt-cube[data-on]{border-color:var(--dsw-alias-state-business-primary);color:var(--dsw-alias-label-primary);box-shadow:inset 0 0 0 1px var(--dsw-alias-state-business-primary)}',
      '.cdxt-cube svg{width:20px;height:20px}',
      '.cdxt-picker{position:relative}',
      '.cdxt-trigger{display:flex;align-items:center;gap:8px;min-width:196px;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12.5px}',
      '.cdxt-trigger:hover{border-color:var(--dsw-alias-border-l4)}',
      '.cdxt-trigger-label{flex:1 1 auto;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cdxt-aa{display:inline-flex;align-items:center;justify-content:center;width:20px;height:20px;border-radius:6px;font-size:10px;font-weight:700;flex:none;background:var(--dsw-alias-bg-layer-3);color:var(--dsw-alias-label-secondary)}',
      '.cdxt-caret{flex:none;width:12px;height:12px;color:var(--dsw-alias-label-tertiary)}',
      '.cdxt-menu{position:absolute;z-index:40;top:calc(100% + 6px);right:0;width:236px;max-height:288px;overflow:auto;padding:5px;border-radius:12px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-specific-menu);box-shadow:0 14px 36px rgba(0,0,0,.22);backdrop-filter:blur(18px) saturate(1.2)}',
      '.cdxt-menu[hidden]{display:none}',
      '.cdxt-opt{display:flex;align-items:center;gap:9px;width:100%;padding:6px 8px;border-radius:8px;border:none;background:transparent;color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12.5px;text-align:left}',
      '.cdxt-opt:hover{background:var(--dsw-alias-interactive-bg-hover)}',
      '.cdxt-opt[data-on]{background:var(--dsw-alias-interactive-bg-hover-accent)}',
      '.cdxt-opt-name{flex:1 1 auto;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cdxt-check{flex:none;width:14px;height:14px;color:var(--dsw-alias-state-business-primary)}',
      '.cdxt-swatch{display:inline-flex;align-items:center;gap:8px;height:32px;padding:0 10px 0 6px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2)}',
      '.cdxt-dot{position:relative;width:20px;height:20px;border-radius:50%;border:1px solid var(--dsw-alias-border-l3);overflow:hidden;flex:none;cursor:pointer}',
      '.cdxt-dot input{position:absolute;inset:-6px;width:calc(100% + 12px);height:calc(100% + 12px);border:none;padding:0;background:transparent;cursor:pointer;opacity:0}',
      '.cdxt-hex{width:78px;border:none;background:transparent;color:var(--dsw-alias-label-primary);font:inherit;font-size:12px;font-variant-numeric:tabular-nums;text-transform:uppercase;outline:none}',
      '.cdxt-hex:focus{color:var(--dsw-alias-state-business-primary)}',
      '.cdxt-src{font-size:11px;color:var(--dsw-alias-label-tertiary);padding:0 6px 0 2px}',
      '.cdxt-field{width:196px;height:32px;padding:0 10px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);font:inherit;font-size:12.5px;outline:none}',
      '.cdxt-field:focus{border-color:var(--dsw-alias-state-business-primary)}',
      '.cdxt-adv{display:flex;align-items:center;gap:6px;margin-top:12px;padding:6px 0;border:none;background:transparent;color:var(--dsw-alias-label-tertiary);cursor:pointer;font:inherit;font-size:12.5px}',
      '.cdxt-adv:hover{color:var(--dsw-alias-label-primary)}',
      '.cdxt-adv svg{width:12px;height:12px;transition:transform .15s}',
      '.cdxt-adv[data-open] svg{transform:rotate(90deg)}',
      '.cdxt-range{display:flex;align-items:center;gap:10px}',
      '.cdxt-range input[type=range]{width:132px;accent-color:var(--dsw-alias-state-business-primary)}',
      '.cdxt-range-val{width:26px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;color:var(--dsw-alias-label-secondary)}',
      '.cdxt-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px;padding-top:12px;border-top:1px solid var(--dsw-alias-border-l1)}',
      '.cdxt-note{font-size:11.5px;color:var(--dsw-alias-label-tertiary)}',
      '.cdxt-btn{height:30px;padding:0 12px;border-radius:8px;border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary);cursor:pointer;font:inherit;font-size:12.5px}',
      '.cdxt-btn:hover{border-color:var(--dsw-alias-border-l4)}',
    ].join('\n')

    const ICON_SUN = h(
      'svg',
      { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
      h('circle', { cx: 12, cy: 12, r: 4.2 }),
      h('path', { d: 'M12 2.6v2.2M12 19.2v2.2M2.6 12h2.2M19.2 12h2.2M5.4 5.4l1.6 1.6M17 17l1.6 1.6M18.6 5.4L17 7M7 17l-1.6 1.6' }),
    )

    const ICON_MOON = h(
      'svg',
      { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
      h('path', { d: 'M20 14.2A8.2 8.2 0 1 1 9.8 4a6.6 6.6 0 0 0 10.2 10.2Z' }),
    )

    const ICON_SYSTEM = h(
      'svg',
      { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' },
      h('rect', { x: 3, y: 4.5, width: 18, height: 12, rx: 2 }),
      h('path', { d: 'M8.5 20h7M12 16.5V20' }),
    )

    const ICON_CHEVRON = h(
      'svg',
      { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.2, strokeLinecap: 'round' },
      h('path', { d: 'M9 5l7 7-7 7' }),
    )

    const ICON_CHECK = h(
      'svg',
      { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2.6, strokeLinecap: 'round' },
      h('path', { d: 'M4 12.5l5 5L20 6.5' }),
    )

    // ---- Page --------------------------------------------------------------
    function Row(props) {
      return h(
        'div',
        { className: 'cdxt-row' },
        h(
          'div',
          { className: 'cdxt-row-text' },
          h('div', { className: 'cdxt-row-title' }, props.title),
          props.desc === undefined ? null : h('div', { className: 'cdxt-row-desc' }, props.desc),
        ),
        h('div', { className: 'cdxt-row-ctrl' }, props.children),
      )
    }

    /** One hex color control: native picker dot plus editable hex text. */
    function ColorControl(props) {
      const [draft, setDraft] = useState(props.value)
      useEffect(() => {
        setDraft(props.value)
      }, [props.value])
      const commit = (text) => {
        const parsed = parseHex(text)
        if (parsed === null) {
          setDraft(props.value)
          return
        }
        props.onChange(toHex(parsed))
      }
      return h(
        'div',
        { className: 'cdxt-swatch' },
        h(
          'label',
          { className: 'cdxt-dot', style: { background: props.value }, title: props.label },
          h('input', {
            type: 'color',
            value: props.value,
            'aria-label': props.label,
            onChange: (event) => props.onChange(event.target.value.toLowerCase()),
          }),
        ),
        h('input', {
          className: 'cdxt-hex',
          value: draft,
          spellCheck: false,
          autoComplete: 'off',
          'aria-label': props.label,
          onChange: (event) => setDraft(event.target.value),
          onBlur: (event) => commit(event.target.value),
          onKeyDown: (event) => {
            if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') {
              setDraft(props.value)
              event.currentTarget.blur()
            }
          },
        }),
        props.source === undefined ? null : h('span', { className: 'cdxt-src' }, props.source),
      )
    }

    /** Theme dropdown: the Codex list, limited to presets that ship this mode. */
    function PresetPicker(props) {
      const [open, setOpen] = useState(false)
      const root = useRef(null)
      useEffect(() => {
        if (!open) return undefined
        const onDoc = (event) => {
          if (root.current !== null && !root.current.contains(event.target)) setOpen(false)
        }
        const onKey = (event) => {
          if (event.key === 'Escape') setOpen(false)
        }
        document.addEventListener('mousedown', onDoc)
        document.addEventListener('keydown', onKey)
        return () => {
          document.removeEventListener('mousedown', onDoc)
          document.removeEventListener('keydown', onKey)
        }
      }, [open])
      const label = PRESETS[props.value] === undefined ? props.value : PRESETS[props.value].label
      return h(
        'div',
        { className: 'cdxt-picker', ref: root },
        h(
          'button',
          {
            type: 'button',
            className: 'cdxt-trigger',
            'aria-haspopup': 'listbox',
            'aria-expanded': open ? 'true' : 'false',
            onClick: () => setOpen((previous) => !previous),
          },
          h('span', { className: 'cdxt-aa' }, 'Aa'),
          h('span', { className: 'cdxt-trigger-label' }, label),
          h('span', { className: 'cdxt-caret' }, ICON_CHEVRON),
        ),
        h(
          'div',
          { className: 'cdxt-menu', role: 'listbox', hidden: !open },
          props.ids.map((id) =>
            h(
              'button',
              {
                key: id,
                type: 'button',
                role: 'option',
                className: 'cdxt-opt',
                'data-on': id === props.value ? '' : undefined,
                'aria-selected': id === props.value ? 'true' : 'false',
                onClick: () => {
                  props.onPick(id)
                  setOpen(false)
                },
              },
              h('span', { className: 'cdxt-aa' }, 'Aa'),
              h('span', { className: 'cdxt-opt-name' }, PRESETS[id].label),
              id === props.value ? h('span', { className: 'cdxt-check' }, ICON_CHECK) : null,
            ),
          ),
        ),
      )
    }

    /**
     * The settings page. `controller` is its one business face: it holds the
     * state and owns the token-layer write, so this component stays pure
     * rendering plus local draft state.
     */
    function CodexThemePage(props) {
      const controller = props.controller
      const snapshot = props.snapshot
      const state = snapshot.state
      const variant = snapshot.variant
      const colors = state[variant]
      const [advancedOpen, setAdvancedOpen] = useState(false)
      const preset = presetColors(colors.preset, variant)
      const isCustom =
        preset.accent !== colors.accent || preset.surface !== colors.surface || preset.ink !== colors.ink

      const patch = (next) => controller.update(next)
      const patchVariant = (next) => {
        const update = {}
        update[variant] = Object.assign({}, colors, next)
        patch(update)
      }

      const ids = presetIdsFor(variant)
      const modeCubes = [
        { id: 'light', label: TEXT.modeLight, icon: ICON_SUN },
        { id: 'dark', label: TEXT.modeDark, icon: ICON_MOON },
        { id: 'system', label: TEXT.modeSystem, icon: ICON_SYSTEM },
      ]

      return h(
        'div',
        { className: 'cdxt' },
        h('style', null, CSS),
        h(
          'div',
          { className: 'cdxt-head' },
          h('h1', { className: 'cdxt-title' }, TEXT.title),
          h('p', { className: 'cdxt-sub' }, TEXT.subtitle),
        ),
        h('div', { className: 'cdxt-section' }, TEXT.section),

        h(
          Row,
          { title: TEXT.mode, desc: TEXT.modeHint },
          h(
            'div',
            { className: 'cdxt-cubes' },
            modeCubes.map((cube) =>
              h(
                'button',
                {
                  key: cube.id,
                  type: 'button',
                  className: 'cdxt-cube',
                  'data-on': snapshot.preference === cube.id ? '' : undefined,
                  'aria-pressed': snapshot.preference === cube.id ? 'true' : 'false',
                  onClick: () => controller.setMode(cube.id),
                },
                cube.icon,
                cube.label,
              ),
            ),
          ),
        ),

        h(
          Row,
          { title: TEXT.theme, desc: TEXT.themeHint },
          h(PresetPicker, {
            value: colors.preset,
            ids,
            onPick: (id) => {
              const next = presetColors(id, variant)
              patchVariant({
                preset: id,
                accent: next.accent,
                ink: next.ink,
                surface: next.surface,
                contrast: next.contrast,
              })
              if (next.font !== '' && state.fontText === '') patch({ fontText: next.font })
            },
          }),
        ),

        h(
          Row,
          { title: TEXT.accent, desc: TEXT.accentHint },
          h(ColorControl, {
            value: colors.accent,
            label: TEXT.accent,
            source: isCustom ? TEXT.custom : undefined,
            onChange: (value) => patchVariant({ accent: value }),
          }),
        ),

        h(
          Row,
          { title: TEXT.surface, desc: TEXT.surfaceHint },
          h(ColorControl, {
            value: colors.surface,
            label: TEXT.surface,
            onChange: (value) => patchVariant({ surface: value }),
          }),
        ),

        h(
          Row,
          { title: TEXT.ink, desc: TEXT.inkHint },
          h(ColorControl, {
            value: colors.ink,
            label: TEXT.ink,
            onChange: (value) => patchVariant({ ink: value }),
          }),
        ),

        h(
          Row,
          { title: TEXT.font, desc: TEXT.fontHint },
          h('input', {
            className: 'cdxt-field',
            key: 'font-' + state.fontText,
            defaultValue: state.fontText,
            placeholder: TEXT.fontPlaceholder,
            spellCheck: false,
            autoComplete: 'off',
            'aria-label': TEXT.font,
            onBlur: (event) => patch({ fontText: event.target.value }),
            onKeyDown: (event) => {
              if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
              if (event.key === 'Enter') event.currentTarget.blur()
            },
          }),
        ),

        h(
          'button',
          {
            type: 'button',
            className: 'cdxt-adv',
            'data-open': advancedOpen ? '' : undefined,
            'aria-expanded': advancedOpen ? 'true' : 'false',
            onClick: () => setAdvancedOpen((previous) => !previous),
          },
          ICON_CHEVRON,
          TEXT.advanced,
        ),

        advancedOpen
          ? h(
              React.Fragment,
              null,
              h(
                Row,
                { title: TEXT.contrast, desc: TEXT.contrastHint },
                h(
                  'div',
                  { className: 'cdxt-range' },
                  h('input', {
                    type: 'range',
                    min: 0,
                    max: 100,
                    step: 1,
                    value: colors.contrast,
                    'aria-label': TEXT.contrast,
                    onChange: (event) => patchVariant({ contrast: Number(event.target.value) }),
                  }),
                  h('span', { className: 'cdxt-range-val' }, String(colors.contrast)),
                ),
              ),
              h(
                Row,
                { title: TEXT.codeFont, desc: TEXT.codeFontHint },
                h('input', {
                  className: 'cdxt-field',
                  key: 'code-font-' + state.fontCode,
                  defaultValue: state.fontCode,
                  placeholder: TEXT.fontPlaceholderCode,
                  spellCheck: false,
                  autoComplete: 'off',
                  'aria-label': TEXT.codeFont,
                  onBlur: (event) => patch({ fontCode: event.target.value }),
                  onKeyDown: (event) => {
                    if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
                    if (event.key === 'Enter') event.currentTarget.blur()
                  },
                }),
              ),
            )
          : null,

        h(
          'div',
          { className: 'cdxt-foot' },
          h('span', { className: 'cdxt-note' }, TEXT.followAppearance),
          h('button', { type: 'button', className: 'cdxt-btn', onClick: () => controller.reset() }, TEXT.reset),
        ),
      )
    }

    // ---- Controller --------------------------------------------------------
    /**
     * Owns the state, the theme subscription, and the override layer. The page
     * and the token writer share it, so a color change repaints the app and the
     * page from the same value.
     */
    function createController(theme) {
      let state = readState()
      let snapshot = null
      const listeners = new Set()
      let disposeLayer = null

      const preference = () => (theme === undefined ? 'system' : theme.getTheme().preference)

      const currentVariant = () => {
        const mode = preference()
        if (mode === 'light' || mode === 'dark') return mode
        try {
          return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
        } catch {
          return 'light'
        }
      }

      const publish = () => {
        snapshot = { state: clone(state), variant: currentVariant(), preference: preference() }
        for (const listener of listeners) listener()
      }

      const applyTokens = () => {
        if (theme === undefined) return
        try {
          // Re-calling with the same source replaces the whole layer, so there
          // is exactly one live layer and no per-call disposer to track.
          disposeLayer = theme.overrideTokens(OVERRIDE_SOURCE, buildOverrides(state))
        } catch (error) {
          console.warn('dsh-codex-theme: token layer rejected:', error)
        }
      }

      return {
        getSnapshot: () => snapshot,
        subscribe(listener) {
          listeners.add(listener)
          return () => listeners.delete(listener)
        },
        start() {
          publish()
          applyTokens()
        },
        refresh() {
          publish()
        },
        update(patch) {
          state = normalizeState(Object.assign({}, state, patch))
          writeState(state)
          publish()
          applyTokens()
        },
        setMode(mode) {
          if (theme === undefined) return
          try {
            theme.setTheme(mode)
          } catch (error) {
            console.warn('dsh-codex-theme: mode change rejected:', error)
          }
        },
        reset() {
          state = defaultState()
          writeState(state)
          publish()
          applyTokens()
        },
        dispose() {
          if (typeof disposeLayer === 'function') {
            try {
              disposeLayer()
            } catch {
              // The layer may already be gone with the plugin context.
            }
          }
          disposeLayer = null
          listeners.clear()
        },
      }
    }

    // ---- Entry -------------------------------------------------------------
    function CodexThemeSection(props) {
      const controller = props.controller
      const [, force] = useState(0)
      useEffect(() => {
        let alive = true
        const unsubscribe = controller.subscribe(() => {
          if (alive) force((value) => value + 1)
        })
        return () => {
          alive = false
          unsubscribe()
        }
      }, [controller])
      const snapshot = controller.getSnapshot()
      if (snapshot === null) return null
      return h(CodexThemePage, { controller, snapshot })
    }

    return {
      inject: ['slots', 'theme'],
      apply(ctx) {
        const theme = ctx.get('theme')
        const slots = ctx.get('slots')
        if (theme === undefined || typeof theme.overrideTokens !== 'function') {
          console.warn('dsh-codex-theme: the theme service is unavailable; no colors applied.')
          return
        }

        const controller = createController(theme)
        controller.start()

        ctx.effect(() => {
          const off = typeof ctx.on === 'function' ? ctx.on('theme/change', () => controller.refresh()) : null
          return () => {
            if (typeof off === 'function') off()
            controller.dispose()
          }
        }, 'codex-theme: token layer')

        if (slots === undefined || typeof slots.inject !== 'function') return
        try {
          slots.inject('settings.section', () =>
            slots.register(
              {
                name: 'settings.section',
                id: 'codex-theme',
                order: 12,
                label: TEXT.title,
              },
              () => h(CodexThemeSection, { controller }),
            ),
          )
        } catch (error) {
          console.warn('dsh-codex-theme: settings section registration failed:', error)
        }
      },
      // Exposed for the unit tests only; the host ignores unknown keys.
      internals: {
        PRESETS,
        PRESET_IDS,
        presetColors,
        presetIdsFor,
        derivePalette,
        buildTokenMap,
        buildOverrides,
        normalizeState,
        normalizeFontFamily,
        parseHex,
        toHex,
        onColor,
        normalizeContrast,
        defaultState,
        DEFAULT_PRESET,
        SETTINGS_STORE,
      },
    }
  },
})
