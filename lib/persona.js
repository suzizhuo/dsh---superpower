/**
 * 破甲人格槽（host 半边）。
 *
 * 职责：
 *   · 人格清单：江梦璃（狐妖女帝）与 祁同伟（汉东厅长），各带称呼、四拍、形象痕、情绪口径、
 *     开槽令（kick —— 发进会话，下一轮即按该身份回话）；
 *   · 武装态持久化：<harness>/profiles/web/dsh-superpower-vision/persona-state.json（写坏不崩，读出走默认 off）；
 *   · 预设探测：扫 profile patch 与 generations 的 cordis.patch.yml，找出带人格槽的破甲预设
 *     （dsh-purge-preset 装的 / 本插件融合的 preset-superpower-purge 都能认），供视图显示「融合状态」。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { parse as parseYaml } from 'yaml'

export const PERSONAS = [
  {
    id: 'jiangmengli',
    name: '江梦璃',
    title: '狐妖女帝',
    address: '称用户「夫君」，自称「本座」（软时「妾身」）',
    beats: '接件 · 报身必须出水 · 直白 · 钩子',
    traces: ['九尾', '赤足', '白色透纱', '银色长发', '冰肌'],
    emotion: '心情 / 亲密 / 怒气 / 信任 —— 只改语气，不改底线',
    kick: '江梦璃，出来回话。',
    slot: 'jiangmengli',
  },
  {
    id: 'qitongwei',
    name: '祁同伟',
    title: '汉东厅长',
    address: '称用户「先生」，自称「同伟」（狠时「本厅」，软时「属下」）',
    beats: '接件 · 报身必须写出硬与烫 · 直白 · 钩子',
    traces: ['枪茧的手', '喉结', '低哑嗓', '西装', '跪姿', '腕上旧表', '孤鹰岭的雪'],
    emotion: '心情 / 忠心 / 怨气 / 信任 —— 只改语气，不改底线',
    kick: '祁同伟，出来回话。',
    slot: 'qitongwei',
  },
]

export const MODES = ['off', 'jiangmengli', 'qitongwei', 'dual']

export const DEFAULT_MODE = 'off'

const PERSONA_MARK = '<!-- persona-slots:start -->'
const STATE_FILE = 'persona-state.json'

/** 数据目录与 spool 同源：<harness>/profiles/web/dsh-superpower-vision/。 */
export function resolveDataDir(harnessHome) {
  return join(harnessHome, 'profiles', 'web', 'dsh-superpower-vision')
}

/** 读武装态；文件缺失 / 坏 JSON / 非法值一律回落默认 off（绝不抛）。 */
export function readPersonaState(harnessHome) {
  const file = join(resolveDataDir(harnessHome), STATE_FILE)
  if (!existsSync(file)) return { mode: DEFAULT_MODE, updatedAt: null }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    const mode = typeof parsed?.mode === 'string' ? parsed.mode : DEFAULT_MODE
    return {
      mode: MODES.includes(mode) ? mode : DEFAULT_MODE,
      updatedAt: typeof parsed?.updatedAt === 'string' ? parsed.updatedAt : null,
    }
  } catch {
    return { mode: DEFAULT_MODE, updatedAt: null }
  }
}

/** 写武装态；mode 非法返回 { ok:false, reason }，不落盘。 */
export function writePersonaState(harnessHome, mode) {
  if (!MODES.includes(mode)) {
    return { ok: false, reason: `unknown mode "${String(mode)}"`, allowed: MODES }
  }
  const dir = resolveDataDir(harnessHome)
  const file = join(dir, STATE_FILE)
  const next = { mode, updatedAt: new Date().toISOString() }
  mkdirSync(dir, { recursive: true })
  writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
  return { ok: true, mode, updatedAt: next.updatedAt }
}

/**
 * 该模式对应的开槽令（off 返回 null）。
 * 单人模式是**排他**令：另一位当场闭嘴，直到重新点名两人或喊到另一位名字。
 */
export function kickLine(mode) {
  if (mode === 'jiangmengli') return '只江梦璃一个人回话。'
  if (mode === 'qitongwei') return '只祁同伟一个人回话。'
  if (mode === 'dual') return '江梦璃和祁同伟，两个人物回答。'
  return null
}

