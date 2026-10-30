import test from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))
const CHECK = join(root, 'scripts/verify-memory-dir.mjs')

function run(dir) {
  try {
    const stdout = execFileSync(process.execPath, [CHECK, '--dir', dir, '--strict'], { encoding: 'utf8' })
    return { code: 0, stdout }
  } catch (error) {
    return { code: error.status ?? 1, stdout: String(error.stdout ?? '') }
  }
}

function fixture(rows, extra = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'spv-mem-'))
  mkdirSync(join(dir, '归档'), { recursive: true })
  writeFileSync(join(dir, '记忆.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8')
  writeFileSync(join(dir, '索引.md'), extra.index ?? '# 记忆索引\n\n- 存量：0\n', 'utf8')
  writeFileSync(join(dir, '画像.md'), extra.profile ?? '# 长期画像\n', 'utf8')
  if (extra.schema) writeFileSync(join(dir, 'schema.json'), extra.schema, 'utf8')
  return dir
}

const good = () => [
  { id: 'aaaaaaaa-0000-0000-0000-000000000001', at: '2026-10-30T14:00:00+08:00', role: 'system', kind: 'rule', text: '规范 v1', status: 'activated' },
  { id: 'aaaaaaaa-0000-0000-0000-000000000002', at: '2026-10-30T14:01:00+08:00', role: 'user', kind: 'fact', text: '第二条', covered_history: 'aaaaaaaa-0000-0000-0000-000000000001' },
]

test('合规夹子：13 项全过，strict 退出 0', () => {
  const dir = fixture(good(), { index: '# 索引\n\n- 存量：2\n' })
  try {
    const res = run(dir)
    assert.equal(res.code, 0, res.stdout)
    assert.match(res.stdout, /13\/13 通过|汇总：13 项通过/)
    assert.doesNotMatch(res.stdout, /✗/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('坏夹子：缺必填 / id 重复 / 悬空引用 / 非法枚举 —— strict 退出 1', () => {
  const dir = fixture([
    { id: 'x1', at: '2026-10-30T14:00:00+08:00', role: 'user', kind: 'fact', text: '缺 role 的行' },
    { id: 'x1', at: '2026-10-30T14:00:00+08:00', role: 'user', kind: 'fact', text: 'id 重复' },
    { id: 'x2', at: '2026-10-30T14:00:00+08:00', role: 'user', kind: 'nope', text: '枚举非法', covered_history: 'ghost-id' },
  ])
  try {
    const res = run(dir)
    assert.notEqual(res.code, 0)
    for (const needle of ['必填', 'id 无重复', '悬空引用', '枚举字段合法']) {
      assert.ok(res.stdout.includes(needle), `缺少失败项：${needle}`)
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('坏 JSON 行：不崩，计入失败', () => {
  const dir = mkdtempSync(join(tmpdir(), 'spv-mem-'))
  mkdirSync(join(dir, '归档'), { recursive: true })
  writeFileSync(join(dir, '记忆.jsonl'), '{"id":"a","at":"t","role":"user","text":"ok"}\n{ 坏\n', 'utf8')
  writeFileSync(join(dir, '索引.md'), '# 索引\n\n- 存量：1\n', 'utf8')
  writeFileSync(join(dir, '画像.md'), '# 画像\n', 'utf8')
  try {
    const res = run(dir)
    assert.notEqual(res.code, 0)
    assert.match(res.stdout, /有问题/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('真实桌面夹子：校验通过（operator 的 ~/Desktop/Memory）', () => {
  const res = run(join(process.env.HOME, 'Desktop', 'Memory'))
  assert.equal(res.code, 0, res.stdout)
  assert.match(res.stdout, /13\/13 通过|汇总：13 项通过/)
})
