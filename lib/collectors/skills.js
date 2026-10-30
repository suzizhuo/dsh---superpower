/**
 * 技能采集器：宿主注册表（ctx.skills.list）+ 磁盘目录双通道。
 *
 * 注册表通道拿 provider/rank/invocation 等活数据；磁盘通道扫
 * <harness>/skills 与 generations 内各包的 skills 目录，用于暴露
 * 「装了但注册表没有」与「注册表有但磁盘没了」两类漂移。
 */
import { existsSync } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { findGenerationDirs } from './plugins.js'

/** harness home：默认 DSH Desktop harness，env 可覆盖（CLI/测试）。 */
export function resolveHarnessHome(env = process.env) {
  return (
    env.DSH_DESKTOP_HOME ??
    join(env.HOME ?? homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness')
  )
}

const DEFAULT_INVOCATION = { modelInvocable: true, userInvocable: true }

async function listSkillDirs(base) {
  if (!existsSync(base)) return []
  const names = await readdir(base, { withFileTypes: true })
  const out = []
  for (const entry of names) {
    if (!entry.isDirectory()) continue
    const skillFile = join(base, entry.name, 'SKILL.md')
    if (existsSync(skillFile)) out.push(entry.name)
  }
  return out.sort()
}

/** 磁盘侧两个来源：用户级 skills/ 与各 generation 包内 skills/。 */
export async function scanDiskSkills(harnessHome) {
  const found = new Map()
  for (const name of await listSkillDirs(join(harnessHome, 'skills'))) {
    found.set(name, { name, origin: 'user-skills' })
  }
  const live = join(harnessHome, 'profiles', '.generations', 'live')
  for (const generationDir of findGenerationDirs(live)) {
    const nm = join(generationDir, 'node_modules')
    let packages = []
    try {
      packages = await readdir(nm, { withFileTypes: true })
    } catch {
      continue
    }
    for (const pkg of packages) {
      if (!pkg.isDirectory()) continue
      for (const name of await listSkillDirs(join(nm, pkg.name, 'skills'))) {
        if (!found.has(name)) found.set(name, { name, origin: pkg.name })
      }
    }
  }
  return [...found.values()]
}

/**
 * @param {{ skills?: { list?: (options?: object) => Promise<object[]> } }} ctx
 * @returns {Promise<{ entries: object[], drift: { onDiskOnly: string[], brokenLocator: string[] }, scannedAt: string, reason?: string }>}
 */
export async function collectSkills(ctx, options = {}) {
  const harnessHome = options.harnessHome ?? resolveHarnessHome()
  const entries = []
  const reason = typeof ctx?.skills?.list === 'function' ? undefined : 'skills-service-unavailable'
  if (!reason) {
    let raw = []
    try {
      raw = (await ctx.skills.list({})) ?? []
    } catch {
      /* 注册表不可用不影响磁盘通道 */
    }
    for (const skill of raw) {
      const invocation = skill.invocation ?? DEFAULT_INVOCATION
      entries.push({
        name: skill.name,
        provider: skill.provider ?? 'runtime',
        source: skill.source ?? 'unknown',
        rank: typeof skill.rank === 'number' ? skill.rank : null,
        modelInvocable: invocation.modelInvocable !== false,
        userInvocable: invocation.userInvocable !== false,
        locator: skill.locator ?? null,
      })
    }
  }
  const disk = await scanDiskSkills(harnessHome)
  const registered = new Set(entries.map((e) => e.name))
  const drift = {
    onDiskOnly: disk.filter((d) => !registered.has(d.name)).map((d) => d.name),
    brokenLocator: entries
      .filter((e) => e.locator?.path && !existsSync(e.locator.path))
      .map((e) => e.name),
  }
  return {
    entries: entries.sort((a, b) => a.name.localeCompare(b.name)),
    drift,
    scannedAt: new Date().toISOString(),
    ...(reason ? { reason } : {}),
  }
}
