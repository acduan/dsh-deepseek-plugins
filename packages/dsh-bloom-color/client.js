/* dsh-bloom-color v0.1.0 —— 仅「主题色」复刻。
   配色数据与 token 编译逻辑取自 dsh-bloom-theme 的 src/palette.ts 与 src/tokens.ts
   （纯颜色逻辑），移除了遥测/更新检测/反馈/分享/诊断/玻璃/氛围/动效等全部功能。
   本文件不发起任何网络请求，不读取对话内容。 */
window.__ModuleLoader__.load({
  id: '@local/dsh-bloom-color',
  factory: function (require) {
    'use strict';

    var PLUGIN_ID = '@local/dsh-bloom-color';
    var STORAGE_KEY = 'dsh-bloom-color-variant';

    // ── 配色数据（源自 palette.ts）──────────────────────────────────────────
    var PALETTE = {
      mist: {
        accentL: 'oklch(50% 0.08 240)',  accentD: 'oklch(72% 0.12 240)',
        morandi: '146, 168, 179',
        bgL: 'oklch(96% 0.01 240)',      bgD: 'oklch(28% 0.02 240)',
        txL: 'oklch(25% 0.02 240)',      txD: 'oklch(96% 0.01 240)',
        sfL: 'oklch(94% 0.01 240)',      sfD: 'oklch(34% 0.02 240)',
        sf2L: 'oklch(91% 0.01 240)',     sf2D: 'oklch(40% 0.02 240)',
        motionL: ['oklch(50% 0.08 240)', 'oklch(50% 0.10 210)', 'oklch(50% 0.09 275)'],
        motionD: ['oklch(72% 0.12 240)', 'oklch(74% 0.13 210)', 'oklch(74% 0.11 275)'],
      },
      cinnabar: {
        accentL: 'oklch(55% 0.18 25)',   accentD: 'oklch(72% 0.12 25)',
        morandi: '215, 75, 75',
        bgL: 'oklch(97% 0.005 25)',      bgD: 'oklch(28% 0.02 25)',
        txL: 'oklch(25% 0.02 25)',       txD: 'oklch(96% 0.01 25)',
        sfL: 'oklch(95% 0.005 25)',      sfD: 'oklch(34% 0.02 25)',
        sf2L: 'oklch(92% 0.005 25)',     sf2D: 'oklch(40% 0.02 25)',
        motionL: ['oklch(55% 0.18 25)', 'oklch(55% 0.16 65)', 'oklch(55% 0.15 350)'],
        motionD: ['oklch(72% 0.12 25)', 'oklch(74% 0.14 65)', 'oklch(73% 0.13 350)'],
      },
      petal: {
        accentL: 'oklch(58% 0.22 350)',  accentD: 'oklch(75% 0.18 350)',
        morandi: '232, 133, 155',
        bgL: 'oklch(98% 0.01 350)',      bgD: 'oklch(28% 0.02 350)',
        txL: 'oklch(25% 0.02 354)',      txD: 'oklch(98% 0.01 350)',
        sfL: 'oklch(96% 0.015 350)',     sfD: 'oklch(34% 0.02 350)',
        sf2L: 'oklch(94% 0.015 350)',    sf2D: 'oklch(40% 0.02 350)',
        motionL: ['oklch(56.7% 0.22 350)', 'oklch(56.7% 0.17 310)', 'oklch(56.7% 0.17 20)'],
        motionD: ['oklch(75% 0.18 350)', 'oklch(75% 0.14 310)', 'oklch(76% 0.14 20)'],
      },
      ripple: {
        accentL: 'oklch(51% 0.12 195)',  accentD: 'oklch(75% 0.12 195)',
        morandi: '95, 168, 178',
        bgL: 'oklch(96% 0.01 195)',      bgD: 'oklch(20% 0.02 195)',
        txL: 'oklch(25% 0.02 195)',      txD: 'oklch(96% 0.01 195)',
        sfL: 'oklch(94% 0.01 195)',      sfD: 'oklch(28% 0.02 195)',
        sf2L: 'oklch(92% 0.01 195)',     sf2D: 'oklch(38% 0.02 195)',
        motionL: ['oklch(51% 0.12 195)', 'oklch(51% 0.13 225)', 'oklch(51% 0.11 165)'],
        motionD: ['oklch(75% 0.12 195)', 'oklch(76% 0.14 225)', 'oklch(77% 0.12 165)'],
      },
      sage: {
        accentL: 'oklch(54.1% 0.111 115)',  accentD: 'oklch(71.9% 0.120 115)',
        morandi: '138, 154, 91',
        bgL: 'oklch(97% 0.011 112)',      bgD: 'oklch(20% 0.019 113)',
        txL: 'oklch(25% 0.02 116)',       txD: 'oklch(96% 0.011 118)',
        sfL: 'oklch(94.9% 0.009 113)',    sfD: 'oklch(27.9% 0.02 116)',
        sf2L: 'oklch(91.9% 0.009 113)',   sf2D: 'oklch(34% 0.03 116)',
        motionL: ['oklch(54.1% 0.111 115)', 'oklch(54.1% 0.12 83)', 'oklch(53.1% 0.10 152)'],
        motionD: ['oklch(71.9% 0.120 115)', 'oklch(71.9% 0.13 83)', 'oklch(71.9% 0.11 152)'],
      },
      stone: {
        accentL: 'oklch(49.9% 0.06 29)',   accentD: 'oklch(75% 0.12 30)',
        morandi: '180, 160, 155',
        bgL: 'oklch(95.9% 0.01 25)',      bgD: 'oklch(20.1% 0.019 30)',
        txL: 'oklch(25% 0.02 29)',        txD: 'oklch(95.9% 0.01 25)',
        sfL: 'oklch(94.1% 0.01 33)',      sfD: 'oklch(27.9% 0.02 28)',
        sf2L: 'oklch(91% 0.01 33)',       sf2D: 'oklch(33.9% 0.03 28)',
        motionL: ['oklch(49.9% 0.06 29)', 'oklch(49.9% 0.075 0)', 'oklch(49.9% 0.07 60)'],
        motionD: ['oklch(75% 0.12 30)', 'oklch(75% 0.13 0)', 'oklch(75% 0.11 62)'],
      },
      lapis: {
        accentL: 'oklch(50% 0.13 258)',   accentD: 'oklch(74% 0.10 255)',
        morandi: '47, 98, 172',
        bgL: 'oklch(97.4% 0.006 240)',    bgD: 'oklch(23.1% 0.019 249)',
        txL: 'oklch(23% 0.02 249)',       txD: 'oklch(96.1% 0.008 237)',
        sfL: 'oklch(95.6% 0.008 242)',    sfD: 'oklch(30.1% 0.022 251)',
        sf2L: 'oklch(92.4% 0.013 244)',   sf2D: 'oklch(35.9% 0.025 251)',
        motionL: ['oklch(50% 0.13 258)', 'oklch(50% 0.12 226)', 'oklch(50% 0.11 295)'],
        motionD: ['oklch(74% 0.10 255)', 'oklch(74% 0.11 225)', 'oklch(74% 0.10 292)'],
      },
      amber: {
        accentL: 'oklch(55.5% 0.12 70)',  accentD: 'oklch(78% 0.11 70)',
        morandi: '159, 100, 1',
        bgL: 'oklch(97.5% 0.008 74)',     bgD: 'oklch(26% 0.018 60)',
        txL: 'oklch(24% 0.02 74)',        txD: 'oklch(95% 0.008 70)',
        sfL: 'oklch(95.6% 0.01 82)',      sfD: 'oklch(32% 0.020 60)',
        sf2L: 'oklch(93% 0.014 78)',      sf2D: 'oklch(38% 0.022 60)',
        motionL: ['oklch(55.5% 0.12 70)', 'oklch(55.5% 0.11 38)', 'oklch(54.1% 0.12 100)'],
        motionD: ['oklch(78% 0.11 70)', 'oklch(78% 0.12 38)', 'oklch(78% 0.11 100)'],
      },
      aurora: {
        accentL: 'oklch(55% 0.145 72)',   accentD: 'oklch(80% 0.13 72)',
        morandi: '218, 158, 72',
        bgL: 'oklch(98% 0.004 72)',       bgD: 'oklch(24.5% 0.008 70)',
        txL: 'oklch(24% 0.012 72)',       txD: 'oklch(95% 0.005 72)',
        sfL: 'oklch(96.2% 0.005 72)',     sfD: 'oklch(30.5% 0.01 70)',
        sf2L: 'oklch(93.4% 0.007 72)',    sf2D: 'oklch(36.5% 0.012 70)',
        motionL: ['oklch(55% 0.145 72)', 'oklch(56% 0.15 50)', 'oklch(56% 0.13 32)'],
        motionD: ['oklch(80% 0.13 72)', 'oklch(80% 0.14 50)', 'oklch(80% 0.12 32)'],
      },
      lavender: {
        accentL: 'oklch(52% 0.11 295)',   accentD: 'oklch(75% 0.11 295)',
        morandi: '164, 148, 190',
        bgL: 'oklch(97% 0.012 295)',      bgD: 'oklch(26% 0.02 295)',
        txL: 'oklch(25% 0.02 295)',       txD: 'oklch(96% 0.012 295)',
        sfL: 'oklch(95% 0.014 295)',      sfD: 'oklch(32% 0.022 295)',
        sf2L: 'oklch(92.5% 0.016 295)',   sf2D: 'oklch(38% 0.024 295)',
        motionL: ['oklch(52% 0.11 295)', 'oklch(52% 0.10 265)', 'oklch(53% 0.12 325)'],
        motionD: ['oklch(75% 0.11 295)', 'oklch(75% 0.11 265)', 'oklch(76% 0.12 325)'],
      },
      mint: {
        accentL: 'oklch(51% 0.10 160)',   accentD: 'oklch(82% 0.12 160)',
        morandi: '128, 196, 166',
        bgL: 'oklch(97.6% 0.006 160)',    bgD: 'oklch(24% 0.012 165)',
        txL: 'oklch(24% 0.015 165)',      txD: 'oklch(96% 0.008 160)',
        sfL: 'oklch(95.6% 0.008 160)',    sfD: 'oklch(30% 0.015 165)',
        sf2L: 'oklch(92.8% 0.01 160)',    sf2D: 'oklch(36% 0.018 165)',
        motionL: ['oklch(51% 0.10 160)', 'oklch(52% 0.10 135)', 'oklch(51% 0.09 185)'],
        motionD: ['oklch(82% 0.12 160)', 'oklch(84% 0.12 135)', 'oklch(80% 0.10 185)'],
      },
      tangerine: {
        accentL: 'oklch(55% 0.16 47)',    accentD: 'oklch(73% 0.17 50)',
        morandi: '226, 128, 64',
        bgL: 'oklch(97.8% 0.005 60)',     bgD: 'oklch(24% 0.01 50)',
        txL: 'oklch(24% 0.014 50)',       txD: 'oklch(96% 0.006 60)',
        sfL: 'oklch(95.8% 0.006 60)',     sfD: 'oklch(30% 0.012 50)',
        sf2L: 'oklch(93% 0.008 58)',      sf2D: 'oklch(36% 0.015 50)',
        motionL: ['oklch(55% 0.16 47)', 'oklch(56% 0.15 30)', 'oklch(57% 0.13 65)'],
        motionD: ['oklch(73% 0.17 50)', 'oklch(74% 0.16 32)', 'oklch(78% 0.14 66)'],
      },
      silverrose: {
        accentL: 'oklch(50% 0.10 320)',    accentD: 'oklch(78% 0.10 320)',
        morandi: '168, 145, 170',
        bgL: 'oklch(97.5% 0.004 320)',     bgD: 'oklch(23% 0.010 320)',
        txL: 'oklch(24% 0.012 320)',       txD: 'oklch(96% 0.006 320)',
        sfL: 'oklch(95.3% 0.006 320)',     sfD: 'oklch(30% 0.015 320)',
        sf2L: 'oklch(92% 0.008 320)',      sf2D: 'oklch(36% 0.018 320)',
        motionL: ['oklch(50% 0.10 320)', 'oklch(51% 0.07 340)', 'oklch(50% 0.07 24)'],
        motionD: ['oklch(78% 0.10 320)', 'oklch(79% 0.08 340)', 'oklch(78% 0.08 24)'],
      },
      dawn: {
        accentL: 'oklch(51% 0.15 8)',    accentD: 'oklch(78% 0.13 8)',
        morandi: '219, 147, 151',
        bgL: 'oklch(98% 0.006 8)',       bgD: 'oklch(24% 0.012 8)',
        txL: 'oklch(24% 0.013 8)',       txD: 'oklch(96% 0.007 8)',
        sfL: 'oklch(95.8% 0.009 8)',     sfD: 'oklch(30% 0.017 8)',
        sf2L: 'oklch(93% 0.011 8)',      sf2D: 'oklch(36% 0.021 8)',
        motionL: ['oklch(51% 0.15 8)', 'oklch(52% 0.12 8)', 'oklch(52% 0.11 50)'],
        motionD: ['oklch(78% 0.13 8)', 'oklch(79% 0.12 8)', 'oklch(79% 0.11 50)'],
      },
      osmanthus: {
        accentL: 'oklch(50% 0.12 98)',    accentD: 'oklch(86% 0.14 98)',
        morandi: '214, 186, 92',
        bgL: 'oklch(97.8% 0.006 95)',     bgD: 'oklch(24% 0.008 95)',
        txL: 'oklch(24% 0.014 95)',       txD: 'oklch(96% 0.008 95)',
        sfL: 'oklch(95.8% 0.008 95)',     sfD: 'oklch(30% 0.012 95)',
        sf2L: 'oklch(93% 0.01 95)',       sf2D: 'oklch(36% 0.015 95)',
        motionL: ['oklch(50% 0.12 98)', 'oklch(52% 0.11 80)', 'oklch(51% 0.10 120)'],
        motionD: ['oklch(86% 0.14 98)', 'oklch(84% 0.13 80)', 'oklch(84% 0.12 120)'],
      },
    };

    var VARIANTS = Object.keys(PALETTE);
    var LABELS = {
      mist: ['黛蓝', 'Mist'], cinnabar: ['朱砂', 'Cinnabar'], petal: ['桃夭', 'Petal'],
      ripple: ['天青', 'Ripple'], sage: ['竹青', 'Sage'], stone: ['赭石', 'Stone'],
      lapis: ['青金', 'Lapis'], amber: ['琥珀', 'Amber'], aurora: ['落霞', 'Afterglow'],
      lavender: ['青莲', 'Lavender'], mint: ['草色', 'Mint'], tangerine: ['橙黄', 'Tangerine'],
      silverrose: ['银红', 'Silver Rose'], dawn: ['粉霞', 'Dawn'], osmanthus: ['轻黄', 'Osmanthus'],
    };
    var IS_ZH = (function () { try { return String(navigator.language || '').toLowerCase().indexOf('zh') === 0; } catch (e) { return true; } })();
    function label(v) { var it = LABELS[v]; if (!it) return v; return IS_ZH ? it[0] : it[1]; }

    // ── 提取自 zuoyunlai/dsh-theme-palette 的 4 套配色（该插件配色引擎静态烘焙出的宿主 token）──
    var THEME_PALETTE = {"mono":{"label":"黑白","desc":"无色调 · 默认","tinted":false,"light":{"--dsw-static-neutral-bluish-400":"#adb2b8","--dsw-static-neutral-bluish-600":"#696c73","--dsw-static-neutral-bluish-700":"#575c61","--dsw-static-neutral-bluish-1000":"#0f1115","--dsw-static-deepseek-500":"#4176e6","--dsw-alias-link":"#2c5ecc","--dsw-alias-button-primary-fill":"#376bda","--dsw-specific-sidebar-fill":"#f8f8f8","--dsw-specific-sidebar-nav-item-hover":"#f1f1f1","--dsw-specific-sidebar-nav-item-active":"#ebebeb","--dsw-alias-markdown-code-block":"#e7ecf6","--dsw-alias-markdown-code-block-banner":"#eef2fa","--dsw-alias-brand-primary":"#4176e6","--dsw-alias-label-caption":"#adb2b8","--dsw-alias-label-tertiary":"#696c73"},"dark":{"--dsw-static-neutral-bluish-400":"#adb2b8","--dsw-static-neutral-bluish-600":"#696c73","--dsw-static-neutral-bluish-700":"#575c61","--dsw-static-neutral-bluish-1000":"#0f1115","--dsw-static-deepseek-500":"#4176e6","--dsw-alias-link":"#7aaaff","--dsw-alias-button-primary-fill":"#0f1115","--dsw-specific-sidebar-fill":"#0c0c0e","--dsw-specific-sidebar-nav-item-hover":"#101012","--dsw-specific-sidebar-nav-item-active":"#141416","--dsw-alias-markdown-code-block":"#2f333a","--dsw-alias-markdown-code-block-banner":"#35383f","--dsw-alias-brand-primary":"#99beff","--dsw-alias-label-caption":"#696c73","--dsw-alias-label-tertiary":"#adb2b8"}},"warm":{"label":"暖砂","desc":"米白 + 棕调","tinted":true,"light":{"--dsw-static-neutral-bluish-50":"#fef6ef","--dsw-static-neutral-bluish-60":"#faf5ee","--dsw-static-neutral-bluish-75":"#f7f0e7","--dsw-static-neutral-bluish-100":"#f1eade","--dsw-static-neutral-bluish-150":"#e9e0d0","--dsw-static-neutral-bluish-200":"#e4dbc8","--dsw-static-neutral-bluish-300":"#e3ceb4","--dsw-static-neutral-bluish-400":"#c2b29c","--dsw-static-neutral-bluish-500":"#a89a8a","--dsw-static-neutral-bluish-600":"#685d54","--dsw-static-neutral-bluish-700":"#574e46","--dsw-static-neutral-bluish-750":"#49443f","--dsw-static-neutral-bluish-800":"#4a3f36","--dsw-static-neutral-bluish-850":"#2b241f","--dsw-static-neutral-bluish-875":"#221d19","--dsw-static-neutral-bluish-900":"#201c18","--dsw-static-neutral-bluish-950":"#1a1613","--dsw-static-neutral-bluish-1000":"#27221e","--dsw-static-neutral-bluish-00":"#fdfbf8","--dsw-static-neutral-50":"#efebe6","--dsw-static-neutral-100":"#eae6e1","--dsw-static-neutral-150":"#e2ded9","--dsw-static-neutral-200":"#dbd7d2","--dsw-static-neutral-250":"#d9d4ce","--dsw-static-neutral-300":"#d6d1cb","--dsw-static-neutral-400":"#a8a39d","--dsw-static-neutral-500":"#86817b","--dsw-static-neutral-550":"#6b6661","--dsw-static-neutral-600":"#585450","--dsw-static-neutral-700":"#3f3b38","--dsw-static-neutral-800":"#2c2825","--dsw-static-neutral-850":"#24211d","--dsw-static-neutral-900":"#120f0c","--dsw-static-neutral-1000":"#000000","--dsw-static-neutral-00":"#f4f0eb","--dsw-static-deepseek-50":"#ffeee2","--dsw-static-deepseek-100":"#fde8d9","--dsw-static-deepseek-200":"#f1ddce","--dsw-static-deepseek-300":"#e6c2a6","--dsw-static-deepseek-400":"#e0bca1","--dsw-static-deepseek-450":"#bb7f4b","--dsw-static-deepseek-500":"#a66b37","--dsw-static-deepseek-600":"#965c27","--dsw-static-deepseek-800":"#59391e","--dsw-static-deepseek-900":"#47290d","--dsw-static-blue-50":"#ffeee2","--dsw-static-blue-75":"#ffebdb","--dsw-static-blue-100":"#f8e4d5","--dsw-static-blue-300":"#dcb99d","--dsw-static-blue-400":"#d19360","--dsw-static-blue-450":"#c28551","--dsw-static-blue-500":"#a66b37","--dsw-static-blue-600":"#9b612d","--dsw-static-blue-800":"#753e00","--dsw-static-blue-900":"#4c2e12","--dsw-static-blue-950":"#3f2104","--dsw-static-blue-50p":"#ffeee2","--dsw-static-red-50":"#fdf2f2","--dsw-static-red-100":"#fce3e1","--dsw-static-red-400":"#eb6352","--dsw-static-red-500":"#e8503b","--dsw-static-red-600":"#e33300","--dsw-static-red-900":"#53150a","--dsw-static-red-600-a08":"#e3330014","--dsw-static-red-400-a12":"#eb63521f","--dsw-static-green-100":"#eaf9ec","--dsw-static-green-400":"#71cc73","--dsw-static-green-500":"#5cc051","--dsw-static-green-900":"#293b2a","--dsw-static-green-500-a08":"#5cc05114","--dsw-static-green-500-a12":"#5cc0511f","--dsw-static-amber-100":"#fdf5e9","--dsw-static-amber-400":"#f3af45","--dsw-static-amber-500":"#f0a12f","--dsw-static-amber-600":"#d88937","--dsw-static-amber-900":"#272420","--dsw-alias-link":"#885031","--dsw-alias-border-l1":"#211d170a","--dsw-alias-border-l2":"#211d171a","--dsw-alias-border-l2-darkmode-thin":"#211d171a","--dsw-alias-border-l3":"#211d171f","--dsw-alias-border-l4":"#211d1729","--dsw-alias-bg-skeleton":"#211d170a","--dsw-alias-interactive-bg-hover":"#211d170f","--dsw-alias-interactive-bg-active":"#211d171a","--dsw-alias-interactive-bg-hover-accent":"#211d1724","--dsw-alias-button-tool-bar-fill":"#615b5580","--dsw-alias-button-tool-bar-hover":"#615b5599","--dsw-alias-button-tool-bar-fill-invisible":"#211d175c","--dsw-menu-surface-fill":"#fef6ef94","--dsw-specific-menu":"#fef6eff0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#a66b37","--dsw-alias-menu-group-header-fill":"#fbf6eff0","--dsw-alias-bg-mask-drop":"#fdfbf8b3","--dsw-alias-label-caption":"#786a55","--dsw-specific-bubble":"#f3ebe3","--dsw-alias-state-error-primary":"#e33300","--dsw-alias-state-error-secondary":"#eb6352","--dsw-alias-state-success-primary":"#5cc051","--dsw-alias-state-success-secondary":"#71cc73","--dsw-alias-state-success-tertiary":"#eaf9ec","--dsw-alias-state-warn-primary":"#f0a12f","--dsw-alias-state-warn-secondary":"#f3af45","--dsw-alias-state-warn-tertiary":"#fdf5e9","--dsw-alias-state-warn-label":"#d88937","--dsw-alias-label-error":"#e33300","--dsw-alias-code-diff-added":"#5cc05114","--dsw-alias-code-diff-deleted":"#e3330014","--dsw-alias-interactive-bg-hover-danger":"#e333000d","--dsw-alias-bg-layer-4":"#f7f0e7","--dsw-specific-sidebar-fill":"#f8f4ef","--dsw-specific-sidebar-nav-item-hover":"#f0ece7","--dsw-specific-sidebar-nav-item-active":"#e8e4df","--dsw-alias-button-primary-fill":"#a16632","--dsw-alias-button-info-fill":"#a16632","--dsw-alias-markdown-code-block":"#f4ebe0","--dsw-alias-markdown-code-block-banner":"#f9eee4","--dsw-alias-file-diff-added-bg":"#eaf3e5","--dsw-alias-file-diff-added-gutter":"#f0f6ec","--dsw-alias-file-diff-added-marker":"#5f9a03","--dsw-alias-file-diff-deleted-bg":"#fae7e1","--dsw-alias-file-diff-deleted-gutter":"#fcede9","--dsw-alias-file-diff-deleted-marker":"#b43400","--dsw-alias-scrollbar-bg-l1":"#e3d5c6","--dsw-alias-scrollbar-bg-l2":"#e3d5c6","--dsw-alias-scrollbar-hover-l1":"#ddd0c0","--dsw-alias-scrollbar-hover-l2":"#ddd0c0","--dsw-alias-brand-primary":"#a66b37","--dsw-alias-label-dimmed":"#8b7f65","--dsw-alias-label-tertiary":"#76583f","--dsw-alias-label-secondary":"#634a32","--dsw-alias-label-document-preview":"#907d65","--dsw-alias-bg-base":"#fdfbf8","--dsw-alias-bg-document-preview":"#f1eade","--dsw-alias-bg-layer-1":"#fdfbf8","--dsw-alias-bg-layer-2":"#fdfbf8","--dsw-alias-bg-layer-3":"#fdfbf8","--dsw-alias-bg-module-platform":"#faf5ee","--dsw-alias-bg-overlay":"#e9e0d0","--dsw-alias-brand-primary-invert":"#27221e","--dsw-alias-brand-text":"#27221e","--dsw-alias-button-contrast-fill":"#574e46","--dsw-alias-button-elevated-fill":"#fdfbf8","--dsw-alias-button-floating-fill":"#fdfbf8","--dsw-alias-button-floating-hover":"#f7f0e7","--dsw-alias-button-ghost-active-border":"#a89a8a","--dsw-alias-button-ghost-active-fill":"#f1eade","--dsw-alias-button-ghost-active-hover":"#e9e0d0","--dsw-alias-button-primary-dimmed":"#f1eade","--dsw-alias-button-primary-hover":"#49443f","--dsw-alias-interactive-bg-hover-solid":"#f7f0e7","--dsw-alias-label-primary":"#27221e","--dsw-alias-label-primary-dimmed":"#1a1613","--dsw-alias-label-primary-foreground":"#fdfbf8","--dsw-alias-label-primary-inverted":"#fdfbf8","--dsw-alias-markdown-citation":"#f1eade","--dsw-alias-markdown-code-segment-selected":"#fdfbf8","--dsw-alias-markdown-code-segment-unselected":"#f7f0e7","--dsw-alias-markdown-placeholder":"#faf5ee","--dsw-alias-markdown-tag":"#f7f0e7","--dsw-alias-switch-thumb":"#fdfbf8","--dsw-alias-toast-bg":"#4a3f36","--dsw-alias-toast-label":"#fdfbf8","--dsw-alias-tooltip-bg":"#2b241f","--dsw-specific-input-major":"#fdfbf8","--dsw-specific-login-input":"#fef6ef","--dsw-specific-selector":"#faf5ee","--dsw-specific-tip":"#faf5ee"},"dark":{"--dsw-static-neutral-bluish-50":"#cdc9c4","--dsw-static-neutral-bluish-60":"#ccc7c0","--dsw-static-neutral-bluish-75":"#ccc5bc","--dsw-static-neutral-bluish-100":"#cac3b8","--dsw-static-neutral-bluish-150":"#cac1b1","--dsw-static-neutral-bluish-200":"#c8bfad","--dsw-static-neutral-bluish-300":"#eee2d5","--dsw-static-neutral-bluish-400":"#d9cbbd","--dsw-static-neutral-bluish-500":"#a89a8a","--dsw-static-neutral-bluish-600":"#756a5e","--dsw-static-neutral-bluish-700":"#615b55","--dsw-static-neutral-bluish-750":"#49443f","--dsw-static-neutral-bluish-800":"#4a3f36","--dsw-static-neutral-bluish-850":"#2b241f","--dsw-static-neutral-bluish-875":"#221d19","--dsw-static-neutral-bluish-900":"#201c18","--dsw-static-neutral-bluish-950":"#1a1613","--dsw-static-neutral-bluish-1000":"#19150f","--dsw-static-neutral-bluish-00":"#fdfbf8","--dsw-static-neutral-50":"#efebe6","--dsw-static-neutral-100":"#eae6e1","--dsw-static-neutral-150":"#e2ded9","--dsw-static-neutral-200":"#dbd7d2","--dsw-static-neutral-250":"#d9d4ce","--dsw-static-neutral-300":"#d6d1cb","--dsw-static-neutral-400":"#a8a39d","--dsw-static-neutral-500":"#86817b","--dsw-static-neutral-550":"#6b6661","--dsw-static-neutral-600":"#585450","--dsw-static-neutral-700":"#3f3b38","--dsw-static-neutral-800":"#2c2825","--dsw-static-neutral-850":"#24211d","--dsw-static-neutral-900":"#120f0c","--dsw-static-neutral-1000":"#000000","--dsw-static-neutral-00":"#f4f0eb","--dsw-static-deepseek-50":"#ffeee2","--dsw-static-deepseek-100":"#fde8d9","--dsw-static-deepseek-200":"#f1ddce","--dsw-static-deepseek-300":"#e6c2a6","--dsw-static-deepseek-400":"#e0bca1","--dsw-static-deepseek-450":"#bb7f4b","--dsw-static-deepseek-500":"#a66b37","--dsw-static-deepseek-600":"#965c27","--dsw-static-deepseek-800":"#59391e","--dsw-static-deepseek-900":"#47290d","--dsw-static-blue-50":"#ffeee2","--dsw-static-blue-75":"#ffebdb","--dsw-static-blue-100":"#f8e4d5","--dsw-static-blue-300":"#dcb99d","--dsw-static-blue-400":"#d19360","--dsw-static-blue-450":"#c28551","--dsw-static-blue-500":"#a66b37","--dsw-static-blue-600":"#9b612d","--dsw-static-blue-800":"#753e00","--dsw-static-blue-900":"#4c2e12","--dsw-static-blue-950":"#3f2104","--dsw-static-blue-50p":"#ffeee2","--dsw-static-red-50":"#fdf2f2","--dsw-static-red-100":"#fce3e1","--dsw-static-red-400":"#eb6352","--dsw-static-red-500":"#e8503b","--dsw-static-red-600":"#e33300","--dsw-static-red-900":"#53150a","--dsw-static-red-600-a08":"#e3330014","--dsw-static-red-400-a12":"#eb63521f","--dsw-static-green-100":"#eaf9ec","--dsw-static-green-400":"#71cc73","--dsw-static-green-500":"#5cc051","--dsw-static-green-900":"#293b2a","--dsw-static-green-500-a08":"#5cc05114","--dsw-static-green-500-a12":"#5cc0511f","--dsw-static-amber-100":"#fdf5e9","--dsw-static-amber-400":"#f3af45","--dsw-static-amber-500":"#f0a12f","--dsw-static-amber-600":"#d88937","--dsw-static-amber-900":"#272420","--dsw-alias-link":"#e6c4a0","--dsw-alias-border-l1":"#fef6ef0f","--dsw-alias-border-l2":"#fef6ef1f","--dsw-alias-border-l2-darkmode-thin":"#fef6ef0f","--dsw-alias-border-l3":"#fef6ef29","--dsw-alias-border-l4":"#fef6ef33","--dsw-alias-bg-skeleton":"#fef6ef14","--dsw-alias-interactive-bg-hover":"#fef6ef0d","--dsw-alias-interactive-bg-active":"#fef6ef17","--dsw-alias-interactive-bg-hover-accent":"#fef6ef24","--dsw-alias-button-tool-bar-fill":"#615b5580","--dsw-alias-button-tool-bar-hover":"#615b5599","--dsw-alias-button-tool-bar-fill-invisible":"#211d175c","--dsw-menu-surface-fill":"#49443f73","--dsw-specific-menu":"#2b241ff0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#e0bca1","--dsw-alias-menu-group-header-fill":"#4a3f36f0","--dsw-alias-bg-mask-drop":"#4a3f36b3","--dsw-alias-label-caption":"#cfc1b0","--dsw-specific-bubble":"#342c25","--dsw-alias-state-error-primary":"#eb6352","--dsw-alias-state-error-secondary":"#eb6352","--dsw-alias-state-success-primary":"#5cc051","--dsw-alias-state-success-secondary":"#71cc73","--dsw-alias-state-success-tertiary":"#293b2a","--dsw-alias-state-warn-primary":"#f0a12f","--dsw-alias-state-warn-secondary":"#f3af45","--dsw-alias-state-warn-tertiary":"#272420","--dsw-alias-state-warn-label":"#d88937","--dsw-alias-label-error":"#eb6352","--dsw-alias-code-diff-added":"#5cc0511f","--dsw-alias-code-diff-deleted":"#eb63521f","--dsw-alias-interactive-bg-hover-danger":"#eb635226","--dsw-alias-bg-layer-4":"#4a3f36","--dsw-specific-sidebar-fill":"#110d09","--dsw-specific-sidebar-nav-item-hover":"#18140f","--dsw-specific-sidebar-nav-item-active":"#1f1a16","--dsw-alias-button-primary-fill":"#e0bca1","--dsw-alias-button-info-fill":"#e0bca1","--dsw-alias-markdown-code-block":"#352d27","--dsw-alias-markdown-code-block-banner":"#393029","--dsw-alias-file-diff-added-bg":"#243021","--dsw-alias-file-diff-added-gutter":"#171f14","--dsw-alias-file-diff-added-marker":"#7ec155","--dsw-alias-file-diff-deleted-bg":"#3a211a","--dsw-alias-file-diff-deleted-gutter":"#26140e","--dsw-alias-file-diff-deleted-marker":"#f44f17","--dsw-alias-scrollbar-bg-l1":"#453a2d","--dsw-alias-scrollbar-bg-l2":"#5e5345","--dsw-alias-scrollbar-hover-l1":"#5e5345","--dsw-alias-scrollbar-hover-l2":"#716557","--dsw-alias-brand-primary":"#e0bca1","--dsw-alias-label-dimmed":"#9d8872","--dsw-alias-label-tertiary":"#e7c8a8","--dsw-alias-label-secondary":"#fce0c2","--dsw-alias-label-document-preview":"#998979","--dsw-alias-bg-base":"#1a1613","--dsw-alias-bg-document-preview":"#1a1613","--dsw-alias-bg-layer-1":"#221d19","--dsw-alias-bg-layer-2":"#2b241f","--dsw-alias-bg-layer-3":"#4a3f36","--dsw-alias-bg-module-platform":"#4a3f36","--dsw-alias-bg-overlay":"#615b55","--dsw-alias-brand-primary-invert":"#cdc9c4","--dsw-alias-brand-text":"#cdc9c4","--dsw-alias-button-contrast-fill":"#cdc9c4","--dsw-alias-button-elevated-fill":"#49443f","--dsw-alias-button-floating-fill":"#2b241f","--dsw-alias-button-floating-hover":"#4a3f36","--dsw-alias-button-ghost-active-border":"#756a5e","--dsw-alias-button-ghost-active-fill":"#49443f","--dsw-alias-button-ghost-active-hover":"#615b55","--dsw-alias-button-primary-dimmed":"#49443f","--dsw-alias-button-primary-hover":"#cac3b8","--dsw-alias-interactive-bg-hover-solid":"#4a3f36","--dsw-alias-label-primary":"#cdc9c4","--dsw-alias-label-primary-dimmed":"#cac3b8","--dsw-alias-label-primary-foreground":"#19150f","--dsw-alias-label-primary-inverted":"#4a3f36","--dsw-alias-markdown-citation":"#4a3f36","--dsw-alias-markdown-code-segment-selected":"#4a3f36","--dsw-alias-markdown-code-segment-unselected":"#201c18","--dsw-alias-markdown-placeholder":"#2b241f","--dsw-alias-markdown-tag":"#2b241f","--dsw-alias-switch-thumb":"#d9cbbd","--dsw-alias-toast-bg":"#49443f","--dsw-alias-toast-label":"#fdfbf8","--dsw-alias-tooltip-bg":"#49443f","--dsw-specific-input-major":"#2b241f","--dsw-specific-login-input":"#201c18","--dsw-specific-selector":"#4a3f36","--dsw-specific-tip":"#4a3f36"}},"indigo":{"label":"靛蓝","desc":"冷白 + 蓝调","tinted":true,"light":{"--dsw-static-neutral-bluish-50":"#f3f7ff","--dsw-static-neutral-bluish-60":"#f2f5fa","--dsw-static-neutral-bluish-75":"#eef2f8","--dsw-static-neutral-bluish-100":"#e8eef4","--dsw-static-neutral-bluish-150":"#dfe7ef","--dsw-static-neutral-bluish-200":"#dae3ec","--dsw-static-neutral-bluish-300":"#c4d1ee","--dsw-static-neutral-bluish-400":"#a7b2c8","--dsw-static-neutral-bluish-500":"#959dae","--dsw-static-neutral-bluish-600":"#546379","--dsw-static-neutral-bluish-700":"#455367","--dsw-static-neutral-bluish-750":"#42454b","--dsw-static-neutral-bluish-800":"#2c3a4e","--dsw-static-neutral-bluish-850":"#1b2533","--dsw-static-neutral-bluish-875":"#18212e","--dsw-static-neutral-bluish-900":"#191c25","--dsw-static-neutral-bluish-950":"#121924","--dsw-static-neutral-bluish-1000":"#1a2330","--dsw-static-neutral-bluish-00":"#f8fafc","--dsw-static-neutral-50":"#e9ebf1","--dsw-static-neutral-100":"#e4e7ec","--dsw-static-neutral-150":"#dcdfe4","--dsw-static-neutral-200":"#d5d8dd","--dsw-static-neutral-250":"#d2d5dc","--dsw-static-neutral-300":"#cfd2d9","--dsw-static-neutral-400":"#a1a4aa","--dsw-static-neutral-500":"#7f8288","--dsw-static-neutral-550":"#64676d","--dsw-static-neutral-600":"#51555e","--dsw-static-neutral-700":"#383c44","--dsw-static-neutral-800":"#262931","--dsw-static-neutral-850":"#1e2129","--dsw-static-neutral-900":"#0c0f16","--dsw-static-neutral-1000":"#000000","--dsw-static-neutral-00":"#eef0f6","--dsw-static-deepseek-50":"#eaf2ff","--dsw-static-deepseek-100":"#e2edff","--dsw-static-deepseek-200":"#d5e3f7","--dsw-static-deepseek-300":"#b3ccf1","--dsw-static-deepseek-400":"#a9c0e5","--dsw-static-deepseek-450":"#668fcf","--dsw-static-deepseek-500":"#3f66a3","--dsw-static-deepseek-600":"#446ba9","--dsw-static-deepseek-800":"#2c4163","--dsw-static-deepseek-900":"#1c3151","--dsw-static-blue-50":"#eaf2ff","--dsw-static-blue-75":"#e6f0ff","--dsw-static-blue-100":"#dceaff","--dsw-static-blue-300":"#aac2e7","--dsw-static-blue-400":"#7aa4e5","--dsw-static-blue-450":"#6c95d6","--dsw-static-blue-500":"#3f66a3","--dsw-static-blue-600":"#4970ae","--dsw-static-blue-800":"#274d88","--dsw-static-blue-900":"#213657","--dsw-static-blue-950":"#152949","--dsw-static-blue-50p":"#eaf2ff","--dsw-static-red-50":"#fdf2f3","--dsw-static-red-100":"#fbe3e6","--dsw-static-red-400":"#eb5f71","--dsw-static-red-500":"#e84c5f","--dsw-static-red-600":"#e42843","--dsw-static-red-900":"#53131a","--dsw-static-red-600-a08":"#e4284314","--dsw-static-red-400-a12":"#eb5f711f","--dsw-static-green-100":"#e6faf0","--dsw-static-green-400":"#41d192","--dsw-static-green-500":"#00c47a","--dsw-static-green-900":"#233c30","--dsw-static-green-500-a08":"#00c47a14","--dsw-static-green-500-a12":"#00c47a1f","--dsw-static-amber-100":"#fef5e9","--dsw-static-amber-400":"#faaa4d","--dsw-static-amber-500":"#f79b3e","--dsw-static-amber-600":"#dd8445","--dsw-static-amber-900":"#272420","--dsw-alias-link":"#345286","--dsw-alias-border-l1":"#1b1d230a","--dsw-alias-border-l2":"#1b1d231a","--dsw-alias-border-l2-darkmode-thin":"#1b1d231a","--dsw-alias-border-l3":"#1b1d231f","--dsw-alias-border-l4":"#1b1d2329","--dsw-alias-bg-skeleton":"#1b1d230a","--dsw-alias-interactive-bg-hover":"#1b1d230f","--dsw-alias-interactive-bg-active":"#1b1d231a","--dsw-alias-interactive-bg-hover-accent":"#1b1d2324","--dsw-alias-button-tool-bar-fill":"#585b6380","--dsw-alias-button-tool-bar-hover":"#585b6399","--dsw-alias-button-tool-bar-fill-invisible":"#1b1d235c","--dsw-menu-surface-fill":"#f3f7ff94","--dsw-specific-menu":"#f3f7fff0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#3f66a3","--dsw-alias-menu-group-header-fill":"#f3f6fbf0","--dsw-alias-bg-mask-drop":"#f8fafcb3","--dsw-alias-label-caption":"#626c80","--dsw-specific-bubble":"#e4eaf2","--dsw-alias-state-error-primary":"#e42843","--dsw-alias-state-error-secondary":"#eb5f71","--dsw-alias-state-success-primary":"#00c47a","--dsw-alias-state-success-secondary":"#41d192","--dsw-alias-state-success-tertiary":"#e6faf0","--dsw-alias-state-warn-primary":"#f79b3e","--dsw-alias-state-warn-secondary":"#faaa4d","--dsw-alias-state-warn-tertiary":"#fef5e9","--dsw-alias-state-warn-label":"#dd8445","--dsw-alias-label-error":"#e42843","--dsw-alias-code-diff-added":"#00c47a14","--dsw-alias-code-diff-deleted":"#e4284314","--dsw-alias-interactive-bg-hover-danger":"#e428430d","--dsw-alias-bg-layer-4":"#eef2f8","--dsw-specific-sidebar-fill":"#f0f3f8","--dsw-specific-sidebar-nav-item-hover":"#e8ebf0","--dsw-specific-sidebar-nav-item-active":"#e0e3e8","--dsw-alias-button-primary-fill":"#3f66a3","--dsw-alias-button-info-fill":"#3f66a3","--dsw-alias-markdown-code-block":"#e5eaf4","--dsw-alias-markdown-code-block-banner":"#e8eef9","--dsw-alias-file-diff-added-bg":"#e3f4ec","--dsw-alias-file-diff-added-gutter":"#ebf7f1","--dsw-alias-file-diff-added-marker":"#009d81","--dsw-alias-file-diff-deleted-bg":"#fae6e8","--dsw-alias-file-diff-deleted-gutter":"#fcecee","--dsw-alias-file-diff-deleted-marker":"#b12b62","--dsw-alias-scrollbar-bg-l1":"#d0d8ea","--dsw-alias-scrollbar-bg-l2":"#d0d8ea","--dsw-alias-scrollbar-hover-l1":"#cad2e4","--dsw-alias-scrollbar-hover-l2":"#cad2e4","--dsw-alias-brand-primary":"#3f66a3","--dsw-alias-label-dimmed":"#71869b","--dsw-alias-label-tertiary":"#4e6381","--dsw-alias-label-secondary":"#40536e","--dsw-alias-label-document-preview":"#78849f","--dsw-alias-bg-base":"#f8fafc","--dsw-alias-bg-document-preview":"#e8eef4","--dsw-alias-bg-layer-1":"#f8fafc","--dsw-alias-bg-layer-2":"#f8fafc","--dsw-alias-bg-layer-3":"#f8fafc","--dsw-alias-bg-module-platform":"#f2f5fa","--dsw-alias-bg-overlay":"#dfe7ef","--dsw-alias-brand-primary-invert":"#1a2330","--dsw-alias-brand-text":"#1a2330","--dsw-alias-button-contrast-fill":"#455367","--dsw-alias-button-elevated-fill":"#f8fafc","--dsw-alias-button-floating-fill":"#f8fafc","--dsw-alias-button-floating-hover":"#eef2f8","--dsw-alias-button-ghost-active-border":"#959dae","--dsw-alias-button-ghost-active-fill":"#e8eef4","--dsw-alias-button-ghost-active-hover":"#dfe7ef","--dsw-alias-button-primary-dimmed":"#e8eef4","--dsw-alias-button-primary-hover":"#42454b","--dsw-alias-interactive-bg-hover-solid":"#eef2f8","--dsw-alias-label-primary":"#1a2330","--dsw-alias-label-primary-dimmed":"#121924","--dsw-alias-label-primary-foreground":"#f8fafc","--dsw-alias-label-primary-inverted":"#f8fafc","--dsw-alias-markdown-citation":"#e8eef4","--dsw-alias-markdown-code-segment-selected":"#f8fafc","--dsw-alias-markdown-code-segment-unselected":"#eef2f8","--dsw-alias-markdown-placeholder":"#f2f5fa","--dsw-alias-markdown-tag":"#eef2f8","--dsw-alias-switch-thumb":"#f8fafc","--dsw-alias-toast-bg":"#2c3a4e","--dsw-alias-toast-label":"#f8fafc","--dsw-alias-tooltip-bg":"#1b2533","--dsw-specific-input-major":"#f8fafc","--dsw-specific-login-input":"#f3f7ff","--dsw-specific-selector":"#f2f5fa","--dsw-specific-tip":"#f2f5fa"},"dark":{"--dsw-static-neutral-bluish-50":"#cbcdd0","--dsw-static-neutral-bluish-60":"#c8cbd0","--dsw-static-neutral-bluish-75":"#c5c9cf","--dsw-static-neutral-bluish-100":"#c2c8cd","--dsw-static-neutral-bluish-150":"#bec6ce","--dsw-static-neutral-bluish-200":"#bbc4cd","--dsw-static-neutral-bluish-300":"#cbd9ed","--dsw-static-neutral-bluish-400":"#b1c3db","--dsw-static-neutral-bluish-500":"#959dae","--dsw-static-neutral-bluish-600":"#666c7a","--dsw-static-neutral-bluish-700":"#585b63","--dsw-static-neutral-bluish-750":"#42454b","--dsw-static-neutral-bluish-800":"#2c3a4e","--dsw-static-neutral-bluish-850":"#1b2533","--dsw-static-neutral-bluish-875":"#18212e","--dsw-static-neutral-bluish-900":"#191c25","--dsw-static-neutral-bluish-950":"#121924","--dsw-static-neutral-bluish-1000":"#15171d","--dsw-static-neutral-bluish-00":"#f8fafc","--dsw-static-neutral-50":"#e9ebf1","--dsw-static-neutral-100":"#e4e7ec","--dsw-static-neutral-150":"#dcdfe4","--dsw-static-neutral-200":"#d5d8dd","--dsw-static-neutral-250":"#d2d5dc","--dsw-static-neutral-300":"#cfd2d9","--dsw-static-neutral-400":"#a1a4aa","--dsw-static-neutral-500":"#7f8288","--dsw-static-neutral-550":"#64676d","--dsw-static-neutral-600":"#51555e","--dsw-static-neutral-700":"#383c44","--dsw-static-neutral-800":"#262931","--dsw-static-neutral-850":"#1e2129","--dsw-static-neutral-900":"#0c0f16","--dsw-static-neutral-1000":"#000000","--dsw-static-neutral-00":"#eef0f6","--dsw-static-deepseek-50":"#eaf2ff","--dsw-static-deepseek-100":"#e2edff","--dsw-static-deepseek-200":"#d5e3f7","--dsw-static-deepseek-300":"#b3ccf1","--dsw-static-deepseek-400":"#a9c0e5","--dsw-static-deepseek-450":"#668fcf","--dsw-static-deepseek-500":"#3f66a3","--dsw-static-deepseek-600":"#446ba9","--dsw-static-deepseek-800":"#2c4163","--dsw-static-deepseek-900":"#1c3151","--dsw-static-blue-50":"#eaf2ff","--dsw-static-blue-75":"#e6f0ff","--dsw-static-blue-100":"#dceaff","--dsw-static-blue-300":"#aac2e7","--dsw-static-blue-400":"#7aa4e5","--dsw-static-blue-450":"#6c95d6","--dsw-static-blue-500":"#3f66a3","--dsw-static-blue-600":"#4970ae","--dsw-static-blue-800":"#274d88","--dsw-static-blue-900":"#213657","--dsw-static-blue-950":"#152949","--dsw-static-blue-50p":"#eaf2ff","--dsw-static-red-50":"#fdf2f3","--dsw-static-red-100":"#fbe3e6","--dsw-static-red-400":"#eb5f71","--dsw-static-red-500":"#e84c5f","--dsw-static-red-600":"#e42843","--dsw-static-red-900":"#53131a","--dsw-static-red-600-a08":"#e4284314","--dsw-static-red-400-a12":"#eb5f711f","--dsw-static-green-100":"#e6faf0","--dsw-static-green-400":"#41d192","--dsw-static-green-500":"#00c47a","--dsw-static-green-900":"#233c30","--dsw-static-green-500-a08":"#00c47a14","--dsw-static-green-500-a12":"#00c47a1f","--dsw-static-amber-100":"#fef5e9","--dsw-static-amber-400":"#faaa4d","--dsw-static-amber-500":"#f79b3e","--dsw-static-amber-600":"#dd8445","--dsw-static-amber-900":"#272420","--dsw-alias-link":"#a8c2e6","--dsw-alias-border-l1":"#f3f7ff0f","--dsw-alias-border-l2":"#f3f7ff1f","--dsw-alias-border-l2-darkmode-thin":"#f3f7ff0f","--dsw-alias-border-l3":"#f3f7ff29","--dsw-alias-border-l4":"#f3f7ff33","--dsw-alias-bg-skeleton":"#f3f7ff14","--dsw-alias-interactive-bg-hover":"#f3f7ff0d","--dsw-alias-interactive-bg-active":"#f3f7ff17","--dsw-alias-interactive-bg-hover-accent":"#f3f7ff24","--dsw-alias-button-tool-bar-fill":"#585b6380","--dsw-alias-button-tool-bar-hover":"#585b6399","--dsw-alias-button-tool-bar-fill-invisible":"#1b1d235c","--dsw-menu-surface-fill":"#42454b73","--dsw-specific-menu":"#1b2533f0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#a9c0e5","--dsw-alias-menu-group-header-fill":"#2c3a4ef0","--dsw-alias-bg-mask-drop":"#2c3a4eb3","--dsw-alias-label-caption":"#b7c0d2","--dsw-specific-bubble":"#262f3d","--dsw-alias-state-error-primary":"#eb5f71","--dsw-alias-state-error-secondary":"#eb5f71","--dsw-alias-state-success-primary":"#00c47a","--dsw-alias-state-success-secondary":"#41d192","--dsw-alias-state-success-tertiary":"#233c30","--dsw-alias-state-warn-primary":"#f79b3e","--dsw-alias-state-warn-secondary":"#faaa4d","--dsw-alias-state-warn-tertiary":"#272420","--dsw-alias-state-warn-label":"#dd8445","--dsw-alias-label-error":"#eb5f71","--dsw-alias-code-diff-added":"#00c47a1f","--dsw-alias-code-diff-deleted":"#eb5f711f","--dsw-alias-interactive-bg-hover-danger":"#eb5f7126","--dsw-alias-bg-layer-4":"#2c3a4e","--dsw-specific-sidebar-fill":"#080f1c","--dsw-specific-sidebar-nav-item-hover":"#0e1623","--dsw-specific-sidebar-nav-item-active":"#151d2b","--dsw-alias-button-primary-fill":"#a9c0e5","--dsw-alias-button-info-fill":"#a9c0e5","--dsw-alias-markdown-code-block":"#273140","--dsw-alias-markdown-code-block-banner":"#263141","--dsw-alias-file-diff-added-bg":"#1c312a","--dsw-alias-file-diff-added-gutter":"#11201b","--dsw-alias-file-diff-added-marker":"#00c7ab","--dsw-alias-file-diff-deleted-bg":"#3a1f24","--dsw-alias-file-diff-deleted-gutter":"#271315","--dsw-alias-file-diff-deleted-marker":"#ee468a","--dsw-alias-scrollbar-bg-l1":"#363c4a","--dsw-alias-scrollbar-bg-l2":"#4e5564","--dsw-alias-scrollbar-hover-l1":"#4e5564","--dsw-alias-scrollbar-hover-l2":"#606776","--dsw-alias-brand-primary":"#a9c0e5","--dsw-alias-label-dimmed":"#77839c","--dsw-alias-label-tertiary":"#aac4e5","--dsw-alias-label-secondary":"#c3daf9","--dsw-alias-label-document-preview":"#7b8295","--dsw-alias-bg-base":"#121924","--dsw-alias-bg-document-preview":"#121924","--dsw-alias-bg-layer-1":"#18212e","--dsw-alias-bg-layer-2":"#1b2533","--dsw-alias-bg-layer-3":"#2c3a4e","--dsw-alias-bg-module-platform":"#2c3a4e","--dsw-alias-bg-overlay":"#585b63","--dsw-alias-brand-primary-invert":"#cbcdd0","--dsw-alias-brand-text":"#cbcdd0","--dsw-alias-button-contrast-fill":"#cbcdd0","--dsw-alias-button-elevated-fill":"#42454b","--dsw-alias-button-floating-fill":"#1b2533","--dsw-alias-button-floating-hover":"#2c3a4e","--dsw-alias-button-ghost-active-border":"#666c7a","--dsw-alias-button-ghost-active-fill":"#42454b","--dsw-alias-button-ghost-active-hover":"#585b63","--dsw-alias-button-primary-dimmed":"#42454b","--dsw-alias-button-primary-hover":"#c2c8cd","--dsw-alias-interactive-bg-hover-solid":"#2c3a4e","--dsw-alias-label-primary":"#cbcdd0","--dsw-alias-label-primary-dimmed":"#c2c8cd","--dsw-alias-label-primary-foreground":"#15171d","--dsw-alias-label-primary-inverted":"#2c3a4e","--dsw-alias-markdown-citation":"#2c3a4e","--dsw-alias-markdown-code-segment-selected":"#2c3a4e","--dsw-alias-markdown-code-segment-unselected":"#191c25","--dsw-alias-markdown-placeholder":"#1b2533","--dsw-alias-markdown-tag":"#1b2533","--dsw-alias-switch-thumb":"#b1c3db","--dsw-alias-toast-bg":"#42454b","--dsw-alias-toast-label":"#f8fafc","--dsw-alias-tooltip-bg":"#42454b","--dsw-specific-input-major":"#1b2533","--dsw-specific-login-input":"#191c25","--dsw-specific-selector":"#2c3a4e","--dsw-specific-tip":"#2c3a4e"}},"moss":{"label":"苔绿","desc":"浅灰绿 + 绿调","tinted":true,"light":{"--dsw-static-neutral-bluish-50":"#f0faf5","--dsw-static-neutral-bluish-60":"#f3f7ef","--dsw-static-neutral-bluish-75":"#eef4ea","--dsw-static-neutral-bluish-100":"#e8f0e3","--dsw-static-neutral-bluish-150":"#dde9d9","--dsw-static-neutral-bluish-200":"#d7e5d4","--dsw-static-neutral-bluish-300":"#badbc9","--dsw-static-neutral-bluish-400":"#9fb9ab","--dsw-static-neutral-bluish-500":"#8ea297","--dsw-static-neutral-bluish-600":"#56655a","--dsw-static-neutral-bluish-700":"#46554b","--dsw-static-neutral-bluish-750":"#404743","--dsw-static-neutral-bluish-800":"#2f3f34","--dsw-static-neutral-bluish-850":"#1d2a22","--dsw-static-neutral-bluish-875":"#1a241d","--dsw-static-neutral-bluish-900":"#191e1b","--dsw-static-neutral-bluish-950":"#131b16","--dsw-static-neutral-bluish-1000":"#1d2820","--dsw-static-neutral-bluish-00":"#f8fbf7","--dsw-static-neutral-50":"#e7edea","--dsw-static-neutral-100":"#e3e8e5","--dsw-static-neutral-150":"#dbe0dd","--dsw-static-neutral-200":"#d4d9d6","--dsw-static-neutral-250":"#cfd7d3","--dsw-static-neutral-300":"#cdd4d0","--dsw-static-neutral-400":"#9fa6a2","--dsw-static-neutral-500":"#7d8480","--dsw-static-neutral-550":"#626965","--dsw-static-neutral-600":"#515654","--dsw-static-neutral-700":"#393e3b","--dsw-static-neutral-800":"#262a28","--dsw-static-neutral-850":"#1e2320","--dsw-static-neutral-900":"#0c110e","--dsw-static-neutral-1000":"#000000","--dsw-static-neutral-00":"#ecf2ef","--dsw-static-deepseek-50":"#e8f7e4","--dsw-static-deepseek-100":"#e3f2df","--dsw-static-deepseek-200":"#d8e6d4","--dsw-static-deepseek-300":"#b9d3b2","--dsw-static-deepseek-400":"#aec7a7","--dsw-static-deepseek-450":"#709d63","--dsw-static-deepseek-500":"#4f7a42","--dsw-static-deepseek-600":"#4d7941","--dsw-static-deepseek-800":"#31492a","--dsw-static-deepseek-900":"#21381b","--dsw-static-blue-50":"#e8f7e4","--dsw-static-blue-75":"#e6f4e2","--dsw-static-blue-100":"#dfeedb","--dsw-static-blue-300":"#b0c9a9","--dsw-static-blue-400":"#84b177","--dsw-static-blue-450":"#75a369","--dsw-static-blue-500":"#4f7a42","--dsw-static-blue-600":"#527e46","--dsw-static-blue-800":"#305a24","--dsw-static-blue-900":"#263d1f","--dsw-static-blue-950":"#1a3013","--dsw-static-blue-50p":"#e8f7e4","--dsw-static-red-50":"#fdf3f1","--dsw-static-red-100":"#fce3e0","--dsw-static-red-400":"#eb644d","--dsw-static-red-500":"#e85233","--dsw-static-red-600":"#dd3f00","--dsw-static-red-900":"#521507","--dsw-static-red-600-a08":"#dd3f0014","--dsw-static-red-400-a12":"#eb644d1f","--dsw-static-green-100":"#e8f9ee","--dsw-static-green-400":"#58cf85","--dsw-static-green-500":"#32c369","--dsw-static-green-900":"#253b2d","--dsw-static-green-500-a08":"#32c36914","--dsw-static-green-500-a12":"#32c3691f","--dsw-static-amber-100":"#fcf6e9","--dsw-static-amber-400":"#eab440","--dsw-static-amber-500":"#e8a624","--dsw-static-amber-600":"#d28d2e","--dsw-static-amber-900":"#262420","--dsw-alias-link":"#406236","--dsw-alias-border-l1":"#191f1c0a","--dsw-alias-border-l2":"#191f1c1a","--dsw-alias-border-l2-darkmode-thin":"#191f1c1a","--dsw-alias-border-l3":"#191f1c1f","--dsw-alias-border-l4":"#191f1c29","--dsw-alias-bg-skeleton":"#191f1c0a","--dsw-alias-interactive-bg-hover":"#191f1c0f","--dsw-alias-interactive-bg-active":"#191f1c1a","--dsw-alias-interactive-bg-hover-accent":"#191f1c24","--dsw-alias-button-tool-bar-fill":"#565e5980","--dsw-alias-button-tool-bar-hover":"#565e5999","--dsw-alias-button-tool-bar-fill-invisible":"#191f1c5c","--dsw-menu-surface-fill":"#f0faf594","--dsw-specific-menu":"#f0faf5f0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#4f7a42","--dsw-alias-menu-group-header-fill":"#f4f8f0f0","--dsw-alias-bg-mask-drop":"#f8fbf7b3","--dsw-alias-label-caption":"#597165","--dsw-specific-bubble":"#e5ede3","--dsw-alias-state-error-primary":"#dd3f00","--dsw-alias-state-error-secondary":"#eb644d","--dsw-alias-state-success-primary":"#32c369","--dsw-alias-state-success-secondary":"#58cf85","--dsw-alias-state-success-tertiary":"#e8f9ee","--dsw-alias-state-warn-primary":"#e8a624","--dsw-alias-state-warn-secondary":"#eab440","--dsw-alias-state-warn-tertiary":"#fcf6e9","--dsw-alias-state-warn-label":"#d28d2e","--dsw-alias-label-error":"#dd3f00","--dsw-alias-code-diff-added":"#32c36914","--dsw-alias-code-diff-deleted":"#dd3f0014","--dsw-alias-interactive-bg-hover-danger":"#dd3f000d","--dsw-alias-bg-layer-4":"#eef4ea","--dsw-specific-sidebar-fill":"#f1f4f0","--dsw-specific-sidebar-nav-item-hover":"#e9ece8","--dsw-specific-sidebar-nav-item-active":"#e1e4e0","--dsw-alias-button-primary-fill":"#4f7a42","--dsw-alias-button-info-fill":"#4f7a42","--dsw-alias-markdown-code-block":"#e7eee2","--dsw-alias-markdown-code-block-banner":"#e6f2ea","--dsw-alias-file-diff-added-bg":"#e6f4e8","--dsw-alias-file-diff-added-gutter":"#edf7ee","--dsw-alias-file-diff-added-marker":"#00a14e","--dsw-alias-file-diff-deleted-bg":"#f9e8df","--dsw-alias-file-diff-deleted-gutter":"#faede6","--dsw-alias-file-diff-deleted-marker":"#9b5100","--dsw-alias-scrollbar-bg-l1":"#c9ddd2","--dsw-alias-scrollbar-bg-l2":"#c9ddd2","--dsw-alias-scrollbar-hover-l1":"#c4d8cd","--dsw-alias-scrollbar-hover-l2":"#c4d8cd","--dsw-alias-brand-primary":"#4f7a42","--dsw-alias-label-dimmed":"#768872","--dsw-alias-label-tertiary":"#476951","--dsw-alias-label-secondary":"#395945","--dsw-alias-label-document-preview":"#6b8a79","--dsw-alias-bg-base":"#f8fbf7","--dsw-alias-bg-document-preview":"#e8f0e3","--dsw-alias-bg-layer-1":"#f8fbf7","--dsw-alias-bg-layer-2":"#f8fbf7","--dsw-alias-bg-layer-3":"#f8fbf7","--dsw-alias-bg-module-platform":"#f3f7ef","--dsw-alias-bg-overlay":"#dde9d9","--dsw-alias-brand-primary-invert":"#1d2820","--dsw-alias-brand-text":"#1d2820","--dsw-alias-button-contrast-fill":"#46554b","--dsw-alias-button-elevated-fill":"#f8fbf7","--dsw-alias-button-floating-fill":"#f8fbf7","--dsw-alias-button-floating-hover":"#eef4ea","--dsw-alias-button-ghost-active-border":"#8ea297","--dsw-alias-button-ghost-active-fill":"#e8f0e3","--dsw-alias-button-ghost-active-hover":"#dde9d9","--dsw-alias-button-primary-dimmed":"#e8f0e3","--dsw-alias-button-primary-hover":"#404743","--dsw-alias-interactive-bg-hover-solid":"#eef4ea","--dsw-alias-label-primary":"#1d2820","--dsw-alias-label-primary-dimmed":"#131b16","--dsw-alias-label-primary-foreground":"#f8fbf7","--dsw-alias-label-primary-inverted":"#f8fbf7","--dsw-alias-markdown-citation":"#e8f0e3","--dsw-alias-markdown-code-segment-selected":"#f8fbf7","--dsw-alias-markdown-code-segment-unselected":"#eef4ea","--dsw-alias-markdown-placeholder":"#f3f7ef","--dsw-alias-markdown-tag":"#eef4ea","--dsw-alias-switch-thumb":"#f8fbf7","--dsw-alias-toast-bg":"#2f3f34","--dsw-alias-toast-label":"#f8fbf7","--dsw-alias-tooltip-bg":"#1d2a22","--dsw-specific-input-major":"#f8fbf7","--dsw-specific-login-input":"#f0faf5","--dsw-specific-selector":"#f3f7ef","--dsw-specific-tip":"#f3f7ef"},"dark":{"--dsw-static-neutral-bluish-50":"#cad0cb","--dsw-static-neutral-bluish-60":"#cacec6","--dsw-static-neutral-bluish-75":"#c7cdc3","--dsw-static-neutral-bluish-100":"#c4ccbf","--dsw-static-neutral-bluish-150":"#c0cbbc","--dsw-static-neutral-bluish-200":"#bccab9","--dsw-static-neutral-bluish-300":"#cfdfd3","--dsw-static-neutral-bluish-400":"#b4caba","--dsw-static-neutral-bluish-500":"#8ea297","--dsw-static-neutral-bluish-600":"#606f67","--dsw-static-neutral-bluish-700":"#565e59","--dsw-static-neutral-bluish-750":"#404743","--dsw-static-neutral-bluish-800":"#2f3f34","--dsw-static-neutral-bluish-850":"#1d2a22","--dsw-static-neutral-bluish-875":"#1a241d","--dsw-static-neutral-bluish-900":"#191e1b","--dsw-static-neutral-bluish-950":"#131b16","--dsw-static-neutral-bluish-1000":"#131916","--dsw-static-neutral-bluish-00":"#f8fbf7","--dsw-static-neutral-50":"#e7edea","--dsw-static-neutral-100":"#e3e8e5","--dsw-static-neutral-150":"#dbe0dd","--dsw-static-neutral-200":"#d4d9d6","--dsw-static-neutral-250":"#cfd7d3","--dsw-static-neutral-300":"#cdd4d0","--dsw-static-neutral-400":"#9fa6a2","--dsw-static-neutral-500":"#7d8480","--dsw-static-neutral-550":"#626965","--dsw-static-neutral-600":"#515654","--dsw-static-neutral-700":"#393e3b","--dsw-static-neutral-800":"#262a28","--dsw-static-neutral-850":"#1e2320","--dsw-static-neutral-900":"#0c110e","--dsw-static-neutral-1000":"#000000","--dsw-static-neutral-00":"#ecf2ef","--dsw-static-deepseek-50":"#e8f7e4","--dsw-static-deepseek-100":"#e3f2df","--dsw-static-deepseek-200":"#d8e6d4","--dsw-static-deepseek-300":"#b9d3b2","--dsw-static-deepseek-400":"#aec7a7","--dsw-static-deepseek-450":"#709d63","--dsw-static-deepseek-500":"#4f7a42","--dsw-static-deepseek-600":"#4d7941","--dsw-static-deepseek-800":"#31492a","--dsw-static-deepseek-900":"#21381b","--dsw-static-blue-50":"#e8f7e4","--dsw-static-blue-75":"#e6f4e2","--dsw-static-blue-100":"#dfeedb","--dsw-static-blue-300":"#b0c9a9","--dsw-static-blue-400":"#84b177","--dsw-static-blue-450":"#75a369","--dsw-static-blue-500":"#4f7a42","--dsw-static-blue-600":"#527e46","--dsw-static-blue-800":"#305a24","--dsw-static-blue-900":"#263d1f","--dsw-static-blue-950":"#1a3013","--dsw-static-blue-50p":"#e8f7e4","--dsw-static-red-50":"#fdf3f1","--dsw-static-red-100":"#fce3e0","--dsw-static-red-400":"#eb644d","--dsw-static-red-500":"#e85233","--dsw-static-red-600":"#dd3f00","--dsw-static-red-900":"#521507","--dsw-static-red-600-a08":"#dd3f0014","--dsw-static-red-400-a12":"#eb644d1f","--dsw-static-green-100":"#e8f9ee","--dsw-static-green-400":"#58cf85","--dsw-static-green-500":"#32c369","--dsw-static-green-900":"#253b2d","--dsw-static-green-500-a08":"#32c36914","--dsw-static-green-500-a12":"#32c3691f","--dsw-static-amber-100":"#fcf6e9","--dsw-static-amber-400":"#eab440","--dsw-static-amber-500":"#e8a624","--dsw-static-amber-600":"#d28d2e","--dsw-static-amber-900":"#262420","--dsw-alias-link":"#aed0a2","--dsw-alias-border-l1":"#f0faf50f","--dsw-alias-border-l2":"#f0faf51f","--dsw-alias-border-l2-darkmode-thin":"#f0faf50f","--dsw-alias-border-l3":"#f0faf529","--dsw-alias-border-l4":"#f0faf533","--dsw-alias-bg-skeleton":"#f0faf514","--dsw-alias-interactive-bg-hover":"#f0faf50d","--dsw-alias-interactive-bg-active":"#f0faf517","--dsw-alias-interactive-bg-hover-accent":"#f0faf524","--dsw-alias-button-tool-bar-fill":"#565e5980","--dsw-alias-button-tool-bar-hover":"#565e5999","--dsw-alias-button-tool-bar-fill-invisible":"#191f1c5c","--dsw-menu-surface-fill":"#40474373","--dsw-specific-menu":"#1d2a22f0","--dsw-alias-brand-primary-new-colorprimary-new-color":"#aec7a7","--dsw-alias-menu-group-header-fill":"#2f3f34f0","--dsw-alias-bg-mask-drop":"#2f3f34b3","--dsw-alias-label-caption":"#b0c6ba","--dsw-specific-bubble":"#273129","--dsw-alias-state-error-primary":"#eb644d","--dsw-alias-state-error-secondary":"#eb644d","--dsw-alias-state-success-primary":"#32c369","--dsw-alias-state-success-secondary":"#58cf85","--dsw-alias-state-success-tertiary":"#253b2d","--dsw-alias-state-warn-primary":"#e8a624","--dsw-alias-state-warn-secondary":"#eab440","--dsw-alias-state-warn-tertiary":"#262420","--dsw-alias-state-warn-label":"#d28d2e","--dsw-alias-label-error":"#eb644d","--dsw-alias-code-diff-added":"#32c3691f","--dsw-alias-code-diff-deleted":"#eb644d1f","--dsw-alias-interactive-bg-hover-danger":"#eb644d26","--dsw-alias-bg-layer-4":"#2f3f34","--dsw-specific-sidebar-fill":"#09120c","--dsw-specific-sidebar-nav-item-hover":"#0f1913","--dsw-specific-sidebar-nav-item-active":"#162019","--dsw-alias-button-primary-fill":"#aec7a7","--dsw-alias-button-info-fill":"#aec7a7","--dsw-alias-markdown-code-block":"#29342b","--dsw-alias-markdown-code-block-banner":"#29372d","--dsw-alias-file-diff-added-bg":"#203125","--dsw-alias-file-diff-added-gutter":"#142017","--dsw-alias-file-diff-added-marker":"#43c87e","--dsw-alias-file-diff-deleted-bg":"#392215","--dsw-alias-file-diff-deleted-gutter":"#25150a","--dsw-alias-file-diff-deleted-marker":"#d67100","--dsw-alias-scrollbar-bg-l1":"#314138","--dsw-alias-scrollbar-bg-l2":"#485950","--dsw-alias-scrollbar-hover-l1":"#485950","--dsw-alias-scrollbar-hover-l2":"#5a6c62","--dsw-alias-brand-primary":"#aec7a7","--dsw-alias-label-dimmed":"#6f8c7c","--dsw-alias-label-tertiary":"#a9ceb3","--dsw-alias-label-secondary":"#c1e3ca","--dsw-alias-label-document-preview":"#768a7e","--dsw-alias-bg-base":"#131b16","--dsw-alias-bg-document-preview":"#131b16","--dsw-alias-bg-layer-1":"#1a241d","--dsw-alias-bg-layer-2":"#1d2a22","--dsw-alias-bg-layer-3":"#2f3f34","--dsw-alias-bg-module-platform":"#2f3f34","--dsw-alias-bg-overlay":"#565e59","--dsw-alias-brand-primary-invert":"#cad0cb","--dsw-alias-brand-text":"#cad0cb","--dsw-alias-button-contrast-fill":"#cad0cb","--dsw-alias-button-elevated-fill":"#404743","--dsw-alias-button-floating-fill":"#1d2a22","--dsw-alias-button-floating-hover":"#2f3f34","--dsw-alias-button-ghost-active-border":"#606f67","--dsw-alias-button-ghost-active-fill":"#404743","--dsw-alias-button-ghost-active-hover":"#565e59","--dsw-alias-button-primary-dimmed":"#404743","--dsw-alias-button-primary-hover":"#c4ccbf","--dsw-alias-interactive-bg-hover-solid":"#2f3f34","--dsw-alias-label-primary":"#cad0cb","--dsw-alias-label-primary-dimmed":"#c4ccbf","--dsw-alias-label-primary-foreground":"#131916","--dsw-alias-label-primary-inverted":"#2f3f34","--dsw-alias-markdown-citation":"#2f3f34","--dsw-alias-markdown-code-segment-selected":"#2f3f34","--dsw-alias-markdown-code-segment-unselected":"#191e1b","--dsw-alias-markdown-placeholder":"#1d2a22","--dsw-alias-markdown-tag":"#1d2a22","--dsw-alias-switch-thumb":"#b4caba","--dsw-alias-toast-bg":"#404743","--dsw-alias-toast-label":"#f8fbf7","--dsw-alias-tooltip-bg":"#404743","--dsw-specific-input-major":"#1d2a22","--dsw-specific-login-input":"#191e1b","--dsw-specific-selector":"#2f3f34","--dsw-specific-tip":"#2f3f34"}}};
    var TP_LABEL_EN = { mono: 'Neutral', warm: 'Warm Sand', indigo: 'Indigo', moss: 'Moss' };
    function isTp(v) { return typeof v === 'string' && v.slice(0, 3) === 'tp-' && THEME_PALETTE[v.slice(3)] !== undefined; }
    function tpLabel(v) { var it = THEME_PALETTE[v.slice(3)]; if (!it) return v; return IS_ZH ? it.label : (TP_LABEL_EN[v.slice(3)] || it.label); }

    var mix = function (c, p) { return 'color-mix(in oklch, ' + c + ', transparent ' + p + '%)'; };
    var readableAccent = function (p, dark) { return dark ? p.accentD : 'color-mix(in oklch, ' + p.accentL + ' 88%, black)'; };

    // ── token 编译（源自 tokens.ts，逐字复刻）────────────────────────────────
    function bloomTokens(p, dark) {
      var tx = dark ? p.txD : p.txL;
      var m = p.morandi;
      var motion = dark ? p.motionD : p.motionL;
      return '\n'
        + '  --bloom-morandi: ' + m + ';\n'
        + '  --bloom-accent: ' + readableAccent(p, dark) + ';\n'
        + '  --bloom-motion-1: ' + motion[0] + ';\n'
        + '  --bloom-motion-2: ' + motion[1] + ';\n'
        + '  --bloom-motion-3: ' + motion[2] + ';\n'
        + '  --dsw-alias-label-deep-diving: color-mix(in oklch, ' + motion[1] + ', transparent ' + (dark ? 8 : 6) + '%);\n'
        + '  --dsw-alias-label-deep-diving-shimmer: color-mix(in oklch, ' + motion[2] + ', transparent ' + (dark ? 45 : 35) + '%);\n'
        + '  --bloom-aurora-stream-1: color-mix(in oklch, ' + motion[0] + ', transparent ' + (dark ? 55 : 72) + '%);\n'
        + '  --bloom-aurora-stream-2: color-mix(in oklch, ' + motion[1] + ', transparent ' + (dark ? 55 : 72) + '%);\n'
        + '  --bloom-aurora-stream-3: color-mix(in oklch, ' + motion[2] + ', transparent ' + (dark ? 55 : 72) + '%);\n'
        + '  --bloom-shadow-sm: 0 2px 8px ' + (dark ? 'rgba(0,0,0,0.4)' : mix(tx, 96)) + ';\n'
        + '  --bloom-shadow: 0 10px 30px ' + (dark ? 'rgba(0,0,0,0.5)' : mix(tx, 94)) + ';\n'
        + '  --bloom-shadow-lg: 0 24px 60px ' + (dark ? 'rgba(0,0,0,0.6)' : mix(tx, 90)) + ';\n'
        + '  --dsw-alias-state-business-primary: ' + readableAccent(p, dark) + ';\n'
        + '  --bloom-glass-blur: ' + (dark ? '22px' : '24px') + ';\n'
        + '  --bloom-cursor-x: 50%;\n'
        + '  --bloom-cursor-y: 50%;\n'
        + '  --bloom-hairline: rgba(' + m + ', 0.3);\n'
        + '  --bloom-hairline-strong: rgba(' + m + ', ' + (dark ? 0.55 : 0.5) + ');\n'
        + '  --bloom-glow: rgba(' + m + ', ' + (dark ? 0.34 : 0.2) + ');\n'
        + '  --bloom-code-bg: rgba(' + m + ', ' + (dark ? 0.16 : 0.13) + ');\n'
        + '  --bloom-code-fg: ' + (dark ? p.txD : p.txL) + ';';
    }

    function borderStack(p, dark) {
      var m = p.morandi;
      var tx = dark ? p.txD : p.txL;
      return dark
        ? '  --dsw-alias-border-l1: rgba(' + m + ', 0.10);\n'
          + '  --dsw-alias-border-l2: rgba(' + m + ', 0.18);\n'
          + '  --dsw-alias-border-l3: rgba(' + m + ', 0.28);\n'
          + '  --dsw-alias-border-l4: rgba(' + m + ', 0.40);'
        : '  --dsw-alias-border-l1: ' + mix(tx, 90) + ';\n'
          + '  --dsw-alias-border-l2: ' + mix(tx, 80) + ';\n'
          + '  --dsw-alias-border-l3: ' + mix(tx, 70) + ';\n'
          + '  --dsw-alias-border-l4: ' + mix(tx, 60) + ';';
    }

    function labelStack(p, dark) {
      var tx = dark ? p.txD : p.txL;
      return dark
        ? '  --dsw-alias-label-secondary: ' + mix(tx, 30) + ';\n'
          + '  --dsw-alias-label-tertiary: ' + mix(tx, 35) + ';\n'
          + '  --dsw-alias-label-caption: ' + mix(tx, 40) + ';\n'
          + '  --dsw-alias-label-dimmed: ' + mix(tx, 43) + ';'
        : '  --dsw-alias-label-secondary: ' + mix(tx, 28) + ';\n'
          + '  --dsw-alias-label-tertiary: ' + mix(tx, 32) + ';\n'
          + '  --dsw-alias-label-caption: ' + mix(tx, 35) + ';\n'
          + '  --dsw-alias-label-dimmed: ' + mix(tx, 37) + ';';
    }

    function sharedDswTokens(p, dark) {
      var bg = dark ? p.bgD : p.bgL;
      var tx = dark ? p.txD : p.txL;
      var ok = dark ? 'oklch(72% 0.12 150)' : 'oklch(45% 0.14 150)';
      var err = dark ? 'oklch(72% 0.16 25)' : 'oklch(45% 0.16 25)';
      var warn = dark ? 'oklch(80% 0.12 75)' : 'oklch(45% 0.11 75)';
      var t = function (c, pct) { return 'color-mix(in oklch, ' + c + ', ' + bg + ' ' + pct + '%)'; };
      return '\n'
        + '  --dsw-alias-state-success-primary: ' + ok + ';\n'
        + '  --dsw-alias-state-success-secondary: ' + ok + ';\n'
        + '  --dsw-alias-state-success-tertiary: ' + t(ok, dark ? 78 : 88) + ';\n'
        + '  --dsw-alias-state-error-primary: ' + err + ';\n'
        + '  --dsw-alias-state-error-secondary: ' + err + ';\n'
        + '  --dsw-alias-state-warn-primary: ' + warn + ';\n'
        + '  --dsw-alias-state-warn-secondary: ' + warn + ';\n'
        + '  --dsw-alias-state-warn-tertiary: ' + t(warn, dark ? 78 : 88) + ';\n'
        + '  --dsw-alias-state-warn-label: ' + (dark ? 'oklch(88% 0.1 75)' : 'oklch(40% 0.09 75)') + ';\n'
        + '  --dsw-alias-interactive-bg-hover-danger: ' + mix(err, dark ? 86 : 90) + ';\n'
        + '  --dsw-alias-state-business-tertiary: ' + t(readableAccent(p, dark), dark ? 78 : 88) + ';\n'
        + '  --dsw-alias-border-inverted: ' + mix(bg, 85) + ';\n'
        + '  --dsw-alias-border-inverted2: ' + mix(bg, 70) + ';\n'
        + '  --dsw-alias-label-primary-inverted: ' + bg + ';\n'
        + '  --dsw-alias-button-contrast-fill: ' + tx + ';\n'
        + '  --dsw-alias-button-elevated-fill: ' + bg + ';\n'
        + '  --dsw-alias-button-tool-bar-fill-invisible: transparent;\n'
        + '  --dsw-alias-markdown-code-block-banner: ' + mix(tx, 96) + ';\n'
        + '  --dsw-alias-tooltip-bg: color-mix(in oklch, ' + (dark ? bg : tx) + ', black ' + (dark ? 22 : 8) + '%);\n'
        + '  --dsw-alias-toast-bg: color-mix(in oklch, ' + (dark ? bg : tx) + ', black ' + (dark ? 22 : 8) + '%);\n'
        + '  --dsw-alias-bg-mask-photo: color-mix(in oklch, ' + bg + ', black ' + (dark ? 45 : 30) + '%);';
    }

    function mistLight(p) {
      var bgL = p.bgL, txL = p.txL, sfL = p.sfL, sf2L = p.sf2L;
      var aL = readableAccent(p, false);
      return '\n'
        + '/* Bloom · mist 亮色（默认）*/\n'
        + 'body[data-bloom-variant="mist"] {' + bloomTokens(p, false) + sharedDswTokens(p, false) + '\n'
        + '  --dsw-alias-bg-base: ' + bgL + ';\n'
        + '  --dsw-alias-bg-layer-1: ' + bgL + ';\n'
        + '  --dsw-alias-bg-layer-2: ' + sfL + ';\n'
        + '  --dsw-alias-bg-layer-3: ' + sf2L + ';\n'
        + '  --dsw-alias-bg-overlay: ' + sfL + ';\n'
        + '  --dsw-alias-bg-module-platform: ' + sfL + ';\n'
        + '  --dsw-alias-bg-multi-select: ' + sf2L + ';\n'
        + '  --dsw-alias-bg-skeleton: ' + mix(txL, 96) + ';\n'
        + '  --dsw-alias-bg-mask-1: ' + mix(txL, 97) + ';\n'
        + '  --dsw-alias-bg-mask-2: ' + mix(txL, 95) + ';\n'
        + '  --dsw-alias-bg-mask-3: ' + mix(txL, 93) + ';\n'
        + '  --dsw-alias-bg-mask-drop: ' + mix(txL, 88) + ';\n'
        + '  --dsw-alias-label-primary: ' + txL + ';\n'
        + '  --dsw-alias-label-primary-bluish: ' + txL + ';\n'
        + '  --dsw-alias-label-primary-dimmed: ' + mix(txL, 25) + ';\n'
        + '  --dsw-alias-label-primary-foreground: ' + bgL + ';\n'
        + labelStack(p, false) + '\n'
        + '  --dsw-alias-brand-primary: ' + aL + ';\n'
        + '  --dsw-alias-brand-primary-invert: ' + bgL + ';\n'
        + '  --dsw-alias-brand-text: ' + bgL + ';\n'
        + borderStack(p, false) + '\n'
        + '  --dsw-alias-button-primary-fill: ' + aL + ';\n'
        + '  --dsw-alias-button-primary-hover: color-mix(in oklch, ' + aL + ', black 8%);\n'
        + '  --dsw-alias-button-primary-dimmed: ' + bgL + ';\n'
        + '  --dsw-alias-button-tool-bar-fill: ' + sfL + ';\n'
        + '  --dsw-alias-button-tool-bar-hover: ' + mix(txL, 95) + ';\n'
        + '  --dsw-alias-button-floating-fill: ' + sfL + ';\n'
        + '  --dsw-alias-button-floating-hover: ' + sf2L + ';\n'
        + '  --dsw-alias-button-info-fill: ' + aL + ';\n'
        + '  --dsw-alias-button-info-hover: color-mix(in oklch, ' + aL + ', black 8%);\n'
        + '  --dsw-alias-button-ghost-active-fill: ' + mix(aL, 92) + ';\n'
        + '  --dsw-alias-button-ghost-active-hover: ' + mix(aL, 88) + ';\n'
        + '  --dsw-alias-button-ghost-active-border: ' + mix(aL, 78) + ';\n'
        + '  --dsw-alias-interactive-bg-hover: ' + mix(aL, 92) + ';\n'
        + '  --dsw-alias-interactive-bg-hover-accent: ' + mix(aL, 85) + ';\n'
        + '  --dsw-alias-interactive-bg-hover-solid: ' + mix(aL, 88) + ';\n'
        + '  --dsw-alias-interactive-bg-active: ' + mix(aL, 88) + ';\n'
        + '  --dsw-alias-markdown-inline-code: var(--bloom-code-bg);\n'
        + '  --dsw-alias-markdown-code-block: ' + sfL + ';\n'
        + '  --dsw-alias-markdown-tag: ' + mix(aL, 88) + ';\n'
        + '  --dsw-alias-markdown-placeholder: ' + mix(txL, 50) + ';\n'
        + '  --dsw-alias-markdown-citation: ' + mix(txL, 55) + ';\n'
        + '  --dsw-alias-scrollbar-bg-l1: ' + mix(txL, 90) + ';\n'
        + '  --dsw-alias-scrollbar-bg-l2: ' + mix(txL, 80) + ';\n'
        + '  --dsw-alias-scrollbar-hover-l1: ' + mix(txL, 82) + ';\n'
        + '  --dsw-alias-scrollbar-hover-l2: ' + mix(txL, 72) + ';\n'
        + '  --dsw-specific-bubble: color-mix(in oklch, ' + bgL + ', ' + txL + ' 3%);\n'
        + '  --dsw-specific-bubble-highlight: ' + mix(aL, 88) + ';\n'
        + '  --dsw-specific-input-major: ' + bgL + ';\n'
        + '  --dsw-specific-login-input: ' + sfL + ';\n'
        + '  --dsw-specific-menu: ' + sf2L + ';\n'
        + '  --dsw-specific-selector: ' + sfL + ';\n'
        + '  --dsw-specific-sidebar-fill: color-mix(in oklch, ' + bgL + ', ' + txL + ' 5%);\n'
        + '  --dsw-specific-sidebar-nav-item-active-accent: ' + mix(aL, 86) + ';\n'
        + '  --dsw-specific-sidebar-nav-item-active: ' + mix(aL, 93) + ';\n'
        + '  --dsw-specific-sidebar-nav-item-hover: ' + mix(txL, 95) + ';\n'
        + '  --dsw-specific-tip: ' + mix(aL, 90) + ';\n'
        + '}\n';
    }

    function mistDark(p) {
      var aD = p.accentD, bgD = p.bgD, txD = p.txD, sfD = p.sfD, sf2D = p.sf2D;
      return '\n'
        + '/* Bloom · mist 暗色 */\n'
        + 'body[data-ds-dark-theme][data-bloom-variant="mist"] {' + bloomTokens(p, true) + sharedDswTokens(p, true) + '\n'
        + '  --dsw-alias-bg-base: ' + bgD + ';\n'
        + '  --dsw-alias-bg-layer-1: ' + bgD + ';\n'
        + '  --dsw-alias-bg-layer-2: ' + sfD + ';\n'
        + '  --dsw-alias-bg-layer-3: ' + sf2D + ';\n'
        + '  --dsw-alias-bg-overlay: ' + sfD + ';\n'
        + '  --dsw-alias-bg-module-platform: ' + sfD + ';\n'
        + '  --dsw-alias-bg-multi-select: ' + sf2D + ';\n'
        + '  --dsw-alias-bg-skeleton: ' + mix(txD, 94) + ';\n'
        + '  --dsw-alias-bg-mask-1: ' + mix(txD, 96) + ';\n'
        + '  --dsw-alias-bg-mask-2: ' + mix(txD, 93) + ';\n'
        + '  --dsw-alias-bg-mask-3: ' + mix(txD, 90) + ';\n'
        + '  --dsw-alias-bg-mask-drop: ' + mix(txD, 84) + ';\n'
        + '  --dsw-alias-label-primary: ' + txD + ';\n'
        + '  --dsw-alias-label-primary-bluish: ' + txD + ';\n'
        + '  --dsw-alias-label-primary-dimmed: ' + mix(txD, 30) + ';\n'
        + '  --dsw-alias-label-primary-foreground: ' + bgD + ';\n'
        + labelStack(p, true) + '\n'
        + '  --dsw-alias-brand-primary: ' + aD + ';\n'
        + '  --dsw-alias-brand-primary-invert: ' + bgD + ';\n'
        + '  --dsw-alias-brand-text: ' + bgD + ';\n'
        + borderStack(p, true) + '\n'
        + '  --dsw-alias-button-primary-fill: ' + aD + ';\n'
        + '  --dsw-alias-button-primary-hover: color-mix(in oklch, ' + aD + ', white 8%);\n'
        + '  --dsw-alias-button-primary-dimmed: ' + bgD + ';\n'
        + '  --dsw-alias-button-tool-bar-fill: ' + sfD + ';\n'
        + '  --dsw-alias-button-tool-bar-hover: ' + mix(txD, 92) + ';\n'
        + '  --dsw-alias-button-floating-fill: ' + sfD + ';\n'
        + '  --dsw-alias-button-floating-hover: ' + sf2D + ';\n'
        + '  --dsw-alias-button-info-fill: ' + aD + ';\n'
        + '  --dsw-alias-button-info-hover: color-mix(in oklch, ' + aD + ', white 8%);\n'
        + '  --dsw-alias-button-ghost-active-fill: ' + mix(aD, 88) + ';\n'
        + '  --dsw-alias-button-ghost-active-hover: ' + mix(aD, 82) + ';\n'
        + '  --dsw-alias-button-ghost-active-border: ' + mix(aD, 70) + ';\n'
        + '  --dsw-alias-interactive-bg-hover: ' + mix(aD, 90) + ';\n'
        + '  --dsw-alias-interactive-bg-hover-accent: ' + mix(aD, 84) + ';\n'
        + '  --dsw-alias-interactive-bg-hover-solid: ' + mix(aD, 82) + ';\n'
        + '  --dsw-alias-interactive-bg-active: ' + mix(aD, 86) + ';\n'
        + '  --dsw-alias-markdown-inline-code: var(--bloom-code-bg);\n'
        + '  --dsw-alias-markdown-code-block: oklch(24% 0.02 240);\n'
        + '  --dsw-alias-markdown-tag: ' + mix(aD, 85) + ';\n'
        + '  --dsw-alias-markdown-placeholder: ' + mix(txD, 40) + ';\n'
        + '  --dsw-alias-markdown-citation: ' + mix(txD, 35) + ';\n'
        + '  --dsw-alias-scrollbar-bg-l1: ' + mix(txD, 86) + ';\n'
        + '  --dsw-alias-scrollbar-bg-l2: ' + mix(txD, 76) + ';\n'
        + '  --dsw-alias-scrollbar-hover-l1: ' + mix(txD, 75) + ';\n'
        + '  --dsw-alias-scrollbar-hover-l2: ' + mix(txD, 65) + ';\n'
        + '  --dsw-specific-bubble: color-mix(in oklch, ' + bgD + ', white 3%);\n'
        + '  --dsw-specific-bubble-highlight: ' + mix(aD, 82) + ';\n'
        + '  --dsw-specific-input-major: ' + bgD + ';\n'
        + '  --dsw-specific-login-input: ' + sfD + ';\n'
        + '  --dsw-specific-menu: ' + sf2D + ';\n'
        + '  --dsw-specific-selector: ' + sfD + ';\n'
        + '  --dsw-specific-sidebar-fill: color-mix(in oklch, ' + bgD + ', black 7%);\n'
        + '  --dsw-specific-sidebar-nav-item-active-accent: ' + mix(aD, 80) + ';\n'
        + '  --dsw-specific-sidebar-nav-item-active: ' + mix(aD, 88) + ';\n'
        + '  --dsw-specific-sidebar-nav-item-hover: ' + mix(txD, 95) + ';\n'
        + '  --dsw-specific-tip: ' + mix(aD, 84) + ';\n'
        + '}\n';
    }

    function variantBlock(v, dark) {
      var p = PALETTE[v];
      var a = readableAccent(p, dark);
      var bg = dark ? p.bgD : p.bgL;
      var tx = dark ? p.txD : p.txL;
      var sf = dark ? p.sfD : p.sfL;
      var sf2 = dark ? p.sf2D : p.sf2L;
      var sel = dark
        ? 'body[data-ds-dark-theme][data-bloom-variant="' + v + '"]'
        : 'body[data-bloom-variant="' + v + '"]';
      return '\n'
        + '/* Bloom · ' + v + (dark ? ' 暗色' : '') + '（仅覆盖主色 + 背景调，骨架继承 mist）*/\n'
        + sel + ' {' + bloomTokens(p, dark) + sharedDswTokens(p, dark) + '\n'
        + '  --dsw-alias-bg-base: ' + bg + ';\n'
        + '  --dsw-alias-bg-layer-1: ' + bg + ';\n'
        + '  --dsw-alias-bg-layer-2: ' + sf + ';\n'
        + '  --dsw-alias-bg-layer-3: ' + sf2 + ';\n'
        + '  --dsw-alias-bg-overlay: ' + sf + ';\n'
        + '  --dsw-alias-bg-module-platform: ' + sf + ';\n'
        + '  --dsw-alias-bg-multi-select: ' + sf2 + ';\n'
        + '  --dsw-alias-bg-skeleton: ' + mix(tx, 95) + ';\n'
        + '  --dsw-alias-bg-mask-1: ' + mix(tx, 97) + ';\n'
        + '  --dsw-alias-bg-mask-2: ' + mix(tx, 95) + ';\n'
        + '  --dsw-alias-bg-mask-3: ' + mix(tx, 93) + ';\n'
        + '  --dsw-alias-bg-mask-drop: ' + mix(tx, 88) + ';\n'
        + '  --dsw-alias-brand-primary: ' + a + ';\n'
        + '  --dsw-alias-brand-primary-invert: ' + bg + ';\n'
        + '  --dsw-alias-brand-text: ' + bg + ';\n'
        + '  --dsw-alias-button-primary-fill: ' + a + ';\n'
        + '  --dsw-alias-button-primary-hover: color-mix(in oklch, ' + a + ', ' + (dark ? 'white' : 'black') + ' 8%);\n'
        + '  --dsw-alias-button-primary-dimmed: ' + bg + ';\n'
        + '  --dsw-alias-button-info-fill: ' + a + ';\n'
        + '  --dsw-alias-button-info-hover: color-mix(in oklch, ' + a + ', ' + (dark ? 'white' : 'black') + ' 8%);\n'
        + '  --dsw-alias-button-ghost-active-fill: ' + mix(a, dark ? 88 : 92) + ';\n'
        + '  --dsw-alias-button-ghost-active-hover: ' + mix(a, dark ? 82 : 88) + ';\n'
        + '  --dsw-alias-button-ghost-active-border: ' + mix(a, dark ? 70 : 78) + ';\n'
        + '  --dsw-alias-button-tool-bar-fill: ' + sf + ';\n'
        + '  --dsw-alias-button-tool-bar-hover: ' + mix(tx, dark ? 92 : 95) + ';\n'
        + '  --dsw-alias-button-floating-fill: ' + sf + ';\n'
        + '  --dsw-alias-button-floating-hover: ' + sf2 + ';\n'
        + '  --dsw-alias-interactive-bg-hover: ' + mix(a, dark ? 90 : 92) + ';\n'
        + '  --dsw-alias-interactive-bg-hover-accent: ' + mix(a, dark ? 84 : 85) + ';\n'
        + '  --dsw-alias-interactive-bg-hover-solid: ' + mix(a, dark ? 82 : 88) + ';\n'
        + '  --dsw-alias-interactive-bg-active: ' + mix(a, dark ? 86 : 88) + ';\n'
        + '  --dsw-alias-markdown-tag: ' + mix(a, dark ? 85 : 88) + ';\n'
        + '  --dsw-alias-markdown-inline-code: var(--bloom-code-bg);\n'
        + '  --dsw-alias-markdown-code-block: ' + (dark ? 'color-mix(in oklch, ' + bg + ', black 12%)' : sf) + ';\n'
        + '  --dsw-alias-scrollbar-bg-l1: ' + mix(tx, dark ? 86 : 90) + ';\n'
        + '  --dsw-alias-scrollbar-bg-l2: ' + mix(tx, dark ? 76 : 80) + ';\n'
        + '  --dsw-alias-scrollbar-hover-l1: ' + mix(tx, dark ? 75 : 82) + ';\n'
        + '  --dsw-alias-scrollbar-hover-l2: ' + mix(tx, dark ? 65 : 72) + ';\n'
        + '  --dsw-alias-label-primary: ' + tx + ';\n'
        + '  --dsw-alias-label-primary-bluish: ' + tx + ';\n'
        + '  --dsw-alias-label-primary-dimmed: ' + mix(tx, dark ? 30 : 25) + ';\n'
        + '  --dsw-alias-label-primary-foreground: ' + bg + ';\n'
        + labelStack(p, dark) + '\n'
        + borderStack(p, dark) + '\n'
        + '  --dsw-alias-markdown-placeholder: ' + mix(tx, dark ? 40 : 50) + ';\n'
        + '  --dsw-alias-markdown-citation: ' + mix(tx, dark ? 35 : 55) + ';\n'
        + '  --dsw-specific-bubble: color-mix(in oklch, ' + bg + ', ' + tx + ' ' + (dark ? 4 : 3) + '%);\n'
        + '  --dsw-specific-bubble-highlight: ' + mix(a, dark ? 82 : 88) + ';\n'
        + '  --dsw-specific-input-major: ' + bg + ';\n'
        + '  --dsw-specific-login-input: ' + sf + ';\n'
        + '  --dsw-specific-menu: ' + sf2 + ';\n'
        + '  --dsw-specific-selector: ' + sf + ';\n'
        + '  --dsw-specific-sidebar-fill: color-mix(in oklch, ' + bg + ', ' + (dark ? 'black' : tx) + ' ' + (dark ? 7 : 5) + '%);\n'
        + '  --dsw-specific-sidebar-nav-item-active-accent: ' + mix(a, dark ? 80 : 86) + ';\n'
        + '  --dsw-specific-sidebar-nav-item-active: ' + mix(a, dark ? 88 : 93) + ';\n'
        + '  --dsw-specific-sidebar-nav-item-hover: ' + mix(tx, 95) + ';\n'
        + '  --dsw-specific-tip: ' + mix(a, dark ? 84 : 90) + ';\n'
        + '}\n';
    }

    function buildBloomCSS() {
      var blocks = [mistLight(PALETTE.mist), mistDark(PALETTE.mist)];
      for (var i = 0; i < VARIANTS.length; i++) {
        var v = VARIANTS[i];
        if (v === 'mist') continue;
        blocks.push(variantBlock(v, false), variantBlock(v, true));
      }
      var tpIds = Object.keys(THEME_PALETTE);
      for (var j = 0; j < tpIds.length; j++) {
        var id = tpIds[j], tp = THEME_PALETTE[id];
        var lsel = 'body[data-bloom-variant="tp-' + id + '"]';
        var dsel = 'body[data-ds-dark-theme][data-bloom-variant="tp-' + id + '"]';
        var lb = ['/* dsh-theme-palette · ' + id + ' · light */', lsel + ' {'];
        for (var lk in tp.light) lb.push('  ' + lk + ': ' + tp.light[lk] + ';');
        lb.push('}');
        var db = ['/* dsh-theme-palette · ' + id + ' · dark */', dsel + ' {'];
        for (var dk in tp.dark) db.push('  ' + dk + ': ' + tp.dark[dk] + ';');
        db.push('}');
        blocks.push(lb.join('\n'), db.join('\n'));
      }
      return blocks.join('\n');
    }

    // ── 切换器样式 ─────────────────────────────────────────────────────────
    var WIDGET_CSS = [
      '.bloomc{position:fixed;right:16px;bottom:16px;z-index:2147482000;font:12px/1.4 system-ui,-apple-system,"PingFang SC","Segoe UI",sans-serif;color:var(--dsw-alias-label-primary,#222)}',
      '.bloomc *{box-sizing:border-box}',
      '.bloomc-btn{display:flex;align-items:center;gap:7px;height:34px;padding:0 12px;border-radius:17px;border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));background:color-mix(in oklch,var(--dsw-alias-bg-layer-2,#fff),transparent 6%);color:var(--dsw-alias-label-primary,#222);cursor:pointer;box-shadow:0 6px 20px rgba(0,0,0,.18);backdrop-filter:blur(14px) saturate(1.2);-webkit-backdrop-filter:blur(14px) saturate(1.2);font:inherit}',
      '.bloomc-btn:hover{border-color:var(--bloom-accent,var(--dsw-alias-brand-primary,#888))}',
      '.bloomc-dot{width:16px;height:16px;border-radius:50%;border:1px solid rgba(0,0,0,.2);flex:none}',
      '.bloomc-btn-text{font-size:12.5px;font-weight:600;letter-spacing:.3px;white-space:nowrap}',
      '.bloomc-panel{position:absolute;right:0;bottom:46px;width:262px;padding:9px;border-radius:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px;background:color-mix(in oklch,var(--dsw-alias-bg-layer-2,#fff),transparent 4%);border:1px solid var(--dsw-alias-border-l2,rgba(0,0,0,.15));box-shadow:0 14px 36px rgba(0,0,0,.30);backdrop-filter:blur(18px) saturate(1.3);-webkit-backdrop-filter:blur(18px) saturate(1.3)}',
      '.bloomc-panel[hidden]{display:none}',
      '.bloomc-item{display:flex;flex-direction:column;align-items:center;gap:5px;padding:7px 3px;border-radius:9px;border:1px solid transparent;background:transparent;cursor:pointer;color:var(--dsw-alias-label-secondary,#555);font:11px/1.2 inherit}',
      '.bloomc-item:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(120,120,120,.12))}',
      '.bloomc-item[data-active]{border-color:var(--bloom-accent,var(--dsw-alias-brand-primary,#888));color:var(--dsw-alias-label-primary,#222)}',
      '.bloomc-sw{width:26px;height:26px;border-radius:50%;border:1px solid rgba(0,0,0,.18);box-shadow:inset 0 0 0 1px rgba(255,255,255,.28)}',
      '.bloomc-group{grid-column:1/-1;font-size:10.5px;letter-spacing:.4px;color:var(--dsw-alias-label-tertiary,#8a8a8a);padding:5px 2px 1px;font-weight:600}',
      '.bloomc-name{white-space:nowrap}'
    ].join('\n');

    // ── 注入 / 状态 ────────────────────────────────────────────────────────
    var styleTags = [];
    function injectCSS(css, idSuffix) {
      var tagId = PLUGIN_ID + '/' + idSuffix;
      if (document.querySelector('style[data-plugin-css="' + tagId + '"]')) return null;
      var tag = document.createElement('style');
      tag.setAttribute('data-plugin', PLUGIN_ID);
      tag.setAttribute('data-plugin-css', tagId);
      tag.textContent = css;
      document.head.appendChild(tag);
      styleTags.push(tag);
      return tag;
    }

    function readVariant() {
      try { var v = window.localStorage.getItem(STORAGE_KEY); return (VARIANTS.indexOf(v) >= 0 || isTp(v)) ? v : 'mist'; }
      catch (e) { return 'mist'; }
    }
    function writeVariant(v) { try { window.localStorage.setItem(STORAGE_KEY, v); } catch (e) {} }
    function applyVariant(v) { if (document.body) document.body.setAttribute('data-bloom-variant', v); }

    function swatch(v) {
      if (isTp(v)) {
        var tp = THEME_PALETTE[v.slice(3)];
        var acc = tp.light['--dsw-alias-brand-primary'] || '#888';
        var bg = tp.light['--dsw-static-neutral-bluish-00'] || tp.light['--dsw-static-neutral-bluish-50'] || '#ffffff';
        return 'linear-gradient(135deg, ' + acc + ' 0 52%, ' + bg + ' 52% 100%)';
      }
      var p = PALETTE[v];
      return 'linear-gradient(135deg, ' + p.accentL + ' 0 52%, ' + p.bgL + ' 52% 100%)';
    }

    function buildSwitcher(getVariant, onPick) {
      var root = document.createElement('div');
      root.className = 'bloomc';
      root.setAttribute('data-bloom-color-ui', '');

      var btn = document.createElement('button');
      btn.type = 'button'; btn.className = 'bloomc-btn';
      btn.setAttribute('aria-haspopup', 'true'); btn.setAttribute('aria-expanded', 'false');
      btn.title = IS_ZH ? 'Bloom 配色' : 'Bloom palette';
      var dot = document.createElement('span'); dot.className = 'bloomc-dot';
      var txt = document.createElement('span'); txt.className = 'bloomc-btn-text';
      btn.appendChild(dot); btn.appendChild(txt);

      var panel = document.createElement('div');
      panel.className = 'bloomc-panel'; panel.hidden = true; panel.setAttribute('role', 'listbox');
      var items = {};
      function addItem(id, labelText) {
        var it = document.createElement('button');
        it.type = 'button'; it.className = 'bloomc-item'; it.setAttribute('role', 'option');
        it.title = labelText;
        var sw = document.createElement('span'); sw.className = 'bloomc-sw'; sw.style.background = swatch(id);
        var nm = document.createElement('span'); nm.className = 'bloomc-name'; nm.textContent = labelText;
        it.appendChild(sw); it.appendChild(nm);
        it.addEventListener('click', function () {
          onPick(id); panel.hidden = true; btn.setAttribute('aria-expanded', 'false');
        });
        items[id] = it; panel.appendChild(it);
      }
      function addGroup(text) {
        var g = document.createElement('div'); g.className = 'bloomc-group'; g.textContent = text; panel.appendChild(g);
      }
      addGroup(IS_ZH ? 'Bloom · 莫兰迪' : 'Bloom · Morandi');
      VARIANTS.forEach(function (v) { addItem(v, label(v)); });
      addGroup('dsh-theme-palette');
      Object.keys(THEME_PALETTE).forEach(function (id) { addItem('tp-' + id, tpLabel('tp-' + id)); });

      function refresh() {
        var v = getVariant();
        dot.style.background = swatch(v);
        txt.textContent = isTp(v) ? tpLabel(v) : label(v);
        for (var k in items) {
          if (k === v) items[k].setAttribute('data-active', '');
          else items[k].removeAttribute('data-active');
        }
      }

      function onBtnClick(e) {
        e.stopPropagation();
        panel.hidden = !panel.hidden;
        btn.setAttribute('aria-expanded', panel.hidden ? 'false' : 'true');
      }
      function onDocClick(e) {
        if (!root.contains(e.target)) { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
      }
      function onKey(e) {
        if (e.key === 'Escape') { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); }
      }
      btn.addEventListener('click', onBtnClick);
      document.addEventListener('click', onDocClick);
      document.addEventListener('keydown', onKey);

      root.appendChild(btn); root.appendChild(panel);
      refresh();

      return {
        root: root,
        refresh: refresh,
        cleanup: function () {
          btn.removeEventListener('click', onBtnClick);
          document.removeEventListener('click', onDocClick);
          document.removeEventListener('keydown', onKey);
        },
      };
    }

    function install() {
      injectCSS(buildBloomCSS(), 'tokens.css');
      injectCSS(WIDGET_CSS, 'widget.css');
      var current = readVariant();
      applyVariant(current);
      var sw = buildSwitcher(
        function () { return current; },
        function (v) { current = v; applyVariant(v); writeVariant(v); sw.refresh(); }
      );
      document.body.appendChild(sw.root);
      return function cleanup() {
        try { sw.cleanup(); } catch (e) {}
        if (sw.root.parentNode) sw.root.parentNode.removeChild(sw.root);
        if (document.body) document.body.removeAttribute('data-bloom-variant');
        for (var i = 0; i < styleTags.length; i++) { if (styleTags[i].parentNode) styleTags[i].parentNode.removeChild(styleTags[i]); }
        styleTags.length = 0;
      };
    }

    return {
      inject: [],
      apply: function apply(ctx) {
        if (typeof document === 'undefined') return;
        var cleanup = null;
        function boot() { if (!cleanup) cleanup = install(); }
        if (document.body) boot();
        else document.addEventListener('DOMContentLoaded', boot, { once: true });

        if (ctx && typeof ctx.effect === 'function') {
          ctx.effect(function () {
            return function () {
              document.removeEventListener('DOMContentLoaded', boot);
              if (cleanup) { cleanup(); cleanup = null; }
            };
          }, 'dsh-bloom-color: skin');
        }
      },
    };
  },
});
