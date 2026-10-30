/**
 * dsh-superpower-vision —— DSH 插件可视化面板（宿主半边入口，T8 全量版）
 *
 * 职责：
 *   · 采集：技能注册表 + 磁盘 skills、插件 generations、profile patch MCP 行；
 *   · 适配：三个预留槽位（前置准备记忆读取 / 结束进化记忆写入 / Agent Toolkit），
 *     未接入时 Null 兜底；kb-mcp 只开一条 stdio 连接，读（prep-memory）与
 *     写（evolution）两个适配器共用；
 *   · 路由：顶层 exact path /dsh-superpower-vision/snapshot（GET 快照 /
 *     POST evolve:ingest | memory:search[预留]）；
 *   · 事件：skills/change 失效快照缓存；session/event 计数；
 *     session/disposed 触发进化记忆（auto 门 + 会话级节流）。
 *
 * 配置字段全部 volatile：每次读取 unwrap（loader 给的是活引用）。
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import Schema from '@deepseek-ai/schemastery'
import {
  collectSkills,
  collectPlugins,
  collectMcpServers,
  resolveHarnessHome,
} from './lib/collectors/index.js'
import {
  createRegistry,
  createStdioMcpPrepMemoryRead,
  createToolkitAdapter,
  createFileSpoolEvolutionMemory,
  createMcpEvolutionMemory,
  createEvolutionHook,
  ingestPending,
} from './lib/adapters/index.js'
import {
  readPersonaState,
  writePersonaState,
  buildPersonaSection,
} from './lib/persona.js'
import { buildSnapshot, createSnapshotRoute } from './lib/snapshot.js'

/** loader entry id，与 cordis.patch.yml 的 `- id: dsh-superpower-vision` 逐字一致。 */
export const name = 'dsh-superpower-vision'

/** 宿主服务依赖：快照路由（webServer）、技能清单（skills）、会话生命周期（sessions）。 */
export const inject = ['webServer', 'skills', 'sessions']

export const Config = Schema.object({
  /** 进化记忆自动 ingest 开关。默认 true（operator 选择「全自动优先」）。 */
  evolutionAuto: Schema.boolean().default(true).volatile(),
  /** 记忆复用库对应的 MCP serverName，默认 anything-kb；与 profile patch 的 mcp 行匹配。 */
  kbServer: Schema.string().default('anything-kb').volatile(),
  /** 快照缓存 TTL（毫秒）。skills/change 即时失效，不受此值影响。 */
  snapshotTtlMs: Schema.number().default(2000).volatile(),
}).description('dsh-superpower-vision 插件配置')

/** volatile 活引用解包：loader 可能给 { get() } 引用对象，也可能给普通值。 */
function unwrap(value) {
  return value && typeof value.get === 'function' ? value.get() : value
}

