import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, appendFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { appendSpoolRecord, readSpool, markSpoolIngested } = await import('../lib/spool.js')
const { createFileSpoolEvolutionMemory, createMcpEvolutionMemory, buildSessionEndRecord, createEvolutionHook } = await import('../lib/adapters/evolution.js')

async function spoolDir() {
  return await mkdtemp(join(tmpdir(), 'dsv-spool-'))
}

test('spool append + read round-trip, tolerating a malformed trailing line', async () => {
  const dir = await spoolDir()
  await appendSpoolRecord(dir, { kind: 'session-end', sessionId: 's1' })
  await appendSpoolRecord(dir, { kind: 'session-end', sessionId: 's2' })
  await appendFile(join(dir, 'evolution-spool.jsonl'), '{"kind":"broken"') // 无换行的残行
  const records = await readSpool(join(dir, 'evolution-spool.jsonl'))
  assert.equal(records.length, 2)
  assert.equal(records[0].sessionId, 's1')
  assert.equal(records.every((r) => r.ingested === false), true)
})

test('markSpoolIngested flips only the named ids', async () => {
  const dir = await spoolDir()
  await appendSpoolRecord(dir, { kind: 'session-end', sessionId: 's1' })
  await appendSpoolRecord(dir, { kind: 'session-end', sessionId: 's2' })
  const file = join(dir, 'evolution-spool.jsonl')
  await markSpoolIngested(file, ['s1'])
  const records = await readSpool(file)
  assert.equal(records.find((r) => r.sessionId === 's1').ingested, true)
  assert.equal(records.find((r) => r.sessionId === 's2').ingested, false)
})

test('buildSessionEndRecord has the fixed shape', () => {
  const record = buildSessionEndRecord({
    session: { id: 'sess-1', header: { cwd: '/work' } },
    counters: { assistantMessages: 3, attempts: 1 },
    at: '2026-10-30T00:00:00.000Z',
  })
  assert.equal(record.kind, 'session-end')
  assert.equal(record.sessionId, 'sess-1')
  assert.equal(record.cwd, '/work')
  assert.equal(record.at, '2026-10-30T00:00:00.000Z')
  assert.deepEqual(record.counters, { assistantMessages: 3, attempts: 1 })
  assert.equal(record.ingested, false)
})

test('evolution hook writes exactly one record per session, throttled by id', async () => {
  const dir = await spoolDir()
  const spool = createFileSpoolEvolutionMemory({ dir })
  const hook = createEvolutionHook({
    spool,
    mcp: null,
    isAutoEnabled: () => true,
  })
  const session = { id: 'sess-1', header: { cwd: '/work' } }
  hook.onSessionEvent(session, { type: 'assistant/message', data: {} })
  hook.onSessionEvent(session, { type: 'assistant/message', data: {} })
  hook.onSessionEvent(session, { type: 'assistant/attempt', data: {} })
  hook.onSessionEvent(session, { type: 'other/noise', data: {} }) // 忽略
  const result = await hook.onSessionDisposed(session)
  assert.equal(result.ok, true)
  const records = await readSpool(join(dir, 'evolution-spool.jsonl'))
  assert.equal(records.length, 1)
  assert.equal(records[0].counters.assistantMessages, 2)
  assert.equal(records[0].counters.attempts, 1)
  assert.equal(await hook.pendingCount(), 1)
  const again = await hook.onSessionDisposed(session) // 同 session 再 dispose 不重复写
  assert.equal(again.ok, false)
  assert.equal((await readSpool(join(dir, 'evolution-spool.jsonl'))).length, 1)
})

test('evolution hook honors the auto gate', async () => {
  const dir = await spoolDir()
  const spool = createFileSpoolEvolutionMemory({ dir })
  const hook = createEvolutionHook({ spool, mcp: null, isAutoEnabled: () => false })
  const result = await hook.onSessionDisposed({ id: 'sess-2', header: { cwd: '/x' } })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'auto-disabled')
  const records = await readSpool(join(dir, 'evolution-spool.jsonl'))
  assert.equal(records.length, 0)
})

test('mcp evolution ingest maps auto_ingest_text with the dedup turn_text and no status', async () => {
  const calls = []
  const fakeRpc = {
    request: async (method, params) => {
      calls.push({ method, params })
      return { content: [{ type: 'text', text: JSON.stringify({ ok: true, status: 'PENDING' }) }] }
    },
  }
  const adapter = createMcpEvolutionMemory({ rpc: fakeRpc })
  const record = buildSessionEndRecord({
    session: { id: 'sess-9', header: { cwd: '/w' } },
    counters: { assistantMessages: 1, attempts: 0 },
    at: '2026-10-30T00:00:00.000Z',
  })
  const result = await adapter.ingest(record)
  assert.equal(result.ok, true)
  assert.equal(calls.length, 1)
  assert.equal(calls[0].method, 'tools/call')
  assert.equal(calls[0].params.name, 'auto_ingest_text')
  const args = calls[0].params.arguments
  assert.equal(args.turn_text, 'session-end:sess-9')
  assert.equal(args.operator, 'ai:plugin:dsh-superpower-vision')
  assert.ok(!('status' in args)) // PENDING 由 MCP 侧保证，本插件不指定
  assert.ok(typeof args.content === 'string' && args.content.includes('sess-9'))
})

test('evolution hook auto-ingests through mcp when healthy, then marks spool', async () => {
  const dir = await spoolDir()
  const ingested = []
  const spool = createFileSpoolEvolutionMemory({ dir })
  const mcp = createMcpEvolutionMemory({
    rpc: { request: async (method, params) => { ingested.push(params.arguments.turn_text); return { content: [{ type: 'text', text: JSON.stringify({ ok: true }) }] } } },
  })
  const hook = createEvolutionHook({ spool, mcp, isAutoEnabled: () => true })
  await hook.onSessionDisposed({ id: 'sess-3', header: { cwd: '/z' } })
  const records = await readSpool(join(dir, 'evolution-spool.jsonl'))
  assert.equal(records.length, 1)
  assert.equal(records[0].ingested, true)
  assert.deepEqual(ingested, ['session-end:sess-3'])
  assert.equal(await hook.pendingCount(), 0)
})

test('spool dir auto-creates and missing file reads as empty', async () => {
  const dir = await spoolDir()
  await appendSpoolRecord(dir, { kind: 'session-end', sessionId: 's1' })
  assert.equal((await readSpool(join(dir, 'nothing-here.jsonl'))).length, 0)
})
