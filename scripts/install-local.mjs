#!/usr/bin/env node
/**
 * 把 dsh-superpower-vision 装进 **DSH Desktop** 的 generation 通道。
 *
 * 为什么不用 `pnpm add` / 手工塞 node_modules：桌面端插件是不变 generation，
 * 直接塞 profiles/web/node_modules 会被下次投影覆盖。正确通道：
 *
 *   installGeneration() → verifyGenerationPeers() → writeDesired()
 *   → projectGenerations(DSH_HOME, 'web')  ← 位置参数，勿传对象
 *
 * 实现位于应用包内（不在 @deepseek-ai/ 下）：
 *   <DSH_DESKTOP_APP>/node_modules/dsh-desktop-market-installer/generations/*.mjs
 *
 * 版本防撞：desired.json 里已存在同 `名+同版本` 的 generation 时拒绝安装，
 * 除非加 --force（generation id 含 content hash，重复安装同名同版没有意义）。
 *
 * 用法：
 *   node scripts/install-local.mjs [--force]
 *   DSH_DESKTOP_HOME=/path/to/harness node scripts/install-local.mjs
 *
 * 装完 **必须重启 DSH Desktop**：桌面端启动会重跑自己的投影流程。
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createRequire, registerHooks } from 'node:module'

// 本机实测：安装器在 app.asar 内（Electron node 的 asar fs 透明可读）；
// pnpm 二进制在 app.asar.unpacked。DSH_DESKTOP_APP 可覆盖。
const APP_ROOT =
  process.env.DSH_DESKTOP_APP ?? '/Applications/DSH Desktop.app/Contents/Resources/app.asar'
const DSH_HOME =
  process.env.DSH_DESKTOP_HOME ??
  join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness')
const PROFILE = process.env.DSH_DESKTOP_PROFILE ?? 'web'
const GENERATIONS = join(APP_ROOT, 'node_modules', 'dsh-desktop-market-installer', 'generations')
const PNPM = join(
  APP_ROOT.replace(/app\.asar$/, 'app.asar.unpacked'),
  'node_modules',
  'pnpm',
  'bin',
  'pnpm.cjs',
)
const FORCE = process.argv.includes('--force')
// peer 闭包校验锚点：host 单件（@deepseek-ai/*、react）解析自 bundled DSH entry
// （app.asar 内 @deepseek-ai/dsh/lib/bin.js）——host-module-fallback.mjs 同款设计。
const DSH_ENTRY =
  process.env.DSH_DESKTOP_ENTRY ?? join(APP_ROOT, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')

// 宿主单件回退钩子：桌面端进程内由 host-module-fallback.mjs 注册（ESM parentURL
// 重试不吃 asar，实测失败）；本脚本改用 CJS require 预解析 + shortCircuit 返回，
// 对 createRequire().resolve（verifyGenerationPeers 用的就是它）生效。
const HOST_SINGLETON_PREFIXES = ['@deepseek-ai/', 'react', 'react-dom']
const hostRequireForFallback = createRequire(DSH_ENTRY)
const hostResolveCache = new Map()
registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context)
    } catch (error) {
      const isHostSingleton = HOST_SINGLETON_PREFIXES.some(
        (prefix) => specifier === prefix || specifier.startsWith(prefix),
      )
      if (!isHostSingleton) throw error
      if (!hostResolveCache.has(specifier)) {
        try {
          hostResolveCache.set(specifier, hostRequireForFallback.resolve(specifier))
        } catch {
          throw error
        }
      }
      return { url: pathToFileURL(hostResolveCache.get(specifier)).href, shortCircuit: true, format: 'commonjs' }
    }
  },
})

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(sourceDirectory, 'package.json'), 'utf8'))

for (const required of [GENERATIONS, PNPM]) {
  if (!existsSync(required)) {
    console.error(`找不到 ${required}\nDSH_DESKTOP_APP 可指向 DSH Desktop.app/Contents/Resources/app`)
    process.exit(1)
  }
}

const importModule = async (file) => import(pathToFileURL(file).href)
const { installGeneration, verifyGenerationPeers } = await importModule(
  join(GENERATIONS, 'installer.mjs')
)
const { readDesired, writeDesired, withRegistryLock } = await importModule(
  join(GENERATIONS, 'registry.mjs')
)
const { projectGenerations } = await importModule(join(GENERATIONS, 'projection.mjs'))

await withRegistryLock(DSH_HOME, async () => {
  console.log(`→ 安装 ${manifest.name}@${manifest.version}`)
  console.log(`  源码目录 : ${sourceDirectory}`)
  console.log(`  DSH_HOME : ${DSH_HOME}`)
  console.log(`  profile  : ${PROFILE}`)

  // 版本防撞：desired 里已有同名同版本 generation → 要求 bump 或 --force
  const desired = await readDesired(DSH_HOME)
  const sameVersionIds = desired.filter((id) => id.startsWith(`${manifest.name}+${manifest.version}+`))
  if (sameVersionIds.length > 0 && !FORCE) {
    console.error(
      `✗ desired.json 已存在 ${manifest.name}+${manifest.version}+* generation（${sameVersionIds.length} 个）。\n` +
        '  请先 bump package.json 的 version，或加 --force 强制重装。'
    )
    process.exitCode = 1
    return
  }

  const result = await installGeneration({
    dshHome: DSH_HOME,
    profile: PROFILE,
    pluginSpec: sourceDirectory,
    sourceDirectory,
    expectedPluginName: manifest.name,
    expectedVersion: manifest.version,
    pnpmEntryPath: PNPM,
    nodeExecutablePath: process.execPath,
    dshEntryPath: DSH_ENTRY,
    onTrace: (line) => console.log(`  [${line}]`),
  })
  if (!result.ok) {
    console.error(`✗ 安装失败：${result.detail}`)
    process.exitCode = 1
    return
  }
  console.log(`✓ generation: ${result.generation.id}`)

  const peers = await verifyGenerationPeers(DSH_HOME, result.generation, { dshEntryPath: DSH_ENTRY })
  if (!peers.ok) {
    console.error('✗ 依赖闭包校验失败：')
    for (const problem of peers.problems) console.error(`   - ${problem}`)
    process.exitCode = 1
    return
  }
  console.log('✓ 依赖闭包校验通过')

  const next = [
    ...desired.filter((id) => !id.startsWith(`${manifest.name}+`)),
    result.generation.id,
  ]
  await writeDesired(DSH_HOME, next)
  console.log('✓ desired.json 已指向新 generation')

  const projected = await projectGenerations(DSH_HOME, PROFILE)
  console.log(`✓ 投影完成：linked=${projected.linked.join(', ') || '(无)'}`)
  console.log(`  profile bundles = ${projected.bundles.join(', ')}`)

  const profilePatch = join(DSH_HOME, 'profiles', PROFILE, 'cordis.patch.yml')
  if (existsSync(profilePatch)) {
    const text = await readFile(profilePatch, 'utf8')
    if (/id:\s*dsh-superpower-vision\b/.test(text)) {
      console.warn(
        '⚠ profile 的 cordis.patch.yml 里还有手工追加的 dsh-superpower-vision 行，' +
          '会与本插件重复注册（日志会出现重复 entry 警告）。请删掉那段后重启。'
      )
    }
  }
})

if (process.exitCode === undefined || process.exitCode === 0) {
  console.log('\n下一步：重启 DSH Desktop → 设置 → 导航栏出现「超能力全景」')
  console.log('验证：node scripts/verify.mjs；回滚：node scripts/uninstall-local.mjs')
}
