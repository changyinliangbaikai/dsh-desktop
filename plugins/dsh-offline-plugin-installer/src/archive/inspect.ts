import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { createGunzip } from 'node:zlib'
import { extract, type Header } from 'tar-stream'
import { abortedError, InstallerError } from '../errors.js'

const PACKAGE_JSON = 'package/package.json'
const MAX_PACKAGE_JSON_BYTES = 1024 * 1024

/** Validation policy tied to the running DSH deployment. */
export interface ArchivePolicy {
  readonly maxUploadBytes: number
  readonly maxExpandedBytes: number
  readonly maxArchiveEntries: number
  readonly expectedHarnessVersion: string
  readonly expectedCordisVersion: string
  readonly allowedPackagePrefixes: readonly string[]
}

/** Trusted manifest projection after the complete tar stream has been checked. */
export interface ArchiveInspection {
  readonly name: string
  readonly version: string
  readonly sha256: string
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly entryCount: number
  readonly runtimeDependencies: readonly string[]
}

type JsonRecord = Record<string, unknown>

function invalid(message: string, cause?: unknown): InstallerError {
  return new InstallerError('INVALID_ARCHIVE', 422, message, { cause })
}

function incompatible(message: string): InstallerError {
  return new InstallerError('PACKAGE_INCOMPATIBLE', 422, message)
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function stringField(record: JsonRecord, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.length === 0) {
    throw invalid(`The package manifest must declare a non-empty ${key} string.`)
  }
  return value
}

function optionalRecord(record: JsonRecord, key: string): JsonRecord {
  const value = record[key]
  if (value === undefined) return {}
  if (!isRecord(value)) throw invalid(`The package manifest field ${key} must be an object.`)
  return value
}

function dependencyNames(record: JsonRecord, key: string): string[] {
  const dependencies = optionalRecord(record, key)
  for (const [name, spec] of Object.entries(dependencies)) {
    if (typeof spec !== 'string' || spec.length === 0) {
      throw invalid(`The package manifest contains an invalid ${key} entry for ${name}.`)
    }
  }
  return Object.keys(dependencies)
}

function validPackageName(name: string): boolean {
  if (name.length > 214 || name !== name.toLowerCase()) return false
  const segment = '[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?'
  return new RegExp(`^(?:${segment}|@${segment}/${segment})$`, 'u').test(name)
}

function validVersion(version: string): boolean {
  const number = '(?:0|[1-9]\\d*)'
  const identifier = '[0-9A-Za-z-]+'
  return new RegExp(
    `^${number}\\.${number}\\.${number}(?:-${identifier}(?:\\.${identifier})*)?(?:\\+${identifier}(?:\\.${identifier})*)?$`,
    'u',
  ).test(version)
}

function normalizePackagePath(value: string, field: string): string {
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    throw invalid(`The package manifest ${field} path is unsafe.`)
  }
  const normalized = value.replace(/^\.\//u, '')
  const parts = normalized.split('/')
  if (normalized.length === 0 || parts.some(part => part.length === 0 || part === '.' || part === '..')) {
    throw invalid(`The package manifest ${field} path is unsafe.`)
  }
  return normalized
}

function normalizeTarPath(value: string, type: Header['type']): string {
  if (value.includes('\\') || value.includes('\0') || value.startsWith('/')) {
    throw invalid('The archive contains an unsafe entry path.')
  }
  const withoutTrailingSlash = type === 'directory' ? value.replace(/\/+$/u, '') : value
  const parts = withoutTrailingSlash.split('/')
  if (parts[0] !== 'package' || parts.some(part => part === '.' || part === '..' || part.length === 0)) {
    throw invalid('Every archive entry must remain under the package directory.')
  }
  return parts.join('/')
}

function exportTarget(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (!isRecord(value)) return undefined
  for (const key of ['import', 'default']) {
    const candidate = value[key]
    if (typeof candidate === 'string') return candidate
  }
  return undefined
}

function assertFile(entries: ReadonlySet<string>, relativePath: string, field: string): void {
  if (!entries.has(`package/${relativePath}`)) {
    throw invalid(`The package archive does not contain the declared ${field} file.`)
  }
}

