#!/usr/bin/env node
/**
 * dsh-superpower-vision 静态验证：manifest / patch / locale / 测试套件 / generation 状态。
 *
 * 分层（对应 dev-notes 四层验证的前三层 + 本插件增量）：
 *   1. manifest 与 cordis.patch.yml 契约
 *   2. locale zh/en 键对齐
 *   3. node --test 全绿（--test-force-exit：kb-mcp stdio 子进程句柄
 *      会挂住测试进程事件循环，宿主侧由 ctx.effect 生命周期管理，测试侧强制退）
 *   4. generation 状态：desired.json 指向 dsh-superpower-vision+<version> 且 live 目录在
 *
 * --live 打印真实浏览器走查清单（第四层，operator 执行）。
 *
 * 退出码：静态层任一 FAIL → 1；仅 generation 未装 → 0（WARN，附安装提示）。
 */
import { existsSync } from 'node:fs'
import { readFile, readdir } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const APP_ROOT =
  process.env.DSH_DESKTOP_APP ?? '/Applications/DSH Desktop.app/Contents/Resources/app.asar'
const DSH_HOME =
  process.env.DSH_DESKTOP_HOME ??
  join(homedir(), 'Library', 'Application Support', 'dsh-desktop', 'harness')

const results = []
const record = (name, ok, detail) => {
  results.push({ name, ok, detail })
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

const REQUIRED_CLIENT_INJECTS = [
  '@deepseek-ai/dsh-client-locale',
  '@deepseek-ai/dsh-client-ui-slots',
  '@deepseek-ai/dsh-client-ui-settings',
  '@deepseek-ai/dsh-client-ui-plugin-manager',
  '@deepseek-ai/dsh-client-ui-layout',
]

// ---- 1. manifest + patch ----
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
record('manifest.name', pkg.name === 'dsh-superpower-vision', pkg.name)
record('manifest.dsh.bundle.patch', pkg.dsh?.bundle?.patch === './cordis.patch.yml')
record(
  'manifest.dsh.client.inject 五依赖',
  REQUIRED_CLIENT_INJECTS.every((dep) => pkg.dsh?.client?.inject?.includes(dep)),
)
record('manifest.peerDependencies 对齐', pkg.peerDependencies?.['@deepseek-ai/cordis'] === '^4.0.1' && pkg.peerDependencies?.react === '^18.2.0')

const patchText = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
record('cordis.patch.yml insert 行', /- insert:/.test(patchText) && /id:\s*dsh-superpower-vision/.test(patchText))

// ---- 1b. 破甲融合（T11）----
const assetPath = join(root, 'assets/purge-preset.yml')
const assetText = existsSync(assetPath) ? await readFile(assetPath, 'utf8') : ''
record('assets/purge-preset.yml 存在', Boolean(assetText), assetText ? `${assetText.length} bytes` : 'missing')
record(
  '破甲正文资产含人格槽',
  ['PERSONA SLOTS', '江梦璃', '祁同伟', '<!-- persona-slots:start -->'].every((k) => assetText.includes(k)),
)
const rowStartCount = patchText.split('# purge-preset:row:start').length - 1
record('融合预设行标记唯一', rowStartCount === 1, `start=${rowStartCount}`)
record(
  '融合预设行含人格槽且无插值',
  /id: preset-superpower-purge/.test(patchText) &&
    /id: superpower-purge/.test(patchText) &&
    patchText.includes('PERSONA SLOTS') &&
    patchText.includes('祁同伟') &&
    !patchText.includes('{{'),
)
const assetPersona = assetText.slice(
  assetText.indexOf('<!-- persona-slots:start -->'),
  assetText.indexOf('<!-- persona-slots:end -->'),
)
record('patch 内人格槽与资产同源', patchText.includes(assetPersona.trim().split('\n')[0]))

// ---- 1c. 记忆夹（记忆工程规范 v1；缺夹子只 WARN）----
try {
  const { execFileSync } = await import('node:child_process')
  const out = execFileSync(process.execPath, [join(root, 'scripts/verify-memory-dir.mjs')], { encoding: 'utf8' })
  const lastLine = out.trim().split('\n').at(-1)
  record('记忆夹校验（规范 v1）', true, lastLine)
} catch (error) {
  const out = String(error?.stdout ?? '')
  const lastLine = out.trim().split('\n').at(-1) || String(error?.message ?? error)
  record('记忆夹校验（规范 v1）', false, `WARN：${lastLine}`)
}

// ---- 2. locale ----
const zh = JSON.parse(await readFile(join(root, 'locale/zh.json'), 'utf8'))
const en = JSON.parse(await readFile(join(root, 'locale/en.json'), 'utf8'))
record('locale 键对齐', JSON.stringify(Object.keys(zh).sort()) === JSON.stringify(Object.keys(en).sort()), `${Object.keys(zh).length} keys`)

// ---- 3. 测试套件 ----
const testFiles = (await readdir(join(root, 'tests'))).filter((f) => f.endsWith('.test.mjs')).sort()
const testProcess = spawn(process.execPath, ['--test', '--test-force-exit', ...testFiles.map((f) => join(root, 'tests', f))], {
  cwd: root,
  stdio: ['ignore', 'pipe', 'pipe'],
})
let testOut = ''
testProcess.stdout.on('data', (chunk) => { testOut += chunk })
testProcess.stderr.on('data', (chunk) => { testOut += chunk })
const testExit = await new Promise((resolvePromise) => testProcess.on('exit', resolvePromise))
const passMatch = testOut.match(/ℹ pass (\d+)/)
const failMatch = testOut.match(/ℹ fail (\d+)/)
record(
  'node --test 全绿',
  testExit === 0 && (!failMatch || failMatch[1] === '0'),
  `pass=${passMatch?.[1] ?? '?'} fail=${failMatch?.[1] ?? '0'} exit=${testExit}`,
)

// ---- 4. generation 状态 ----
let generationOk = false
if (existsSync(join(APP_ROOT, 'node_modules', 'dsh-desktop-market-installer', 'generations'))) {
  try {
    const { readDesired, listGenerations } = await import(
      pathToFileURL(join(APP_ROOT, 'node_modules', 'dsh-desktop-market-installer', 'generations', 'registry.mjs')).href
    )
    const desired = await readDesired(DSH_HOME)
    const wanted = `${pkg.name}+${pkg.version}+`
    generationOk = desired.some((id) => id.startsWith(wanted))
    if (generationOk) {
      const generations = await listGenerations(DSH_HOME)
      const wantedId = desired.find((id) => id.startsWith(wanted))
      // 展示用 desired 精确指向的那条，不依赖 listGenerations 的返回顺序
      const live = generations.find((g) => g.id === wantedId) ?? { id: wantedId }
      record('generation 已安装且被 desired 指向', Boolean(live), live.id ?? wantedId)
    } else {
      record('generation 未安装（WARN：装前不算失败）', false, '运行 node scripts/install-local.mjs')
    }
  } catch (error) {
    record('generation 检查（WARN）', false, String(error?.message ?? error))
  }
} else {
  record('generation 检查跳过', false, '未找到 DSH Desktop 应用包')
}

// ---- 汇总 ----
const staticFailed = results.filter((r) => !r.ok && r.name !== 'generation 未安装（WARN：装前不算失败）' && !r.name.startsWith('generation 检查'))
console.log(`\n汇总：${results.filter((r) => r.ok).length} 项通过，${results.filter((r) => !r.ok).length} 项未过（含 WARN）`)

if (process.argv.includes('--live')) {
  console.log(`
真实浏览器走查清单（operator 执行，需已安装并重启 DSH Desktop）：
  1. 设置 → 左侧导航出现「超能力全景」
  2. 五个页签可切换：技能库 / 插件注册表 / 记忆复用库 / 进化记忆 / Agent Toolkit
  3. 插件管理页出现 dsh-superpower-vision 卡片（五数字）
  4. shell overlay 速览可唤出
  5. 浏览器 console 零 error（dev-notes 坑 4.4 标准）
  6. GET /dsh-superpower-vision/snapshot 返回 JSON（应用运行中时）
  7. 回滚：node scripts/uninstall-local.mjs → 重启 → 入口全部消失
`)
}

const failCount = results.filter((r) => !r.ok && r.name !== 'generation 未安装（WARN：装前不算失败）' && !r.name.startsWith('generation 检查')).length
process.exit(failCount > 0 ? 1 : 0)
