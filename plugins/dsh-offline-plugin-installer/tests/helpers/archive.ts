import { createWriteStream } from 'node:fs'
import { pipeline } from 'node:stream/promises'
import { createGzip } from 'node:zlib'
import { pack, type Header } from 'tar-stream'

type FixtureHeader = Partial<Header> & Pick<Header, 'name'>

export interface ArchiveFixtureOptions {
  readonly name?: string
  readonly version?: string
  readonly manifest?: Record<string, unknown>
  readonly omit?: readonly string[]
  readonly extraEntries?: readonly {
    readonly header: FixtureHeader
    readonly body?: string | Buffer
  }[]
}

export function fixtureManifest(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    name: 'dsh-fixture-plugin',
    version: '1.2.3',
    type: 'module',
    main: './lib/index.js',
    exports: {
      '.': { import: './lib/index.js' },
      './package.json': './package.json',
    },
    engines: { node: '^22.19.0 || >=24.0.0' },
    dsh: { bundle: { patch: './cordis.patch.yml' } },
    peerDependencies: {
      '@deepseek-ai/cordis': '4.0.2',
      '@deepseek-ai/dsh-host-webserver': '0.1.2-rc.1',
    },
    ...overrides,
  }
}

function addEntry(archive: ReturnType<typeof pack>, header: FixtureHeader, body: string | Buffer = ''): Promise<void> {
  return new Promise((resolveEntry, reject) => {
    archive.entry(header, body, error => {
      if (error === null || error === undefined) resolveEntry()
      else reject(error)
    })
  })
}

/** Write a deterministic gzip tar fixture accepted by the npm package layout. */
export async function createArchive(path: string, options: ArchiveFixtureOptions = {}): Promise<void> {
  const manifest = options.manifest ?? fixtureManifest({
    ...(options.name === undefined ? {} : { name: options.name }),
    ...(options.version === undefined ? {} : { version: options.version }),
  })
  const omitted = new Set(options.omit ?? [])
  const entries: { header: FixtureHeader; body: string | Buffer }[] = [
    { header: { name: 'package/package.json', type: 'file', mode: 0o644 }, body: `${JSON.stringify(manifest)}\n` },
    { header: { name: 'package/lib/index.js', type: 'file', mode: 0o644 }, body: 'export const name = "fixture"\n' },
    { header: { name: 'package/cordis.patch.yml', type: 'file', mode: 0o644 }, body: '[]\n' },
  ]
  const archive = pack()
  const writing = pipeline(archive, createGzip(), createWriteStream(path))
  for (const entry of entries) {
    if (!omitted.has(entry.header.name)) await addEntry(archive, entry.header, entry.body)
  }
  for (const entry of options.extraEntries ?? []) {
    await addEntry(archive, entry.header, entry.body)
  }
  archive.finalize()
  await writing
}
