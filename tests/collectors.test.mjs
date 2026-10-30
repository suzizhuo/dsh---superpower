import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const { collectSkills, collectPlugins, collectMcpServers } = await import('../lib/collectors/index.js')

async function makeHarness() {
  const home = await mkdtemp(join(tmpdir(), 'dsv-harness-'))
  await mkdir(join(home, 'skills', 'ghost'), { recursive: true })
  await writeFile(join(home, 'skills', 'ghost', 'SKILL.md'), '# ghost\n')
  const gen = join(home, 'profiles', '.generations', 'live', 'demo-plugin+1.0.0+abc123', 'node_modules', 'demo-plugin', 'skills', 'diskgen')
  await mkdir(gen, { recursive: true })
  // 真机布局：desired id `@wenaixi/dsh-superpower+7.4.1+eba1abbc565f` → live 消毒名
  await mkdir(join(home, 'profiles', '.generations', 'live', 'wenaixi+dsh-superpower+7.4.1+eba1abbc565f', 'node_modules', 'demo2'), { recursive: true })
  await writeFile(join(gen, 'SKILL.md'), '# diskgen\n')
  await mkdir(join(home, 'profiles', 'web'), { recursive: true })
  await writeFile(join(home, 'profiles', '.generations', 'desired.json'), JSON.stringify([
    'demo-plugin+1.0.0+abc123',
    '@wenaixi/dsh-superpower+7.4.1+eba1abbc565f',
  ]))
  await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
    '- insert:',
    '    - id: demo-plugin',
    '      name: demo-plugin',
    '- insert:',
    '    - id: mcp-anything-kb',
    "      name: '@deepseek-ai/dsh-mcp-client'",
    '      config:',
    '        serverName: anything-kb',
    '        transport: stdio',
    "        command: '/Applications/AnyThingKB.app/Contents/MacOS/kb-mcp'",
    '        env:',
    "          ANYTHING_KB_DEFAULT_OPERATOR: 'ai:mcp:dsh'",
    '',
  ].join('\n'))
  return home
}

test('collectSkills normalizes registry entries and applies invocation defaults', async () => {
  const home = await makeHarness()
  const ctx = {
    skills: {
      list: async () => [
        { name: 'brainstorming', provider: 'superpowers', source: 'custom', rank: 550, locator: { path: join(home, 'skills', 'ghost') } },
        { name: 'bare', provider: 'x', source: 'user-agents', rank: 500, locator: { path: '/nonexistent/locator/path' } },
      ],
    },
  }
  const result = await collectSkills(ctx, { harnessHome: home })
  const brainstorming = result.entries.find((s) => s.name === 'brainstorming')
  assert.equal(brainstorming.modelInvocable, true)
  assert.equal(brainstorming.userInvocable, true)
  assert.equal(brainstorming.rank, 550)
  // 磁盘上存在但注册表没有的技能
  assert.ok(result.drift.onDiskOnly.includes('ghost'))
  assert.ok(result.drift.onDiskOnly.includes('diskgen'))
  // 注册表里 locator 路径不存在的技能
  assert.ok(result.drift.brokenLocator.includes('bare'))
  assert.equal(typeof result.scannedAt, 'string')
})

test('collectSkills degrades when ctx.skills is unavailable', async () => {
  const home = await makeHarness()
  const result = await collectSkills({}, { harnessHome: home })
  assert.deepEqual(result.entries, [])
  assert.ok(result.drift.onDiskOnly.includes('ghost'))
  assert.equal(result.reason, 'skills-service-unavailable')
})

test('collectPlugins reads desired.json, generations and patch rows', async () => {
  const home = await makeHarness()
  const result = collectPlugins(home)
  assert.deepEqual(result.desired, ['demo-plugin+1.0.0+abc123', '@wenaixi/dsh-superpower+7.4.1+eba1abbc565f'])
  const gen = result.generations.find((g) => g.id === '@wenaixi/dsh-superpower+7.4.1+eba1abbc565f')
  assert.equal(gen.name, '@wenaixi/dsh-superpower')
  assert.equal(gen.version, '7.4.1')
  assert.ok(result.patchRows.some((r) => r.id === 'demo-plugin' && r.name === 'demo-plugin'))
})

test('collectMcpServers extracts mcp rows and survives malformed yaml', async () => {
  const home = await makeHarness()
  const rows = collectMcpServers(home)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].serverName, 'anything-kb')
  assert.equal(rows[0].command, '/Applications/AnyThingKB.app/Contents/MacOS/kb-mcp')
  assert.equal(rows[0].env.ANYTHING_KB_DEFAULT_OPERATOR, 'ai:mcp:dsh')
  assert.equal(rows[0].transport, 'stdio')

  await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), '- : : broken: [')
  assert.deepEqual(collectMcpServers(home), [])
})

test('collectMcpServers handles nested managed blocks', async () => {
  const home = await makeHarness()
  await writeFile(join(home, 'profiles', 'web', 'cordis.patch.yml'), [
    'managed:',
    '  - insert:',
    '      - id: mcp-nested',
    "        name: '@deepseek-ai/dsh-mcp-client'",
    '        config:',
    '          serverName: nested-kb',
    '          transport: http',
    '          command: ""',
    '',
  ].join('\n'))
  const rows = collectMcpServers(home)
  assert.equal(rows.length, 1)
  assert.equal(rows[0].serverName, 'nested-kb')
  assert.equal(rows[0].transport, 'http')
})
