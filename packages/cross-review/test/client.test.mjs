import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { test } from 'node:test'

const root = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const source = fs.readFileSync(path.join(root, '..', 'client.js'), 'utf8')

test('client.js only references localized keys that both dictionaries define', () => {
  const start = source.indexOf('const TEXT = ZH')
  const end = source.indexOf('const CSS =', start)
  assert.ok(start > 0 && end > start, 'the TEXT dictionaries are locatable')
  const [zhBlock, enBlock] = source.slice(start, end).split('\n      : {')
  const keys = (block) => new Set([...block.matchAll(/^\s+([A-Za-z_]\w*):/gm)].map((match) => match[1]))
  const zh = keys(zhBlock)
  const en = keys(enBlock)
  assert.ok(zh.size > 20)
  assert.deepEqual([...zh].sort(), [...en].sort(), 'zh and en expose the same keys')
  const referenced = new Set([...source.matchAll(/TEXT\.([A-Za-z_]\w*)/g)].map((match) => match[1]))
  const missing = [...referenced].filter((key) => !zh.has(key))
  assert.deepEqual(missing, [], `missing localization keys: ${missing.join(', ')}`)
})

test('the client half loads and registers a settings section', async () => {
  let captured
  globalThis.window = {
    __ModuleLoader__: {
      load(entry) {
        captured = entry
      },
    },
  }
  await import('../client.js')
  assert.equal(captured.id, '@local/dsh-cross-review')

  const React = {
    createElement: () => null,
    Fragment: 'Fragment',
    useEffect() {},
    useMemo: (factory) => factory(),
    useState: (initial) => [initial, () => {}],
  }
  const module = captured.factory(() => React)
  assert.equal(typeof module.apply, 'function')
  assert.deepEqual(module.inject, ['slots'])

  const registrations = []
  const ctx = {
    get: (key) => (key === 'slots' ? { inject: (_name, fn) => fn(), register: (meta, component) => registrations.push({ meta, component }) } : undefined),
  }
  module.apply(ctx)
  assert.equal(registrations.length, 1)
  assert.equal(registrations[0].meta.name, 'settings.section')
  assert.equal(registrations[0].meta.id, 'cross-review')
  assert.equal(typeof registrations[0].component, 'function')
})
