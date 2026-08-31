import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, resolveConfig } from '../src/config.js'

let home: string
let previousHome: string | undefined

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-offline-config-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

describe('resolveConfig', () => {
  it('resolves complete defaults inside the selected Profile', () => {
    const result = resolveConfig({})
    expect(result).toMatchObject({
      profile: 'web',
      archiveStoreDir: '.dsh-offline-plugin-packages',
      expectedHarnessVersion: '0.1.2-alpha.2',
      expectedCordisVersion: '4.0.2',
    })
    expect(result.profileDir).toBe(join(home, 'profiles', 'web'))
    expect(result.archiveStorePath).toBe(join(result.profileDir, result.archiveStoreDir))
    expect(DEFAULT_CONFIG.maxExpandedBytes).toBeGreaterThanOrEqual(DEFAULT_CONFIG.maxUploadBytes)
  })

  it('rejects unsafe paths, invalid versions, invalid prefixes, and inconsistent caps', () => {
    expect(() => resolveConfig({ archiveStoreDir: '../outside' })).toThrow('unsafe path segment')
    expect(() => resolveConfig({ archiveStoreDir: '/outside' })).toThrow('relative Profile path')
    expect(() => resolveConfig({ profile: '../outside' })).toThrow('invalid profile name')
    expect(() => resolveConfig({ expectedHarnessVersion: '^0.1.1' })).toThrow('exact semantic version')
    expect(() => resolveConfig({ allowedPackagePrefixes: ['bad prefix'] })).toThrow('invalid prefix')
    expect(() => resolveConfig({ maxUploadBytes: 100, maxExpandedBytes: 99 })).toThrow('maxExpandedBytes')
    expect(() => resolveConfig({ maxUploadBytes: 100, maxStoredBytes: 99 })).toThrow('maxStoredBytes')
  })
})
