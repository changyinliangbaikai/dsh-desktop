import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const runtimeRoot = join(projectRoot, 'resources', 'runtime')
const provenance = JSON.parse(readFileSync(join(projectRoot, 'packaging', 'runtime-manifest.json'), 'utf8'))
const required = [
  join(runtimeRoot, 'STAGED'),
  process.platform === 'win32'
    ? join(runtimeRoot, 'node', 'node.exe')
    : join(runtimeRoot, 'node', 'bin', 'node'),
  join(runtimeRoot, 'dsh', 'node_modules', '@deepseek-ai', 'dsh', 'lib', 'bin.js'),
  join(runtimeRoot, 'dsh', 'node_modules', 'pnpm', 'bin', 'pnpm.mjs'),
]

const missing = required.filter(path => !existsSync(path))
if (missing.length > 0) {
  throw new Error('Staged runtime is incomplete:\n' + missing.map(path => '- ' + path).join('\n'))
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
for (const plugin of provenance.embeddedPlugins) {
  const archivePath = join(runtimeRoot, 'plugins', plugin.archive)
  if (!existsSync(archivePath)) throw new Error('Embedded plugin archive is missing: ' + plugin.archive)
  const actualIntegrity = 'sha512-' + createHash('sha512').update(readFileSync(archivePath)).digest('base64')
  if (actualIntegrity !== plugin.integrity) {
    throw new Error('Embedded plugin archive failed integrity verification: ' + plugin.archive)
  }
}

console.log('verify-staged-runtime: complete DSH ' + installed.version + ' runtime and '
  + String(provenance.embeddedPlugins.length) + ' embedded plugin archive(s) found')
