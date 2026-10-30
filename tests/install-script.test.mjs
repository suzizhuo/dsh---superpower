import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const scripts = join(dirname(fileURLToPath(import.meta.url)), '..', 'scripts')

test('install script uses the generation channel with the right call shapes', async () => {
  const text = await readFile(join(scripts, 'install-local.mjs'), 'utf8')
  assert.match(text, /installGeneration\(/)
  assert.match(text, /verifyGenerationPeers\(/)
  assert.match(text, /writeDesired\(/)
  // 位置参数形式（对象形式会报 "path argument must be of type string"）
  assert.match(text, /projectGenerations\(DSH_HOME, PROFILE\)/)
  // 版本防撞
  assert.match(text, /--force/)
  assert.match(text, /already|已存在|bump/)
  // 重启提醒
  assert.match(text, /重启 DSH Desktop/)
})

test('uninstall script disables generation and re-projects', async () => {
  const text = await readFile(join(scripts, 'uninstall-local.mjs'), 'utf8')
  assert.match(text, /disableGeneration\(/)
  assert.match(text, /projectGenerations\(DSH_HOME, PROFILE\)/)
  assert.match(text, /listGenerations\(/)
  assert.match(text, /重启 DSH Desktop/)
})
