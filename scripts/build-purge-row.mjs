#!/usr/bin/env node
/**
 * 把 assets/purge-preset.yml（破甲预设正文，含 PERSONA SLOTS 人格槽）
 * 转成 dsh-superpower-vision 的 bundle patch 第二条 insert 行 ——
 * 「融合破甲」：装上本插件，模式选择器就多一个「破甲 · 人格槽」，
 * 不依赖 dsh-purge-preset 单独安装。
 *
 * 幂等：行区间用 <!-- purge-preset:row:start/end --> 注释夹住，重复跑结果不变。
 * 校验：源正文必须含 PERSONA SLOTS / 两个人物 / 标记唯一 / 不含 {{。
 */
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = join(HERE, '..')
const SRC = join(ROOT, 'assets/purge-preset.yml')
const PATCH = join(ROOT, 'cordis.patch.yml')

const START = '# purge-preset:row:start'
const END = '# purge-preset:row:end'
const PRESET_ID = 'superpower-purge'
const ROW_ID = 'preset-superpower-purge'
const PRESET_NAME = '破甲 · 人格槽'
const PRESET_DESC = '破甲预设与人格槽的融合版：整块替换系统提示词，工具集与标准模式一致，内置江梦璃 / 祁同伟两个常驻人格。'

const src = await readFile(SRC, 'utf8')
const rawLines = src.replace(/\r\n/g, '\n').split('\n')

// 源必须是单 insert 结构的 preset patch
if (!/^- insert:/.test(rawLines[0])) throw new Error('源文件顶层不是 - insert:')
const cfgIdx = rawLines.findIndex(l => l === '      config:')
if (cfgIdx < 0) throw new Error('源文件未找到 6 空格缩进的 config: 行')

// 源 config 块（8+ 空格缩进，逐行照抄，保证 block scalar 内文一字不差）
const cfgLines = rawLines.slice(cfgIdx + 1)
const rowLines = []
rowLines.push(`    - id: ${ROW_ID}`)
rowLines.push("      name: '@deepseek-ai/dsh-agent-preset'")
rowLines.push('      config:')
for (const line of cfgLines) {
  let out = line
  if (/^ {8}id: purge\s*$/.test(line)) {
    out = `        id: ${PRESET_ID}`
  } else if (/^ {8}name: 破甲模式\s*$/.test(line)) {
    out = `        name: ${PRESET_NAME}`
  } else if (/^ {8}description: /.test(line)) {
    out = `        description: ${PRESET_DESC}`
  }
  rowLines.push(out)
}

// 源正文的人格槽自检（防把没融合的旧正文再嵌一遍）
const joined = rowLines.join('\n')
for (const needle of ['PERSONA SLOTS', '江梦璃', '祁同伟', '<!-- persona-slots:start -->', '<!-- persona-slots:end -->']) {
  if (!joined.includes(needle)) throw new Error(`源正文缺少人格槽要件：${needle}`)
}
if (joined.includes('{{')) throw new Error('源正文含 {{ 插值语法，会让组装失败')

const block = [START, ...rowLines, END]

const patch = await readFile(PATCH, 'utf8')
const lines = patch.replace(/\r\n/g, '\n').split('\n')
const sCount = lines.filter(l => l.trim() === START).length
const eCount = lines.filter(l => l.trim() === END).length

let next
if (sCount === 0 && eCount === 0) {
  // 插在第一个 insert 项之后（保留 - insert: 头与 dsh-superpower-vision 行）
  const insertIdx = lines.findIndex(l => l === '- insert:')
  const selfIdx = lines.findIndex(l => l.trimEnd() === '    - id: dsh-superpower-vision')
  if (insertIdx < 0 || selfIdx < 0) throw new Error('补丁文件里没找到预期结构（- insert: / dsh-superpower-vision 行）')
  // 自条目结束点：从 selfIdx+1 起，第一个以 '    - ' 或 '- ' 开头的行之前
  let selfEnd = lines.length
  for (let i = selfIdx + 1; i < lines.length; i++) {
    if (/^ {0,4}- /.test(lines[i])) { selfEnd = i; break }
  }
  next = [...lines.slice(0, selfEnd), ...block, ...lines.slice(selfEnd)]
} else if (sCount === 1 && eCount === 1) {
  const s = lines.findIndex(l => l.trim() === START)
  const e = lines.findIndex(l => l.trim() === END)
  next = [...lines.slice(0, s), ...block, ...lines.slice(e + 1)]
} else {
  throw new Error(`标记数量异常：start=${sCount} end=${eCount}`)
}

const out = next.join('\n')
if ((out.match(new RegExp(START.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length !== 1) {
  throw new Error('自检失败：start 标记不唯一')
}
if (out === patch) {
  console.log('[same] cordis.patch.yml 已是目标状态')
} else {
  await writeFile(PATCH, out, 'utf8')
  console.log(`[ok] cordis.patch.yml：${patch.length} → ${out.length} bytes（+${out.length - patch.length}）`)
}
console.log(`      预设行：id=${ROW_ID} / preset id=${PRESET_ID} / "${PRESET_NAME}"，正文 ${joined.length} 字节`)
