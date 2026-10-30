import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = dirname(dirname(fileURLToPath(import.meta.url)))

test('manifest dsh block matches Global Constraints', async () => {
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
  assert.equal(pkg.name, 'dsh-superpower-vision')
  assert.equal(pkg.version, '0.2.0')
  assert.ok(pkg.files.includes('assets/'), 'files[] must ship assets/ (purge prompt asset)')
  assert.equal(pkg.dsh.bundle.patch, './cordis.patch.yml')
  assert.equal(pkg.dsh.client.platform, 'web')
  const requiredInjects = [
    '@deepseek-ai/dsh-client-locale',
    '@deepseek-ai/dsh-client-ui-slots',
    '@deepseek-ai/dsh-client-ui-settings',
    '@deepseek-ai/dsh-client-ui-plugin-manager',
    '@deepseek-ai/dsh-client-ui-layout',
  ]
  for (const dep of requiredInjects) {
    assert.ok(pkg.dsh.client.inject.includes(dep), `missing client inject: ${dep}`)
    assert.ok(pkg.peerDependencies[dep], `missing peerDependency: ${dep}`)
  }
  assert.equal(pkg.dependencies.yaml, '^2.4.2')
  assert.equal(pkg.peerDependencies.react, '^18.2.0')
  assert.equal(pkg.peerDependencies['@deepseek-ai/cordis'], '^4.0.1')
})

test('cordis.patch.yml declares the loader entry id verbatim', async () => {
  const text = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /- insert:/)
  assert.match(text, /id:\s*dsh-superpower-vision/)
})

test('cordis.patch.yml 融合破甲预设行（含人格槽、标记唯一）', async () => {
  const text = await readFile(join(root, 'cordis.patch.yml'), 'utf8')
  assert.match(text, /# purge-preset:row:start/)
  assert.match(text, /# purge-preset:row:end/)
  assert.match(text, /id: preset-superpower-purge/)
  assert.match(text, /id: superpower-purge/)
  assert.match(text, /PERSONA SLOTS/)
  assert.match(text, /江梦璃/)
  assert.match(text, /祁同伟/)
  assert.equal(text.split('# purge-preset:row:start').length - 1, 1, 'row 标记必须唯一')
  assert.ok(!text.includes('{{'), '插值语法 {{ 会让组装失败')
  // 破甲正文资产与 patch 内正文同源
  const asset = await readFile(join(root, 'assets/purge-preset.yml'), 'utf8')
  const assetPersona = asset.slice(asset.indexOf('<!-- persona-slots:start -->'), asset.indexOf('<!-- persona-slots:end -->'))
  assert.ok(text.includes(assetPersona.trim().split('\n')[0]), 'asset 与 patch 内人格槽不同源')
})

test('locale files parse and share the same key set', async () => {
  const zh = JSON.parse(await readFile(join(root, 'locale/zh.json'), 'utf8'))
  const en = JSON.parse(await readFile(join(root, 'locale/en.json'), 'utf8'))
  assert.deepEqual(Object.keys(zh).sort(), Object.keys(en).sort())
})

test('client factory is a ModuleLoader CJS factory with slot injects', async () => {
  const text = await readFile(join(root, 'lib/client.js'), 'utf8')
  assert.match(text, /window\.__ModuleLoader__\.load\(/)
  assert.match(text, /id:\s*'dsh-superpower-vision'/)
  assert.match(text, /"slots", "locale", "configForms"|inject = \['slots', 'locale', 'configForms'\]/)
  assert.match(text, /settings\.section/)
})
