import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const { createStdioJsonRpc } = await import('../lib/adapters/stdio-jsonrpc.js')
const { createStdioMcpPrepMemoryRead, createHttpPrepMemoryRead } = await import('../lib/adapters/prep-memory.js')

const fakeMcp = join(dirname(fileURLToPath(import.meta.url)), 'fake-mcp.mjs')
const spawnOpts = { command: process.execPath, args: [fakeMcp], env: {}, timeoutMs: 3000 }

/** 每个用例自带收尾，防孤儿进程挂住事件循环。 */
function withAdapter(fn) {
  return async (t) => {
    const adapter = createStdioMcpPrepMemoryRead(spawnOpts)
    t.after(() => adapter.close())
    await fn(adapter, t)
  }
}

test('stdio jsonrpc performs the initialize handshake and calls tools', withAdapter(async (adapter) => {
  const bases = await adapter.listKnowledgeBases()
  assert.equal(bases.length, 2)
  assert.equal(bases[0].key, 'ai')
}))

test('prep-memory adapter maps list_knowledge_bases / kb_stats / search_knowledge / search_deep', withAdapter(async (adapter) => {
  const bases = await adapter.listKnowledgeBases()
  assert.equal(bases.length, 2)
  assert.equal(bases[0].key, 'ai')

  const stats = await adapter.kbStats('ai')
  assert.equal(stats.ok, true)
  assert.equal(stats.approved, 98)

  const hits = await adapter.searchKnowledge({ base: 'ai', query: 'dsh', topK: 3 })
  assert.equal(hits.ok, true)
  assert.equal(hits.hits[0].title, 'hit-for:dsh')
  assert.equal(hits.hits[0].topK, 3) // topK 逐字透传为 top_k

  const deep = await adapter.searchDeep({ base: 'ai', query: 'anything' })
  assert.equal(deep.ok, true)
  assert.equal(deep.hits[0].title, 'deep-hit')
}))

test('transport timeout degrades to { ok:false } instead of throwing', withAdapter(async (adapter) => {
  const result = await adapter.searchKnowledge({ base: 'ai', query: '__trigger_timeout__' })
  assert.equal(result.ok, false)
  assert.ok(typeof result.reason === 'string' && result.reason.length > 0)
}))

test('adapter health and describe report the read contract', withAdapter(async (adapter) => {
  assert.equal(adapter.describe().id, 'prep-memory-read')
  assert.equal(adapter.describe().kind, 'read')
  assert.equal(adapter.health().ok, false) // initialize 前
  await adapter.listKnowledgeBases()
  assert.equal(adapter.health().ok, true)
}))

test('http prep-memory is a reserved placeholder', async () => {
  const adapter = createHttpPrepMemoryRead({ endpoint: 'https://example.invalid' })
  assert.equal(adapter.describe().id, 'prep-memory-read')
  const result = await adapter.listKnowledgeBases()
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'not-configured')
})
