/**
 * Null 默认适配器：数据源缺失时的兜底，永不抛异常。
 *
 * read 槽位返回 [] / { ok:false, reason:'not-connected' }；
 * write 槽位返回 { ok:false, reason:'not-connected' }；
 * toolkit 槽位 tools() → []、invoke() → reserved/not-connected。
 */

const REASON = 'not-connected'

function base(id, kind, label) {
  return { id, kind, describe: () => ({ id, kind, label }), health: () => ({ ok: false, reason: REASON }) }
}

export function createNullPrepMemoryRead() {
  return {
    ...base('prep-memory-read', 'read', '记忆复用库读取（未接入）'),
    async listKnowledgeBases() {
      return []
    },
    async kbStats() {
      return { ok: false, reason: REASON }
    },
    async searchKnowledge() {
      return { ok: false, reason: REASON }
    },
    async searchDeep() {
      return { ok: false, reason: REASON }
    },
  }
}

export function createNullEvolutionMemory() {
  return {
    ...base('evolution-memory', 'write', '进化记忆写入（未接入）'),
    async ingest() {
      return { ok: false, reason: REASON }
    },
    async listRecords() {
      return []
    },
    async markIngested() {
      return { ok: false, reason: REASON }
    },
  }
}

export function createNullToolkit() {
  return {
    ...base('agent-toolkit', 'toolkit', 'Agent Toolkit（未接入）'),
    tools() {
      return []
    },
    async invoke() {
      return { ok: false, reason: REASON }
    },
  }
}
