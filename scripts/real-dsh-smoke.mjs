import { execFileSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { delimiter, dirname, join, resolve } from 'node:path'
import { DshRuntime } from '../dist/main/dsh-runtime.js'
import { seedEmbeddedProfilePlugins } from '../dist/main/embedded-plugins.js'
import { projectRoot, runtimeLayout } from './runtime-layout.mjs'

const linuxX64 = process.argv.includes('--linux-x64')
const staged = linuxX64 || process.argv.includes('--staged')
const runtimeRoot = resolve(process.env.DSH_DESKTOP_REAL_RUNTIME_ROOT ?? runtimeLayout(linuxX64).resourcesRoot)
const entry = resolve(process.env.DSH_DESKTOP_REAL_DSH_ENTRY ?? (staged
  ? join(runtimeRoot, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js')
  : join(projectRoot, '..', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')))
const nodeCommand = resolve(process.env.DSH_DESKTOP_REAL_NODE_PATH ?? (staged
  ? (process.platform === 'win32'
      ? join(runtimeRoot, 'node', 'node.exe')
      : join(runtimeRoot, 'node', 'bin', 'node'))
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
      runtimeRoot,
      launch,
    })
    if (!seeded.installed.includes('dsh-offline-plugin-installer')) {
      throw new Error('Staged runtime did not seed dsh-offline-plugin-installer into the fresh Profile.')
    }
  }
  const installer = await checkWeb(await runtime.start())
  if (staged) await checkPluginLifecycle()
  if (linuxX64) {
    await installFixture(installer)
    await runtime.stop()
    const nextSeed = await seedEmbeddedProfilePlugins({ runtimeRoot, launch })
    if (!nextSeed.skipped.includes('dsh-offline-plugin-installer')) {
      throw new Error('The restart attempted to install an already seeded package.')
    }
    await checkWeb(await runtime.start())
    if (!profileConfig().includes('desktop-offline-smoke')) {
      throw new Error('The uploaded fixture was missing from the resolved Web Profile after restart.')
    }
    console.log('real-dsh-smoke: restarted with the existing Web Profile and offline installer')
  }
} finally {
  await runtime.stop()
  await rm(fixtureRoot, { recursive: true, force: true })
}

console.log('real-dsh-smoke: shutdown complete')

async function checkWeb(url) {
  const exchange = await fetch(url, {
    redirect: 'manual',
    signal: AbortSignal.timeout(10_000),
  })
  const setCookie = exchange.headers.get('set-cookie')
  const expectedLocation = linuxX64 ? './' : '/'
  if (exchange.status !== 303 || exchange.headers.get('location') !== expectedLocation || setCookie === null) {
    throw new Error('DSH Web did not exchange its launch token for an authenticated cookie.')
  }
  const cookie = setCookie.split(';', 1)[0]
  const response = await fetch(new URL('/', url), {
    headers: { cookie },
    signal: AbortSignal.timeout(10_000),
  })
  const html = await response.text()
  if (!response.ok) throw new Error('DSH Web returned HTTP ' + String(response.status) + '.')
  const expectedTitle = staged ? '<title>DeepSeek Harness</title>' : '<title>DSH Local Build</title>'
  if (!html.includes('<div id="root"></div>') || !html.includes(expectedTitle)) {
    throw new Error('DSH Web response did not contain the official application shell.')
  }
  console.log('real-dsh-smoke: ready ' + new URL(url).origin + ', HTTP ' + String(response.status))
  if (staged) {
    const installerUrl = new URL('/dsh-offline-plugin-installer/session.json', url)
    if (linuxX64) {
      const unauthenticated = await fetch(installerUrl, { signal: AbortSignal.timeout(10_000) })
      if (unauthenticated.status !== 401 || !html.includes('dsh-offline-plugin-installer')) {
        throw new Error('The offline installer was not discovered or its route did not enforce authentication.')
      }
    }
    const installerResponse = await fetch(installerUrl, {
      headers: { cookie },
      signal: AbortSignal.timeout(10_000),
    })
    const installerSession = await installerResponse.json()
    if (!installerResponse.ok || installerSession.profile !== 'web'
      || typeof installerSession.token !== 'string' || installerSession.token.length < 32) {
      throw new Error('Embedded offline installer Host route did not return a valid session.')
    }
    console.log('real-dsh-smoke: embedded offline installer route ready')
    return { url, cookie, token: installerSession.token }
  }
}

function profileConfig() {
  return execFileSync(nodeCommand, [entry, 'web', '--dump-config'], {
    cwd: workspace, env: launch.env, encoding: 'utf8',
  })
}

async function installFixture({ url, cookie, token }) {
  const packageDir = join(fixtureRoot, 'package')
  await cp(join(projectRoot, 'tests', 'fixtures', 'native', 'offline-plugin', 'package'), packageDir, {
    recursive: true,
  })
  const packagePath = join(packageDir, 'package.json')
  const fixture = JSON.parse(await readFile(packagePath, 'utf8'))
  for (const name of Object.keys(fixture.peerDependencies)) {
    const installed = JSON.parse(await readFile(join(runtimeDshRoot, 'node_modules', name, 'package.json'), 'utf8'))
    fixture.peerDependencies[name] = installed.version
  }
  await writeFile(packagePath, JSON.stringify(fixture) + '\n')
  const archive = join(fixtureRoot, 'smoke-plugin.tgz')
  execFileSync('tar', ['--format=ustar', '-czf', archive, '-C', fixtureRoot, 'package'])
  const endpoint = new URL('/dsh-offline-plugin-installer/install.tgz', url)
  const request = {
    method: 'POST',
    headers: {
      cookie,
      'content-type': 'application/gzip',
      'x-dsh-plugin-filename': 'smoke-plugin.tgz',
      'x-dsh-installer-token': token,
    },
    body: await readFile(archive),
    signal: AbortSignal.timeout(60_000),
  }
  const denied = await fetch(endpoint, {
    ...request,
    headers: { ...request.headers, origin: 'http://cross-origin.invalid' },
  })
  if (denied.status !== 403) {
    throw new Error('The offline installer accepted a cross-origin upload request.')
  }
  const response = await fetch(endpoint, request)
  if (!response.ok || (await response.json()).restartRequired !== true) {
    throw new Error('The offline installer did not accept the fixture archive; HTTP ' + String(response.status) + '.')
  }
  console.log('real-dsh-smoke: authenticated offline fixture upload ready')
}

async function checkPluginLifecycle() {
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
  if (linuxX64 && !profileConfig().includes('dsh-offline-plugin-installer')) {
    throw new Error('Resolved Web Profile did not include the installed offline installer.')
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
