/**
 * 结束的进化记忆写入接口（EvolutionMemory）。
 *
 * 三个实现：
 *   createFileSpoolEvolutionMemory —— JSONL spool：append/list/markIngested
 *   createMcpEvolutionMemory       —— kb-mcp auto_ingest_text（PENDING 契约，
 *                                     turn_text=`session-end:<sessionId>` 去重键）
 *   registry 未注册               —— Null 兜底（T4）
 *
 * createEvolutionHook 把宿主 session 事件接到 spool + mcp：
 *   session/event 的 assistant/message | assistant/attempt → 计数
 *   session/disposed → 若 auto 门开且该 sessionId 未处理过 → 落 spool，
 *     mcp 健康则 ingest 并标记；一次会话一条记录（进程内 Set 节流）。
 *
 * auto 门读的是 volatile 配置的活引用，每轮 unwrap，不缓存快照。
 */
import { appendSpoolRecord, readSpool, markSpoolIngested } from '../spool.js'

const MCP_OPERATOR = 'ai:plugin:dsh-superpower-vision'
const SETTLEMENT_TYPES = new Set(['assistant/message', 'assistant/attempt'])

export function createFileSpoolEvolutionMemory({ dir }) {
  const file = dir
  return {
    id: 'evolution-memory',
    kind: 'write',

    describe() {
      return { id: 'evolution-memory', kind: 'write', label: '进化记忆写入（spool 文件）' }
    },

    health() {
      return { ok: true }
    },

    async ingest(record) {
      appendSpoolRecord(file, record)
      return { ok: true }
    },

    async listRecords() {
      return readSpool(file)
    },

    async markIngested(sessionIds) {
      return markSpoolIngested(file, sessionIds)
    },
  }
}

export function createMcpEvolutionMemory({ rpc }) {
  return {
    id: 'evolution-memory',
    kind: 'write',

    describe() {
      return { id: 'evolution-memory', kind: 'write', label: '进化记忆写入（kb-mcp auto_ingest）' }
    },

    health() {
      return { ok: typeof rpc?.request === 'function' }
    },

    async ingest(record) {
      if (typeof rpc?.request !== 'function') return { ok: false, reason: 'not-connected' }
      const content = [
        `kind: ${record.kind}`,
        `sessionId: ${record.sessionId}`,
        `cwd: ${record.cwd ?? ''}`,
        `endedAt: ${record.at ?? new Date().toISOString()}`,
        `counters: ${JSON.stringify(record.counters ?? {})}`,
      ].join('\n')
      try {
        const result = await rpc.request('tools/call', {
          name: 'auto_ingest_text',
          arguments: {
            content,
            turn_text: `session-end:${record.sessionId}`,
            operator: MCP_OPERATOR,
            source: { name: 'dsh-superpower-vision', type: 'plugin', uri: 'dsh-superpower-vision://session-end' },
          },
        })
        const text = result?.content?.map((c) => c?.text ?? '').join('\n') ?? ''
        let parsed = {}
        try {
          parsed = JSON.parse(text)
        } catch {
          /* 非 JSON 响应当成功处理（MCP 侧已收单） */
        }
        if (parsed && parsed.ok === false) return { ok: false, reason: parsed.reason ?? 'ingest-rejected' }
        return { ok: true }
      } catch (error) {
        return { ok: false, reason: error && error.message ? error.message : String(error) }
      }
    },

    async listRecords() {
      return []
    },

    async markIngested() {
      return { ok: true }
    },
  }
}

/**
 * 手动补写：把 spool 里所有未 ingest 记录依次过 mcp（面板「立即归档」按钮
 * 与 scripts/evolve-memory.mjs 共用）。mcp 不可用时原样留在 spool。
 */
export async function ingestPending({ spool, mcp }) {
  const records = await spool.listRecords()
  const pending = records.filter((r) => r.ingested !== true)
  if (!(mcp && typeof mcp.health === 'function' && mcp.health().ok === true)) {
    return { ok: false, reason: 'mcp-not-connected', pending: pending.length }
  }
  const done = []
  const failed = []
  for (const record of pending) {
    const result = await mcp.ingest(record)
    if (result && result.ok) done.push(record.sessionId)
    else failed.push({ id: record.sessionId, reason: result?.reason })
  }
  if (done.length > 0) await spool.markIngested(done)
  const left = (await spool.listRecords()).filter((r) => r.ingested !== true).length
  return { ok: failed.length === 0, ingested: done.length, pending: left, failed }
}

/** 固定形状的会话结束记录（spec D6/builder 已定项）。 */
export function buildSessionEndRecord({ session, counters, at }) {
  return {
    kind: 'session-end',
    sessionId: session?.id ?? session?.header?.id ?? null,
    cwd: session?.header?.cwd ?? null,
    at: at ?? new Date().toISOString(),
    counters: { assistantMessages: 0, attempts: 0, ...(counters ?? {}) },
    ingested: false,
  }
}

/**
 * @param {{ spool: object, mcp: object|null, isAutoEnabled: () => boolean }} options
 * isAutoEnabled 每次调用重新解包 volatile（loader 活引用）。
 *
 * 注意：spool/mcp 适配器方法按契约为 async —— hook 全链路 async，
 * onSessionDisposed 返回 Promise（宿主侧 fire-and-forget 或 await）。
 */
export function createEvolutionHook({ spool, mcp, isAutoEnabled }) {
  const counters = new Map() // sessionId → { assistantMessages, attempts }
  const settled = new Set() // 已处理 dispose 的 sessionId（进程内节流）

  const bump = (session, type) => {
    if (!SETTLEMENT_TYPES.has(type)) return
    const id = session?.id ?? session?.header?.id
    if (!id) return
    const prev = counters.get(id) ?? { assistantMessages: 0, attempts: 0 }
    if (type === 'assistant/message') prev.assistantMessages += 1
    if (type === 'assistant/attempt') prev.attempts += 1
    counters.set(id, prev)
  }

  const dispose = async (session) => {
    const id = session?.id ?? session?.header?.id
    if (!id || settled.has(id)) return { ok: false, reason: 'already-settled' }
    settled.add(id)
    if (!isAutoEnabled()) return { ok: false, reason: 'auto-disabled' }
    const record = buildSessionEndRecord({ session, counters: counters.get(id) })
    await spool.ingest(record)
    const pendingAfter = (await spool.listRecords()).filter((r) => r.ingested !== true).length
    const mcpHealthy = mcp && typeof mcp.health === 'function' && mcp.health().ok === true
    if (mcpHealthy) {
      const result = await mcp.ingest(record)
      if (result && result.ok) {
        await spool.markIngested([id])
        counters.delete(id)
      }
    }
    return { ok: true, pendingAfter }
  }

  return {
    onSessionEvent(session, event) {
      try {
        bump(session, event?.type)
      } catch {
        /* 事件形状异常不影响宿主 */
      }
    },
    onSessionDisposed(session) {
      return dispose(session).catch((error) => ({
        ok: false,
        reason: error && error.message ? error.message : String(error),
      }))
    },
    async pendingCount() {
      try {
        return (await spool.listRecords()).filter((r) => r.ingested !== true).length
      } catch {
        return 0
      }
    },
    reset() {
      counters.clear()
      settled.clear()
    },
  }
}
