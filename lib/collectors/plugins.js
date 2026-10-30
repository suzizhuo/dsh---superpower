/**
 * 插件注册表采集器：desired.json 指针 + generation 目录 + profile patch 行。
 *
 * 桌面端 harness 布局：
 *   <harness>/profiles/.generations/desired.json      期望生效的 generation id 列表
 *   <harness>/profiles/.generations/live/<id>/        不可变 generation 存储
 *   <harness>/profiles/web/cordis.patch.yml           用户/插件 patch 行
 *
 * generation id 形如 `<name>+<version>+<hash>`（name 可含 @scope/，但不含 +）。
 *
 * 同步实现：调用方（快照路由、verify 脚本）都在一次性读少量小文件，同步更简单。
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import YAML from 'yaml'

/** 解析 generation id → { name, version }；无法解析时 name 取全串。 */
export function parseGenerationId(id) {
  const parts = String(id).split('+')
  if (parts.length >= 3) {
    return { name: parts.slice(0, -2).join('+'), version: parts[parts.length - 2] }
  }
  return { name: String(id), version: null }
}

/**
 * live 目录名消毒：desired 里的 `@scope/name+ver+hash` 落成 `scope+name+ver+hash`
 * （真机实测：@scope 的 @ 剥掉、/ 变 +，目录扁平化）。用于把 live 目录对回 desired id。
 */
export function sanitizeGenerationId(id) {
  return String(id).replace(/^@/, '').replace(/\//g, '+')
}

/** 递归找 live 下所有含 node_modules 的目录（容忍消毒名/嵌套两种布局）。 */
export function findGenerationDirs(live) {
  const found = []
  const walk = (dir, depth) => {
    let entries
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      const full = join(dir, entry.name)
      if (existsSync(join(full, 'node_modules'))) {
        found.push(full)
      } else if (depth < 3) {
        walk(full, depth + 1)
      }
    }
  }
  if (existsSync(live)) walk(live, 0)
  return found.sort()
}

/** 递归收集任意 `insert:` 数组里的行（保留原对象引用，含 config；容忍托管块嵌套）。 */
export function collectInsertRows(node, rows = []) {
  if (Array.isArray(node)) {
    for (const item of node) collectInsertRows(item, rows)
    return rows
  }
  if (node && typeof node === 'object') {
    if (Array.isArray(node.insert)) {
      for (const row of node.insert) {
        if (row && typeof row === 'object' && typeof row.id === 'string') rows.push(row)
      }
    }
    for (const value of Object.values(node)) collectInsertRows(value, rows)
  }
  return rows
}

/** 读 profile patch 原文与解析结果；解析失败返回 doc=null（不抛）。 */
export function readProfilePatch(harnessHome) {
  const file = join(harnessHome, 'profiles', 'web', 'cordis.patch.yml')
  if (!existsSync(file)) return { doc: null, raw: '' }
  const raw = readFileSync(file, 'utf8')
  try {
    return { doc: YAML.parse(raw), raw }
  } catch {
    return { doc: null, raw }
  }
}

/** @returns {{ desired: string[], generations: {id,name,version}[], patchRows: {id,name}[] }} */
export function collectPlugins(harnessHome) {
  const desired = []
  const desiredFile = join(harnessHome, 'profiles', '.generations', 'desired.json')
  if (existsSync(desiredFile)) {
    try {
      const parsed = JSON.parse(readFileSync(desiredFile, 'utf8'))
      if (Array.isArray(parsed)) desired.push(...parsed.filter((id) => typeof id === 'string'))
    } catch {
      /* 坏 JSON → 空 desired，不抛 */
    }
  }
  const generations = []
  const live = join(harnessHome, 'profiles', '.generations', 'live')
  // desired 权威：live 目录名对回 desired id（消毒映射），对不上就按目录原名
  const desiredBySanitized = new Map(desired.map((id) => [sanitizeGenerationId(id), id]))
  for (const dir of findGenerationDirs(live)) {
    const basename = dir.slice(live.length + 1)
    const id = desiredBySanitized.get(basename) ?? basename
    const { name, version } = parseGenerationId(id)
    generations.push({ id, name, version, dir })
  }
  const { doc } = readProfilePatch(harnessHome)
  const patchRows = doc === null ? [] : collectInsertRows(doc)
  return { desired, generations: generations.sort((a, b) => a.id.localeCompare(b.id)), patchRows }
}
