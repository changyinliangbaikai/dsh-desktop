import { execFileSync } from 'node:child_process'
import { join } from 'node:path'
import { projectRoot } from './runtime-layout.mjs'

if (process.platform !== 'linux' || process.arch !== 'x64') {
  throw new Error('Linux desktop packaging requires a Linux x64 Node process.')
}
const pnpm = process.env.npm_execpath
if (pnpm === undefined) throw new Error('Use pnpm run pack:linux.')
const options = { cwd: projectRoot, stdio: 'inherit' }

execFileSync(process.execPath, ['scripts/verify-embedded-plugin-source.mjs', '--linux-x64'], options)
execFileSync(process.execPath, ['scripts/stage-runtime.mjs', '--linux-x64'], options)
execFileSync(process.execPath, ['scripts/verify-staged-runtime.mjs', '--linux-x64'], options)
execFileSync(process.execPath, [pnpm, 'run', 'build'], options)
execFileSync(process.execPath, [
  pnpm, 'exec', 'electron-builder', '--config', join('packaging', 'linux-x64', 'electron-builder.mjs'),
  '--linux', 'deb', '--x64', '--publish', 'never',
], options)
