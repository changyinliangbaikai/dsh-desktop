import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../', import.meta.url))
const buildRoot = join(projectRoot, 'build')

function iconSizes(path: string): number[] {
  const bytes = readFileSync(path)
  expect(bytes.readUInt16LE(0)).toBe(0)
  expect(bytes.readUInt16LE(2)).toBe(1)
  const count = bytes.readUInt16LE(4)
  const sizes: number[] = []
  for (let index = 0; index < count; index += 1) {
    const offset = 6 + index * 16
    const width = bytes[offset]
    const height = bytes[offset + 1]
    if (width === undefined || height === undefined) throw new Error('ICO directory is truncated.')
    expect(height).toBe(width)
    sizes.push(width === 0 ? 256 : width)
  }
  return sizes.sort((left, right) => left - right)
}

describe('packaging assets', () => {
  it('wires the official DeepSeek whale into application and installer packages', () => {
    const svg = readFileSync(join(buildRoot, 'icon-source.svg'), 'utf8')
    expect(svg).toContain('viewBox="0 0 50 50"')
    expect(svg).toContain('fill="#4D6BFE"')

    const png = readFileSync(join(buildRoot, 'icon.png'))
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(1024)
    expect(png.readUInt32BE(20)).toBe(1024)
    expect(iconSizes(join(buildRoot, 'icon.ico'))).toEqual([16, 24, 32, 48, 64, 128, 256])
    expect(readFileSync(join(buildRoot, 'icon.icns')).subarray(0, 4).toString()).toBe('icns')

    const config = readFileSync(join(projectRoot, 'electron-builder.yml'), 'utf8')
    expect(config).toContain('mac:\n  icon: build/icon.icns')
    expect(config).toContain('win:\n  icon: build/icon.ico')
    expect(config).toContain('installerIcon: build/icon.ico')
    expect(config).toContain('uninstallerIcon: build/icon.ico')
    expect(config).toContain('  - from: build/icon.ico\n    to: tray-icon.ico')
  })

  it('commits the exact reviewed offline installer archive used by CI staging', () => {
    const manifest = JSON.parse(readFileSync(join(projectRoot, 'packaging', 'native-upstream.json'), 'utf8'))
    const plugin = manifest.embeddedPlugins[0]
    const sourceRoot = join(projectRoot, 'plugins', 'dsh-offline-plugin-installer')
    const sourceManifest = JSON.parse(readFileSync(join(sourceRoot, 'package.json'), 'utf8'))
    const sourceLock = JSON.parse(readFileSync(join(sourceRoot, 'package-lock.json'), 'utf8'))
    expect(sourceManifest).toMatchObject({ name: plugin.name, version: plugin.version })
    expect(sourceLock).toMatchObject({ name: plugin.name, version: plugin.version })
    expect(sourceLock.packages['']).toMatchObject({ name: plugin.name, version: plugin.version })
    expect(existsSync(join(sourceRoot, '.git'))).toBe(false)
    const archivePath = join(projectRoot, 'packaging', 'plugins', plugin.archive)
    expect(existsSync(archivePath)).toBe(true)
    expect(statSync(archivePath).isFile()).toBe(true)
    const integrity = `sha512-${createHash('sha512').update(readFileSync(archivePath)).digest('base64')}`
    expect(integrity).toBe(plugin.integrity)
  })

  it('packages the published Harness release and the reviewed Web installer for Linux amd64', () => {
    const linuxRoot = join(projectRoot, 'packaging', 'linux-x64')
    const manifest = JSON.parse(readFileSync(join(linuxRoot, 'runtime-manifest.json'), 'utf8'))
    const runtime = JSON.parse(readFileSync(join(linuxRoot, 'package.json'), 'utf8'))
    const [plugin] = manifest.embeddedPlugins
    expect(manifest.target).toBe('linux-x64')
    expect(manifest.deepSeekHarness.version).toBe(runtime.dependencies['@deepseek-ai/dsh'])
    expect(manifest.deepSeekHarness.tag).toBe(`dsh-v${manifest.deepSeekHarness.version}`)
    expect(manifest.deepSeekHarness.commit).toMatch(/^[0-9a-f]{40}$/u)
    expect(manifest.pnpm).toBe(runtime.dependencies.pnpm)
    expect(manifest.embeddedPlugins).toHaveLength(1)
    expect(plugin).toMatchObject({ name: 'dsh-offline-plugin-installer', profile: 'web' })
    const archive = readFileSync(join(projectRoot, 'packaging', 'plugins', plugin.archive))
    expect(`sha512-${createHash('sha512').update(archive).digest('base64')}`).toBe(plugin.integrity)
    expect(readFileSync(join(linuxRoot, 'pnpm-lock.yaml'), 'utf8')).toContain(manifest.deepSeekHarness.npmIntegrity)

    const config = JSON.parse(execFileSync(process.execPath, ['--input-type=module', '--eval',
      'import config from "./packaging/linux-x64/electron-builder.mjs"; console.log(JSON.stringify(config))',
    ], { cwd: projectRoot, encoding: 'utf8' }))
    expect(config.linux.target).toEqual([{ target: 'deb', arch: ['x64'] }])
    expect(config.linux.syncDesktopName).toBe(true)
    expect(config.extraMetadata.version).toBe(manifest.desktopVersion)
    expect(config.extraMetadata.desktopName).toBe('harness-desktop.desktop')
    expect(config.files).toEqual(['dist/main/**/*.js', 'package.json'])
    expect(config.extraResources).toEqual([{
      from: join(projectRoot, '..', '.artifacts', 'linux-desktop', 'runtime'),
      to: 'runtime',
      filter: expect.arrayContaining([
        '!dsh/node_modules/.modules.yaml',
        '!dsh/node_modules/.pnpm-workspace-state-v1.json',
      ]),
    }])
  })

  it('retains the original installer archive at the file dependency used by existing Linux Profiles', () => {
    const packagingRoot = join(projectRoot, 'packaging')
    const manifest = JSON.parse(readFileSync(join(packagingRoot, 'linux-x64', 'runtime-manifest.json'), 'utf8'))
    const originalArchive = 'dsh-offline-plugin-installer-0.9.0.tgz'
    expect(manifest.embeddedPlugins.map((plugin: { archive: string }) => plugin.archive)).not.toContain(originalArchive)
    expect(manifest.retainedPluginArchives).toHaveLength(1)
    const [retained] = manifest.retainedPluginArchives
    expect(retained).toMatchObject({
      name: 'dsh-offline-plugin-installer',
      version: '0.9.0',
      tag: 'dsh-v0.2.1-rc.3',
      archive: originalArchive,
      integrity: 'sha512-Ma0QudmVgsNRr+YZj2Quo65ytVrvkK/h0rcdNGX9p6rYqcR/uT+Ht7vitIXkc2Jg/qFzREGT781Sg9soedN/ww==',
    })
    const archive = readFileSync(join(packagingRoot, 'plugins', originalArchive))
    expect(`sha512-${createHash('sha512').update(archive).digest('base64')}`).toBe(retained.integrity)
  })
})
