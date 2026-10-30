/**
 * 前置准备记忆复用库读取接口（PrepMemoryRead）。
 *
 * 两个实现 + 一个兜底：
 *   createStdioMcpPrepMemoryRead —— spawn kb-mcp，映射 MCP 工具：
 *     list_knowledge_bases / kb_stats / search_knowledge / search_deep
 *   createHttpPrepMemoryRead     —— 预留位：未来远程 agent toolkit / 多 agent 共享库
 *   registry 未注册时            —— Null 兜底（T4）
 *
 * 失败语义：任何异常/超时都收敛为 { ok:false, reason }，绝不向上抛。
 */
import { createStdioJsonRpc } from './stdio-jsonrpc.js'

/** MCP tools/call 结果 → 数据对象：优先 structuredContent，其次 content[].text 的 JSON，
 *  最后按 { text } 透出（真实 kb-mcp 的 text 是 markdown，不可 JSON 解析）。 */
function parseToolResult(result) {
  if (!result || typeof result !== 'object') return null
  if (result.structuredContent && typeof result.structuredContent === 'object') {
    return result.structuredContent
  }
  const content = Array.isArray(result.content) ? result.content : []
  const text = content.map((c) => (c && c.type === 'text' ? c.text : '')).join('\n')
  if (!text) return null
  try {
    return JSON.parse(text)
  } catch {
    return { text }
  }
}

async function guard(promise, fallback = null) {
  try {
    const value = await promise
    return value === undefined ? fallback : value
  } catch (error) {
    const reason = error && error.message ? error.message : String(error)
    return { __error: reason }
  }
}

export function createStdioMcpPrepMemoryRead(options = {}) {
  const rpc = createStdioJsonRpc(options)
  let healthy = false

  const call = async (name, args) => {
    const result = await rpc.request('tools/call', { name, arguments: args })
    return parseToolResult(result)
  }

  return {
    id: 'prep-memory-read',
    kind: 'read',

    describe() {
      return { id: 'prep-memory-read', kind: 'read', label: '记忆复用库读取（kb-mcp stdio）' }
    },

    health() {
      return healthy ? { ok: true } : { ok: false, reason: 'not-initialized' }
    },

    async listKnowledgeBases() {
      const data = await guard(call('list_knowledge_bases', {}))
      if (data?.__error) return []
      healthy = true
      const bases = Array.isArray(data?.bases) ? data.bases : []
      return bases.map((b) => ({ key: b.key ?? b.id ?? String(b.name ?? ''), name: b.name ?? b.key }))
    },

    async kbStats(base) {
      const data = await guard(call('kb_stats', { base }))
      if (data?.__error) return { ok: false, reason: data.__error }
      healthy = true
      return { ok: true, ...data }
    },

    async searchKnowledge({ base, query, topK = 10 }) {
      const data = await guard(call('search_knowledge', { base, query, top_k: topK }))
      if (data?.__error) return { ok: false, reason: data.__error }
      healthy = true
      return { ok: true, hits: Array.isArray(data?.hits) ? data.hits : [], raw: data }
    },

    async searchDeep({ base, query }) {
      const data = await guard(call('search_deep', { base, query }))
      if (data?.__error) return { ok: false, reason: data.__error }
      healthy = true
      return { ok: true, hits: Array.isArray(data?.hits) ? data.hits : [], raw: data }
    },

    close() {
      rpc.close()
    },
    /** 暴露底层 transport：进化记忆写通道复用同一条 stdio 连接，避免双开 kb-mcp。 */
    get rpc() {
      return rpc
    },
  }
}

export function createHttpPrepMemoryRead({ endpoint } = {}) {
  return {
    id: 'prep-memory-read',
    kind: 'read',

    describe() {
      return { id: 'prep-memory-read', kind: 'read', label: `记忆复用库读取（HTTP 预留${endpoint ? `：${endpoint}` : ''}）` }
    },

    health() {
      return { ok: false, reason: 'not-configured' }
    },

    async listKnowledgeBases() {
      return { ok: false, reason: 'not-configured' }
    },

    async kbStats() {
      return { ok: false, reason: 'not-configured' }
    },

    async searchKnowledge() {
      return { ok: false, reason: 'not-configured' }
    },

    async searchDeep() {
      return { ok: false, reason: 'not-configured' }
    },
  }
}
