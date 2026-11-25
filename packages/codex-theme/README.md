# @local/dsh-codex-theme

Codex 桌面端的**外观主题**在 DSH 里的移植：29 套 Codex 主题预设、强调色 / 背景 / 前景三个基色、统一的对比度档位、界面与代码字体，并按 Codex 自己的派生算法生成 DSH 全部语义 token。

安装后：**设置 → 外观** 多出一个 **Codex 外观** 分区（默认主题为 Absolutely，即参考截图里那套配色）。

## 设计：为什么只有三个颜色

Codex 的主题不是"每个控件配一个颜色"，而是**三个基色 + 一个派生算法**：

| 控件 | Codex 的角色 | 含义 |
|---|---|---|
| 主题 | preset | 一次性给出 accent / ink / surface 三个基色 |
| 强调色 | `accent` | 高亮、选中、链接、主按钮 |
| 背景 | `surface` | 应用内容背后的底色 |
| 前景 | `ink` | 主要文字颜色 |
| 对比度 | `contrast` | 统一缩放边框 / 层次 / 次级文字的强度 |

其余所有色阶（elevated 层、control 层、border 三档、次级与三级文字、hover/active、diff、markdown 代码块、侧栏、菜单、tooltip、toast、滚动条等）都由这三个基色按固定比例混合得出，比例随 `contrast` 线性缩放。本插件的 `derivePalette()` 是这段算法的逐行移植，`buildTokenMap()` 把结果接到 DSH 的 `--dsw-alias-*` / `--dsw-specific-*` 上。

这意味着：**改一个强调色，整套界面仍然是协调的**，这正是 Codex 外观的实际行为，也是本插件与"逐 token 手写配色"的主题插件最大的区别。

## 主题预设

预设表取自本机 Codex 构建里的外观预设数据（29 套，部分预设只有单一模式，与 Codex 一致）：

Absolutely · Ayu · Catppuccin · Codex · Dracula · Everforest · GitHub · Gruvbox · Linear · Lobster · Material · Matrix · Monokai · Night Owl · Nord · Notion · OG · One · Oscurange · Proof · Raycast · Rose Pine · Sentry · Solarized · Temple · Tokyo Night · Vercel · VS Code Plus · Xcode

- 下拉列表**只列出该模式真实提供的预设**（Dracula 只在暗色出现，Proof 只在亮色出现），与 Codex 一致。
- 选中预设会把它的 accent / ink / surface / contrast 一次性填入当前模式；之后可以继续改任一个颜色，此时强调色右侧标注「自定义」。
- 亮色与暗色**分别记忆**：两套主题、两套基色、两套对比度。

## 与 DSH 自带外观的关系

- **模式**（亮色 / 暗色 / 跟随系统）写的是 DSH 自己的 `ui-theme` 偏好，所以设置页的「模式」与 DSH「外观」里的选择是**同一个值**，两处改动互相生效。
- **颜色与字体**通过 `ctx.theme.overrideTokens` 叠加一层可回收的 token 层，不改写宿主注册表，插件卸载即恢复原色。
- 字体写入 `--dsw-font-family`（界面/正文）与 `--ds-font-family-code`（代码），留空即回落到 DSH 内置字体栈。

## 持久化

配置存在浏览器 `localStorage`（键 `codex-appearance-v1`），每个浏览器各存各的；不写 Host 配置、不占 storage domain、无网络请求。

读取时会**校验并修复**存储内容：非法预设、非法色值、越界对比度、非字符串字体都会回落到默认值，不会因为一次坏数据让插件失效。

## 文件

```
package.json         dsh.bundle.patch + dsh.client
cordis.patch.yml     插入 codex-theme 行
index.js             Host 半：空实现（纯客户端插件）
client.js            配色派生 + token 映射 + 设置页
locale/{zh,en}.json  插件管理展示用
icon.svg             插件图标
test/client.test.mjs 26 个用例
```

## 测试

```powershell
cd packages/codex-theme
node --test test/client.test.mjs
```

覆盖：预设数据完整性、颜色解析、on-color 判定、对比度归一化、派生调色板、token 覆盖度、override 层必须成对、字体归一化、存储修复、slot 注册与 token 层安装。

## 已知边界

- **只改颜色与字体，不改动效**：Codex 的 `opaqueWindows`（窗口不透明）与窗口材质在 Web 端没有对应概念，已忽略。
- **预设字体不自动安装**：Linear / Raycast 等预设声明的 Inter、JetBrains Mono 等字体，只在选中该预设且用户尚未设置界面字体时作为字体名写入；本机未安装该字体时会自然回落到 DSH 默认栈。
- **对比度范围 0–100**，与 Codex 一致；默认值随模式（亮色 45 / 暗色 60）。
- 依赖 `ctx.theme.overrideTokens`（DSH 主题服务）。服务不可用时插件不报错、不改色，仅在控制台留一行提示。
