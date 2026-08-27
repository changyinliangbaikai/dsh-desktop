import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { seedEmbeddedProfilePlugins } from '../src/main/embedded-plugins.js'
import type { DshLaunchSpec } from '../src/main/runtime-config.js'

const PACKAGE_NAME = 'dsh-offline-plugin-installer'
const VERSION = '0.1.0'
const ARCHIVE = 'dsh-offline-plugin-installer-0.1.0.tgz'

let root: string
let runtimeRoot: string
let pluginsRoot: string
let dshHome: string
let archivePath: string
let launch: DshLaunchSpec

function integrity(bytes: Buffer): string {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

async function writeManifest(bytes: Buffer, overrides: Record<string, unknown> = {}): Promise<void> {
  await writeFile(archivePath, bytes)
  await writeFile(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify({
    schemaVersion: 1,
    embeddedPlugins: [{
      name: PACKAGE_NAME,
      version: VERSION,
      archive: ARCHIVE,
      integrity: integrity(bytes),
      profile: 'web',
      ...overrides,
    }],
  }))
}

async function reconcile(usedArchivePath: string): Promise<void> {
  const profileDir = join(dshHome, 'profiles', 'web')
  const packageDir = join(profileDir, 'node_modules', PACKAGE_NAME)
  await mkdir(packageDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({
    dependencies: { [PACKAGE_NAME]: `file:${relative(profileDir, usedArchivePath)}` },
    dsh: { profile: { bundles: [PACKAGE_NAME] } },
  }))
  await writeFile(join(packageDir, 'package.json'), JSON.stringify({ name: PACKAGE_NAME, version: VERSION }))
}

async function writeFakeCli(mode: 'success' | 'failure' | 'hang'): Promise<string> {
  const path = join(root, `fake-${mode}.cjs`)
  const source = mode === 'success'
    ? `
const { mkdirSync, writeFileSync } = require('node:fs')
const { dirname, join, relative } = require('node:path')
const args = process.argv.slice(2)
const profile = args[2]
const archive = args[4]
const profileDir = join(process.env.DSH_HOME, 'profiles', profile)
const packageDir = join(profileDir, 'node_modules', '${PACKAGE_NAME}')
mkdirSync(packageDir, { recursive: true })
writeFileSync(join(profileDir, 'package.json'), JSON.stringify({
  dependencies: { '${PACKAGE_NAME}': 'file:' + relative(profileDir, archive) },
  dsh: { profile: { bundles: ['${PACKAGE_NAME}'] } },
}))
writeFileSync(join(packageDir, 'package.json'), JSON.stringify({
  name: '${PACKAGE_NAME}', version: '${VERSION}',
}))
writeFileSync(process.env.DSH_TEST_CAPTURE, JSON.stringify({
  args,
  offline: process.env.npm_config_offline,
  ignoreScripts: process.env.npm_config_ignore_scripts,
}))
`
    : mode === 'failure'
      ? 'process.exitCode = 7\n'
      : 'setInterval(() => {}, 1000)\n'
  await writeFile(path, source)
  return path
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-desktop-embedded-'))
  runtimeRoot = join(root, 'runtime')
  pluginsRoot = join(runtimeRoot, 'plugins')
  dshHome = join(root, 'home')
  archivePath = join(pluginsRoot, ARCHIVE)
  await mkdir(pluginsRoot, { recursive: true })
  launch = {
    command: process.execPath,
    args: [join(root, 'dsh.js'), 'web'],
    cwd: join(root, 'workspace'),
    env: { ...process.env, DSH_HOME: dshHome },
  }
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('seedEmbeddedProfilePlugins', () => {
  it('verifies, installs, and then skips the exact current archive', async () => {
    await writeManifest(Buffer.from('trusted archive'))
    const runAdd = vi.fn(async (_plugin, usedArchivePath: string) => { await reconcile(usedArchivePath) })
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd })).resolves.toEqual({
      installed: [PACKAGE_NAME],
      skipped: [],
    })
    expect(runAdd).toHaveBeenCalledTimes(1)

    const skipRun = vi.fn()
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: skipRun })).resolves.toEqual({
      installed: [],
      skipped: [PACKAGE_NAME],
    })
    expect(skipRun).not.toHaveBeenCalled()
  })

  it('reinstalls when the Profile points at an obsolete archive path', async () => {
    await writeManifest(Buffer.from('trusted archive'))
    await reconcile(join(root, 'old-install', ARCHIVE))
    const runAdd = vi.fn(async (_plugin, usedArchivePath: string) => { await reconcile(usedArchivePath) })
    const result = await seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd })
    expect(result.installed).toEqual([PACKAGE_NAME])
    expect(runAdd).toHaveBeenCalledTimes(1)
  })

  it('rejects missing, corrupt, invalid, duplicate, and unreconciled runtime inputs', async () => {
    await writeManifest(Buffer.from('trusted archive'))
    await writeFile(archivePath, 'tampered')
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: vi.fn() }))
      .rejects.toThrow('integrity verification')

    await writeFile(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify({ schemaVersion: 1 }))
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: vi.fn() }))
      .rejects.toThrow('invalid embeddedPlugins')

    const bytes = Buffer.from('trusted archive')
    await writeManifest(bytes, { profile: '..' })
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: vi.fn() }))
      .rejects.toThrow('embedded plugin 0 is invalid')

    await writeManifest(bytes)
    const manifest = JSON.parse(await readFile(join(runtimeRoot, 'runtime-manifest.json'), 'utf8'))
    manifest.embeddedPlugins.push(manifest.embeddedPlugins[0])
    await writeFile(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify(manifest))
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: vi.fn() }))
      .rejects.toThrow('Duplicate embedded plugin')

    await writeManifest(bytes)
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: async () => {} }))
      .rejects.toThrow('was not reconciled')
  })

  it('runs the official CLI with offline and lifecycle-script protections', async () => {
    const bytes = Buffer.from('trusted archive')
    await writeManifest(bytes)
    const capturePath = join(root, 'cli-capture.json')
    launch = {
      ...launch,
      args: [await writeFakeCli('success'), 'web'],
      env: { ...launch.env, DSH_TEST_CAPTURE: capturePath },
    }

    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch })).resolves.toEqual({
      installed: [PACKAGE_NAME], skipped: [],
    })
    const capture = JSON.parse(await readFile(capturePath, 'utf8'))
    expect(capture).toMatchObject({
      args: [
        'plugin', '--profile', 'web', 'add', archivePath,
        '--offline', '--ignore-scripts', '--save-exact',
      ],
      offline: 'true',
      ignoreScripts: 'true',
    })
  })

  it('reports invalid CLI entries, spawn failures, nonzero exits, and timeouts', async () => {
    await writeManifest(Buffer.from('trusted archive'))
    await expect(seedEmbeddedProfilePlugins({
      runtimeRoot,
      launch: { ...launch, args: ['relative-cli.js'] },
    })).rejects.toThrow('CLI entry is invalid')

    await expect(seedEmbeddedProfilePlugins({
      runtimeRoot,
      launch: { ...launch, command: join(root, 'missing-node'), args: [join(root, 'cli.cjs')] },
    })).rejects.toThrow('Could not start')

    await expect(seedEmbeddedProfilePlugins({
      runtimeRoot,
      launch: { ...launch, args: [await writeFakeCli('failure')] },
    })).rejects.toThrow('exit 7')

    await expect(seedEmbeddedProfilePlugins({
      runtimeRoot,
      launch: { ...launch, args: [await writeFakeCli('hang')] },
      timeoutMs: 50,
    })).rejects.toThrow('timed out')
  })

  it('rejects missing archives and homes, and recovers from malformed Profile state', async () => {
    const bytes = Buffer.from('trusted archive')
    await writeManifest(bytes)
    await rm(archivePath)
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch, runAdd: vi.fn() }))
      .rejects.toThrow('archive')

    await writeManifest(bytes)
    await expect(seedEmbeddedProfilePlugins({
      runtimeRoot,
      launch: { ...launch, env: { ...launch.env, DSH_HOME: '' } },
      runAdd: vi.fn(),
    })).rejects.toThrow('DSH_HOME is missing')

    const profileDir = join(dshHome, 'profiles', 'web')
    const packageDir = join(profileDir, 'node_modules', PACKAGE_NAME)
    await mkdir(packageDir, { recursive: true })
    await writeFile(join(profileDir, 'package.json'), '{')
    await writeFile(join(packageDir, 'package.json'), JSON.stringify({ version: VERSION }))
    await expect(seedEmbeddedProfilePlugins({
      runtimeRoot,
      launch,
      runAdd: async (_plugin, usedArchivePath) => { await reconcile(usedArchivePath) },
    })).resolves.toMatchObject({ installed: [PACKAGE_NAME] })
  })

  it('accepts an empty reviewed plugin list', async () => {
    await writeFile(join(runtimeRoot, 'runtime-manifest.json'), JSON.stringify({
      schemaVersion: 1,
      embeddedPlugins: [],
    }))
    await expect(seedEmbeddedProfilePlugins({ runtimeRoot, launch })).resolves.toEqual({
      installed: [], skipped: [],
    })
  })
})
