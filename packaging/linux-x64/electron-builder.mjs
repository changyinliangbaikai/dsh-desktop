import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { linuxArtifacts, runtimeLayout } from '../../scripts/runtime-layout.mjs'

const { provenancePath, resourcesRoot } = runtimeLayout(true)
const { desktopVersion } = JSON.parse(readFileSync(provenancePath, 'utf8'))

export default {
  appId: 'io.github.changyinliangbaikai.dsh-desktop.linux',
  productName: 'Harness Desktop',
  artifactName: 'Harness-Desktop-${version}-linux-x86_64.${ext}',
  directories: { output: join(linuxArtifacts, 'release') },
  asar: true,
  npmRebuild: false,
  extraMetadata: {
    name: 'harness-desktop',
    version: desktopVersion,
    desktopName: 'harness-desktop.desktop',
    description: 'Desktop application for the official DeepSeek Harness Web profile.',
    homepage: 'https://github.com/changyinliangbaikai/dsh-desktop',
  },
  files: ['dist/main/**/*.js', 'package.json'],
  extraResources: [{
    from: resourcesRoot,
    to: 'runtime',
    filter: [
      '**/*',
      '!dsh/node_modules/.modules.yaml',
      '!dsh/node_modules/.pnpm-workspace-state-v1.json',
    ],
  }],
  linux: {
    executableName: 'harness-desktop',
    syncDesktopName: true,
    icon: 'build/icon.png',
    category: 'Development',
    target: [{ target: 'deb', arch: ['x64'] }],
  },
  deb: {
    packageName: 'harness-desktop',
    maintainer: 'Dsh-Desktop',
  },
}
