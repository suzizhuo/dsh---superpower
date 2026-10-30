#!/usr/bin/env node
/**
 * 进化记忆补写 CLI：把 spool 里未 ingest 的记录补写进 kb-mcp。
 *
 * 典型场景：
 *   · 插件未安装时会话产生了 spool（来自 CLI 旁的旧数据）——不存在此场景，仅作说明；
 *   · kb-mcp 曾不可用 → 记录落在 spool 未标记 → 恢复后手动补写；
 *   · 审计：--dry-run 只看不写。
 *
 * 用法：
 *   node scripts/evolve-memory.mjs [--dry-run] [--server anything-kb]
 *   DSH_DESKTOP_HOME=/path/to/harness node scripts/evolve-memory.mjs
 */
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const DSH_HOME =
  process.env.DSH_DESKTOP_HOME ??
  join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness')
const SPOOL_DIR = join(DSH_HOME, 'profiles', 'web', 'dsh-superpower-vision', 'spool')
const DRY_RUN = process.argv.includes('--dry-run')
const serverArgIndex = process.argv.indexOf('--server')
const SERVER = serverArgIndex > -1 ? process.argv[serverArgIndex + 1] : 'anything-kb'

const { readSpool, markSpoolIngested } = await import('../lib/spool.js')
const { createStdioJsonRpc } = await import('../lib/adapters/stdio-jsonrpc.js')
const { createMcpEvolutionMemory } = await import('../lib/adapters/evolution.js')
const { collectMcpServers, resolveHarnessHome } = await import('../lib/collectors/index.js')

const records = readSpool(SPOOL_DIR)
const pending = records.filter((r) => r.ingested !== true)
console.log(`spool: ${join(SPOOL_DIR, 'evolution-spool.jsonl')}`)
console.log(`records=${records.length} pending=${pending.length}`)

if (pending.length === 0) {
  console.log('没有待补写的记录。')
  process.exit(0)
}

const rows = collectMcpServers(resolveHarnessHome()).filter((r) => r.serverName === SERVER)
const row = rows[0]
if (!row || !row.command || !existsSync(row.command)) {
  console.error(`✗ 找不到可用的 MCP server "${SERVER}"（command=${row?.command ?? '未在 profile patch 声明'}），无法补写。`)
  process.exit(1)
}

if (DRY_RUN) {
  console.log('--dry-run：以下记录将被补写（未做任何修改）')
  for (const record of pending) console.log(`  ${record.sessionId ?? '?'} @ ${record.at ?? '?'} counters=${JSON.stringify(record.counters ?? {})}`)
  process.exit(0)
}

const rpc = createStdioJsonRpc({ command: row.command, args: row.args, env: row.env, timeoutMs: 10000 })
const mcp = createMcpEvolutionMemory({ rpc })
const done = []
const failed = []
for (const record of pending) {
  const result = await mcp.ingest(record)
  if (result.ok) done.push(record.sessionId)
  else failed.push({ id: record.sessionId, reason: result.reason })
}
if (done.length > 0) markSpoolIngested(SPOOL_DIR, done)
rpc.close()
console.log(`✓ 已补写 ${done.length} 条${failed.length > 0 ? `，失败 ${failed.length} 条` : ''}`)
for (const failure of failed) console.error(`  ✗ ${failure.id}: ${failure.reason}`)
process.exit(failed.length > 0 ? 1 : 0)
