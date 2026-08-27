import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { DshRuntime } from '../dist/main/dsh-runtime.js'
import { seedEmbeddedProfilePlugins } from '../dist/main/embedded-plugins.js'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const staged = process.argv.includes('--staged')
const entry = resolve(process.env.DSH_DESKTOP_REAL_DSH_ENTRY ?? (staged
  ? join(projectRoot, 'resources', 'runtime', 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  : join(projectRoot, '..', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')))
const nodeCommand = resolve(process.env.DSH_DESKTOP_REAL_NODE_PATH ?? (staged
  ? (process.platform === 'win32'
      ? join(projectRoot, 'resources', 'runtime', 'node', 'node.exe')
      : join(projectRoot, 'resources', 'runtime', 'node', 'bin', 'node'))
  : process.execPath))

if (!existsSync(entry)) {
  throw new Error('Built official DSH entry not found at ' + entry + '. Run the upstream build first.')
}

const fixtureRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-real-'))
const dshHome = join(fixtureRoot, 'home')
const workspace = join(fixtureRoot, 'workspace')
await mkdir(workspace, { recursive: true })
const runtimeDshRoot = resolve(dirname(entry), '..', '..', '..', '..')
const pathKey = Object.keys(process.env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
const managedPath = staged
  ? [dirname(nodeCommand), join(runtimeDshRoot, 'node_modules', '.bin'), process.env[pathKey]]
    .filter(Boolean)
    .join(delimiter)
  : process.env[pathKey]

const launch = {
  command: nodeCommand,
  args: [entry, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'],
  cwd: workspace,
  env: {
    ...process.env,
    DSH_HOME: dshHome,
    DSH_TELEMETRY_DISABLED: '1',
    npm_config_cache: join(fixtureRoot, 'npm-cache'),
    PNPM_HOME: join(fixtureRoot, 'pnpm-home'),
    XDG_CACHE_HOME: join(fixtureRoot, 'xdg-cache'),
    XDG_DATA_HOME: join(fixtureRoot, 'xdg-data'),
    [pathKey]: managedPath,
  },
}
const runtime = new DshRuntime({
  launch,
  startupTimeoutMs: 90_000,
  shutdownTimeoutMs: 7_000,
})

try {
  if (staged) {
    const seeded = await seedEmbeddedProfilePlugins({
      runtimeRoot: join(projectRoot, 'resources', 'runtime'),
      launch,
    })
    if (!seeded.installed.includes('dsh-offline-plugin-installer')) {
      throw new Error('Staged runtime did not seed dsh-offline-plugin-installer into the fresh Profile.')
    }
  }
  const url = await runtime.start()
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  const html = await response.text()
  if (!response.ok) throw new Error('DSH Web returned HTTP ' + String(response.status) + '.')
  const expectedTitle = staged ? '<title>DeepSeek Harness</title>' : '<title>DSH Local Build</title>'
  if (!html.includes('<div id="root"></div>') || !html.includes(expectedTitle)) {
    throw new Error('DSH Web response did not contain the official application shell.')
  }
  console.log('real-dsh-smoke: ready ' + url + ', HTTP ' + String(response.status))
  if (staged) {
    const installerResponse = await fetch(new URL('/dsh-offline-plugin-installer/session.json', url), {
      signal: AbortSignal.timeout(10_000),
    })
    const installerSession = await installerResponse.json()
    if (!installerResponse.ok || installerSession.profile !== 'web'
      || typeof installerSession.token !== 'string' || installerSession.token.length < 32) {
      throw new Error('Embedded offline installer Host route did not return a valid session.')
    }
    console.log('real-dsh-smoke: embedded offline installer route ready')
    const pluginEnvironment = {
      ...launch.env,
      npm_config_offline: 'true',
      PNPM_CONFIG_OFFLINE: 'true',
    }
    const pluginOutput = execFileSync(
      nodeCommand,
      [entry, 'plugin', '--profile', 'web', '--version'],
      { cwd: workspace, env: pluginEnvironment, encoding: 'utf8' },
    )
    if (!pluginOutput.split(/\r?\n/u).includes('11.7.0')) {
      throw new Error('Embedded plugin manager did not report pnpm 11.7.0.')
    }
    const pluginName = 'dsh-desktop-smoke-plugin'
    const pluginDir = join(fixtureRoot, 'plugin')
    await mkdir(pluginDir)
    await writeFile(join(pluginDir, 'package.json'), JSON.stringify({
      name: pluginName,
      version: '1.0.0',
      private: true,
      dsh: { bundle: { patch: './cordis.patch.yml' } },
    }, null, 2) + '\n')
    await writeFile(join(pluginDir, 'cordis.patch.yml'), '[]\n')
    execFileSync(
      nodeCommand,
      [entry, 'plugin', '--profile', 'web', 'add', pluginDir],
      { cwd: workspace, env: pluginEnvironment, stdio: 'pipe' },
    )
    const profileManifestPath = join(dshHome, 'profiles', 'web', 'package.json')
    const installedProfile = JSON.parse(await readFile(profileManifestPath, 'utf8'))
    if (installedProfile.dependencies?.[pluginName] === undefined
      || !installedProfile.dsh?.profile?.bundles?.includes(pluginName)) {
      throw new Error('Official plugin add did not activate the local smoke bundle.')
    }
    execFileSync(
      nodeCommand,
      [entry, 'plugin', '--profile', 'web', 'remove', pluginName],
      { cwd: workspace, env: pluginEnvironment, stdio: 'pipe' },
    )
    const removedProfile = JSON.parse(await readFile(profileManifestPath, 'utf8'))
    if (removedProfile.dependencies?.[pluginName] !== undefined
      || removedProfile.dsh?.profile?.bundles?.includes(pluginName)) {
      throw new Error('Official plugin remove did not reconcile the local smoke bundle.')
    }
    console.log('real-dsh-smoke: embedded pnpm plugin add/remove ready')
  }
} finally {
  await runtime.stop()
  await rm(fixtureRoot, { recursive: true, force: true })
}

console.log('real-dsh-smoke: shutdown complete')
