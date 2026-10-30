import { test } from 'node:test'
import assert from 'node:assert/strict'

const { createRegistry } = await import('../lib/adapters/registry.js')
const {
  createNullPrepMemoryRead,
  createNullEvolutionMemory,
  createNullToolkit,
} = await import('../lib/adapters/null.js')

const SLOT_IDS = ['prep-memory-read', 'evolution-memory', 'agent-toolkit']

test('empty registry resolves every slot to a Null adapter that never throws', async () => {
  const registry = createRegistry()
  const prep = registry.get('prep-memory-read')
  assert.equal(prep.health().ok, false)
  assert.equal(prep.health().reason, 'not-connected')
  assert.deepEqual(await prep.listKnowledgeBases(), [])
  assert.equal((await prep.kbStats('ai')).ok, false)
  assert.equal((await prep.searchKnowledge({ base: 'ai', query: 'x' })).ok, false)

  const evolution = registry.get('evolution-memory')
  assert.equal(evolution.health().ok, false)
  assert.equal((await evolution.ingest({ kind: 'session-end' })).ok, false)
  assert.deepEqual(await evolution.listRecords(), [])

  const toolkit = registry.get('agent-toolkit')
  assert.equal(toolkit.health().ok, false)
  assert.deepEqual(toolkit.tools(), [])
  assert.equal((await toolkit.invoke('x', {})).ok, false)
})

test('registered adapters replace the Null default for their slot', () => {
  const registry = createRegistry()
  const stub = { id: 'prep-memory-read', kind: 'read', describe: () => ({ id: 'prep-memory-read', kind: 'read' }), health: () => ({ ok: true }) }
  registry.register(stub)
  assert.equal(registry.get('prep-memory-read'), stub)
  // 其它槽位仍是 Null
  assert.notEqual(registry.get('evolution-memory'), stub)
  assert.equal(registry.get('evolution-memory').health().ok, false)
})

test('health() reports all three slots with their state', () => {
  const registry = createRegistry()
  const health = registry.health()
  assert.deepEqual(health.map((h) => h.id).sort(), [...SLOT_IDS].sort())
  for (const slot of health) {
    assert.equal(slot.ok, false)
    assert.equal(slot.reason, 'not-connected')
  }
  registry.register({ id: 'agent-toolkit', kind: 'toolkit', describe: () => ({}), health: () => ({ ok: true }) })
  const after = registry.health().find((h) => h.id === 'agent-toolkit')
  assert.equal(after.ok, true)
})

test('register rejects unknown slot ids and malformed adapters', () => {
  const registry = createRegistry()
  assert.throws(() => registry.register({ id: 'not-a-slot', kind: 'read', health: () => ({}) }), /unknown adapter slot/)
  assert.throws(() => registry.register(null), /adapter must be an object/)
  assert.throws(() => registry.get('also-not-a-slot'), /unknown adapter slot/)
})

test('null adapters describe themselves with stable labels', () => {
  const prep = createNullPrepMemoryRead()
  const evolution = createNullEvolutionMemory()
  const toolkit = createNullToolkit()
  assert.equal(prep.describe().kind, 'read')
  assert.equal(evolution.describe().kind, 'write')
  assert.equal(toolkit.describe().kind, 'toolkit')
  for (const adapter of [prep, evolution, toolkit]) {
    assert.equal(typeof adapter.describe().label, 'string')
    assert.ok(adapter.describe().label.length > 0)
  }
})
