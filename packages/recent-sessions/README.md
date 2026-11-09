# @local/recent-sessions

左侧栏“最近会话”面板（dsh Web 客户端 bundle 插件）。

![demo](docs/recent-sessions.png)

## 功能

- 左侧栏“最近会话”折叠列表：约 150px 高、可滚动、可展开/折叠；
- 列表项显示会话状态图标（运行中 / 等待 / 完成），右侧显示相对更新时间；
- 当前会话高亮，并在打开时自动滚动定位；
- **单击会话**：打开该会话，并在左侧“工作区”会话树中滚动定位到它（必要时自动展开所属工作区分组）；
- **悬停**：显示与宿主工作区同款的信息卡（标题 / 工作区文件夹路径 / 相对时间 / 状态行）；
- **右键菜单**：
  - 新建会话（在该会话所属工作区创建并打开）
  - 复制 Session ID
  - 打开所在文件夹
  - 归档会话

## 安装

dsh 的本地安装是**链接指向本目录**，请放在稳定目录后再安装（不要放临时目录）。

在 dsh 中对该包目录执行本地 bundle 安装（等价 `plugin_manager` 的 `install_bundle`，target = 本目录绝对路径）。安装后会把 `@local/recent-sessions` 写入 profile 的 `package.json`：

```jsonc
{
  "dependencies": { "@local/recent-sessions": "link:<本目录绝对路径>" },
  "dsh": { "profile": { "bundles": ["@local/recent-sessions"] } }
}
```

然后刷新/重启 dsh。

## 依赖与兼容性

- 需要与源码对应的 dsh 版本（依赖 `shell.overlay` 等插槽与 `@deepseek-ai/dsh-client-ui-primitives` 导出）。
- “打开所在文件夹”依赖 dsh 自带 `dsh-host-open-in-app` 的 `/open-in-app/apps` 与 `/open-in-app/open` 路由（标准 Web 配置默认包含；缺失时该项自动隐藏）。
- “归档会话”调用宿主 `uiWorkspace.archiveSession`；会话正在工作时可能被宿主拒绝并提示失败（不会强制停止）。

## 文件

```
package.json        dsh bundle 声明
cordis.patch.yml    bundle patch（insert 插件行）
index.js            Host 半（空实现）
client.js           Client 半（列表 / 悬停卡 / 右键菜单）
locale/{en,zh}.json 插件管理展示元数据
icon.svg            图标
```
