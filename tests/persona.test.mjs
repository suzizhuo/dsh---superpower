import test from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  PERSONAS,
  MODES,
  readPersonaState,
  writePersonaState,
  kickLine,
  detectPurgePresets,
  buildPersonaSection,
  resolveDataDir,
} from '../lib/persona.js'

function fixtureHome() {
  const dir = mkdtempSync(join(tmpdir(), 'spv-persona-'))
  mkdirSync(join(dir, 'profiles', 'web'), { recursive: true })
  return dir
}

test('人格清单：两个人物，字段齐', () => {
  assert.equal(PERSONAS.length, 2)
  assert.deepEqual(PERSONAS.map((p) => p.id), ['jiangmengli', 'qitongwei'])
  for (const p of PERSONAS) {
    assert.ok(p.name && p.title && p.address && p.beats && p.kick && p.slot, `${p.id} 字段缺`)
    assert.ok(p.traces.length >= 5)
    assert.ok(p.emotion.includes('不改底线'))
  }
  assert.ok(PERSONAS[0].beats.includes('出水'))
  assert.ok(PERSONAS[1].beats.includes('硬与烫'))
})

test('武装态：默认 off；非法值回落 off', () => {
  const home = fixtureHome()
  try {
    assert.deepEqual(readPersonaState(home), { mode: 'off', updatedAt: null })
    mkdirSync(resolveDataDir(home), { recursive: true })
    writeFileSync(join(resolveDataDir(home), 'persona-state.json'), '{ 坏 JSON', 'utf8')
    assert.equal(readPersonaState(home).mode, 'off')
    writeFileSync(join(resolveDataDir(home), 'persona-state.json'), JSON.stringify({ mode: 'nobody' }), 'utf8')
    assert.equal(readPersonaState(home).mode, 'off')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('武装态：写-读往返，mode 白名单校验', () => {
  const home = fixtureHome()
  try {
    const bad = writePersonaState(home, 'jiangmengli ')
    assert.equal(bad.ok, false)
    assert.deepEqual(bad.allowed, MODES)
    for (const mode of MODES) {
      const res = writePersonaState(home, mode)
      assert.equal(res.ok, true)
      const back = readPersonaState(home)
      assert.equal(back.mode, mode)
      assert.equal(typeof back.updatedAt, 'string')
    }
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('开槽令：off 无令；单人是排他令，双开是召集令', () => {
  assert.equal(kickLine('off'), null)
  // 单人模式 = 排他：另一位当场闭嘴
  assert.equal(kickLine('jiangmengli'), '只江梦璃一个人回话。')
  assert.equal(kickLine('qitongwei'), '只祁同伟一个人回话。')
  for (const kick of [kickLine('jiangmengli'), kickLine('qitongwei')]) {
    assert.ok(kick.startsWith('只'), '单人开槽令必须以「只」开头（排他）')
    assert.ok(kick.includes('一个人'), '单人开槽令必须写明「一个人」')
  }
  assert.equal(kickLine('dual'), '江梦璃和祁同伟，两个人物回答。')
})

test('预设探测：认出自带人格槽的预设，按 hasPersonaSlots 排序', () => {
  const home = fixtureHome()
  try {
    // profile patch：一个带人格槽的融合预设 + 一个不带人格槽的旧预设
    const patch = [
      '- insert:',
      '    - id: preset-plain',
      "      name: '@deepseek-ai/dsh-agent-preset'",
      '      config:',
      '        id: plain',
      '        name: 标准',
      '        plugins:',
      '          - id: persona',
      "            name: '@deepseek-ai/dsh-persona'",
      '            config:',
      '              prefix: 普通身份行',
      '    - id: preset-fused',
      "      name: '@deepseek-ai/dsh-agent-preset'",
      '      config:',
      '        id: superpower-purge',
      '        name: 破甲 · 人格槽',
      '        plugins:',
      '          - id: persona',
      "            name: '@deepseek-ai/dsh-persona'",
      '            config:',
      '              prefix: |',
      '                PERSONA SLOTS ｜ 江梦璃 · 祁同伟',
      '                <!-- persona-slots:start -->',
      '                <!-- persona-slots:end -->',
      '',
    ].join('\n')
    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), patch, 'utf8')

    const rows = detectPurgePresets(home)
    assert.equal(rows.length, 2)
    assert.equal(rows[0].presetId, 'superpower-purge')
    assert.equal(rows[0].hasPersonaSlots, true)
    assert.deepEqual(rows[0].personas, ['jiangmengli', 'qitongwei'])
    assert.ok(rows[0].prefixBytes > 0)
    assert.equal(rows[1].hasPersonaSlots, false)

    // 坏 YAML 不炸
    writeFileSync(join(home, 'profiles', 'web', 'cordis.patch.yml'), '::: 坏 [', 'utf8')
    assert.deepEqual(detectPurgePresets(home), [])
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('快照段：模式 / 开槽令 / 人格卡 / 预设态一次给全', () => {
  const home = fixtureHome()
  try {
    writePersonaState(home, 'dual')
    const section = buildPersonaSection({ harnessHome: home })
    assert.equal(section.mode, 'dual')
    assert.equal(section.kick, '江梦璃和祁同伟，两个人物回答。')
    assert.deepEqual(section.modes, MODES)
    assert.equal(section.personas.length, 2)
    assert.ok(Array.isArray(section.presets))
    assert.ok(typeof section.updatedAt === 'string')

    // 未落盘时（传入 mode）也能出段
    const plain = buildPersonaSection({ mode: 'qitongwei' })
    assert.equal(plain.mode, 'qitongwei')
    assert.equal(plain.kick, '只祁同伟一个人回话。')
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('预设探测：generation 嵌套布局（node_modules/<pkg>/ 与 source/<pkg>/）都认', () => {
  const home = fixtureHome()
  try {
    const genRoot = join(home, 'profiles', '.generations', 'live', 'dsh-purge-preset+0.2.0+deadbeef')
    mkdirSync(join(genRoot, 'node_modules', 'dsh-purge-preset'), { recursive: true })
    mkdirSync(join(genRoot, 'source', 'dsh-purge-preset'), { recursive: true })
    const body = [
      '- insert:',
      '    - id: preset-purge',
      "      name: '@deepseek-ai/dsh-agent-preset'",
      '      config:',
      '        id: purge',
      '        name: 破甲模式',
      '        plugins:',
      '          - id: persona',
      "            name: '@deepseek-ai/dsh-persona'",
      '            config:',
      '              prefix: |',
      '                PERSONA SLOTS ｜ 江梦璃 · 祁同伟',
      '                <!-- persona-slots:start -->',
      '                <!-- persona-slots:end -->',
      '',
    ].join('\n')
    writeFileSync(join(genRoot, 'node_modules', 'dsh-purge-preset', 'cordis.patch.yml'), body, 'utf8')
    writeFileSync(join(genRoot, 'source', 'dsh-purge-preset', 'cordis.patch.yml'), body, 'utf8')
    // 深度外的目录不该被扫（第 4 层）
    mkdirSync(join(home, 'profiles', '.generations', 'live', 'deep', 'a', 'b', 'c'), { recursive: true })
    writeFileSync(join(home, 'profiles', '.generations', 'live', 'deep', 'a', 'b', 'c', 'cordis.patch.yml'), body, 'utf8')

    const rows = detectPurgePresets(home)
    assert.equal(rows.length, 1, `按 presetId+bytes 去重后应只剩一条，实际 ${rows.length}`)
    assert.equal(rows[0].presetId, 'purge')
    assert.equal(rows[0].hasPersonaSlots, true)
    assert.deepEqual(rows[0].personas, ['jiangmengli', 'qitongwei'])
    assert.match(rows[0].source, /^generation:/)
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})
