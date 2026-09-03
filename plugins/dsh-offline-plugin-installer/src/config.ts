import { isAbsolute, relative, resolve } from 'node:path'
import { resolveProfileDir } from '@deepseek-ai/dsh-app-boot'
import z from '@deepseek-ai/schemastery'

export const DEFAULT_CONFIG = Object.freeze({
  profile: 'web',
  archiveStoreDir: '.dsh-offline-plugin-packages',
  cliEntryPath: '',
  maxUploadBytes: 256 * 1024 * 1024,
  maxExpandedBytes: 512 * 1024 * 1024,
  maxArchiveEntries: 10_000,
  maxStoredPackages: 128,
  maxStoredBytes: 2 * 1024 * 1024 * 1024,
  installTimeoutMs: 5 * 60 * 1_000,
  maxCliOutputBytes: 64 * 1024,
  expectedHarnessVersion: '0.1.2-rc.1',
  expectedCordisVersion: '4.0.2',
  allowedPackagePrefixes: Object.freeze([]) as readonly string[],
})

/** Loader config before Schemastery supplies package defaults. */
export interface Config {
  profile?: string
  archiveStoreDir?: string
  cliEntryPath?: string
  maxUploadBytes?: number
  maxExpandedBytes?: number
  maxArchiveEntries?: number
  maxStoredPackages?: number
  maxStoredBytes?: number
  installTimeoutMs?: number
  maxCliOutputBytes?: number
  expectedHarnessVersion?: string
  expectedCordisVersion?: string
  allowedPackagePrefixes?: string[]
}

/** Complete runtime configuration with resolved Profile and store paths. */
export interface ResolvedConfig {
  readonly profile: string
  readonly profileDir: string
  readonly archiveStoreDir: string
  readonly archiveStorePath: string
  readonly cliEntryPath: string
  readonly maxUploadBytes: number
  readonly maxExpandedBytes: number
  readonly maxArchiveEntries: number
  readonly maxStoredPackages: number
  readonly maxStoredBytes: number
  readonly installTimeoutMs: number
  readonly maxCliOutputBytes: number
  readonly expectedHarnessVersion: string
  readonly expectedCordisVersion: string
  readonly allowedPackagePrefixes: readonly string[]
}

export const Config: z<Config> = z.object({
  profile: z.string().default(DEFAULT_CONFIG.profile),
  archiveStoreDir: z.string().default(DEFAULT_CONFIG.archiveStoreDir),
  cliEntryPath: z.string().default(DEFAULT_CONFIG.cliEntryPath),
  maxUploadBytes: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxUploadBytes),
  maxExpandedBytes: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxExpandedBytes),
  maxArchiveEntries: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxArchiveEntries),
  maxStoredPackages: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxStoredPackages),
  maxStoredBytes: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxStoredBytes),
  installTimeoutMs: z.number().step(1).min(1).default(DEFAULT_CONFIG.installTimeoutMs),
  maxCliOutputBytes: z.number().step(1).min(1).default(DEFAULT_CONFIG.maxCliOutputBytes),
  expectedHarnessVersion: z.string().default(DEFAULT_CONFIG.expectedHarnessVersion),
  expectedCordisVersion: z.string().default(DEFAULT_CONFIG.expectedCordisVersion),
  allowedPackagePrefixes: z.array(z.string()).default([]),
})

function assertRelativeStoreDirectory(value: string): void {
  if (value.length === 0 || isAbsolute(value)) {
    throw new Error('dsh-offline-plugin-installer: archiveStoreDir must be a relative Profile path')
  }
  const parts = value.split(/[\\/]/u)
  if (parts.some(part => part.length === 0 || part === '.' || part === '..')) {
    throw new Error('dsh-offline-plugin-installer: archiveStoreDir contains an unsafe path segment')
  }
}

function assertVersion(value: string, field: string): void {
  if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(value)) {
    throw new Error(`dsh-offline-plugin-installer: ${field} must be an exact semantic version`)
  }
}

/** Validate cross-field and filesystem configuration at plugin load. */
export function resolveConfig(config: Config): ResolvedConfig {
  const merged = { ...DEFAULT_CONFIG, ...config }
  const profileDir = resolveProfileDir(merged.profile)
  assertRelativeStoreDirectory(merged.archiveStoreDir)
  const archiveStorePath = resolve(profileDir, merged.archiveStoreDir)
  const fromProfile = relative(profileDir, archiveStorePath)
  if (fromProfile.startsWith('..') || isAbsolute(fromProfile)) {
    throw new Error('dsh-offline-plugin-installer: archive store must remain inside the Profile')
  }
  if (merged.maxExpandedBytes < merged.maxUploadBytes) {
    throw new Error('dsh-offline-plugin-installer: maxExpandedBytes must be at least maxUploadBytes')
  }
  if (merged.maxStoredBytes < merged.maxUploadBytes) {
    throw new Error('dsh-offline-plugin-installer: maxStoredBytes must be at least maxUploadBytes')
  }
  assertVersion(merged.expectedHarnessVersion, 'expectedHarnessVersion')
  assertVersion(merged.expectedCordisVersion, 'expectedCordisVersion')
  const prefixes = merged.allowedPackagePrefixes.map(prefix => prefix.trim())
  if (prefixes.some(prefix => prefix.length === 0 || /[\s\\]/u.test(prefix))) {
    throw new Error('dsh-offline-plugin-installer: allowedPackagePrefixes contains an invalid prefix')
  }
  return {
    profile: merged.profile,
    profileDir,
    archiveStoreDir: merged.archiveStoreDir,
    archiveStorePath,
    cliEntryPath: merged.cliEntryPath.trim(),
    maxUploadBytes: merged.maxUploadBytes,
    maxExpandedBytes: merged.maxExpandedBytes,
    maxArchiveEntries: merged.maxArchiveEntries,
    maxStoredPackages: merged.maxStoredPackages,
    maxStoredBytes: merged.maxStoredBytes,
    installTimeoutMs: merged.installTimeoutMs,
    maxCliOutputBytes: merged.maxCliOutputBytes,
    expectedHarnessVersion: merged.expectedHarnessVersion,
    expectedCordisVersion: merged.expectedCordisVersion,
    allowedPackagePrefixes: prefixes,
  }
}
