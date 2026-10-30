/**
 * 适配器契约（以 JSDoc typedef 形式固化，运行时零依赖）。
 *
 * 三个预留位对应 operator 的三条追加要求：
 *
 *   PREP_MEMORY_READ —— 前置准备记忆复用库数据库读取接口
 *     @typedef {object} PrepMemoryReadAdapter
 *     @property {'prep-memory-read'} id
 *     @property {'read'} kind
 *     @property {() => { id: string, kind: 'read', label: string }} describe
 *     @property {() => { ok: boolean, reason?: string }} health
 *     @property {() => Promise<Array<{ key: string, name?: string }>>} listKnowledgeBases
 *     @property {(base: string) => Promise<{ ok: boolean, stats?: object, reason?: string }>} kbStats
 *     @property {(q: { base: string, query: string, topK?: number }) => Promise<{ ok: boolean, hits?: object[], reason?: string }>} searchKnowledge
 *     @property {(q: { base: string, query: string }) => Promise<{ ok: boolean, hits?: object[], reason?: string }>} searchDeep
 *
 *   EVOLUTION_MEMORY —— 结束的进化记忆写入接口
 *     @typedef {object} EvolutionMemoryAdapter
 *     @property {'evolution-memory'} id
 *     @property {'write'} kind
 *     @property {(record: object) => Promise<{ ok: boolean, id?: string, reason?: string }>} ingest
 *     @property {() => Promise<object[]>} listRecords
 *     @property {(ids: string[]) => Promise<{ ok: boolean }>} markIngested
 *
 *   AGENT_TOOLKIT —— 未来 agent toolkit 接入位
 *     @typedef {object} ToolkitAdapter
 *     @property {'agent-toolkit'} id
 *     @property {'toolkit'} kind
 *     @property {() => Array<{ id: string, serverName?: string, transport?: string, command?: string, health?: object }>} tools
 *     @property {(name: string, args: object) => Promise<{ ok: boolean, reason?: string }>} invoke
 *
 * 所有方法在数据源缺失时**不得抛异常**，一律返回 { ok: false, reason } / []，
 * 由 UI 层渲染「未接入」态。
 */

/** 三个预留槽位 id（与 registry 的键逐字一致）。 */
export const SLOTS = Object.freeze({
  PREP_MEMORY_READ: 'prep-memory-read',
  EVOLUTION_MEMORY: 'evolution-memory',
  AGENT_TOOLKIT: 'agent-toolkit',
})

export const SLOT_IDS = Object.freeze([SLOTS.PREP_MEMORY_READ, SLOTS.EVOLUTION_MEMORY, SLOTS.AGENT_TOOLKIT])
