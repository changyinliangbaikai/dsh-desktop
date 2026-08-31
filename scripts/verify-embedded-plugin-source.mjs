import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const pluginRoot = join(projectRoot, 'plugins', 'dsh-offline-plugin-installer')
const pluginManifestPath = join(pluginRoot, 'package.json')
const pluginLockPath = join(pluginRoot, 'package-lock.json')
const runtimeManifestPath = join(projectRoot, 'packaging', 'runtime-manifest.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha512(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

const pluginManifest = readJson(pluginManifestPath)
const pluginLock = readJson(pluginLockPath)
const runtimeManifest = readJson(runtimeManifestPath)

if (pluginManifest.name !== 'dsh-offline-plugin-installer') {
  throw new Error(`Unexpected in-tree plugin package name ${String(pluginManifest.name)}.`)
}
if (pluginLock.name !== pluginManifest.name
  || pluginLock.version !== pluginManifest.version
  || pluginLock.packages?.['']?.name !== pluginManifest.name
  || pluginLock.packages?.['']?.version !== pluginManifest.version) {
  throw new Error('The in-tree offline plugin package lock does not match its package manifest.')
}
if (!Array.isArray(runtimeManifest.embeddedPlugins)) {
  throw new Error('Desktop runtime manifest embeddedPlugins must be an array.')
}
const matches = runtimeManifest.embeddedPlugins.filter(entry => entry?.name === pluginManifest.name)
if (matches.length !== 1) {
  throw new Error('Desktop runtime manifest must contain exactly one in-tree offline plugin record.')
}
const [runtimePlugin] = matches
const expectedArchive = `${pluginManifest.name}-${pluginManifest.version}.tgz`
if (runtimePlugin.version !== pluginManifest.version || runtimePlugin.archive !== expectedArchive) {
  throw new Error('Desktop runtime manifest does not match the in-tree offline plugin identity.')
}

const committedArchivePath = join(projectRoot, 'packaging', 'plugins', expectedArchive)
if (!existsSync(committedArchivePath)) {
  throw new Error(`Committed in-tree plugin archive is missing: ${expectedArchive}`)
}

const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-offline-plugin-'))
try {
  const packed = spawnSync('npm', ['pack', '--pack-destination', temporaryRoot], {
    cwd: pluginRoot,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (packed.error) throw packed.error
  if (packed.status !== 0) {
    throw new Error(`npm pack for the in-tree offline plugin exited with ${String(packed.status)}.`)
  }

  const generatedArchive = readFileSync(join(temporaryRoot, expectedArchive))
  const committedArchive = readFileSync(committedArchivePath)
  const generatedIntegrity = sha512(generatedArchive)
  const committedIntegrity = sha512(committedArchive)
  if (!generatedArchive.equals(committedArchive)) {
    throw new Error(
      `Committed ${expectedArchive} is not reproducible from the in-tree source `
      + `(generated ${generatedIntegrity}, committed ${committedIntegrity}).`,
    )
  }
  if (runtimePlugin.integrity !== generatedIntegrity) {
    throw new Error(
      `Desktop runtime manifest integrity ${String(runtimePlugin.integrity)} does not match ${generatedIntegrity}.`,
    )
  }

  console.log(
    `verify-embedded-plugin-source: ${pluginManifest.name}@${pluginManifest.version}, `
    + `${String(generatedArchive.byteLength)} bytes, ${generatedIntegrity}`,
  )
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
