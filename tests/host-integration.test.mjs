import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { rm } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'

const HARNESS = process.env.DSH_DESKTOP_HOME ?? join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness')
const PLUGIN_DIR = join(HARNESS, 'profiles', 'web', 'dsh-superpower-vision')
const KB_MCP = '/Applications/AnyThingKB.app/Contents/MacOS/kb-mcp'

const mod = await import('../index.js')

/** 最小 ctx 桩：收集事件处理器与 effect disposer（模拟宿主加载/卸载）。 */
function makeCtx() {
  const handlers = new Map()
  const disposers = []
  const ctx = {
    logger: { info: () => {}, debug: () => {} },
    skills: { list: async () => [] },
    inject(services, fn) {
      return fn({ effect: (factory) => { const d = factory(); disposers.push(d); return d }, webServer: { register: () => () => {} } })
    },
    effect(factory) {
      const dispose = factory()
      disposers.push(dispose)
      return dispose
    },
    on(event, listener) {
      if (!handlers.has(event)) handlers.set(event, [])
      handlers.get(event).push(listener)
    },
    emit(event, ...args) {
      for (const listener of handlers.get(event) ?? []) listener(...args)
    },
  }
  ctx.unload = () => { for (const dispose of disposers) { try { dispose?.() } catch { /* ignore */ } }; disposers.length = 0 }
  return ctx
}

test('apply() wires the full host pipeline against the real harness', async (t) => {
  const ctx = makeCtx()
  const plugin = mod.apply(ctx, { evolutionAuto: true, kbServer: 'anything-kb', snapshotTtlMs: 60000 })
  t.after(() => { ctx.unload(); plugin.close() })

  const snapshot = await plugin.getSnapshot()
  // 真机 generation（dsh-api-pool / wenaixi 等已装插件）
  assert.ok(snapshot.plugins.generations.length >= 1, 'real generations expected')
  // 真机 MCP 行 → toolkit 描述符
  assert.ok(snapshot.toolkits.length >= 1, 'real mcp rows expected')
  assert.equal(snapshot.evolution.auto, true)
  assert.equal(typeof snapshot.generatedAt, 'string')
  assert.ok(Array.isArray(snapshot.skills.drift.onDiskOnly))
})

test('kb-mcp stdio read works end-to-end when AnyThingKB is installed', async (t) => {
  if (!existsSync(KB_MCP)) {
    t.skip('kb-mcp binary not present on this machine')
    return
  }
  const ctx = makeCtx()
  const plugin = mod.apply(ctx, { evolutionAuto: true, kbServer: 'anything-kb', snapshotTtlMs: 60000 })
  t.after(() => { ctx.unload(); plugin.close() })

  const snapshot = await plugin.getSnapshot()
  assert.equal(snapshot.memory.reason, undefined, `memory degraded: ${snapshot.memory.reason}`)
  assert.ok(snapshot.memory.bases.length >= 1, 'real knowledge bases expected (structuredContent channel)')
  // 真机四库之一应为 ai
  assert.ok(snapshot.memory.bases.some((base) => base.key === 'ai'), 'ai base expected')
})

test('auto session-end ingest lands in real kb-mcp; hook throttles by session id', async (t) => {
  t.after(async () => {
    await rm(PLUGIN_DIR, { recursive: true, force: true })
  })
  const ctx = makeCtx()
  const plugin = mod.apply(ctx, { evolutionAuto: true, kbServer: 'anything-kb', snapshotTtlMs: 60000 })
  t.after(() => { ctx.unload(); plugin.close() })

  const session = { id: 'it-sess-auto', header: { cwd: '/Users/yin/Desktop/dsh-superpower-vision' } }
  ctx.emit('session/event', session, { type: 'assistant/message', data: {} })
  ctx.emit('session/event', session, { type: 'assistant/attempt', data: {} })
  const first = await plugin.hook.onSessionDisposed(session)
  assert.equal(first.ok, true)
  if (existsSync(KB_MCP)) {
    // 真 kb-mcp 在线：记录应被自动 ingest 并标记 → pending 归零
    assert.equal(await plugin.hook.pendingCount(), 0)
  } else {
    // 无 kb-mcp：记录留在 spool 待补写
    assert.equal(await plugin.hook.pendingCount(), 1)
  }
  const again = await plugin.hook.onSessionDisposed(session)
  assert.equal(again.ok, false)
})

test('auto gate off writes no evolution record at all', async (t) => {
  t.after(async () => {
    await rm(PLUGIN_DIR, { recursive: true, force: true })
  })
  const ctx = makeCtx()
  const plugin = mod.apply(ctx, { evolutionAuto: false, kbServer: 'anything-kb', snapshotTtlMs: 60000 })
  t.after(() => { ctx.unload(); plugin.close() })

  const result = await plugin.hook.onSessionDisposed({ id: 'it-sess-gate', header: { cwd: '/x' } })
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'auto-disabled')
  assert.equal(await plugin.hook.pendingCount(), 0)
})
