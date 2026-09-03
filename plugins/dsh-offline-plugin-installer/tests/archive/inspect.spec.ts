import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { inspectArchive, type ArchivePolicy } from '../../src/archive/inspect.js'
import { InstallerError } from '../../src/errors.js'
import { createArchive, fixtureManifest } from '../helpers/archive.js'

const POLICY: ArchivePolicy = {
  maxUploadBytes: 1024 * 1024,
  maxExpandedBytes: 2 * 1024 * 1024,
  maxArchiveEntries: 100,
  expectedHarnessVersion: '0.1.2-rc.1',
  expectedCordisVersion: '4.0.2',
  allowedPackagePrefixes: [],
}

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-offline-inspect-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

async function rejection(path: string): Promise<InstallerError> {
  try {
    await inspectArchive(path, POLICY)
  } catch (error) {
    expect(error).toBeInstanceOf(InstallerError)
    return error as InstallerError
  }
  throw new Error('Expected archive inspection to reject.')
}

describe('inspectArchive', () => {
  it('accepts one complete compatible DSH bundle and measures it', async () => {
    const path = join(directory, 'plugin.tgz')
    await createArchive(path, {
      manifest: fixtureManifest({ dependencies: { bundled: '1.0.0' } }),
    })

    const result = await inspectArchive(path, POLICY)

    expect(result).toMatchObject({
      name: 'dsh-fixture-plugin',
      version: '1.2.3',
      entryCount: 3,
      runtimeDependencies: ['bundled'],
    })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(result.archiveBytes).toBe((await readFile(path)).byteLength)
    expect(result.expandedBytes).toBeGreaterThan(0)
  })

  it('rejects traversal, links, duplicate entries, and expanded bombs', async () => {
    const traversal = join(directory, 'traversal.tgz')
    await createArchive(traversal, {
      extraEntries: [{ header: { name: 'package/../escape', type: 'file' }, body: 'x' }],
    })
    expect((await rejection(traversal)).message).toContain('under the package directory')

    const link = join(directory, 'link.tgz')
    await createArchive(link, {
      extraEntries: [{ header: { name: 'package/link', type: 'symlink', linkname: '/tmp/x' } }],
    })
    expect((await rejection(link)).message).toContain('link or unsupported')

    const duplicate = join(directory, 'duplicate.tgz')
    await createArchive(duplicate, {
      extraEntries: [{ header: { name: 'package/lib/index.js', type: 'file' }, body: 'again' }],
    })
    expect((await rejection(duplicate)).message).toContain('duplicate')

    const expanded = join(directory, 'expanded.tgz')
    await createArchive(expanded, {
      extraEntries: [{ header: { name: 'package/large.bin', type: 'file' }, body: Buffer.alloc(4096) }],
    })
    await expect(inspectArchive(expanded, { ...POLICY, maxExpandedBytes: 100 }))
      .rejects.toMatchObject({ code: 'INVALID_ARCHIVE' })
  })

  it('rejects missing package files, blocked scripts, and incompatible peers', async () => {
    const missing = join(directory, 'missing.tgz')
    await createArchive(missing, { omit: ['package/cordis.patch.yml'] })
    expect((await rejection(missing)).message).toContain('dsh.bundle.patch')

    const scripts = join(directory, 'scripts.tgz')
    await createArchive(scripts, { manifest: fixtureManifest({ scripts: { postinstall: 'node bad.js' } }) })
    expect((await rejection(scripts)).message).toContain('postinstall')

    const peer = join(directory, 'peer.tgz')
    await createArchive(peer, {
      manifest: fixtureManifest({
        peerDependencies: {
          '@deepseek-ai/cordis': '4.0.0',
          '@deepseek-ai/dsh-host-webserver': '0.1.2-rc.1',
        },
      }),
    })
    await expect(inspectArchive(peer, POLICY)).rejects.toMatchObject({ code: 'PACKAGE_INCOMPATIBLE' })
  })

  it('enforces configured package prefixes, compressed bytes, entries, gzip, and cancellation', async () => {
    const path = join(directory, 'plugin.tgz')
    await createArchive(path)
    await expect(inspectArchive(path, { ...POLICY, allowedPackagePrefixes: ['@approved/'] }))
      .rejects.toMatchObject({ code: 'PACKAGE_INCOMPATIBLE' })
    await expect(inspectArchive(path, { ...POLICY, maxUploadBytes: 1 }))
      .rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    await expect(inspectArchive(path, { ...POLICY, maxArchiveEntries: 1 }))
      .rejects.toMatchObject({ code: 'INVALID_ARCHIVE' })

    const invalid = join(directory, 'invalid.tgz')
    await writeFile(invalid, 'not gzip')
    expect((await rejection(invalid)).message).toContain('valid npm gzip tarball')

    const controller = new AbortController()
    controller.abort()
    await expect(inspectArchive(path, POLICY, controller.signal)).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
