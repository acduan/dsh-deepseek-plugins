# Changelog

## 0.1.0

首个版本：把 Codex 桌面端的外观模型移植到 DSH。

- 29 套 Codex 主题预设（Absolutely / Catppuccin / Everforest / GitHub / Gruvbox / Linear / Notion / One / Proof / Tokyo Night 等），预设表取自本机 Codex 构建的外观预设数据。
- 强调色 / 背景 / 前景三个基色可单独编辑，按 Codex 的派生算法生成 DSH 全部 `--dsw-alias-*` / `--dsw-specific-*` 语义 token（约 110 个）。
- 对比度 0–100 统一缩放边框、层次与次级文字强度；默认亮色 45 / 暗色 60。
- 界面字体与代码字体，写入 `--dsw-font-family` / `--ds-font-family-code`。
- 亮色与暗色分别记忆主题、基色与对比度；模式复用 DSH 自己的 `ui-theme` 偏好，两处同步。
- 设置 → 外观 新增「Codex 外观」分区；配置存 `localStorage`，读取时校验并修复。
- 26 个单元测试。
