import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { ArchiveInspection } from '../../src/archive/inspect.js'
import { ArchiveStore } from '../../src/store/archive-store.js'

let root: string
let profileDir: string
let storePath: string

function inspection(name = 'dsh-fixture-plugin', sha = 'a'.repeat(64)): ArchiveInspection {
  return {
    name,
    version: '1.2.3',
    sha256: sha,
    archiveBytes: 4,
    expandedBytes: 12,
    entryCount: 3,
    runtimeDependencies: [],
  }
}

function packageDir(name: string): string {
  return join(storePath, createHash('sha256').update(name).digest('hex'))
}

async function newStore(options: { maxBytes?: number; maxPackages?: number } = {}): Promise<ArchiveStore> {
  const store = new ArchiveStore({
    profileDir,
    storePath,
    maxStoredBytes: options.maxBytes ?? 1024,
    maxStoredPackages: options.maxPackages ?? 4,
  })
  await store.initialize()
  return store
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'dsh-offline-store-'))
  profileDir = join(root, 'profile')
  storePath = join(profileDir, '.offline')
  await writeFile(join(root, 'placeholder'), '')
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }))
})

afterEach(async () => {
  await rm(root, { recursive: true, force: true })
})

describe('ArchiveStore', () => {
  it('commits one current archive and prunes the previous hash', async () => {
    const store = await newStore()
    const firstIncoming = store.createIncomingPath()
    await writeFile(firstIncoming, 'one', { flag: 'wx' })
    const first = await store.promote(firstIncoming, inspection())
    await first.commit()
    expect(await stat(first.archivePath)).toMatchObject({ size: 3 })

    const secondIncoming = store.createIncomingPath()
    await writeFile(secondIncoming, 'two', { flag: 'wx' })
    const second = await store.promote(secondIncoming, inspection('dsh-fixture-plugin', 'b'.repeat(64)))
    await second.commit()

    expect((await readdir(packageDir('dsh-fixture-plugin'))).sort()).toEqual([
      `${'b'.repeat(64)}.tgz`,
      'current.json',
    ])
    const current = JSON.parse(await readFile(join(packageDir('dsh-fixture-plugin'), 'current.json'), 'utf8'))
    expect(current).toMatchObject({ packageName: 'dsh-fixture-plugin', sha256: 'b'.repeat(64) })
  })

  it('rolls back a new archive and preserves a reused current archive', async () => {
    const store = await newStore()
    const incoming = store.createIncomingPath()
    await writeFile(incoming, 'one', { flag: 'wx' })
    const created = await store.promote(incoming, inspection())
    await created.rollback()
    await expect(stat(created.archivePath)).rejects.toMatchObject({ code: 'ENOENT' })

    const currentIncoming = store.createIncomingPath()
    await writeFile(currentIncoming, 'same', { flag: 'wx' })
    const current = await store.promote(currentIncoming, inspection())
    await current.commit()
    const duplicateIncoming = store.createIncomingPath()
    await writeFile(duplicateIncoming, 'ignored', { flag: 'wx' })
    const reused = await store.promote(duplicateIncoming, inspection())
    await reused.rollback()
    await expect(stat(reused.archivePath)).resolves.toBeDefined()
  })

  it('removes a newly promoted archive when its pending record cannot be written', async () => {
    const store = await newStore()
    const details = inspection()
    const incoming = store.createIncomingPath()
    await writeFile(incoming, 'one', { flag: 'wx' })
    const directory = packageDir(details.name)
    await mkdir(join(directory, `${details.sha256}.pending.json`), { recursive: true })

    await expect(store.promote(incoming, details)).rejects.toBeDefined()
    await expect(stat(join(directory, `${details.sha256}.tgz`))).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('recovers referenced pending installs and removes unreferenced ones', async () => {
    const store = await newStore()
    const incoming = store.createIncomingPath()
    await writeFile(incoming, 'one', { flag: 'wx' })
    const pending = await store.promote(incoming, inspection())
    const spec = `file:${relative(profileDir, pending.archivePath)}`
    await writeFile(join(profileDir, 'package.json'), JSON.stringify({
      dependencies: { 'dsh-fixture-plugin': spec },
    }))

    await newStore()
    expect(await readdir(packageDir('dsh-fixture-plugin'))).toContain('current.json')

    const unreferencedIncoming = store.createIncomingPath()
    await writeFile(unreferencedIncoming, 'two', { flag: 'wx' })
    const unreferenced = await store.promote(
      unreferencedIncoming,
      inspection('dsh-other-plugin', 'c'.repeat(64)),
    )
    await newStore()
    await expect(stat(unreferenced.archivePath)).rejects.toMatchObject({ code: 'ENOENT' })
  })

  it('enforces byte and package-count caps', async () => {
    const byteStore = await newStore({ maxBytes: 2 })
    const largeIncoming = byteStore.createIncomingPath()
    await writeFile(largeIncoming, '123')
    await expect(byteStore.promote(largeIncoming, inspection())).rejects.toMatchObject({ code: 'STORE_FULL' })
    await byteStore.discardIncoming(largeIncoming)

    await rm(storePath, { recursive: true, force: true })
    const countStore = await newStore({ maxPackages: 1 })
    const firstIncoming = countStore.createIncomingPath()
    await writeFile(firstIncoming, '1')
    const first = await countStore.promote(firstIncoming, inspection())
    await first.commit()
    const secondIncoming = countStore.createIncomingPath()
    await writeFile(secondIncoming, '2')
    await expect(countStore.promote(secondIncoming, inspection('dsh-other-plugin', 'd'.repeat(64))))
      .rejects.toMatchObject({ code: 'STORE_FULL' })
  })

  it('cleans abandoned incoming files during initialization', async () => {
    const store = await newStore()
    const incoming = store.createIncomingPath()
    await writeFile(incoming, 'abandoned')
    await newStore()
    await expect(stat(incoming)).rejects.toMatchObject({ code: 'ENOENT' })
  })
})
