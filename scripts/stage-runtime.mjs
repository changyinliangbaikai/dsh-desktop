import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import { projectRoot, runtimeLayout } from './runtime-layout.mjs'

const linuxX64 = process.argv.includes('--linux-x64')
const { resourcesRoot, sourceRoot, provenancePath } = runtimeLayout(linuxX64)
const runtimeRoot = join(resourcesRoot, 'dsh')
const nodeRoot = join(resourcesRoot, 'node')
const sourceManifest = join(sourceRoot, 'package.json')
const sourceLock = join(sourceRoot, 'pnpm-lock.yaml')
const sourceWorkspace = join(sourceRoot, 'pnpm-workspace.yaml')
const runtimeReadmePath = join(resourcesRoot, 'README.md')

function pluginArchives(value, field, qualifier) {
  if (!Array.isArray(value)) throw new Error('Runtime manifest ' + field + ' must be an array.')
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object'
      || typeof entry.name !== 'string'
      || typeof entry.version !== 'string'
      || typeof entry.archive !== 'string'
      || basename(entry.archive) !== entry.archive
      || !entry.archive.endsWith('.tgz')
      || typeof entry.integrity !== 'string'
      || !entry.integrity.startsWith('sha512-')
      || typeof entry[qualifier] !== 'string') {
      throw new Error('Runtime manifest ' + field + '[' + String(index) + '] is invalid.')
    }
    return entry
  })
}

async function sha512(path) {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return 'sha512-' + hash.digest('base64')
}

function resolveArchiveSource(filename) {
  const explicit = process.env.DSH_DESKTOP_PLUGIN_ARCHIVE_DIR
  const directories = [
    ...(explicit === undefined || explicit.trim() === '' ? [] : [resolve(explicit)]),
    join(projectRoot, 'packaging', 'plugins'),
    join(projectRoot, '..', '.artifacts', 'packages'),
  ]
  const source = directories.map(directory => join(directory, filename)).find(path => existsSync(path))
  if (source === undefined) {
    throw new Error('Reviewed embedded plugin archive ' + filename + ' was not found. '
      + 'Set DSH_DESKTOP_PLUGIN_ARCHIVE_DIR or place it under the integration .artifacts/packages directory.')
  }
  return source
}

if (linuxX64 && (process.platform !== 'linux' || process.arch !== 'x64')) {
  throw new Error('Linux runtime staging requires a Linux x64 Node process.')
}
if (!existsSync(sourceLock)) {
  throw new Error('Runtime lock missing at ' + sourceLock + '; generate and review it before staging.')
}

const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
const plugins = pluginArchives(provenance.embeddedPlugins, 'embeddedPlugins', 'profile')
// An upgraded Profile can still reference the previously seeded file: dependency.
const retainedArchives = pluginArchives(provenance.retainedPluginArchives ?? [], 'retainedPluginArchives', 'tag')
const archives = [...plugins, ...retainedArchives]
if (new Set(archives.map(plugin => plugin.archive)).size !== archives.length) {
  throw new Error('Runtime manifest contains duplicate plugin archive names.')
}
const pluginSources = []
for (const plugin of archives) {
  const source = resolveArchiveSource(plugin.archive)
  const actualIntegrity = await sha512(source)
  if (actualIntegrity !== plugin.integrity) {
    throw new Error('Embedded plugin archive ' + plugin.archive + ' failed reviewed integrity verification.')
  }
  pluginSources.push({ plugin, source })
}
const runtimeReadme = linuxX64 ? undefined : await readFile(runtimeReadmePath, 'utf8')
const lockText = await readFile(sourceLock, 'utf8')
if (!lockText.includes(provenance.deepSeekHarness.npmIntegrity)) {
  throw new Error('Runtime lock does not contain the reviewed DSH npm integrity.')
}
if (process.version !== 'v' + provenance.node) {
  throw new Error('Runtime staging requires Node v' + provenance.node + ', found ' + process.version + '.')
}

