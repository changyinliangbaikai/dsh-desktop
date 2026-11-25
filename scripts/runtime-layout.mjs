import { join, resolve } from 'node:path'

export const projectRoot = resolve(import.meta.dirname, '..')
export const linuxArtifacts = join(projectRoot, '..', '.artifacts', 'linux-desktop')

export function runtimeLayout(linuxX64) {
  const packagingRoot = join(projectRoot, 'packaging')
  return {
    resourcesRoot: linuxX64
      ? join(linuxArtifacts, 'runtime')
      : join(projectRoot, 'resources', 'runtime'),
    sourceRoot: join(packagingRoot, linuxX64 ? 'linux-x64' : 'runtime'),
    provenancePath: linuxX64
      ? join(packagingRoot, 'linux-x64', 'runtime-manifest.json')
      : join(packagingRoot, 'runtime-manifest.json'),
  }
}
