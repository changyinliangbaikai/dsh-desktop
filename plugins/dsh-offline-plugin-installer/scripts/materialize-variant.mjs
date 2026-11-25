import { execFileSync } from 'node:child_process'
import { cpSync, mkdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const [tag, destination] = process.argv.slice(2)
if (tag === undefined || !/^dsh-v\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(tag)
  || destination === undefined || destination.length === 0) {
  throw new Error('Usage: node scripts/materialize-variant.mjs <dsh-release-tag> <new-directory>')
}

const pluginRoot = resolve(import.meta.dirname, '..')
const baseManifest = JSON.parse(readFileSync(join(pluginRoot, 'package.json'), 'utf8'))
const baseTag = `dsh-v${baseManifest.peerDependencies['@deepseek-ai/dsh-app-boot']}`
const variant = join(pluginRoot, 'compat', tag)
const output = resolve(destination)
mkdirSync(output)
for (const entry of [
  'AGENTS.md', 'LICENSE', 'README.md', 'package.json', 'cordis.patch.yml', 'docs',
  'scripts/clean.mjs', 'src', 'tests', 'tsconfig.json', 'tsconfig.build.json',
  'tsdown.config.ts', 'vitest.config.ts',
]) {
  cpSync(join(pluginRoot, entry), join(output, entry), { recursive: true })
}
if (tag !== baseTag) {
  execFileSync('git', ['apply', '--whitespace=error', join(variant, 'source.patch')], {
    cwd: output,
    stdio: 'inherit',
  })
}
cpSync(join(tag === baseTag ? pluginRoot : variant, 'package-lock.json'), join(output, 'package-lock.json'))
