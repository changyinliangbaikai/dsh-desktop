import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ArchivePolicy } from '../../src/archive/inspect.js'
import { DshCliRunner } from '../../src/install/cli-runner.js'
import { OfflinePackageInstaller } from '../../src/install/installer.js'
import { ArchiveStore } from '../../src/store/archive-store.js'
import { createArchive, fixtureManifest } from '../helpers/archive.js'

const cliFixture = fileURLToPath(new URL('../fixtures/fake-dsh-cli.mjs', import.meta.url))
const policy: ArchivePolicy = {
  maxUploadBytes: 1024 * 1024,
  maxExpandedBytes: 2 * 1024 * 1024,
  maxArchiveEntries: 100,
  expectedHarnessVersion: '0.1.2-rc.1',
  expectedCordisVersion: '4.0.2',
  allowedPackagePrefixes: [],
}

let root: string
let profileDir: string
let store: ArchiveStore

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-offline-installer-'))
  profileDir = join(root, 'profile')
  await mkdir(profileDir)
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }))
  store = new ArchiveStore({
    profileDir,
    storePath: join(profileDir, '.offline'),
    maxStoredBytes: 4 * 1024 * 1024,
    maxStoredPackages: 4,
  })
  await store.initialize()
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

function installer(mode: string, warn = vi.fn()): OfflinePackageInstaller {
  const cli = new DshCliRunner({
    cliEntryPath: cliFixture,
    profile: 'web',
    profileDir,
    timeoutMs: 2_000,
    maxOutputBytes: 1024,
    environment: { ...process.env, FAKE_DSH_CLI_MODE: mode },
  })
  return new OfflinePackageInstaller(policy, store, cli, { warn })
}

describe('OfflinePackageInstaller', () => {
  it('commits successful installation metadata and reports restart plus dependency warning', async () => {
    const incoming = store.createIncomingPath()
    await createArchive(incoming, {
      manifest: fixtureManifest({ dependencies: { localOnly: '1.0.0' } }),
    })
    const result = await installer('success').install(incoming, new AbortController().signal)
    expect(result).toMatchObject({
      ok: true,
      restartRequired: true,
      package: { name: 'dsh-fixture-plugin', version: '1.2.3' },
      warningCodes: ['RUNTIME_DEPENDENCIES_REQUIRE_OFFLINE_STORE'],
    })
    const packageDirs = await readdir(join(profileDir, '.offline'))
    expect(packageDirs).toHaveLength(1)
    expect(await readdir(join(profileDir, '.offline', packageDirs[0]!))).toContain('current.json')
  })

  it('rolls back the archive and retains bounded CLI diagnostics only in the Host logger', async () => {
    const incoming = store.createIncomingPath()
    await createArchive(incoming)
    const warn = vi.fn()
    await expect(installer('fail', warn).install(incoming, new AbortController().signal))
      .rejects.toMatchObject({ code: 'INSTALL_FAILED' })
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('offline dependency unavailable'))
    const packageDirs = await readdir(join(profileDir, '.offline'))
    expect(packageDirs).toHaveLength(1)
    expect((await readdir(join(profileDir, '.offline', packageDirs[0]!))).filter(name => name.endsWith('.tgz')))
      .toEqual([])
  })
})
