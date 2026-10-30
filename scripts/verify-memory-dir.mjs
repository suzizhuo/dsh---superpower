#!/usr/bin/env node
/**
 * 记忆夹校验器（记忆工程规范 v1 的第十节验收清单）。
 *
 * 用法：node scripts/verify-memory-dir.mjs [--dir <记忆夹>] [--strict]
 *   --dir    默认 ~/Desktop/Memory
 *   --strict 任一 FAIL 返回非 0（verify.mjs 集成时用 WARN 档，不必传）
 *
 * 校验项（对应规范第十节）：
 *   1. 结构：记忆.jsonl / 索引.md / 画像.md / 归档/ 四件在（schema.json 可选）
 *   2. 每行合法 JSON，必填 text/role/at 在
 *   3. id 无重复
 *   4. covered_history / evolve_to 指向的 id 真实存在
 *   5. kind/status/source 在登记枚举内
 *   6. 索引.md 的条数与文件行数一致（不一致只 WARN，允许索引没重写）
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const argv = process.argv.slice(2)
const dirFlag = argv.indexOf('--dir')
const DIR = dirFlag >= 0 ? argv[dirFlag + 1] : join(homedir(), 'Desktop', 'Memory')
const strict = argv.includes('--strict')

const KINDS = ['fact', 'preference', 'rule', 'event', 'task', 'trace']
const STATUS = ['activated', 'resolving', 'archived', 'deleted']
const SOURCES = ['conversation', 'file', 'system', 'web']
const ROLES = ['user', 'assistant', 'system']

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

if (!existsSync(DIR)) {
  record('记忆夹存在', false, `${DIR} 不存在`)
  process.exit(strict ? 1 : 0)
}
record('记忆夹存在', true, DIR)

// 1. 结构
for (const rel of ['记忆.jsonl', '索引.md', '画像.md', '归档']) {
  record(`结构 ${rel}`, existsSync(join(DIR, rel)))
}
record('结构 schema.json', true, existsSync(join(DIR, 'schema.json')) ? '可选件，在' : '可选件，缺（不阻塞）')

// 2/3/4/5. 记录级
const raw = readFileSync(join(DIR, '记忆.jsonl'), 'utf8')
const lines = raw.split('\n').filter((l) => l.trim() !== '')
let bad = 0
let duplicates = 0
const ids = new Set()
const seenIds = []
const dangling = []
const enumBad = []
lines.forEach((line, i) => {
  let row
  try {
    row = JSON.parse(line)
  } catch {
    bad++
    return
  }
  for (const key of ['text', 'role', 'at']) {
    if (typeof row[key] !== 'string' || !row[key]) {
      bad++
      return
    }
  }
  if (typeof row.id === 'string' && row.id) {
    if (ids.has(row.id)) duplicates++
    ids.add(row.id)
    seenIds.push(row.id)
  }
  if (row.kind && !KINDS.includes(row.kind)) enumBad.push(`line ${i + 1}: kind=${row.kind}`)
  if (row.status && !STATUS.includes(row.status)) enumBad.push(`line ${i + 1}: status=${row.status}`)
  if (row.source && !SOURCES.includes(row.source)) enumBad.push(`line ${i + 1}: source=${row.source}`)
  if (row.role && !ROLES.includes(row.role)) enumBad.push(`line ${i + 1}: role=${row.role}`)
  for (const ref of [row.covered_history, ...(Array.isArray(row.evolve_to) ? row.evolve_to : [])]) {
    if (typeof ref === 'string' && ref && ids.has(ref) === false) dangling.push(ref)
  }
})
record('每行合法 JSON 且必填齐', bad === 0, bad === 0 ? `${lines.length} 行` : `${bad} 行有问题`)
record('id 无重复', duplicates === 0, duplicates ? `重复 ${duplicates} 个` : `${ids.size} 个唯一 id`)
record(
  '引用 id 都存在',
  dangling.length === 0,
  dangling.length ? `悬空引用 ${dangling.length} 个：${dangling.slice(0, 3).join(', ')}` : '无悬空引用',
)
record('枚举字段合法', enumBad.length === 0, enumBad.length ? enumBad.slice(0, 3).join('；') : 'kind/status/source/role 全在册')

// 6. 索引一致性
try {
  const index = readFileSync(join(DIR, '索引.md'), 'utf8')
  const m = index.match(/存量：(\d+)/)
  const declared = m ? Number(m[1]) : null
  const archived = readdirSync(join(DIR, '归档')).filter((f) => f !== '.gitkeep').length
  record(
    '索引条数与文件一致',
    declared === null || declared === lines.length,
    declared === null ? '索引未写存量行（跑 memory.py index 可修）' : `索引 ${declared} / 文件 ${lines.length}`,
  )
  record('归档目录', true, archived > 0 ? `${archived} 个轮转文件` : '空（未轮转）')
  const sizeOk = statSync(join(DIR, '记忆.jsonl')).size <= 4 * 1024 * 1024
  record('未超 4 MB 轮转阈值', sizeOk, `${(statSync(join(DIR, '记忆.jsonl')).size / 1024).toFixed(1)} KiB`)
} catch (error) {
  record('索引一致性', false, String(error?.message ?? error))
}

const failed = results.filter((r) => !r.ok)
console.log(`\n汇总：${results.length - failed.length}/${results.length} 通过`)
process.exit(strict && failed.length ? 1 : 0)
