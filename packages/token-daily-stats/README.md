# @local/token-daily-stats

DSH 插件 bundle：在设置页新增「Token 用量统计」分区，按天 + 按模型统计所有会话（含子代理）的 token 消耗。

- **Host 半**（`index.js`）：监听 `session/event` 的 `assistant/message.usage`，按天 + `<provider>/<model>` 聚合；用 `storageDomain` 持久化到 `<DSH_HOME>/storages/token_daily_usage.json`；启动时通过 `sessionQuery` 全量重建；向浏览器暴露认证路由 `GET /api/token-daily-stats`。
- **Client 半**（`client.js`）：注册 `settings.section` 槽位（id `token-usage`，order 30），每 2 秒轮询上面的路由。

> 注：本仓库中出现的 `E:\ai_workspace\...` 路径均为原开发机示例。在新机器请把本包放到稳定目录，并用 dsh 的本地 bundle 安装（target = 本包目录）。

## 安装位置与「版本更新兼容」的关系

插件源码放在**工作区**（用户目录），profile 通过 `link:` 依赖 + junction 指过来：

```
E:\ai_workspace\temp临时空间\token-daily-stats          <- 源码（唯一真源，可版本管理）
        ^ junction
C:\Users\Administrator\.dsh\profiles\desktop\node_modules\@local\token-daily-stats
        ^ link: 依赖
C:\Users\Administrator\.dsh\profiles\desktop\package.json  (dependencies + dsh.profile.bundles)
```

因此：

| 事件 | 插件是否受影响 |
| --- | --- |
| DSH 应用更新（覆盖 `…\Programs\DeepSeek Harness\`） | **不受影响**——插件与 profile 都在 `%USERPROFILE%\.dsh` 与工作区 |
| 工作区源码改动 | 改完即生效于安装副本（junction），Host 半需重启 DSH 或重装才重新加载 |
| profile 被重建（pnpm install） | 自动按 `package.json` 的 `link:` 重新建 junction |
| DSH 内部 API 改名/移除 | 见下「API 兼容契约」——设计为降级而不是崩溃 |

> 注意：实际生效的 profile 是 **`desktop`**（安装版 Electron 应用用 `--profile desktop` 启动）。
> 旧源码构建用的是 `web` profile。装错 profile 的表现是「插件已装但界面没有」。

## API 兼容契约（改代码前必读）

| 接缝 | 用法 | 版本漂移时的行为 |
| --- | --- | --- |
| `connection`（硬依赖，`inject`） | `ctx.connection.fetch.register({path, methods, requestBody, fetch})` | 服务消失 → Cordis 让插件保持 pending，**不会**拖垮 profile |
| `storageDomain`（可选） | `ctx.get('storageDomain')` + `open(spec)` → `domain.table('days')` | 缺失/报错 → 只记 warning，退化为纯内存（前向计数） |
| 值 schema | **鸭子类型**，同时实现 `parse()` 与 `safeParse()` | 不 import `zod` 或任何 `@deepseek-ai/dsh-*`；换 zod 主版本也不受影响 |
| `sessionQuery`（可选） | `ctx.get('sessionQuery')` + `listSessions()` / `readSession(id)` | 缺失 → 跳过全量重建，只做前向计数 |
| Fetch 路由 disposer | `await offRoute()` | 0.1.x 返回 `void`、0.2.x 返回 `Promise`，两种都吃得下 |
| `domain.close()` | `await closeDomain()` | 同上 |
| Client `window.__ModuleLoader__.load({id, factory})` | 文档化的 bundle 协议 | 只 require `react`（平台冻结模块表），不需要 `dsh.client.external` |
| Client `slots` 服务 | `inject: ['slots']` + `slots.inject('settings.section', …)` | 槽位改名 → 分区不出现，但客户端启动不受影响 |

### 冻结项（改了会丢历史数据）

- 域名字 `token_daily_usage`
- `version: 1`（`storage-json` 用 `descriptor.version` 比对，不一致直接 `version-mismatch`）
- 天键格式 `YYYY-MM-DD`（`per-record` 布局会把键当路径段，必须匹配 `[a-zA-Z0-9_-]+`）

## 从 0.1.6-alpha.2 移植到 0.2.0-rc.2 的实际改动

1. **必修**：0.2.x 的 `storageDomain.open()` 用 `valueSchema.parse(raw)` 校验存量记录，而旧代码只实现了 `safeParse` → 打开域时 `TypeError` → 整个域打不开、持久化静默失效。现改为 `parse` + `safeParse` 双协议。
2. 新增 `invalidRecords: 'backup-and-skip'`：单条坏记录被移成 `<key>.json.bak.<时间戳>` 并当作不存在，而不是让整个域打不开。
3. `offRoute` / `domain.close()` 改为 await 并吞掉 reject（0.2.x 返回 Promise，旧写法会产生未处理的 rejection）。
4. `package.json` 删掉 `dsh.client.inject`：0.2.x 的 `dsh.client` 声明解析器只认 `platform` / `external` / `immediately`，该字段从未生效。
5. 可选服务全部改走 `ctx.get` + 能力探测；事件折叠与持久化各自 try/catch，任何一处漂移只记 warning。

## 已知限制

- 被 surface `replace`（压缩 / 回退）遮蔽的 `assistant/message` 会与替换事件一起计数，跨重写的当天可能偏高。每次激活都会用原始日志全量重建，所以是**稳定偏高**而不是持续漂移。
- 历史「重放」事件（同一 message 被重新投影）没有按 `seq` 去重。

## 重装 / 修复

在任意 DSH 会话里调用 `plugin_manager`（需要 danger-full-access）：

```
action: install_bundle
target: E:\ai_workspace\temp临时空间\token-daily-stats
```

或让它校验现有安装（只读）：

```
action: list_bundles
```

装完必须**重启 DSH**（Host 半的 `index.js` 只在启动时加载）。Client 半有 HMR，但前提是同一 checkout 在跑 `pnpm run dev:web`。
