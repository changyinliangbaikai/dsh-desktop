import { createHash, randomUUID } from 'node:crypto'
import {
  lstat,
  mkdir,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import type { ArchiveInspection } from '../archive/inspect.js'
import { InstallerError } from '../errors.js'

interface PendingRecord {
  readonly packageName: string
  readonly version: string
  readonly sha256: string
  readonly archiveFilename: string
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly entryCount: number
  readonly runtimeDependencies: readonly string[]
}

interface CurrentRecord extends PendingRecord {
  readonly installedAt: string
}

interface StoreUsage {
  readonly bytes: number
  readonly packageDirectories: number
}

/** Options for the bounded archive store inside one DSH Profile. */
export interface ArchiveStoreOptions {
  readonly profileDir: string
  readonly storePath: string
  readonly maxStoredBytes: number
  readonly maxStoredPackages: number
}

function packageDirectoryName(name: string): string {
  return createHash('sha256').update(name).digest('hex')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function pendingRecord(value: unknown): PendingRecord | undefined {
  if (!isRecord(value)
    || typeof value.packageName !== 'string'
    || typeof value.version !== 'string'
    || typeof value.sha256 !== 'string'
    || !/^[a-f0-9]{64}$/u.test(value.sha256)
    || typeof value.archiveFilename !== 'string'
    || value.archiveFilename !== `${value.sha256}.tgz`
    || typeof value.archiveBytes !== 'number'
    || typeof value.expandedBytes !== 'number'
    || typeof value.entryCount !== 'number'
    || !Array.isArray(value.runtimeDependencies)
    || !value.runtimeDependencies.every(item => typeof item === 'string')) {
    return undefined
  }
  return {
    packageName: value.packageName,
    version: value.version,
    sha256: value.sha256,
    archiveFilename: value.archiveFilename,
    archiveBytes: value.archiveBytes,
    expandedBytes: value.expandedBytes,
    entryCount: value.entryCount,
    runtimeDependencies: value.runtimeDependencies,
  }
}

async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  const temporary = `${path}.${randomUUID()}.tmp`
  try {
    await writeFile(temporary, `${JSON.stringify(value, undefined, 2)}\n`, { mode: 0o600, flag: 'wx' })
    await rename(temporary, path)
  } finally {
    await rm(temporary, { force: true })
  }
}

function dependencyPath(profileDir: string, spec: unknown): string | undefined {
  if (typeof spec !== 'string') return undefined
  const raw = spec.startsWith('file:') ? spec.slice('file:'.length) : spec
  if (!raw.endsWith('.tgz')) return undefined
  return resolve(profileDir, raw)
}

/** One installed-path reservation that can commit or remove its pending archive. */
export class ArchiveReservation {
  #settled = false

  constructor(
    private readonly store: ArchiveStore,
    readonly archivePath: string,
    readonly record: PendingRecord,
    private readonly pendingPath: string,
    private readonly createdArchive: boolean,
  ) {}

  /** Mark the CLI-installed archive current and prune older versions for this package. */
  async commit(): Promise<void> {
    if (this.#settled) throw new Error('Archive reservation is already settled.')
    this.#settled = true
    await this.store.commit(this.archivePath, this.record, this.pendingPath)
  }

  /** Remove an archive that never became a Profile dependency. */
  async rollback(): Promise<void> {
    if (this.#settled) return
    this.#settled = true
    await rm(this.pendingPath, { force: true })
    if (this.createdArchive) await rm(this.archivePath, { force: true })
  }
}

/** Profile-local durable store with one retained archive per installed package. */
export class ArchiveStore {
  readonly #profileDir: string
  readonly #storePath: string
  readonly #maxStoredBytes: number
  readonly #maxStoredPackages: number

  constructor(options: ArchiveStoreOptions) {
    this.#profileDir = options.profileDir
    this.#storePath = options.storePath
    this.#maxStoredBytes = options.maxStoredBytes
    this.#maxStoredPackages = options.maxStoredPackages
  }

  /** Create the store, reject symlink redirection, and recover interrupted installs. */
  async initialize(): Promise<void> {
    await mkdir(this.#storePath, { recursive: true, mode: 0o700 })
    const [profileReal, storeReal, storeInfo] = await Promise.all([
      realpath(this.#profileDir),
      realpath(this.#storePath),
      lstat(this.#storePath),
    ])
    if (storeInfo.isSymbolicLink() || !storeInfo.isDirectory()) {
      throw new Error('dsh-offline-plugin-installer: archive store must be a real directory')
    }
    const fromProfile = relative(profileReal, storeReal)
    if (fromProfile.startsWith('..') || isAbsolute(fromProfile)) {
      throw new Error('dsh-offline-plugin-installer: archive store escaped the Profile directory')
    }
    await this.#recover()
  }

  /** Generate a non-user-controlled incoming file path inside the store. */
  createIncomingPath(): string {
    return join(this.#storePath, `.incoming-${randomUUID()}.tgz`)
  }

  /** Delete a request body that did not reach archive promotion. */
  async discardIncoming(path: string): Promise<void> {
    this.#assertIncomingPath(path)
    await rm(path, { force: true })
  }

  /** Move a validated incoming archive to its stable hash path and mark it pending. */
  async promote(path: string, inspection: ArchiveInspection): Promise<ArchiveReservation> {
    this.#assertIncomingPath(path)
    const usage = await this.#usage()
    if (usage.bytes > this.#maxStoredBytes) {
      throw new InstallerError('STORE_FULL', 507, 'The Profile offline package store has reached its byte limit.')
    }
    const packageDir = join(this.#storePath, packageDirectoryName(inspection.name))
    let existingPackage = false
    try {
      const info = await lstat(packageDir)
      if (info.isSymbolicLink() || !info.isDirectory()) {
        throw new Error('dsh-offline-plugin-installer: package archive path is not a real directory')
      }
      existingPackage = true
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }
    if (!existingPackage && usage.packageDirectories >= this.#maxStoredPackages) {
      throw new InstallerError('STORE_FULL', 507, 'The Profile offline package store has reached its package limit.')
    }
    await mkdir(packageDir, { recursive: true, mode: 0o700 })

    const archiveFilename = `${inspection.sha256}.tgz`
    const archivePath = join(packageDir, archiveFilename)
    let createdArchive = true
    try {
      const existing = await lstat(archivePath)
      if (!existing.isFile() || existing.isSymbolicLink()) {
        throw new Error('dsh-offline-plugin-installer: archive hash path is not a regular file')
      }
      createdArchive = false
      await rm(path, { force: true })
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
      await rename(path, archivePath)
    }

    const record: PendingRecord = {
      packageName: inspection.name,
      version: inspection.version,
      sha256: inspection.sha256,
      archiveFilename,
      archiveBytes: inspection.archiveBytes,
      expandedBytes: inspection.expandedBytes,
      entryCount: inspection.entryCount,
      runtimeDependencies: inspection.runtimeDependencies,
    }
    const pendingPath = join(packageDir, `${inspection.sha256}.pending.json`)
    try {
      await writeJsonAtomic(pendingPath, record)
    } catch (error) {
      if (createdArchive) await rm(archivePath, { force: true })
      throw error
    }
    return new ArchiveReservation(this, archivePath, record, pendingPath, createdArchive)
  }

  /** Finalize a reservation after the official CLI exits successfully. */
  async commit(archivePath: string, record: PendingRecord, pendingPath: string): Promise<void> {
    const packageDir = dirname(archivePath)
    const current: CurrentRecord = { ...record, installedAt: new Date().toISOString() }
    await writeJsonAtomic(join(packageDir, 'current.json'), current)
    await rm(pendingPath, { force: true })
    await this.#prunePackageDirectory(packageDir, basename(archivePath))
  }

  async #recover(): Promise<void> {
    const rootEntries = await readdir(this.#storePath, { withFileTypes: true })
    for (const entry of rootEntries) {
      const path = join(this.#storePath, entry.name)
      if (entry.name.startsWith('.incoming-')) {
        await rm(path, { force: true })
        continue
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        throw new Error('dsh-offline-plugin-installer: archive store contains an unexpected entry')
      }
      await this.#recoverPackageDirectory(path)
    }
  }

  async #recoverPackageDirectory(packageDir: string): Promise<void> {
    const entries = await readdir(packageDir, { withFileTypes: true })
    for (const entry of entries) {
      if (!entry.name.endsWith('.pending.json')) continue
      const pendingPath = join(packageDir, entry.name)
      let record: PendingRecord | undefined
      try {
        record = pendingRecord(JSON.parse(await readFile(pendingPath, 'utf8')) as unknown)
      } catch {
        record = undefined
      }
      if (record === undefined || packageDirectoryName(record.packageName) !== basename(packageDir)) {
        await rm(pendingPath, { force: true })
        continue
      }
      const archivePath = join(packageDir, record.archiveFilename)
      if (await this.#profileReferences(record.packageName, archivePath)) {
        await this.commit(archivePath, record, pendingPath)
      } else {
        await rm(archivePath, { force: true })
        await rm(pendingPath, { force: true })
      }
    }
  }

  async #profileReferences(packageName: string, archivePath: string): Promise<boolean> {
    try {
      const manifest = JSON.parse(await readFile(join(this.#profileDir, 'package.json'), 'utf8')) as unknown
      if (!isRecord(manifest) || !isRecord(manifest.dependencies)) return false
      return dependencyPath(this.#profileDir, manifest.dependencies[packageName]) === archivePath
    } catch {
      return false
    }
  }

  async #prunePackageDirectory(packageDir: string, keepFilename: string): Promise<void> {
    for (const entry of await readdir(packageDir, { withFileTypes: true })) {
      if (entry.name === keepFilename || entry.name === 'current.json') continue
      if (entry.name.endsWith('.tgz') || entry.name.endsWith('.pending.json')) {
        await rm(join(packageDir, entry.name), { force: true })
      }
    }
  }

  async #usage(): Promise<StoreUsage> {
    let bytes = 0
    let packageDirectories = 0
    for (const entry of await readdir(this.#storePath, { withFileTypes: true })) {
      const path = join(this.#storePath, entry.name)
      if (entry.isFile() && entry.name.startsWith('.incoming-') && entry.name.endsWith('.tgz')) {
        bytes += (await stat(path)).size
        continue
      }
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue
      let hasArchive = false
      for (const child of await readdir(path, { withFileTypes: true })) {
        if (!child.isFile() || !child.name.endsWith('.tgz')) continue
        hasArchive = true
        bytes += (await stat(join(path, child.name))).size
      }
      if (hasArchive) packageDirectories += 1
    }
    return { bytes, packageDirectories }
  }

  #assertIncomingPath(path: string): void {
    if (dirname(path) !== this.#storePath || !basename(path).startsWith('.incoming-') || !path.endsWith('.tgz')) {
      throw new Error('dsh-offline-plugin-installer: invalid incoming archive path')
    }
  }
}
