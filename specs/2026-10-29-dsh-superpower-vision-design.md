# dsh-superpower-vision 设计文档

- 日期：2026-10-29
- 状态：描述已由 operator 批准（范围=全量+overlay；仓库=/Users/yin/Desktop/dsh-superpower-vision；KB=StdioMcp 实测打通；进化记忆=全自动优先；Toolkit=接口+rows采集+UI占位）
- 依据：superpowers-max-7.0.1.zip（18 skills）、superpowers-dsh-0.3.0.zip（DSH 适配先例）、dsh-Plugins/（DSH-PLUGIN-DEV-NOTES.md + dsh-purge-preset + 已装 @wenaixi/dsh-superpower 7.4.1 + dsh-function-preview 1.4.0）

## 意图与为什么

YG 要在 DSH Desktop 里**直接看见** superpowers 技能生态、插件注册表、记忆复用库与 Agent Toolkit 的实时状态，而不是每次翻目录、解压 zip、读笔记。operator 三条追加要求固化为数据层的预留接口：前置准备记忆复用库读取、结束时的进化记忆写入、未来 agent toolkit 接入位。

## 目标

- G1 一个走 generation 通道安装、桌面端真实生效的 DSH 插件（含回滚）。
- G2 可视面：`settings.section` 主面板（五页签：技能库 / 插件注册表 / 记忆复用库 / 进化记忆 / Agent Toolkit）+ `plugins.item` 插件管理卡片（数字总览）+ `shell.overlay` 浮窗速览。
- G3 数据层全适配器化：三个预留接口都有契约、Null 默认实现、真实实现（KB 读走本机 kb-mcp stdio）。
- G4 进化记忆全自动优先：挂宿主会话生命周期事件自动 ingest；降级链 = 事件缺失 → 面板手动按钮 + `scripts/evolve-memory.mjs` → spool 文件可补 ingest。
- G5 Agent Toolkit：ToolkitAdapter 契约 + 从 profile patch 采集 MCP rows + UI 占位面板；接入新 toolkit = 加一行配置 + 丢一个 adapter 文件进 `lib/adapters/`。
- G6 可验证：`scripts/verify.mjs`（四层断言）+ `node --test` 单测 + 真实浏览器走查（零 console error）。
- G7 可回滚：`scripts/uninstall-local.mjs`；generation 目录保留可快速重启用。

## 非目标

- 不做技能启用/禁用开关（@wenaixi/dsh-superpower 已有，本插件只读）。
- 不修改/重新打包 superpowers 本体，不绑定某个 skill 发行版（目录扫描 + providers 快照双通道）。
- 不适配 CLI profile（~/.dsh）——先桌面端 harness；CLI 支持是后续版本议题。
- 不做移动端/窄屏专项（响应式样式跟随 DSH 别名的基本适配即可）。

## 反目标（做成即失败）

- 往用户 profile 的 cordis.patch.yml 手写配置块（必须走 bundle patch，随插件生命周期管理）。
- 自建 `/api/<ns>/` 路由（桌面端 405 坑；数据通道用顶层 exact path）。
- 客户端硬编技能清单（@wenaixi 的漂移教训；浏览器侧一律从 host 快照路由取）。
- `settings.section` 挂在 `whileServed` 条件下或 `configForms.get` 失败时提前 return（入口会整个消失）。
- 装完不提醒重启 Desktop / 不留回滚路径。

## 约束（本机实测事实，设计的地基）

1. **manifest**：`package.json` 的 `dsh.bundle.patch: "./cordis.patch.yml"` + `dsh.client.{platform:"web", inject:[...]}`；`cordis.patch.yml` 仅一行 `- insert: - id: dsh-superpower-vision`。
2. **host 半边**：ESM，`export const name / inject / Config / apply`；`Config = Schema.object({...}).description(...)`，可变字段 `.volatile()`；副作用全部 `ctx.effect(() => ...)`；服务注入 `ctx.inject(['webServer'], host => host.effect(() => host.webServer.register(...)))`。
3. **数据通道**：`kind:'exact'`、顶层路径 `/dsh-superpower-vision/snapshot`（dsh-function-preview 同款，禁走 `/api/`），GET 返回 JSON；客户端同源 fetch。
4. **client 半边**：手写 CJS factory，`window.__ModuleLoader__.load({id, factory})`，产物单源 `lib/client.js`（无构建步骤），`exports["./client"]`；React/primitives 走 `require`；样式注入 `style[data-plugin-css="<pkg>/<file>"]` + DSH 语义别名；i18n 用 `ctx.locale.register(NS,{zh,en})`。
5. **slot**：`settings.section`（契约仅 id/order/label，不挂 whileServed）、`plugins.item`（卡片）、`shell.overlay`（浮窗）；`dsh.client.inject` 是**依赖包**列表，必须包含声明目标 slot 的包（settings→`dsh-client-ui-settings`；plugins.item→`dsh-client-ui-plugin-manager`；overlay→由 dsh-function-preview 的 inject 清单佐证）。
6. **安装**：`installGeneration`（app 包内 `dsh-desktop-market-installer`）→ `verifyGenerationPeers` → `writeDesired` → `projectGenerations(dshHome, 'web')`（位置参数）→ **重启 DSH Desktop**。卸载 = `disableGeneration` + 重投影。
7. **peer 对齐**：`@deepseek-ai/cordis ^4.0.1`、`@deepseek-ai/dsh-client-ui-*`、`@deepseek-ai/dsh-skill`、`@deepseek-ai/schemastery`、`react ^18.2.0`（与 @wenaixi/dsh-superpower 7.4.1 同档，桌面端运行时 0.12.0）。
8. **peerDeps 兼容闸门**只检查声明的 `@deepseek-ai/dsh*` 版本范围——漏声明不会报错但会缺服务，全部显式声明。