function validateManifest(
  manifestValue: unknown,
  entries: ReadonlySet<string>,
  policy: ArchivePolicy,
): Pick<ArchiveInspection, 'name' | 'version' | 'runtimeDependencies'> {
  if (!isRecord(manifestValue)) throw invalid('The package manifest must be a JSON object.')
  const name = stringField(manifestValue, 'name')
  const version = stringField(manifestValue, 'version')
  if (!validPackageName(name)) throw invalid('The package manifest contains an invalid npm package name.')
  if (!validVersion(version)) throw invalid('The package manifest contains an invalid semantic version.')
  if (policy.allowedPackagePrefixes.length > 0
    && !policy.allowedPackagePrefixes.some(prefix => name.startsWith(prefix))) {
    throw incompatible('This package name is not allowed by the Profile installation policy.')
  }

  const engines = optionalRecord(manifestValue, 'engines')
  if (typeof engines.node !== 'string' || engines.node.length === 0) {
    throw incompatible('The package must declare its supported Node range in engines.node.')
  }

  const dsh = optionalRecord(manifestValue, 'dsh')
  const bundle = optionalRecord(dsh, 'bundle')
  const patch = normalizePackagePath(stringField(bundle, 'patch'), 'dsh.bundle.patch')
  assertFile(entries, patch, 'dsh.bundle.patch')

  const main = normalizePackagePath(stringField(manifestValue, 'main'), 'main')
  assertFile(entries, main, 'main entry')
  const exportsField = manifestValue.exports
  if (!isRecord(exportsField)) throw invalid('The package manifest must declare an exports object.')
  const rootTarget = exportTarget(exportsField['.'])
  if (rootTarget === undefined) throw invalid('The package exports must expose the Host entry at ".".')
  assertFile(entries, normalizePackagePath(rootTarget, 'exports["."]'), 'Host export')

  if (dsh.client !== undefined) {
    if (!isRecord(dsh.client)) throw invalid('The package manifest field dsh.client must be an object.')
    const clientTarget = exportTarget(exportsField['./client'])
    if (clientTarget === undefined) {
      throw invalid('A package declaring dsh.client must export its browser entry at "./client".')
    }
    assertFile(entries, normalizePackagePath(clientTarget, 'exports["./client"]'), 'Web client export')
  }

  const peers = optionalRecord(manifestValue, 'peerDependencies')
  if (peers['@deepseek-ai/cordis'] !== policy.expectedCordisVersion) {
    throw incompatible(`The package must require @deepseek-ai/cordis ${policy.expectedCordisVersion} exactly.`)
  }
  const dshPeers = Object.entries(peers).filter(([peer]) => peer.startsWith('@deepseek-ai/dsh-'))
  if (dshPeers.length === 0) {
    throw incompatible('The package must declare at least one exact DeepSeek Harness peer dependency.')
  }
  const incompatibleDshPeer = dshPeers.find(([, spec]) => spec !== policy.expectedHarnessVersion)
  if (incompatibleDshPeer !== undefined) {
    throw incompatible(
      `The package peer ${incompatibleDshPeer[0]} must require ${policy.expectedHarnessVersion} exactly.`,
    )
  }

  const scripts = optionalRecord(manifestValue, 'scripts')
  const blockedScript = ['preinstall', 'install', 'postinstall'].find(script => scripts[script] !== undefined)
  if (blockedScript !== undefined) {
    throw incompatible(`Offline packages must not declare the ${blockedScript} lifecycle script.`)
  }

  const runtimeDependencies = [
    ...dependencyNames(manifestValue, 'dependencies'),
    ...dependencyNames(manifestValue, 'optionalDependencies'),
  ].sort()
  return { name, version, runtimeDependencies }
}

/** Inspect an npm gzip tarball without extracting it to disk. */
export async function inspectArchive(
  path: string,
  policy: ArchivePolicy,
  signal?: AbortSignal,
): Promise<ArchiveInspection> {
  const archiveStat = await stat(path)
  if (!archiveStat.isFile()) throw invalid('The uploaded package is not a regular file.')
  if (archiveStat.size === 0) throw invalid('The uploaded package is empty.')
  if (archiveStat.size > policy.maxUploadBytes) {
    throw new InstallerError('UPLOAD_TOO_LARGE', 413, 'The uploaded package exceeds the configured size limit.')
  }

  const hash = createHash('sha256')
  const meter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  const unpack = extract()
  const entries = new Set<string>()
  const manifestChunks: Buffer[] = []
  let manifestBytes = 0
  let expandedBytes = 0
  let entryCount = 0

  unpack.on('entry', (header, stream, next) => {
    let settled = false
    const settle = (error?: Error): void => {
      if (settled) return
      settled = true
      next(error)
    }
    let name: string
    try {
      entryCount += 1
      if (entryCount > policy.maxArchiveEntries) {
        throw invalid('The archive contains too many entries.')
      }
      if (header.type !== 'file' && header.type !== 'directory') {
        throw invalid('The archive contains a link or unsupported entry type.')
      }
      name = normalizeTarPath(header.name, header.type)
      if (entries.has(name)) throw invalid('The archive contains a duplicate entry path.')
      entries.add(name)
    } catch (error) {
      stream.once('error', () => {})
      stream.resume()
      settle(error instanceof Error ? error : invalid('The archive entry is invalid.', error))
      return
    }

    stream.on('data', (value: unknown) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array)
      expandedBytes += chunk.byteLength
      if (expandedBytes > policy.maxExpandedBytes) {
        stream.resume()
        settle(invalid('The expanded archive exceeds the configured size limit.'))
        return
      }
      if (name !== PACKAGE_JSON) return
      manifestBytes += chunk.byteLength
      if (manifestBytes > MAX_PACKAGE_JSON_BYTES) {
        stream.resume()
        settle(invalid('The package manifest exceeds the allowed size.'))
        return
      }
      manifestChunks.push(Buffer.from(chunk))
    })
    stream.once('error', error => { settle(error) })
    stream.once('end', () => { settle() })
  })

  try {
    await pipeline(createReadStream(path), meter, createGunzip(), unpack, { signal })
  } catch (error) {
    if (signal?.aborted === true || (error instanceof Error && error.name === 'AbortError')) {
      throw abortedError(error)
    }
    if (error instanceof InstallerError) throw error
    throw invalid('The uploaded file is not a valid npm gzip tarball.', error)
  }
  if (manifestChunks.length === 0) throw invalid('The archive does not contain package/package.json.')

  let manifest: unknown
  try {
    manifest = JSON.parse(Buffer.concat(manifestChunks).toString('utf8')) as unknown
  } catch (error) {
    throw invalid('The package manifest is not valid JSON.', error)
  }
  const validated = validateManifest(manifest, entries, policy)
  return {
    ...validated,
    sha256: hash.digest('hex'),
    archiveBytes: archiveStat.size,
    expandedBytes,
    entryCount,
  }
}