const pnpmEntry = process.env.npm_execpath
if (pnpmEntry === undefined || !existsSync(pnpmEntry)) {
  throw new Error('stage-runtime must run through pnpm so its pinned executable is available.')
}
if (linuxX64) {
  const pnpmVersion = execFileSync(process.execPath, [pnpmEntry, '--version'], { encoding: 'utf8' }).trim()
  if (pnpmVersion !== provenance.pnpm) {
    throw new Error('Linux runtime staging requires pnpm ' + provenance.pnpm + ', found ' + pnpmVersion + '.')
  }
}

await rm(resourcesRoot, { recursive: true, force: true })
await mkdir(runtimeRoot, { recursive: true })
if (runtimeReadme !== undefined) await writeFile(runtimeReadmePath, runtimeReadme)
await copyFile(sourceManifest, join(runtimeRoot, 'package.json'))
await copyFile(sourceLock, join(runtimeRoot, 'pnpm-lock.yaml'))
await copyFile(sourceWorkspace, join(runtimeRoot, 'pnpm-workspace.yaml'))

execFileSync(process.execPath, [
  pnpmEntry,
  'install',
  '--prod',
  '--frozen-lockfile',
  '--config.node-linker=hoisted',
  '--config.link-workspace-packages=false',
], {
  cwd: runtimeRoot,
  env: process.env,
  stdio: 'inherit',
})
if (linuxX64) {
  execFileSync(process.execPath, [pnpmEntry, 'peers', 'check'], { cwd: runtimeRoot, stdio: 'inherit' })
}

const nodeDestination = process.platform === 'win32'
  ? join(nodeRoot, 'node.exe')
  : join(nodeRoot, 'bin', 'node')
await mkdir(dirname(nodeDestination), { recursive: true })
await copyFile(process.execPath, nodeDestination)
if (process.platform !== 'win32') await chmod(nodeDestination, 0o755)

const entry = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
const installedManifestPath = join(runtimeRoot, 'node_modules', '@deepseek-ai', 'dsh', 'package.json')
const installedManifest = JSON.parse(await readFile(installedManifestPath, 'utf8'))
if (installedManifest.version !== provenance.deepSeekHarness.version) {
  throw new Error('Staged DSH version ' + installedManifest.version
    + ' does not match pinned ' + provenance.deepSeekHarness.version + '.')
}

const stagedVersion = execFileSync(nodeDestination, [entry, '--version'], {
  cwd: projectRoot,
  env: {
    ...process.env,
    DSH_HOME: join(resourcesRoot, '.verification-home'),
  },
  encoding: 'utf8',
}).trim()
if (stagedVersion !== provenance.deepSeekHarness.version) {
  throw new Error('Staged DSH executable reported ' + stagedVersion + '.')
}
await rm(join(resourcesRoot, '.verification-home'), { recursive: true, force: true })

if (pluginSources.length > 0) {
  const pluginsDestination = join(resourcesRoot, 'plugins')
  await mkdir(pluginsDestination, { recursive: true })
  for (const { plugin, source } of pluginSources) {
    await copyFile(source, join(pluginsDestination, plugin.archive))
  }
}
await cp(provenancePath, join(resourcesRoot, basename(provenancePath)))
await writeFile(join(resourcesRoot, 'STAGED'), [
  'Harness Desktop embedded runtime',
  'DSH ' + provenance.deepSeekHarness.version,
  'Node ' + provenance.node,
  'pnpm ' + provenance.pnpm,
  ...plugins.map(plugin => 'Plugin ' + plugin.name + ' ' + plugin.version + ' -> Profile ' + plugin.profile),
  ...retainedArchives.map(plugin => 'Retained archive ' + plugin.archive),
  '',
].join('\n'))

console.log('stage-runtime: DSH ' + stagedVersion + ' with Node ' + process.version
  + ', ' + String(plugins.length) + ' embedded plugin archive(s), and '
  + String(retainedArchives.length) + ' retained archive(s) staged at ' + resourcesRoot)
