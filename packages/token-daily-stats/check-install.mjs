// Static health check for the @local/token-daily-stats profile install.
//
// Run this after a DSH app update (or any time the settings page loses the
// "Token 用量统计" section). It verifies every link in the chain that has to
// hold for the plugin to load, and names the repair for each broken link. It
// touches nothing — read-only.
//
// Usage:
//   node check-install.mjs [--profile desktop] [--home C:\Users\x\.dsh]
import { readFileSync, realpathSync, existsSync, statSync, lstatSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_NAME = '@local/token-daily-stats'
const pluginDir = dirname(fileURLToPath(import.meta.url))

const argv = process.argv.slice(2)
const flag = (name, fallback) => {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : fallback
}
const home = flag('home', process.env.DSH_HOME ?? join(homedir(), '.dsh'))
const profileName = flag('profile', 'desktop')
const profileDir = join(home, 'profiles', profileName)

let failures = 0
const ok = (msg) => console.log(`  ok   ${msg}`)
const bad = (msg, repair) => {
  failures += 1
  console.error(`  FAIL ${msg}`)
  if (repair) console.error(`       -> ${repair}`)
}
const warn = (msg) => console.log(`  warn ${msg}`)
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'))

console.log(`plugin  : ${pluginDir}`)
console.log(`dsh home: ${home}`)
console.log(`profile : ${profileName}  (${profileDir})\n`)

// --- 1. Source files ---------------------------------------------------------
console.log('1. plugin source')
for (const file of ['index.js', 'client.js', 'package.json', 'cordis.patch.yml']) {
  if (existsSync(join(pluginDir, file))) ok(file)
  else bad(`${file} is missing`, 'the plugin source tree is incomplete — restore it from version control')
}

// --- 2. Manifest is valid for this DSH generation ---------------------------
console.log('\n2. package.json manifest')
let manifest
try {
  manifest = readJson(join(pluginDir, 'package.json'))
  ok(`name ${manifest.name}`)
  if (manifest.name !== PLUGIN_NAME) bad(`expected name ${PLUGIN_NAME}`)
  if (manifest.type === 'module') ok('type: module')
  else bad('package.json must set "type": "module"')
} catch (error) {
  bad(`package.json is unreadable: ${error.message}`)
}

if (manifest) {
  // dsh.bundle.patch — string or array of paths, resolved inside the package.
  const patch = manifest.dsh?.bundle?.patch
  const patches = patch === undefined ? [] : Array.isArray(patch) ? patch : [patch]
  if (patches.length === 0) {
    bad('dsh.bundle.patch is absent', 'the bundle cannot insert any loader entry without it')
  }
  for (const p of patches) {
    const abs = resolve(pluginDir, p)
    if (existsSync(abs)) ok(`dsh.bundle.patch -> ${p}`)
    else bad(`dsh.bundle.patch -> ${p} does not exist`)
  }
  // The patch must actually insert THIS package.
  const patchFile = join(pluginDir, 'cordis.patch.yml')
  if (existsSync(patchFile)) {
    const text = readFileSync(patchFile, 'utf8')
    if (text.includes(PLUGIN_NAME)) ok(`cordis.patch.yml inserts ${PLUGIN_NAME}`)
    else bad('cordis.patch.yml does not mention the package name')
  }

  // dsh.client declarations accepted by 0.2.x are exactly platform/external/immediately.
  const client = manifest.dsh?.client
  if (client === undefined) {
    warn('no dsh.client declaration — the browser half will not be served')
  } else {
    const allowed = new Set(['platform', 'external', 'immediately'])
    const unknown = Object.keys(client).filter((k) => !allowed.has(k))
    if (unknown.length === 0) ok(`dsh.client keys are all recognised (${Object.keys(client).join(', ')})`)
    else bad(`dsh.client has unrecognised keys: ${unknown.join(', ')}`, 'DSH ignores them silently; remove them')
    if (client.platform === 'web') ok('dsh.client.platform = web')
    else bad(`dsh.client.platform must be "web", got ${JSON.stringify(client.platform)}`)
    if (existsSync(join(pluginDir, 'client.js'))) ok('./client bundle exists')
  }
  // A 'react'-only client needs no `external`; anything else would be a
  // non-baseline request that the composition would reject.
  const external = manifest.dsh?.client?.external
  if (external !== undefined && external.length > 0) {
    warn(`dsh.client.external = ${JSON.stringify(external)} — each entry must be answerable by a package row`)
  }
}

// --- 3. Profile wiring -------------------------------------------------------
console.log('\n3. profile wiring')
let profilePkg
try {
  profilePkg = readJson(join(profileDir, 'package.json'))
  ok(`profile package.json (${profilePkg.name})`)
} catch (error) {
  bad(`cannot read ${join(profileDir, 'package.json')}: ${error.message}`, `does the "${profileName}" profile exist?`)
}

const expectedLink = `link:${pluginDir.replace(/\\/g, '/')}`
if (profilePkg) {
  const dep = profilePkg.dependencies?.[PLUGIN_NAME]
  if (dep === undefined) {
    bad(`dependencies["${PLUGIN_NAME}"] is absent`, `reinstall: plugin_manager install_bundle ${pluginDir}`)
  } else if (dep.startsWith('link:')) {
    ok(`dependency is a link: ${dep}`)
    if (dep === expectedLink) ok('the link points at this plugin directory')
    else warn(`the link points elsewhere: ${dep}`)
  } else {
    warn(`dependency is not a link (${dep}) — edits here will not reach the install`)
  }
  const bundles = profilePkg.dsh?.profile?.bundles ?? []
  if (bundles.includes(PLUGIN_NAME)) ok('listed in dsh.profile.bundles')
  else bad(`not listed in dsh.profile.bundles`, `reinstall: plugin_manager install_bundle ${pluginDir}`)
}

// --- 4. The junction actually resolves --------------------------------------
console.log('\n4. installed copy')
const linkPath = join(profileDir, 'node_modules', PLUGIN_NAME)
if (!existsSync(linkPath)) {
  bad(`${linkPath} does not exist`, `run pnpm install in ${profileDir}, or reinstall via plugin_manager`)
} else {
  let real
  try {
    real = realpathSync(linkPath)
  } catch (error) {
    bad(`cannot resolve ${linkPath}: ${error.message}`)
  }
  if (real !== undefined) {
    if (resolve(real) === resolve(pluginDir)) ok(`resolves to this directory (${real})`)
    else warn(`resolves to a DIFFERENT directory: ${real}`)
    // The installed copy must expose the same manifest the loader will read.
    try {
      const installed = readJson(join(real, 'package.json'))
      if (installed.version === manifest?.version) ok(`installed version ${installed.version}`)
      else bad(`installed version ${installed.version} != source ${manifest?.version}`)
    } catch (error) {
      bad(`installed package.json is unreadable: ${error.message}`)
    }
  }
  const st = lstatSync(linkPath)
  if (st.isSymbolicLink()) ok('installed as a symlink/junction')
  else warn('installed as a real directory — the workspace is no longer the single source of truth')
}

// --- 5. Live activation ------------------------------------------------------
console.log('\n5. live activation')
console.log('  info the running Host composed its tree at boot, so this check cannot')
console.log('       see the plugin until DSH is restarted. Confirm after a restart with:')
console.log('         - cordis_inspect_query client/Slots listSubTree root=settings.section')
console.log('           -> expect an occupant with id "token-usage"')
console.log('         - GET /api/token-daily-stats -> 200 JSON')

console.log(failures === 0 ? '\nWIRING OK' : `\n${failures} PROBLEM(S) FOUND`)
process.exit(failures === 0 ? 0 : 1)
