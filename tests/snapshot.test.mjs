import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const { buildSnapshot, createSnapshotRoute } = await import('../lib/snapshot.js')
const { createNullPrepMemoryRead } = await import('../lib/adapters/null.js')

const fakeSkills = {
  entries: [{ name: 'brainstorming', provider: 'superpowers', source: 'custom', rank: 550, modelInvocable: true, userInvocable: true, locator: null }],
  drift: { onDiskOnly: ['ghost'], brokenLocator: [] },
  scannedAt: '2026-10-30T00:00:00.000Z',
}
const fakePlugins = {
  desired: ['dsh-superpower-vision+0.1.0+abc'],
  generations: [{ id: 'dsh-superpower-vision+0.1.0+abc', name: 'dsh-superpower-vision', version: '0.1.0', dir: '/x' }],
  patchRows: [{ id: 'dsh-superpower-vision', name: 'dsh-superpower-vision' }],
}
const fakeSpoolState = { pending: 2, total: 5 }

test('buildSnapshot with Null prep-memory degrades without throwing', async () => {
  const snapshot = await buildSnapshot({
    skills: fakeSkills,
    plugins: fakePlugins,
    toolkits: [],
    prepMemory: createNullPrepMemoryRead(),
    spoolStats: fakeSpoolState,
    auto: true,
  })
  assert.deepEqual(snapshot.memory.bases, [])
  assert.equal(snapshot.memory.reason, 'not-connected')
  assert.equal(snapshot.counts.skills, 1)
  assert.equal(snapshot.counts.plugins, 1)
  assert.equal(snapshot.counts.kbPending, 2)
  assert.equal(snapshot.evolution.auto, true)
  assert.equal(typeof snapshot.generatedAt, 'string')
})

test('buildSnapshot with a stub prep-memory fills bases', async () => {
  const stub = {
    ...createNullPrepMemoryRead(),
    async listKnowledgeBases() {
      return [{ key: 'ai' }, { key: 'user' }]
    },
  }
  const snapshot = await buildSnapshot({
    skills: fakeSkills,
    plugins: fakePlugins,
    toolkits: [{ id: 'anything-kb' }],
    prepMemory: stub,
    spoolStats: fakeSpoolState,
    auto: false,
  })
  assert.equal(snapshot.memory.bases.length, 2)
  assert.equal(snapshot.counts.toolkits, 1)
  assert.equal(snapshot.evolution.auto, false)
})

test('route serves GET snapshot JSON and only accepts known POST actions', async () => {
  const snapshot = { generatedAt: 'x', counts: {}, skills: fakeSkills }
  const ingested = []
  const route = createSnapshotRoute({
    getSnapshot: async () => snapshot,
    onEvolveIngest: async () => {
      ingested.push(1)
      return { ok: true, ingested: 1 }
    },
  })
  assert.equal(route.kind, 'exact')
  assert.equal(route.path, '/dsh-superpower-vision/snapshot')

  // GET
  const res = new EventEmitter()
  const chunks = []
  res.writeHead = () => {}
  res.end = (body) => chunks.push(body)
  await route.handler({ method: 'GET' }, res)
  assert.deepEqual(JSON.parse(chunks.join('')), snapshot)

  // POST evolve:ingest
  const res2 = new EventEmitter()
  let status2 = 0
  res2.writeHead = (code) => { status2 = code }
  res2.end = () => {}
  const req2 = new EventEmitter()
  req2.method = 'POST'
  const handlerPromise = route.handler(req2, res2)
  req2.emit('data', Buffer.from(JSON.stringify({ action: 'evolve:ingest' })))
  req2.emit('end')
  await handlerPromise
  assert.equal(status2, 200)
  assert.deepEqual(ingested, [1])

  // PUT → 405
  const res3 = new EventEmitter()
  let status3 = 0
  let allow3 = ''
  res3.writeHead = (code, headers) => { status3 = code; allow3 = headers?.allow }
  res3.end = () => {}
  await route.handler({ method: 'PUT' }, res3)
  assert.equal(status3, 405)
  assert.equal(allow3, 'GET, POST')

  // 坏 JSON → 500 不崩
  const res4 = new EventEmitter()
  let status4 = 0
  res4.writeHead = (code) => { status4 = code }
  res4.end = () => {}
  const req4 = new EventEmitter()
  req4.method = 'POST'
  const p4 = route.handler(req4, res4)
  req4.emit('data', Buffer.from('{not json'))
  req4.emit('end')
  await p4
  assert.equal(status4, 500)
})

// ---- persona 段（T11：融合破甲人格槽）----

test('buildSnapshot 带 persona 段，缺省可为空段', async () => {
  const left = await buildSnapshot({})
  const right = await buildSnapshot({ persona: { mode: 'dual', kick: '江梦璃和祁同伟，两个人物回答。' } })
  assert.deepEqual(left.persona.modes, ['off', 'jiangmengli', 'qitongwei', 'dual'])
  assert.equal(left.persona.kick, null)
  assert.equal(right.persona.mode, 'dual')
})

function fakeRequest(method, body) {
  const req = new EventEmitter()
  req.method = method
  process.nextTick(() => {
    if (body != null) req.emit('data', Buffer.from(JSON.stringify(body)))
    req.emit('end')
  })
  return req
}

function fakeResponse() {
  return {
    status: null, headers: null, body: null,
    writeHead(status, headers) { this.status = status; this.headers = headers },
    end(body) { if (body != null) this.body = body },
  }
}

test('路由：persona:set 透传 ok / 拒绝非法 mode 走 400', async () => {
  const seen = []
  const route = createSnapshotRoute({
    getSnapshot: async () => ({ ok: true }),
    onPersonaSet: (body) => {
      seen.push(body)
      if (body?.mode === 'bad') return { ok: false, reason: 'unknown mode "bad"' }
      return { ok: true, mode: body.mode }
    },
  })
  const okRes = fakeResponse()
  await route.handler(fakeRequest('POST', { action: 'persona:set', mode: 'dual' }), okRes)
  assert.equal(okRes.status, 200)
  assert.equal(JSON.parse(okRes.body).mode, 'dual')

  const badRes = fakeResponse()
  await route.handler(fakeRequest('POST', { action: 'persona:set', mode: 'bad' }), badRes)
  assert.equal(badRes.status, 400)
  assert.match(JSON.parse(badRes.body).reason, /unknown mode/)

  const noneRes = fakeResponse()
  await route.handler(fakeRequest('POST', { action: 'nope' }), noneRes)
  assert.equal(noneRes.status, 400)
  assert.deepEqual(seen.map((s) => s.mode), ['dual', 'bad'])
})