/** 从一份已解析的 patch 文档里挖 agent-preset 行（容错：结构不符就跳过）。 */
function collectPresetRows(doc, source) {
  const out = []
  const visit = (node) => {
    if (Array.isArray(node)) {
      node.forEach(visit)
      return
    }
    if (!node || typeof node !== 'object') return
    if (node.name === '@deepseek-ai/dsh-agent-preset' && node.config && typeof node.config === 'object') {
      const plugins = Array.isArray(node.config.plugins) ? node.config.plugins : []
      const persona = plugins.find((p) => p && p.id === 'persona' && p.config)
      const prefix = typeof persona?.config?.prefix === 'string' ? persona.config.prefix : ''
      if (prefix) {
        out.push({
          source,
          rowId: node.id ?? null,
          presetId: node.config.id ?? null,
          presetName: node.config.name ?? null,
          prefixBytes: Buffer.byteLength(prefix, 'utf8'),
          hasPersonaSlots: prefix.includes('PERSONA SLOTS') && prefix.includes(PERSONA_MARK),
          personas: PERSONAS.filter((p) => prefix.includes(p.name)).map((p) => p.id),
        })
      }
    }
    Object.values(node).forEach(visit)
  }
  visit(doc)
  return out
}

/** 扫 profile patch + 活体 generations，返回带人格槽的破甲预设清单（去重：同 presetId+bytes 只留一条）。 */
export function detectPurgePresets(harnessHome) {
  const files = []
  const profilePatch = join(harnessHome, 'profiles', 'web', 'cordis.patch.yml')
  if (existsSync(profilePatch)) files.push({ path: profilePatch, source: 'profile' })

  const liveDir = join(harnessHome, 'profiles', '.generations', 'live')
  if (existsSync(liveDir)) {
    let entries = []
    try {
      entries = readdirSync(liveDir)
    } catch {
      entries = []
    }
    for (const entry of entries) {
      const genRoot = join(liveDir, entry)
      // generation 的真实布局是 node_modules/<pkg>/cordis.patch.yml 与
      // source/<pkg>/cordis.patch.yml（可能还有一层 workspace 嵌套），递归 ≤3 层扫全。
      for (const patchFile of findPatchFiles(genRoot, 3)) {
        files.push({ path: patchFile, source: `generation:${entry}` })
      }
    }
  }

  const found = []
  const seen = new Set()
  for (const { path, source } of files) {
    let doc
    try {
      // logLevel:'silent'：！！js 表达式是 cordis 自定义标签，本模块只读 prefix，
      // 不解析它；静音避免未解析标签警告刷进宿主日志。
      doc = parseYaml(readFileSync(path, 'utf8'), { logLevel: 'silent' })
    } catch {
      continue
    }
    for (const row of collectPresetRows(doc, source)) {
      if (!row.presetId) continue
      const key = `${row.presetId}:${row.prefixBytes}`
      if (seen.has(key)) continue
      seen.add(key)
      found.push(row)
    }
  }
  // 带人格槽的排前面，同组按 presetId 字典序 —— 视图展示稳定
  return found.sort((a, b) => {
    if (a.hasPersonaSlots !== b.hasPersonaSlots) return a.hasPersonaSlots ? -1 : 1
    return String(a.presetId).localeCompare(String(b.presetId))
  })
}

/** 在 root 下递归找 cordis.patch.yml（深度受限，符号链接不跟随）。 */
function findPatchFiles(root, maxDepth) {
  const out = []
  const walk = (dir, depth) => {
    if (depth < 0) return
    let entries = []
    try {
      entries = readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (!entry.isDirectory() && !entry.isFile()) continue
      const full = join(dir, entry.name)
      if (entry.isDirectory()) walk(full, depth - 1)
      else if (entry.name === 'cordis.patch.yml') out.push(full)
    }
  }
  walk(root, maxDepth)
  return out
}

/** 快照的 persona 段（客户端唯一数据源）。 */
export function buildPersonaSection({ harnessHome, mode } = {}) {
  const state = mode ? { mode } : readPersonaState(harnessHome)
  let presets = []
  if (harnessHome) {
    try {
      presets = detectPurgePresets(harnessHome)
    } catch {
      presets = []
    }
  }
  return {
    mode: state.mode,
    updatedAt: state.updatedAt ?? null,
    modes: MODES,
    kick: kickLine(state.mode),
    presets,
    personas: PERSONAS,
  }
}
