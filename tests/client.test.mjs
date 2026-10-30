import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

/**
 * 从 lib/client.js 抽取 __HELPERS_START__/END 标记块，在 vm 沙箱求值。
 * 测的是**出厂源码里的那一份** helpers（单一来源，无第二拷贝可漂移）。
 */
async function loadHelpers() {
  const text = await readFile(join(root, 'lib/client.js'), 'utf8')
  const start = text.indexOf('/* __HELPERS_START__')
  const end = text.indexOf('/* __HELPERS_END__ */')
  assert.ok(start >= 0 && end > start, 'helper markers missing in lib/client.js')
  const block = text.slice(start, end)
  const sandbox = { module: { exports: {} }, console }
  vm.createContext(sandbox)
  vm.runInContext(`${block}\n;module.exports = helpers;`, sandbox)
  return sandbox.module.exports
}

test('formatCounts derives the five numbers and survives null', async () => {
  const helpers = await loadHelpers()
  assert.equal(helpers.formatCounts(null), null)
  const counts = helpers.formatCounts({
    counts: { skills: 18, plugins: 5, toolkits: 1 },
    memory: { bases: [{ key: 'ai' }, { key: 'user' }] },
    evolution: { spool: { pending: 3, total: 7 } },
  })
  // 逐字段断言：vm realm 的对象原型与测试 realm 不同，deepEqual 也会比较原型
  assert.equal(counts.skills, 18)
  assert.equal(counts.plugins, 5)
  assert.equal(counts.memory, 2)
  assert.equal(counts.pending, 3)
  assert.equal(counts.toolkits, 1)
  const bad = helpers.formatCounts({ counts: { skills: 'x' }, memory: {}, evolution: {} })
  assert.equal(bad.skills, 0)
  assert.equal(bad.pending, 0)
})

test('skillsShown filters by name/provider/source and passes through on empty keyword', async () => {
  const helpers = await loadHelpers()
  const entries = [
    { name: 'brainstorming', provider: 'superpowers', source: 'custom' },
    { name: 'using-superpowers', provider: 'superpowers', source: 'bundled' },
    { name: 'jiangmengli', provider: 'runtime', source: 'user-agents' },
  ]
  assert.equal(helpers.skillsShown(entries, '').length, 3)
  // 'super' 同时命中 provider=superpowers 的两条（name+provider 双通道）
  assert.equal(helpers.skillsShown(entries, 'SUPER').length, 2)
  assert.equal(helpers.skillsShown(entries, 'user-').length, 1)
  assert.equal(helpers.skillsShown(entries, 'jiangmengli').length, 1)
  assert.equal(helpers.skillsShown(entries, 'nomatch').length, 0)
  assert.equal(helpers.skillsShown(null, 'x').length, 0)
})

test('degradedText prefers section reason over fallback', async () => {
  const helpers = await loadHelpers()
  const t = (key) => key
  assert.equal(helpers.degradedText({ reason: 'not-connected' }, 'notConnected', t), 'notConnected（not-connected）')
  assert.equal(helpers.degradedText({}, 'notConnected', t), 'notConnected')
  assert.equal(helpers.degradedText(null, 'notConnected', t), 'notConnected')
})

test('sourceLabel and rankLabel are display-safe', async () => {
  const helpers = await loadHelpers()
  assert.equal(helpers.sourceLabel({ source: 'custom' }), 'custom')
  assert.equal(helpers.sourceLabel({}), 'unknown')
  assert.equal(helpers.rankLabel({ rank: 550 }), '550')
  assert.equal(helpers.rankLabel({}), '—')
})

test('client registers the three slots with the proven id scheme', async () => {
  const text = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.match(text, /slots\.inject\('settings\.section'/)
  assert.match(text, /whileServed\(\[NS\], \(\) => ctx\.slots\.inject\('plugins\.item'/)
  assert.match(text, /slots\.inject\('shell\.overlay'/)
  assert.match(text, /var ROUTE = '\/dsh-superpower-vision\/snapshot'/)
  assert.match(text, /fetch\(ROUTE/)
  assert.match(text, /action: 'evolve:ingest'/)
})

test('locale files stay in parity after the T9 key expansion', async () => {
  const zh = JSON.parse(await readFile(join(root, 'locale/zh.json'), 'utf8'))
  const en = JSON.parse(await readFile(join(root, 'locale/en.json'), 'utf8'))
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
  for (const key of ['nav', 'tabs.skills', 'tabs.plugins', 'tabs.memory', 'tabs.evolution', 'tabs.toolkits', 'summary.skills', 'evolve.now', 'toolkit.hint', 'overlay.refresh']) {
    assert.ok(key in zh, `zh missing ${key}`)
    assert.ok(key in en, `en missing ${key}`)
  }
})

// ---- T11：破甲人格槽（融合破甲）----
test('helpers: personaOf 兜底与字段规整', async () => {
  const helpers = await loadHelpers()
  // vm realm 原型不匹配（历史坑）：逐字段断言，不用 deepStrictEqual
  const empty = helpers.personaOf(null)
  assert.equal(empty.mode, 'off')
  assert.equal(empty.updatedAt, null)
  assert.equal(empty.kick, null)
  assert.equal(empty.presets.length, 0)
  assert.equal(empty.personas.length, 0)
  assert.deepEqual([...empty.modes], ['off', 'jiangmengli', 'qitongwei', 'dual'])
  const filled = helpers.personaOf({
    persona: {
      mode: 'dual', kick: '江梦璃和祁同伟，两个人物回答。', updatedAt: '2026-10-30T00:00:00Z',
      modes: ['off', 'jiangmengli'], presets: [{ hasPersonaSlots: true }], personas: [{ id: 'qitongwei' }],
    },
  })
  assert.equal(filled.mode, 'dual')
  assert.equal(filled.personas.length, 1)
  assert.equal(helpers.personaOf({ persona: { mode: 'nobody' } }).mode, 'off')
})

test('helpers: fusedPreset 取第一个带人格槽的', async () => {
  const helpers = await loadHelpers()
  assert.equal(helpers.fusedPreset([]), null)
  assert.equal(helpers.fusedPreset([{ hasPersonaSlots: false }]), null)
  assert.equal(
    helpers.fusedPreset([{ hasPersonaSlots: false }, { hasPersonaSlots: true, presetId: 'x' }]).presetId,
    'x',
  )
})

test('helpers: personaCardById / personaModeKey', async () => {
  const helpers = await loadHelpers()
  const personas = [{ id: 'jiangmengli' }, { id: 'qitongwei' }]
  assert.equal(helpers.personaCardById(personas, 'qitongwei').id, 'qitongwei')
  assert.equal(helpers.personaCardById(personas, 'nobody'), null)
  assert.equal(helpers.personaModeKey('dual'), 'purge.mode.dual')
  assert.equal(helpers.personaModeKey('junk'), 'purge.mode.off')
})

test('客户端正文：TABS 含 purge 且注册了人格槽切换', async () => {
  const source = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.match(source, /var TABS = \['skills', 'plugins', 'memory', 'evolution', 'toolkits', 'purge'\]/)
  assert.match(source, /action: 'persona:set'/)
  assert.match(source, /function PersonaTab/)
  // 六页签路由必须收在 PersonaTab（默认分支）
  assert.match(source, /else tabView = PersonaTab\(tabProps\)/)
})
