/**
 * dsh-bloom-color —— Node 半侧。
 *
 * 本插件是纯客户端配色插件，Node 侧不做任何事，只导出一个空的 apply，
 * 让 DSH 的 cordis-plugin-loader 认得这个包。真正的配色逻辑全在浏览器半侧
 * （client.js），经 package.json 的 exports["./client"] 由 dsh.client 加载。
 */
export function apply() {}
