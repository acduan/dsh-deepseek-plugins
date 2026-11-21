# dsh-bloom-color

**主题色（仅配色）** —— 把 [dsh-bloom-theme](https://github.com/webkubor/dsh-bloom-theme) 的主题色能力单独取出，并额外集成 [dsh-theme-palette](https://github.com/zuoyunlai/dsh-theme-palette) 的 4 套配色预设；两者其余功能（遥测、更新、反馈、玻璃/星空/动效等）全部抛弃。

## 包含
- **Bloom 莫兰迪 15 套**（OKLCH）：mist / cinnabar / petal / ripple / sage / stone / lapis / amber / aurora / lavender / mint / tangerine / silverrose / dawn / osmanthus。
- **dsh-theme-palette 4 套预设**：黑白（Neutral）/ 暖砂（Warm Sand）/ 靛蓝（Indigo）/ 苔绿（Moss）。其配色由该插件的配色引擎（OKLCH 色域钳位 + 真实承载面对比度求解）离线烘焙成宿主 `--dsw-*` token 后内置；未安装、未加载该插件本身。
- 每套配色覆盖 DSH 的 `--dsw-alias-*` / `--dsw-specific-*` / `--dsw-static-*` 语义色 token，并随宿主 `body[data-ds-dark-theme]` 自动明暗切换。
- 右下角调色板切换器（分「Bloom · 莫兰迪」与「dsh-theme-palette」两组），选择存 `localStorage`，刷新保留。

## 明确不含
- 无匿名使用统计、无更新检测/版本横幅、无反馈/分享/点星/诊断。
- 无玻璃质感、氛围渐变、星空/流星、液态镜头、输入动效等视觉特效。
- Node 侧无任何 webServer 路由、文件读写或子进程；本插件不发任何网络请求。

## 结构
- `index.js`：Node 半侧，空 `apply`。
- `client.js`：浏览器半侧，注入配色 CSS 并挂载切换器。
- `cordis.patch.yml`：bundle patch，把自己插入 boot graph。
