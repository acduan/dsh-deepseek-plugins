// Validates the composition declared in `cordis.patch.yml` without activating it.
//
// Two failures this catches, both of which only appear at activation time:
//
//   1. A `!!js` expression that throws. The Loader evaluates it while activating
//      the child plugin, so a bad expression takes down the whole preset, not
//      just that row. The shipped `standard` preset's `customSkillDirs`
//      expression resolves relative to the declaring patch file; copying it into
//      a bundle outside the installation makes it throw, which is exactly the
//      regression this file now guards.
//   2. A row whose package name or subpath does not exist in the installation.

import assert from 'node:assert/strict'
import fs from 'node:fs'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const packageRoot = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
const patchPath = path.join(packageRoot, '..', 'cordis.patch.yml')

const require = createRequire(import.meta.url)

/** Load js-yaml from the profile when available, else skip the YAML assertions. */
function loadYaml() {
  const candidates = [
    path.join(process.env.DSH_PROFILE_DIR ?? '', 'node_modules', 'js-yaml'),
    path.join(os.homedir(), '.dsh', 'profiles', 'desktop', 'node_modules', 'js-yaml'),
    'js-yaml',
  ]
  for (const candidate of candidates) {
    try {
      return require(candidate)
    } catch {
      // Try the next candidate.
    }
  }
  return undefined
}

const yaml = loadYaml()

function loaderContext(installAnchor) {
  return { get: (name) => name === 'profileContext' ? { installAnchor } : undefined }
}

/**
 * True when the installation lives inside an `app.asar` that this runtime cannot
 * read. Plain `node` cannot traverse ASAR archives; the DSH process (and
 * `ELECTRON_RUN_AS_NODE=1` with the Electron executable) can. Installation-relative
 * expressions are therefore only checkable under the latter, and that is an
 * environment limitation, not a plugin defect.
 */
function anchorIsOpaque() {
  const anchor = process.env.DSH_INSTALL_DIR
  if (typeof anchor !== 'string' || anchor === '') return true
  if (!anchor.toLowerCase().includes('.asar')) return false
  return !fs.existsSync(path.join(anchor, 'package.json'))
}

/** Parse the patch with `!!js` scalars kept as inert markers, as the Loader does. */
function parsePatch() {
  const text = fs.readFileSync(patchPath, 'utf8')
  const JsExpr = new yaml.Type('tag:yaml.org,2002:js', {
    kind: 'scalar',
    resolve: (data) => typeof data === 'string' && data.length > 0,
    construct: (data) => ({ __jsExpr: data }),
  })
  return yaml.load(text, { schema: yaml.DEFAULT_SCHEMA.extend([JsExpr]) })
}

test('the patch parses and declares the expected rows', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  const doc = parsePatch()
  const ids = doc[0].insert.map((row) => row.id)
  assert.deepEqual(ids, ['cross-review', 'preset-cross-review', 'preset-cross-review-internal'])
})

test('the internal preset keeps its read-only guard as the last row', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  const internal = parsePatch()[0].insert.find((row) => row.id === 'preset-cross-review-internal')
  const ids = internal.config.plugins.map((plugin) => plugin.id)
  assert.equal(ids.at(-1), 'internal-guard', 'the guard must load after the tools it protects')
  assert.ok(!ids.includes('sandbox-policy'), 'a preset-level sandboxPolicy row cannot confine the shell')
  // The file tools stay closed regardless of the guard.
  const fsRow = internal.config.plugins.find((plugin) => plugin.id === 'tool-fs')
  assert.equal(fsRow.config.write, false)
  assert.equal(fsRow.config.edit, false)
  assert.equal(fsRow.config.applyPatch, false)
})

test('every !!js expression evaluates against the published environment', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  if (anchorIsOpaque()) {
    t.skip('DSH_INSTALL_DIR is unset or inside an app.asar this runtime cannot read (run with ELECTRON_RUN_AS_NODE=1)')
    return
  }
  const doc = parsePatch()
  const expressions = []
  const collect = (rows) => {
    for (const row of rows) {
      if (row.config && typeof row.config === 'object' && !Array.isArray(row.config)) {
        for (const value of Object.values(row.config)) {
          if (Array.isArray(value)) {
            for (const item of value) if (item && typeof item === 'object' && item.__jsExpr) expressions.push(item.__jsExpr)
          }
        }
      }
      if (Array.isArray(row.config)) collect(row.config)
      if (row.config && Array.isArray(row.config.plugins)) collect(row.config.plugins)
    }
  }
  collect(doc[0].insert)
  assert.ok(expressions.length > 0, 'the patch is expected to use at least one loader expression')

  for (const expression of expressions) {
    let result
    assert.doesNotThrow(() => {
      // The Loader evaluates these with `process` in scope; `baseUrl` is bound to
      // the declaring patch file, which is why a copied expression breaks.
      result = new Function('process', 'baseUrl', 'ctx', `return (${expression})`)(
        process,
        pathToFileURL(patchPath).href,
        loaderContext(path.join(process.env.DSH_INSTALL_DIR, 'package.json')),
      )
    }, `expression must not throw: ${expression}`)
    assert.equal(typeof result, 'string', `expression must yield a path: ${expression}`)
    assert.ok(fs.existsSync(result), `resolved path must exist: ${result} (from ${expression})`)
  }
})