/** @param {import('@deepseek-ai/cordis').Context} ctx */
export function apply(ctx, config) {
  const registry = createRegistry()
  const harnessHome = resolveHarnessHome()

  // ---- 采集：profile patch 的 MCP 行（Toolkit / PrepMemory / Evolution 的共同发现源）----
  const mcpRows = collectMcpServers(harnessHome)

  // ---- 前置准备记忆读取：kbServer 匹配且命令可执行才接 StdioMcp，否则 Null 兜底 ----
  // 生命周期挂 ctx.effect：插件卸载时 close() kb-mcp 子进程，防泄漏。
  const kbRow = mcpRows.find((row) => row.serverName === unwrap(config.kbServer))
  const kbReady = Boolean(kbRow && kbRow.command && existsSync(kbRow.command))
  ctx.effect(() => {
    const prepMemory = kbReady
      ? createStdioMcpPrepMemoryRead({ command: kbRow.command, args: kbRow.args, env: kbRow.env })
      : null
    if (prepMemory) registry.register(prepMemory)
    return () => {
      prepMemory?.close()
    }
  }, 'dsh-superpower-vision: prep-memory-read')

  // ---- Agent Toolkit：MCP 行 → 描述符（未来新 toolkit = 加行 + 丢 adapter 文件）----
  registry.register(createToolkitAdapter({ rows: mcpRows }))

  // ---- 结束的进化记忆：spool 恒注册；Mcp 写通道经 registry 懒取 kb-mcp 连接 ----
  const spoolDir = join(harnessHome, 'profiles', 'web', 'dsh-superpower-vision', 'spool')
  const spool = createFileSpoolEvolutionMemory({ dir: spoolDir })
  registry.register(spool)

  /** 写通道门面：registry 里已注册 prepMemory 才可口（连接可能未就绪/已卸载）。 */
  const mcpEvolution = {
    health() {
      const adapter = registry.get('prep-memory-read')
      return adapter && adapter.rpc ? { ok: true } : { ok: false, reason: 'not-connected' }
    },
    async ingest(record) {
      const adapter = registry.get('prep-memory-read')
      if (!adapter || !adapter.rpc) return { ok: false, reason: 'not-connected' }
      return createMcpEvolutionMemory({ rpc: adapter.rpc }).ingest(record)
    },
  }

  const evolutionHook = createEvolutionHook({
    spool,
    mcp: mcpEvolution,
    isAutoEnabled: () => unwrap(config.evolutionAuto) !== false,
  })

  // ---- 快照缓存（apply 作用域持有，skills/change 即时失效）----
  let cachedSnapshot = null
  let cachedAt = 0

  const getSnapshot = async () => {
    const ttl = unwrap(config.snapshotTtlMs)
    if (!cachedSnapshot || Date.now() - cachedAt > ttl) {
      const skills = await collectSkills(ctx, { harnessHome })
      const plugins = collectPlugins(harnessHome)
      const toolkits = registry.get('agent-toolkit').tools()
      const spoolRecords = await spool.listRecords()
      cachedSnapshot = await buildSnapshot({
        skills,
        plugins,
        toolkits,
        prepMemory: registry.get('prep-memory-read'),
        spoolStats: {
          pending: spoolRecords.filter((r) => r.ingested !== true).length,
          total: spoolRecords.length,
        },
        auto: unwrap(config.evolutionAuto) !== false,
        persona: buildPersonaSection({ harnessHome }),
      })
      cachedAt = Date.now()
    }
    return cachedSnapshot
  }

  const onEvolveIngest = async () => ingestPending({ spool, mcp: mcpEvolution })

  /** 人格槽武装态切换：落盘 persona-state.json，并使快照缓存即时失效。 */
  const onPersonaSet = (body) => {
    const result = writePersonaState(harnessHome, body?.mode)
    if (result.ok) cachedSnapshot = null
    return result
  }

  // ---- 路由注册（dsh-function-preview 同款：ctx.inject + host.effect）----
  ctx.inject(['webServer'], (host) => {
    host.effect(() => {
      const route = createSnapshotRoute({ getSnapshot, onEvolveIngest, onPersonaSet })
      return host.webServer.register(route, 'dsh-superpower-vision: snapshot')
    })
  })

  // ---- 事件：缓存失效 + 会话计数 + 结束进化 ----
  ctx.on('skills/change', () => {
    cachedSnapshot = null
  })
  ctx.on('session/event', (session, event) => {
    evolutionHook.onSessionEvent(session, event)
  })
  ctx.on('session/disposed', (session) => {
    void evolutionHook.onSessionDisposed(session)
  })

  ctx.logger?.info?.(
    `dsh-superpower-vision: ready (skills+plugins+mcp collectors, ` +
      `kb=${kbReady ? kbRow.serverName : 'not-connected'}, ` +
      `toolkits=${mcpRows.length}, spool=${spoolDir})`,
  )

  // 插件卸载时兜底关掉 kb-mcp 连接（宿主 effect 卸载由 cordis 管理）
  return {
    registry,
    hook: evolutionHook,
    getSnapshot,
    close() {
      registry.get('prep-memory-read')?.close?.()
    },
  }
}

export default { name, inject, Config, apply }
