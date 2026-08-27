import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { basename, isAbsolute, join, relative, resolve } from 'node:path'
import type { DshLaunchSpec } from './runtime-config.js'
import { signalProcessTree } from './process-tree.js'

interface EmbeddedPluginRecord {
  readonly name: string
  readonly version: string
  readonly archive: string
  readonly integrity: string
  readonly profile: string
}

interface RuntimeManifest {
  readonly schemaVersion: 1
  readonly embeddedPlugins: readonly EmbeddedPluginRecord[]
}

export interface EmbeddedPluginSeedResult {
  readonly installed: readonly string[]
  readonly skipped: readonly string[]
}

export interface EmbeddedPluginSeedOptions {
  readonly runtimeRoot: string
  readonly launch: DshLaunchSpec
  readonly timeoutMs?: number
  readonly runAdd?: (plugin: EmbeddedPluginRecord, archivePath: string) => Promise<void>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function exactVersion(value: string): boolean {
  return /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)
}

function parseRuntimeManifest(path: string): RuntimeManifest {
  const value = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!isRecord(value) || value.schemaVersion !== 1 || !Array.isArray(value.embeddedPlugins)) {
    throw new Error('Desktop runtime manifest has invalid embeddedPlugins metadata.')
  }
  const embeddedPlugins = value.embeddedPlugins.map((entry, index): EmbeddedPluginRecord => {
    if (!isRecord(entry)
      || typeof entry.name !== 'string'
      || !/^(?:[a-z0-9][a-z0-9._-]*|@[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._-]*)$/u.test(entry.name)
      || typeof entry.version !== 'string'
      || !exactVersion(entry.version)
      || typeof entry.archive !== 'string'
      || basename(entry.archive) !== entry.archive
      || !entry.archive.endsWith('.tgz')
      || typeof entry.integrity !== 'string'
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/u.test(entry.integrity)
      || typeof entry.profile !== 'string'
      || entry.profile.length === 0
      || entry.profile === '.'
      || entry.profile === '..'
      || entry.profile === 'node_modules'
      || entry.profile.includes('/')
      || entry.profile.includes('\\')) {
      throw new Error(`Desktop runtime manifest embedded plugin ${String(index)} is invalid.`)
    }
    return {
      name: entry.name,
      version: entry.version,
      archive: entry.archive,
      integrity: entry.integrity,
      profile: entry.profile,
    }
  })
  const identities = new Set<string>()
  for (const plugin of embeddedPlugins) {
    const identity = `${plugin.profile}\0${plugin.name}`
    if (identities.has(identity)) throw new Error(`Duplicate embedded plugin ${plugin.name} for ${plugin.profile}.`)
    identities.add(identity)
  }
  return { schemaVersion: 1, embeddedPlugins }
}

async function sha512(path: string): Promise<string> {
  const hash = createHash('sha512')
  for await (const chunk of createReadStream(path)) hash.update(chunk)
  return `sha512-${hash.digest('base64')}`
}

function profileDirectory(launch: DshLaunchSpec, profile: string): string {
  const home = launch.env.DSH_HOME
  if (home === undefined || home.length === 0) throw new Error('Desktop DSH_HOME is missing.')
  return join(home, 'profiles', profile)
}

function packageManifestPath(profileDir: string, packageName: string): string {
  return join(profileDir, 'node_modules', ...packageName.split('/'), 'package.json')
}

function dependencyArchivePath(profileDir: string, value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const raw = value.startsWith('file:') ? value.slice('file:'.length) : value
  if (!raw.endsWith('.tgz')) return undefined
  try {
    const decoded = decodeURIComponent(raw)
    return isAbsolute(decoded) ? resolve(decoded) : resolve(profileDir, decoded)
  } catch {
    return undefined
  }
}

