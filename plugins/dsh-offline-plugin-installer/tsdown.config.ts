import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { defineConfig, type UserConfig } from 'tsdown'

const PACKAGE_ID = 'dsh-offline-plugin-installer'
const INLINE_CSS_PREFIX = '\0dsh-offline-plugin-installer-css:'
const INLINE_CSS_SUFFIX = '.mjs'

function sourceAssetPath(source: string, importer: string): string {
  const emitted = resolve(dirname(importer), source)
  if (existsSync(emitted)) return emitted
  const marker = `${resolve('lib/types')}/`
  if (!emitted.startsWith(marker)) return emitted
  return resolve('src', emitted.slice(marker.length))
}

const hostExternals = [
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-app-boot',
  '@deepseek-ai/dsh-host-webserver',
  '@deepseek-ai/schemastery',
]

const hostBundle: UserConfig = {
  entry: ['lib/types/index.js'],
  outDir: 'lib',
  format: ['esm'],
  platform: 'node',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: hostExternals,
    onlyBundle: ['tar-stream', 'streamx', 'events-universal', 'fast-fifo', 'b4a', 'text-decoder'],
  },
}

const clientBundle: UserConfig = {
  name: `${PACKAGE_ID}/client`,
  entry: { client: 'lib/types/client/index.js' },
  outDir: 'lib',
  format: 'cjs',
  platform: 'browser',
  target: 'es2024',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  clean: false,
  deps: {
    neverBundle: (specifier: string) => specifier === 'react'
      || specifier === 'react-dom'
      || specifier === 'react/jsx-runtime',
  },
  plugins: [{
    name: 'dsh-offline-plugin-installer-inline-css',
    resolveId(source: string, importer: string | undefined) {
      if (!source.endsWith('.css?inline')) return null
      const stylesheet = source.slice(0, -'?inline'.length)
      const path = importer === undefined ? stylesheet : sourceAssetPath(stylesheet, importer)
      return INLINE_CSS_PREFIX + path + INLINE_CSS_SUFFIX
    },
    async load(id: string) {
      if (!id.startsWith(INLINE_CSS_PREFIX)) return null
      const path = id.slice(INLINE_CSS_PREFIX.length, -INLINE_CSS_SUFFIX.length)
      this.addWatchFile(path)
      return `export default ${JSON.stringify(await readFile(path, 'utf8'))};`
    },
  }],
  outputOptions: {
    entryFileNames: 'client.js',
    banner: `window.__ModuleLoader__.load({ id: ${JSON.stringify(PACKAGE_ID)}, factory: (require) => {`,
    footer: 'return module.exports; } });',
    intro: 'var module = { exports: {} }; var exports = module.exports;',
  },
}

export default defineConfig([hostBundle, clientBundle])
