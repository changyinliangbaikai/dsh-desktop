import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { runtimeLayout } from './runtime-layout.mjs'

const linuxX64 = process.argv.includes('--linux-x64')
const { resourcesRoot: runtimeRoot, provenancePath } = runtimeLayout(linuxX64)
const sourceManifest = readFileSync(provenancePath)
const provenance = JSON.parse(sourceManifest)
const required = [
  join(runtimeRoot, 'STAGED'),
  !linuxX64 && process.platform === 'win32'
    ? join(runtimeRoot, 'node', 'node.exe')
    : join(runtimeRoot, 'node', 'bin', 'node'),
  join(runtimeRoot, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  join(runtimeRoot, 'dsh', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
]

const missing = required.filter(path => !existsSync(path))
if (missing.length > 0) {
  throw new Error('Staged runtime is incomplete:\n' + missing.map(path => '- ' + path).join('\n'))
}
if (linuxX64 && !readFileSync(join(runtimeRoot, 'runtime-manifest.json')).equals(sourceManifest)) {
  throw new Error('Staged Linux runtime manifest does not match the pinned source manifest.')
}

const installed = JSON.parse(readFileSync(
  join(runtimeRoot, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'package.json'),
  'utf8',
))
if (installed.version !== provenance.deepSeekHarness.version) {
  throw new Error('Staged DSH is ' + installed.version + ', expected ' + provenance.deepSeekHarness.version + '.')
}

if (!Array.isArray(provenance.embeddedPlugins)) {
  throw new Error('Runtime manifest embeddedPlugins must be an array.')
}
const retainedArchives = provenance.retainedPluginArchives ?? []
if (!Array.isArray(retainedArchives)) {
  throw new Error('Runtime manifest retainedPluginArchives must be an array.')
}
for (const plugin of [...provenance.embeddedPlugins, ...retainedArchives]) {
  const archivePath = join(runtimeRoot, 'plugins', plugin.archive)
  if (!existsSync(archivePath)) throw new Error('Plugin archive is missing: ' + plugin.archive)
  const actualIntegrity = 'sha512-' + createHash('sha512').update(readFileSync(archivePath)).digest('base64')
  if (actualIntegrity !== plugin.integrity) {
    throw new Error('Plugin archive failed integrity verification: ' + plugin.archive)
  }
}

console.log('verify-staged-runtime: complete DSH ' + installed.version + ' runtime, '
  + String(provenance.embeddedPlugins.length) + ' embedded plugin archive(s), and '
  + String(retainedArchives.length) + ' retained archive(s) found')
