import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { chmod, copyFile, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { basename, dirname, join, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const resourcesRoot = join(projectRoot, 'resources', 'runtime')
const runtimeRoot = join(resourcesRoot, 'dsh')
const nodeRoot = join(resourcesRoot, 'node')
const sourceManifest = join(projectRoot, 'packaging', 'runtime', 'package.json')
const sourceLock = join(projectRoot, 'packaging', 'runtime', 'pnpm-lock.yaml')
const sourceWorkspace = join(projectRoot, 'packaging', 'runtime', 'pnpm-workspace.yaml')
const provenancePath = join(projectRoot, 'packaging', 'runtime-manifest.json')
const runtimeReadmePath = join(resourcesRoot, 'README.md')

function embeddedPlugins(value) {
  if (!Array.isArray(value)) throw new Error('Runtime manifest embeddedPlugins must be an array.')
  return value.map((entry, index) => {
    if (entry === null || typeof entry !== 'object'
      || typeof entry.name !== 'string'
      || typeof entry.version !== 'string'
      || typeof entry.archive !== 'string'
      || basename(entry.archive) !== entry.archive
      || !entry.archive.endsWith('.tgz')
      || typeof entry.integrity !== 'string'
      || !entry.integrity.startsWith('sha512-')
      || typeof entry.profile !== 'string') {
      throw new Error('Runtime manifest embedded plugin ' + String(index) + ' is invalid.')
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

function assertSafeTarget(target) {
  if (!target.startsWith(projectRoot + sep) || target === projectRoot) {
    throw new Error('Refusing to replace unsafe runtime target ' + target + '.')
  }
}

assertSafeTarget(resourcesRoot)
if (!existsSync(sourceLock)) {
  throw new Error('Runtime lock missing at ' + sourceLock + '; generate and review it before staging.')
}

const provenance = JSON.parse(readFileSync(provenancePath, 'utf8'))
const plugins = embeddedPlugins(provenance.embeddedPlugins)
const pluginSources = []
for (const plugin of plugins) {
  const source = resolveArchiveSource(plugin.archive)
  const actualIntegrity = await sha512(source)
  if (actualIntegrity !== plugin.integrity) {
    throw new Error('Embedded plugin archive ' + plugin.archive + ' failed reviewed integrity verification.')
  }
  pluginSources.push({ plugin, source })
}
const runtimeReadme = await readFile(runtimeReadmePath, 'utf8')
const lockText = await readFile(sourceLock, 'utf8')
if (!lockText.includes(provenance.deepSeekHarness.npmIntegrity)) {
  throw new Error('Runtime lock does not contain the reviewed DSH npm integrity.')
}
if (process.version !== 'v' + provenance.node) {
  throw new Error('Runtime staging requires Node v' + provenance.node + ', found ' + process.version + '.')
}

await rm(resourcesRoot, { recursive: true, force: true })
await mkdir(runtimeRoot, { recursive: true })
await writeFile(runtimeReadmePath, runtimeReadme)
await copyFile(sourceManifest, join(runtimeRoot, 'package.json'))
await copyFile(sourceLock, join(runtimeRoot, 'pnpm-lock.yaml'))
await copyFile(sourceWorkspace, join(runtimeRoot, 'pnpm-workspace.yaml'))

const pnpmEntry = process.env.npm_execpath
if (pnpmEntry === undefined || !existsSync(pnpmEntry)) {
  throw new Error('stage-runtime must run through pnpm so its pinned executable is available.')
}
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
  '',
].join('\n'))

console.log('stage-runtime: DSH ' + stagedVersion + ' with Node ' + process.version
  + ' and ' + String(plugins.length) + ' embedded plugin archive(s) staged at ' + resourcesRoot)
