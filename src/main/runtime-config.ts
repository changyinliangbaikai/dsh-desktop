import { join } from 'node:path'

export interface RuntimeConfigInput {
  readonly appPath: string
  readonly resourcesPath: string
  readonly userDataPath: string
  readonly defaultWorkspace: string
  readonly isPackaged: boolean
  readonly platform: NodeJS.Platform
  readonly env: NodeJS.ProcessEnv
}

export interface DshLaunchSpec {
  readonly command: string
  readonly args: readonly string[]
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}

function nonEmpty(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized === undefined || normalized.length === 0 ? undefined : normalized
}

/**
 * Resolve the exact Node and DSH paths used by the desktop-managed process.
 * @param input - Electron paths and the inherited process environment.
 * @returns An immutable launch specification for the official Web profile.
 */
export function resolveDshLaunchSpec(input: RuntimeConfigInput): DshLaunchSpec {
  const packagedNode = input.platform === 'win32'
    ? join(input.resourcesPath, 'runtime', 'node', 'node.exe')
    : join(input.resourcesPath, 'runtime', 'node', 'bin', 'node')
  const developmentEntry = join(input.appPath, '..', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js')
  const packagedEntry = join(
    input.resourcesPath,
    'runtime',
    'dsh',
    'node_modules',
    '@deepseek-ai',
    'dsh',
    'lib',
    'bin.js',
  )

  const command = nonEmpty(input.env.DSH_DESKTOP_NODE_PATH)
    ?? (input.isPackaged ? packagedNode : 'node')
  const entry = nonEmpty(input.env.DSH_DESKTOP_ENTRY_PATH)
    ?? (input.isPackaged ? packagedEntry : developmentEntry)
  const cwd = nonEmpty(input.env.DSH_DESKTOP_WORKSPACE) ?? input.defaultWorkspace
  const dshHome = nonEmpty(input.env.DSH_DESKTOP_HOME)
    ?? join(input.userDataPath, 'dsh-home')
  const env: NodeJS.ProcessEnv = { ...input.env, DSH_HOME: dshHome }
  delete env.ELECTRON_RUN_AS_NODE
  if (input.isPackaged) {
    const pathKey = Object.keys(env).find(key => key.toLowerCase() === 'path') ?? 'PATH'
    const nodeBin = input.platform === 'win32'
      ? join(input.resourcesPath, 'runtime', 'node')
      : join(input.resourcesPath, 'runtime', 'node', 'bin')
    const pnpmBin = join(input.resourcesPath, 'runtime', 'dsh', 'node_modules', '.bin')
    const separator = input.platform === 'win32' ? ';' : ':'
    env[pathKey] = [nodeBin, pnpmBin, env[pathKey]].filter(Boolean).join(separator)
  }

  return {
    command,
    args: [entry, 'web', '--no-open', '--host', '127.0.0.1', '--port', '0'],
    cwd,
    env,
  }
}