## 已定（builder 直接执行）

- D1 标识：loader entry id = 包名 = settings 命名空间 = `dsh-superpower-vision`；设置页导航 id = `superpower-vision`（故意不同，避撞车）；`plugins.item` id = `dsh-superpower-vision`；NS（locale 键）= `dsh-superpower-vision`。
- D2 仓库根即包根（安装单元必须是包根，放弃 `{project}-{version}/` 包装器）；产物 tgz 进 `Release/`；overlay（specs/plans/log/scripts/lib/api/lib/static/versions.md/branches.md）按 using-superpowers 落根；git 库在 `git/`，提交需 operator 明确要求。
- D3 host 结构：`index.js`（entry）+ `lib/collectors/{skills,plugins,mcp-rows}.js` + `lib/adapters/{registry,types,null,prep-memory,evolution,toolkit}.js` + `lib/snapshot.js`（聚合+路由 handler）+ `lib/spool.js`。
- D4 client 结构：`lib/client.js` 单源；组件：`VisionPanel`（五页签容器）+ `SkillCatalogTab` + `PluginRegistryTab` + `MemoryTab` + `EvolutionTab` + `ToolkitTab` + `PeekOverlay` + `SummaryCard`。
- D5 KB stdio 客户端：手写 JSON-RPC（initialize → tools/list → tools/call），映射 `list_knowledge_bases` / `search_knowledge` / `search_deep` / `kb_stats`；超时 5s、失败降级 Null 并在面板显示「未接入」。
- D6 spool 路径：`<harness>/profiles/web/dsh-superpower-vision/spool/*.jsonl`（JSONL 追加， rotational 由 builder 定）。
- D7 样式与可访问性：DSH 别名 token、`@media (prefers-reduced-motion)`、错误态 `role="alert"`、零 console error 为验收线。

## 留给 builder（plan 中定）

组件内部状态机与缓存 TTL；快照失效广播（`skills/change` 监听 + 客户端轮询间隔）；测试矩阵；spool 轮转策略；overlay 唤出交互细节。

## 风险与降级

| 风险 | 事实 | 降级 |
|---|---|---|
| `dsh-client-ui-plugin-manager` / `client-ui-slots` 不在安装根（只在 app.asar） | 已装插件靠桌面端运行时提供 | inject 声明 + 注册失败记日志，settings.section 作为主入口不受影响 |
| kb-mcp 二进制路径失效 | 路径从 profile patch 的 mcp 行读取而非硬编 | Null 适配器 + 面板展示「未接入」+ verify.mjs 告警不失败 |
| 无会话结束事件可挂 | 宿主持久化事件清单待子代理枚举 | 降级链：手动按钮 + evolve-memory.mjs + spool 补写；auto 部分记 gap |
| generation id 冲突 | 版本不 bump 会撞 | install-local.mjs 强制读 package.json version，重复安装必须 bump |

## 验证标准（沿用 dev-notes 四层 + 本插件增量）

1. 宿主加载：启动日志有 `dsh-superpower-vision` 行；`settings/describe` 出现 namespace。
2. bundle：页面 `window.__DSH_BOOT__` 含 client entry；`/plugins/??dsh-superpower-vision/client.js` 200。
3. 数据通道：`GET /dsh-superpower-vision/snapshot` 返回 JSON（技能数、插件数、KB 库列表、spool 计数、toolkit 数五大块）。
4. 真实 UI：设置导航有「超能力全景」→ 五页签可切 → plugins.item 卡有数 → overlay 可唤出 → 全程零 console error。
5. 回滚：uninstall-local.mjs 后重启，导航行/卡片/overlay 消失，desired.json 无残留。
