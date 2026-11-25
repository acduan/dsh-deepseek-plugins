/**
 * @local/dsh-codex-theme —— Node 半侧。
 *
 * 本插件是纯客户端外观插件：Node 侧不注册任何资源，只导出一个空的 apply，
 * 让 DSH 的 cordis-plugin-loader 认得这个包。真正的配色与设置页逻辑全在浏览器
 * 半侧（client.js），经 package.json 的 exports["./client"] 由 dsh.client 加载。
 *
 * 配置持久化在浏览器 localStorage（每个浏览器各存各的），因此 Host 侧不需要
 * 配置 schema，也不需要 storage domain。
 */
export function apply() {}
