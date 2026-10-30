/**
 * 进化记忆 spool：会话结束记录的 JSONL 暂存。
 *
 * 文件：<dir>/evolution-spool.jsonl，一行一记录，追加写。
 * 容忍：读取时跳过坏行与无换行的残行；ingest 成功后 markSpoolIngested 翻转标记。
 * 同步实现：文件小、调用方在一次性上下文中，同步更简单。
 */
import { existsSync, mkdirSync, appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const SPOOL_FILE = 'evolution-spool.jsonl'

export function spoolPath(dir) {
  return join(dir, SPOOL_FILE)
}

/** 追加一条记录（ingested 固定 false；at 缺省现在）。 */
export function appendSpoolRecord(dir, record) {
  mkdirSync(dir, { recursive: true })
  const line = JSON.stringify({ ...record, ingested: false, at: record.at ?? new Date().toISOString() })
  appendFileSync(spoolPath(dir), `${line}\n`)
  return record
}

export function appendSpoolRecords(dir, records) {
  for (const record of records) appendSpoolRecord(dir, record)
}

/** 读取全部记录；坏行/残行跳过；文件不存在返回 []。 */
export function readSpool(dir) {
  const file = dir.endsWith('.jsonl') ? dir : spoolPath(dir)
  if (!existsSync(file)) return []
  const text = readFileSync(file, 'utf8')
  const records = []
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    try {
      const parsed = JSON.parse(trimmed)
      if (parsed && typeof parsed === 'object') records.push(parsed)
    } catch {
      /* 坏行跳过 */
    }
  }
  return records
}

/** 把指定 sessionId 的记录标记为已 ingest（重写文件，保留原顺序）。 */
export function markSpoolIngested(dir, sessionIds) {
  const file = dir.endsWith('.jsonl') ? dir : spoolPath(dir)
  const records = readSpool(dir)
  const target = new Set(sessionIds)
  let changed = false
  const lines = records.map((r) => {
    if (target.has(r.sessionId) && r.ingested !== true) {
      changed = true
      return JSON.stringify({ ...r, ingested: true })
    }
    return JSON.stringify(r)
  })
  if (changed) writeFileSync(file, lines.length > 0 ? `${lines.join('\n')}\n` : '')
  return { ok: true, changed }
}