test('the skills directory expression resolves to the bundled skills', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  if (anchorIsOpaque()) {
    t.skip('DSH_INSTALL_DIR is unset or inside an app.asar this runtime cannot read (run with ELECTRON_RUN_AS_NODE=1)')
    return
  }
  const preset = parsePatch()[0].insert.find((row) => row.id === 'preset-cross-review')
  const row = preset.config.plugins.find((plugin) => plugin.id === 'skill-filesystem')
  const expression = row.config.customSkillDirs[0].__jsExpr
  const resolved = new Function('process', 'ctx', `return (${expression})`)(
    process, loaderContext(path.join(process.env.DSH_INSTALL_DIR, 'package.json')),
  )
  assert.ok(fs.existsSync(resolved), `skills dir must exist: ${resolved}`)
  const entries = fs.readdirSync(resolved)
  assert.ok(entries.includes('dsh-doc'), `the bundled dsh-doc skill must be discoverable, saw: ${entries.join(', ')}`)
})

test('Desktop resolves bundled skills without DSH_INSTALL_DIR', () => {
  assert.ok(yaml, 'js-yaml must be available for the Desktop activation regression test')
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dsh-cross-review-skills-'))
  try {
    const installAnchor = path.join(root, 'package.json')
    const packageDir = path.join(root, 'node_modules', '@deepseek-ai', 'dsh-agent-preset')
    const skillsDir = path.join(packageDir, 'skills')
    fs.mkdirSync(path.join(skillsDir, 'dsh-doc'), { recursive: true })
    fs.writeFileSync(installAnchor, '{}')
    fs.writeFileSync(path.join(packageDir, 'package.json'), '{}')
    const preset = parsePatch()[0].insert.find((row) => row.id === 'preset-cross-review')
    const expression = preset.config.plugins.find((row) => row.id === 'skill-filesystem')
      .config.customSkillDirs[0].__jsExpr
    // Desktop supplies the anchor through Cordis, not through process.env.
    const desktopProcess = { env: {}, getBuiltinModule: process.getBuiltinModule }
    const evaluate = new Function('process', 'ctx', `return (${expression})`)
    const resolved = evaluate(desktopProcess, loaderContext(installAnchor))
    assert.equal(path.normalize(resolved), path.normalize(skillsDir))
    assert.ok(fs.readdirSync(resolved).includes('dsh-doc'))
    const staleEnvironment = { ...desktopProcess, env: { DSH_INSTALL_DIR: path.join(root, 'old-install') } }
    assert.equal(evaluate(staleEnvironment, loaderContext(installAnchor)), resolved)
  } finally {
    assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()))
    assert.ok(path.basename(root).startsWith('dsh-cross-review-skills-'))
    fs.rmSync(root, { recursive: true, force: true })
  }
})

test('the preset mirrors the shipped standard capabilities', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  const preset = parsePatch()[0].insert.find((row) => row.id === 'preset-cross-review')
  const ids = preset.config.plugins.map((plugin) => plugin.id)
  // A dropped row here is a capability silently missing from this mode only.
  for (const required of [
    'tool-jobs',
    'tool-schedule',
    'command-goal',
    'tool-goal',
    'skill-filesystem',
    'tool-skill',
    'delegation',
    'tool-ask-user',
    'tool-todo',
    'tool-web',
    'present',
    'tool-office',
    'tool-plugin-manager',
    'cross-review-preset',
  ]) {
    assert.ok(ids.includes(required), `the preset must keep the "${required}" row`)
  }
  const delegation = preset.config.plugins.find((plugin) => plugin.id === 'delegation')
  const delegationIds = delegation.config.map((plugin) => plugin.id)
  assert.ok(delegationIds.includes('workflow-ptc'), 'workflow orchestration must stay available')
  assert.ok(delegationIds.includes('tool-workflow'))
  const control = delegation.config.find((plugin) => plugin.id === 'tool-subagent-control')
  assert.equal(control.config.interrupt, false)
})

test('the audit result is not truncated by an 8 KB pruner (raise the cap)', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  const preset = parsePatch()[0].insert.find((row) => row.id === 'preset-cross-review')
  const compaction = preset.config.plugins.find((plugin) => plugin.id === 'compaction')
  const pruner = compaction.config.find((plugin) => plugin.id === 'tool-result-pruner')
  // A ~17-criterion audit serialises well past 8 KB; the shipped 8192 default cut
  // the JSON mid-string and the caller could not parse the ruling. Keep it large
  // enough for one whole audit result in the head slice.
  assert.ok(pruner.config.thresholdChars >= 16384, 'thresholdChars must be raised above 8 KB')
  assert.ok(pruner.config.headChars >= 16384, 'headChars must hold a whole audit result')
})

test('the internal arbiter persona carries the read-only forensics guidance', (t) => {
  if (yaml === undefined) {
    t.skip('js-yaml not resolvable from this profile')
    return
  }
  const internal = parsePatch()[0].insert.find((row) => row.id === 'preset-cross-review-internal')
  const persona = internal.config.plugins.find((plugin) => plugin.id === 'persona')
  const prefix = persona.config.prefix
  assert.match(prefix, /ConstrainedLanguage/)
  assert.match(prefix, /不代表被检查的对象异常/)
  assert.match(prefix, /netstat -ano/)
})
