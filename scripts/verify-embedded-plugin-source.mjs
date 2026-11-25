import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { projectRoot, runtimeLayout } from './runtime-layout.mjs'

const pluginRoot = join(projectRoot, 'plugins', 'dsh-offline-plugin-installer')
const linuxX64 = process.argv.includes('--linux-x64')
const runtimeManifestPath = linuxX64
  ? runtimeLayout(true).provenancePath
  : join(projectRoot, 'packaging', 'native-upstream.json')

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function sha512(bytes) {
  return `sha512-${createHash('sha512').update(bytes).digest('base64')}`
}

function verifyArchiveIdentity(pluginSource, runtimePlugin, harnessVersion) {
  const pluginManifest = readJson(join(pluginSource, 'package.json'))
  const pluginLock = readJson(join(pluginSource, 'package-lock.json'))

  if (pluginManifest.name !== 'dsh-offline-plugin-installer') {
    throw new Error(`Unexpected in-tree plugin package name ${String(pluginManifest.name)}.`)
  }
  if (pluginLock.name !== pluginManifest.name
    || pluginLock.version !== pluginManifest.version
    || pluginLock.packages?.['']?.name !== pluginManifest.name
    || pluginLock.packages?.['']?.version !== pluginManifest.version) {
    throw new Error('The in-tree offline plugin package lock does not match its package manifest.')
  }
  const expectedArchive = `${pluginManifest.name}-${pluginManifest.version}.tgz`
  if (runtimePlugin.name !== pluginManifest.name || runtimePlugin.version !== pluginManifest.version
    || runtimePlugin.archive !== expectedArchive) {
    throw new Error('Desktop runtime manifest does not match the in-tree offline plugin identity.')
  }
  if (harnessVersion !== undefined
    && pluginManifest.peerDependencies?.['@deepseek-ai/dsh-app-boot'] !== harnessVersion) {
    throw new Error(`Offline installer ${pluginManifest.version} does not target Harness ${harnessVersion}.`)
  }
}

function runNpm(args, cwd, stdio = 'inherit') {
  const result = spawnSync('npm', args, {
    cwd,
    env: {
      ...process.env,
      npm_config_audit: 'false',
      npm_config_fund: 'false',
      npm_config_update_notifier: 'false',
    },
    stdio,
    shell: process.platform === 'win32',
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`npm ${args[0]} for the in-tree offline plugin exited with ${String(result.status)}.`)
  }
}

function verifyPack(pluginSource, runtimePlugin, temporaryRoot) {
  const expectedArchive = runtimePlugin.archive
  const committedArchivePath = join(projectRoot, 'packaging', 'plugins', expectedArchive)
  if (!existsSync(committedArchivePath)) {
    throw new Error(`Committed in-tree plugin archive is missing: ${expectedArchive}`)
  }
  runNpm(['pack', '--pack-destination', temporaryRoot], pluginSource)
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
    `verify-embedded-plugin-source: ${runtimePlugin.name}@${runtimePlugin.version}, `
    + `${String(generatedArchive.byteLength)} bytes, ${generatedIntegrity}`,
  )
}

const runtimeManifest = readJson(runtimeManifestPath)
if (!Array.isArray(runtimeManifest.embeddedPlugins)) {
  throw new Error('Desktop runtime manifest embeddedPlugins must be an array.')
}
const installers = runtimeManifest.embeddedPlugins.filter(entry => entry?.name === 'dsh-offline-plugin-installer')
if (installers.length !== 1) {
  throw new Error('Desktop runtime manifest must contain exactly one in-tree offline plugin record.')
}
const [installer] = installers
const temporaryRoot = await mkdtemp(join(tmpdir(), 'dsh-desktop-offline-plugin-'))
try {
  if (linuxX64) {
    const { tag, version } = runtimeManifest.deepSeekHarness
    if (installer.profile !== 'web' || tag !== `dsh-v${version}`) {
      throw new Error('The Linux offline installer must target the pinned Harness Web Profile.')
    }
    const retained = runtimeManifest.retainedPluginArchives ?? []
    if (!Array.isArray(retained)) {
      throw new Error('Desktop runtime manifest retainedPluginArchives must be an array.')
    }
    const archives = [{ ...installer, tag }, ...retained]
    for (const [index, record] of archives.entries()) {
      if (typeof record?.tag !== 'string') {
        throw new Error('A Desktop offline plugin archive is missing its Harness release tag.')
      }
      const pluginSource = join(temporaryRoot, `source-${index}`)
      execFileSync(process.execPath, [
        join(pluginRoot, 'scripts', 'materialize-variant.mjs'), record.tag, pluginSource,
      ], { stdio: 'inherit' })
      verifyArchiveIdentity(pluginSource, record, record.tag.slice('dsh-v'.length))
      runNpm(['ci'], pluginSource)
      runNpm(['ls', '--all'], pluginSource, ['ignore', 'ignore', 'inherit'])
      if (index === 0) runNpm(['run', 'check'], pluginSource)
      verifyPack(pluginSource, record, temporaryRoot)
    }
  } else {
    verifyArchiveIdentity(pluginRoot, installer)
    verifyPack(pluginRoot, installer, temporaryRoot)
  }
} finally {
  await rm(temporaryRoot, { recursive: true, force: true })
}
