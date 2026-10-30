import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeToolkits, createToolkitAdapter } from '../lib/adapters/toolkit.js'

test('describeToolkits maps rows with stdio command health checks', () => {
  const rows = [
    { rowId: 'mcp-a', serverName: 'kb-a', transport: 'stdio', command: process.execPath, args: [], env: {} }, // 存在的可执行
    { rowId: 'mcp-b', serverName: 'kb-b', transport: 'stdio', command: '/definitely/not/here', args: [], env: {} }, // 不存在
    { rowId: 'mcp-c', serverName: 'kb-c', transport: 'http', command: '', args: [], env: {} }, // http 无 command
  ]
  const descriptors = describeToolkits(rows)
  assert.equal(descriptors.length, 3)
  assert.equal(descriptors[0].health.ok, true)
  assert.equal(descriptors[1].health.ok, false)
  assert.equal(descriptors[1].health.reason, 'command-not-found')
  assert.equal(descriptors[2].health.ok, true) // http 行不因缺 command 判死
  assert.equal(descriptors[0].id, 'kb-a')
})

test('createToolkitAdapter aggregates health and reserves invoke', async () => {
  const rows = [
    { rowId: 'mcp-a', serverName: 'kb-a', transport: 'stdio', command: process.execPath, args: [], env: {} },
  ]
  const adapter = createToolkitAdapter({ rows })
  const health = adapter.health()
  assert.equal(health.ok, true)
  assert.equal(health.healthy, 1)
  assert.equal(adapter.tools().length, 1)
  const invoked = await adapter.invoke('kb-a', {})
  assert.equal(invoked.ok, false)
  assert.equal(invoked.reason, 'reserved')
  assert.equal(adapter.describe().id, 'agent-toolkit')
})

test('empty rows degrade to not-connected', () => {
  const adapter = createToolkitAdapter({ rows: [] })
  const health = adapter.health()
  assert.equal(health.ok, false)
  assert.equal(health.reason, 'not-connected')
  assert.deepEqual(adapter.tools(), [])
})
