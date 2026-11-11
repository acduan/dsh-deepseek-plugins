# 反驳式模式设置页（Rebuttal Mode Settings UI）

`@local/dsh-rebuttal-settings-ui` 是「反驳式模式」的 Web 设置页插件。

## 功能

在 **Settings → 反驳式模式** 中提供两组下拉配置：

- **反驳模型（`rebuttal_review`）**：Provider / 模型 / 推理强度；
- **裁决模型（`rebuttal_arbitrate`）**：Provider / 模型 / 推理强度。

模型列表由 Host 实时读取当前 DSH 已配置且注册的 LLM providers：

- `ctx.llm.listProviders()`
- `llm.listModels(provider)`
- `llm.resolveModelInfo(provider, model)`

保存后写入 `rebuttal_mode_config` storage domain，并立即作用于后续 `rebuttal_review` / `rebuttal_arbitrate` 调用。

## 依赖

本插件必须与 [`../rebuttal-mode`](../rebuttal-mode) 一起安装；它读取后者提供的：

- `rebuttalConfig` Host 服务；
- `/api/rebuttal-config` 配置路由（模型目录与读写）。

## 目录结构

```
package.json         # dsh.bundle.patch + dsh.client
cordis.patch.yml     # hosts one top-level Loader row
index.js             # empty Host half
client.js            # browser half: Settings → 反驳式模式
locale/*.json        # plugin manager metadata
icon.svg
```

## 安装

与 `rebuttal-mode` 一样，以本地 bundle 目录为 target 安装：

```text
packages/rebuttal-settings-ui  →  plugin_manager.install_bundle
```

安装后刷新页面；若 Settings 中仍看不到「反驳式模式」，重启一次 DSH 以加载 Client half。
