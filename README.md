# dsh-superpower-vision

DSH（DeepSeek-harness）Desktop 插件：**超能力全景**可视化面板。

把四类运行时状态画进 DSH 设置页：

| 页签 | 内容 |
|---|---|
| 技能库 | 宿主注册表技能（provider/source/rank/可调用性）+ 磁盘 skills 漂移对照 |
| 插件注册表 | desired.json 指针、generation 目录、profile patch 行 |
| 记忆复用库 | kb-mcp（AnyThingKB）知识库列表（本机实测四库） |
| 进化记忆 | spool 待写/总数、自动归档开关、「立即归档」按钮 |
| Agent Toolkit | profile patch 里的 MCP server 行与健康状态、新 toolkit 接入说明 |

另有两个入口：插件管理页卡片（五数字总览）+ `shell.overlay` 速览浮窗。

## 数据层：三个预留适配接口

对应需求「预留前置准备记忆复用库数据库读取接口、结束的进化记忆接口、适配以后的 agent toolkit」：

```
lib/adapters/
├── registry.js        # 槽位注册表：prep-memory-read / evolution-memory / agent-toolkit
├── types.js           # ReadAdapter / WriteAdapter / ToolkitAdapter 契约（JSDoc）
├── null.js            # Null 默认：未接入时降级，绝不抛异常
├── stdio-jsonrpc.js   # 换行分隔 JSON-RPC 2.0 stdio 客户端（initialize 握手/超时/自毁）
├── prep-memory.js     # 记忆读取：StdioMcp（kb-mcp 实测打通）+ Http 预留位
├── evolution.js       # 进化写入：spool + Mcp（auto_ingest_text，PENDING 契约）+ session 钩子
└── toolkit.js         # Toolkit：MCP 行 → 描述符；invoke/tools 为预留位
```

**接入新 toolkit**：在 profile patch 增加一行 `@deepseek-ai/dsh-mcp-client`（自动出现在 Toolkit 页）；如需更丰富行为，往 `lib/adapters/` 丢一个 adapter 文件并向 registry 注册，重装插件。

## 安装 / 验证 / 回滚

```bash
node scripts/install-local.mjs        # generation 通道安装（需先重启 DSH Desktop 生效）
node scripts/verify.mjs               # 静态验证（manifest/patch/locale/测试/generation）
node scripts/verify.mjs --live        # 附真实浏览器走查清单
node scripts/evolve-memory.mjs        # 进化记忆补写（spool → kb-mcp）
node scripts/uninstall-local.mjs      # 回滚（从 desired.json 摘除 + 重投影）
```

改完代码必须 **bump `package.json` 的 version** 再安装（generation id 含 content hash，同名同版会被拒绝，`--force` 除外）。

## 开发

```bash
node --test --test-force-exit tests/*.test.mjs   # 45 项测试（含真机 kb-mcp 端到端）
```

测试里 `--test-force-exit` 是必需的：kb-mcp stdio 子进程句柄会挂住测试进程事件循环（宿主侧由 `ctx.effect` 生命周期关闭，测试侧强制退）。

## 真机验证状态（2026-10-30）

- generation `dsh-superpower-vision+0.1.0+5b4986a86823` 已装入 desktop profile `web` 并被 desired 指向
- 依赖闭包校验通过（host 单件经 bundled DSH entry 解析）
- 真机 kb-mcp stdio 读取通过（四库列表）；auto_ingest 落库通过
- **待 operator 执行**：重启 DSH Desktop → 设置导航「超能力全景」→ 六页签（含「破甲人格」）/卡片/浮窗走查 → console 零 error

## 许可

MIT
