#!/usr/bin/env node
/**
 * 从 DSH Desktop 的 generation 通道移除 dsh-superpower-vision。
 *
 * 卸载 = disableGeneration（从 desired.json 摘掉）+ 重新投影。
 * 注意：**不是** pnpm remove——投影会把它装回来。generation 目录默认保留，
 * 方便快速重新启用；确认不再需要时手工清：
 *
 *   rm -rf "$DSH_HOME/profiles/.generations/live/<generation-id>"
 *
 * 用法：node scripts/uninstall-local.mjs
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 本机实测：安装器在 app.asar 内（Electron node 的 asar fs 透明可读）。
const APP_ROOT =
  process.env.DSH_DESKTOP_APP ?? '/Applications/DSH Desktop.app/Contents/Resources/app.asar'
const DSH_HOME =
  process.env.DSH_DESKTOP_HOME ??
  join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness')
const PROFILE = process.env.DSH_DESKTOP_PROFILE ?? 'web'
const GENERATIONS = join(APP_ROOT, 'node_modules', 'dsh-desktop-market-installer', 'generations')

const sourceDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(await readFile(join(sourceDirectory, 'package.json'), 'utf8'))

if (!existsSync(GENERATIONS)) {
  console.error(`找不到 ${GENERATIONS}\nDSH_DESKTOP_APP 可指向 DSH Desktop.app/Contents/Resources/app`)
  process.exit(1)
}

const importModule = async (file) => import(pathToFileURL(file).href)
const { disableGeneration, listGenerations, withRegistryLock } = await importModule(
  join(GENERATIONS, 'registry.mjs')
)
const { projectGenerations } = await importModule(join(GENERATIONS, 'projection.mjs'))

await withRegistryLock(DSH_HOME, async () => {
  const removed = await disableGeneration(DSH_HOME, manifest.name)
  console.log(removed ? '✓ desired.json 已移除该插件' : '· desired.json 里本来就没有它')

  const projected = await projectGenerations(DSH_HOME, PROFILE)
  console.log(`✓ 投影完成：linked=${projected.linked.join(', ') || '(无)'}`)

  const left = (await listGenerations(DSH_HOME)).filter((g) => g.pluginName === manifest.name)
  if (left.length > 0) {
    console.log('· generation 目录仍保留（可直接重新启用，需要时手工删）：')
    for (const generation of left) console.log(`   ${generation.id}`)
  }
})

console.log('\n下一步：重启 DSH Desktop，设置导航「超能力全景」与插件卡片、浮窗全部消失')