function isCurrent(plugin: EmbeddedPluginRecord, archivePath: string, launch: DshLaunchSpec): boolean {
  const profileDir = profileDirectory(launch, plugin.profile)
  const profileManifestPath = join(profileDir, 'package.json')
  const installedManifestPath = packageManifestPath(profileDir, plugin.name)
  if (!existsSync(profileManifestPath) || !existsSync(installedManifestPath)) return false
  try {
    const profileManifest = JSON.parse(readFileSync(profileManifestPath, 'utf8')) as unknown
    const installedManifest = JSON.parse(readFileSync(installedManifestPath, 'utf8')) as unknown
    if (!isRecord(profileManifest) || !isRecord(profileManifest.dependencies)
      || !isRecord(profileManifest.dsh) || !isRecord(profileManifest.dsh.profile)
      || !Array.isArray(profileManifest.dsh.profile.bundles)
      || !profileManifest.dsh.profile.bundles.includes(plugin.name)
      || dependencyArchivePath(profileDir, profileManifest.dependencies[plugin.name]) !== archivePath
      || !isRecord(installedManifest) || installedManifest.version !== plugin.version) {
      return false
    }
    return true
  } catch {
    return false
  }
}

async function runOfficialAdd(
  launch: DshLaunchSpec,
  plugin: EmbeddedPluginRecord,
  archivePath: string,
  timeoutMs: number,
): Promise<void> {
  const entry = launch.args[0]
  if (entry === undefined || !isAbsolute(entry)) throw new Error('Desktop DSH CLI entry is invalid.')
  await mkdir(launch.cwd, { recursive: true })
  const child = spawn(launch.command, [
    entry,
    'plugin',
    '--profile',
    plugin.profile,
    'add',
    archivePath,
    '--offline',
    '--ignore-scripts',
    '--save-exact',
  ], {
    cwd: launch.cwd,
    env: {
      ...launch.env,
      npm_config_offline: 'true',
      PNPM_CONFIG_OFFLINE: 'true',
      npm_config_ignore_scripts: 'true',
      PNPM_CONFIG_IGNORE_SCRIPTS: 'true',
    },
    stdio: ['ignore', 'ignore', 'ignore'],
    windowsHide: true,
    detached: process.platform !== 'win32',
  })
  await new Promise<void>((resolveRun, reject) => {
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      signalProcessTree(process.platform, child.pid, 'SIGKILL', {
        killDirect: signal => { child.kill(signal) },
      })
    }, timeoutMs)
    child.once('error', error => {
      clearTimeout(timer)
      reject(new Error(`Could not start the embedded plugin installer: ${error.message}`, { cause: error }))
    })
    child.once('exit', (code, signal) => {
      clearTimeout(timer)
      if (timedOut) {
        reject(new Error(`Embedded plugin ${plugin.name} installation timed out.`))
      } else if (code !== 0) {
        reject(new Error(`Embedded plugin ${plugin.name} installation failed with ${signal ?? `exit ${String(code)}`}.`))
      } else {
        resolveRun()
      }
    })
  })
}

/** Verify and idempotently seed every reviewed runtime archive before Web starts. */
export async function seedEmbeddedProfilePlugins(
  options: EmbeddedPluginSeedOptions,
): Promise<EmbeddedPluginSeedResult> {
  const manifestPath = join(options.runtimeRoot, 'runtime-manifest.json')
  const manifest = parseRuntimeManifest(manifestPath)
  const pluginsRoot = join(options.runtimeRoot, 'plugins')
  const installed: string[] = []
  const skipped: string[] = []
  for (const plugin of manifest.embeddedPlugins) {
    const archivePath = resolve(pluginsRoot, plugin.archive)
    const fromPlugins = relative(pluginsRoot, archivePath)
    if (fromPlugins.startsWith('..') || isAbsolute(fromPlugins) || !existsSync(archivePath)) {
      throw new Error(`Embedded plugin archive ${plugin.archive} is missing.`)
    }
    const actualIntegrity = await sha512(archivePath)
    if (actualIntegrity !== plugin.integrity) {
      throw new Error(`Embedded plugin archive ${plugin.archive} failed integrity verification.`)
    }
    if (isCurrent(plugin, archivePath, options.launch)) {
      skipped.push(plugin.name)
      continue
    }
    if (options.runAdd === undefined) {
      await runOfficialAdd(options.launch, plugin, archivePath, options.timeoutMs ?? 5 * 60 * 1_000)
    } else {
      await options.runAdd(plugin, archivePath)
    }
    if (!isCurrent(plugin, archivePath, options.launch)) {
      throw new Error(`Embedded plugin ${plugin.name} was not reconciled into Profile ${plugin.profile}.`)
    }
    installed.push(plugin.name)
  }
  return { installed, skipped }
}
