import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { describe, expect, it } from 'vitest'

const projectRoot = fileURLToPath(new URL('../../', import.meta.url))

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

function filesBelow(directory: string): string[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).flatMap(entry => {
    const path = join(directory, entry)
    return statSync(path).isDirectory() ? filesBelow(path) : [path]
  })
}

describe('DSH offline installer package structure', () => {
  const packageJson = readJson(join(projectRoot, 'package.json'))

  it('declares independent Host, Web client, patch, and exact peer surfaces', () => {
    expect(packageJson).toMatchObject({
      name: 'dsh-offline-plugin-installer',
      version: '0.1.3',
      type: 'module',
      main: './lib/index.js',
      types: './lib/types/index.d.ts',
      dsh: {
        bundle: { patch: './cordis.patch.yml' },
        client: {
          inject: [
            '@deepseek-ai/dsh-client-ui-renderer',
            '@deepseek-ai/dsh-client-ui-settings',
            '@deepseek-ai/dsh-client-locale',
          ],
          platform: 'web',
        },
      },
    })
    expect(packageJson.dependencies).toBeUndefined()
    expect(packageJson.peerDependencies).toMatchObject({
      '@deepseek-ai/cordis': '4.0.2',
      '@deepseek-ai/dsh-app-boot': '0.1.2-rc.1',
      '@deepseek-ai/dsh-host-webserver': '0.1.2-rc.1',
    })
  })

  it('builds loader-safe Host and browser entries with tar parsing self-contained', async () => {
    for (const path of [
      'lib/index.js', 'lib/client.js',
      'lib/types/index.d.ts', 'lib/types/client/index.d.ts',
    ]) {
      expect(existsSync(join(projectRoot, path)), `missing ${path}`).toBe(true)
    }
    const host = readFileSync(join(projectRoot, 'lib/index.js'), 'utf8')
    expect(host).not.toMatch(/from\s+["']tar-stream["']/u)
    const imported = await import(pathToFileURL(join(projectRoot, 'lib/index.js')).href)
    expect(imported).toMatchObject({ name: 'dsh-offline-plugin-installer', apply: expect.any(Function) })
    expect('default' in imported).toBe(false)

    const client = readFileSync(join(projectRoot, 'lib/client.js'), 'utf8')
    expect(client).toContain('window.__ModuleLoader__.load({')
    expect(client).toContain('id: "dsh-offline-plugin-installer"')
    expect(client).toContain('data-plugin-css')
    expect(client).toContain('.dopi-page')
    expect(client).toContain('return module.exports;')
    const requires = [...client.matchAll(/require\((['"])(.*?)\1\)/gu)].map(match => match[2]).sort()
    expect(requires).toEqual(['react', 'react/jsx-runtime'])
  })

  it('ships every declared runtime surface in the packed tarball', () => {
    const result = spawnSync('npm', ['pack', '--json', '--dry-run', '--ignore-scripts'], {
      cwd: projectRoot,
      encoding: 'utf8',
    })
    expect(result.status, result.stderr || result.stdout).toBe(0)
    const report = JSON.parse(result.stdout) as { files: { path: string }[] }[]
    const files = report[0]?.files.map(entry => entry.path) ?? []
    for (const expected of [
      'package.json', 'lib/index.js', 'lib/index.js.map', 'lib/client.js', 'lib/client.js.map',
      'lib/types/index.d.ts', 'lib/types/client/index.d.ts', 'cordis.patch.yml',
      'README.md', 'LICENSE', 'docs/security.md', 'docs/verification.md',
    ]) {
      expect(files, `packed archive missing ${expected}`).toContain(expected)
    }
    expect(files.some(path => path.startsWith('src/'))).toBe(false)
    expect(files.some(path => path.startsWith('tests/'))).toBe(false)
  })

  it('keeps complete conservative defaults and reviewable production files', () => {
    const patch = readFileSync(join(projectRoot, 'cordis.patch.yml'), 'utf8')
    for (const fragment of [
      'id: dsh-offline-plugin-installer',
      'profile: web',
      'maxUploadBytes: 268435456',
      'installTimeoutMs: 300000',
      'expectedHarnessVersion: 0.1.2-rc.1',
      'expectedCordisVersion: 4.0.2',
    ]) expect(patch).toContain(fragment)

    const candidates = [
      ...filesBelow(join(projectRoot, 'src')).filter(path => /\.(?:ts|tsx)$/u.test(path)),
      ...filesBelow(join(projectRoot, 'scripts')).filter(path => path.endsWith('.mjs')),
    ]
    const oversized = candidates.flatMap(path => {
      const lines = readFileSync(path, 'utf8').trimEnd().split(/\r?\n/u).length
      return lines > 500 ? [`${relative(projectRoot, path)}: ${String(lines)} lines`] : []
    })
    expect(oversized, `Files over 500 lines:\n${oversized.join('\n')}`).toEqual([])
  })
})
