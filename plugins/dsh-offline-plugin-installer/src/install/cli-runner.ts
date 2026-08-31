import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { statSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import type { Readable } from 'node:stream'
import { abortedError, InstallerError } from '../errors.js'

type CliChild = ChildProcessByStdio<null, Readable, Readable>

/** Bounded process result retained only for Host diagnostics. */
export interface CliResult {
  readonly exitCode: number | null
  readonly signal: NodeJS.Signals | null
  readonly stdout: string
  readonly stderr: string
  readonly timedOut: boolean
}

/** Inputs for invoking the same published DSH CLI that owns plugin reconciliation. */
export interface CliRunnerOptions {
  readonly cliEntryPath: string
  readonly profile: string
  readonly profileDir: string
  readonly timeoutMs: number
  readonly maxOutputBytes: number
  readonly platform?: NodeJS.Platform
  readonly executablePath?: string
  readonly environment?: NodeJS.ProcessEnv
}

class TailBuffer {
  readonly #limit: number
  #chunks: Buffer[] = []
  #bytes = 0

  constructor(limit: number) {
    this.#limit = limit
  }

  push(chunk: Buffer): void {
    this.#chunks.push(Buffer.from(chunk))
    this.#bytes += chunk.byteLength
    while (this.#bytes > this.#limit && this.#chunks.length > 0) {
      const first = this.#chunks[0]
      if (first === undefined) break
      const overflow = this.#bytes - this.#limit
      if (first.byteLength <= overflow) {
        this.#chunks.shift()
        this.#bytes -= first.byteLength
      } else {
        this.#chunks[0] = first.subarray(overflow)
        this.#bytes -= overflow
      }
    }
  }

  text(): string {
    return Buffer.concat(this.#chunks).toString('utf8')
  }
}

/** Resolve and validate the current or explicitly configured DSH CLI entry. */
export function resolveCliEntryPath(configured: string): string {
  const candidate = configured === '' ? process.argv[1] : configured
  if (candidate === undefined || candidate.trim().length === 0) {
    throw new Error('dsh-offline-plugin-installer: the current DSH CLI entry could not be identified')
  }
  const path = isAbsolute(candidate) ? candidate : resolve(candidate)
  const info = statSync(path)
  if (!info.isFile()) throw new Error('dsh-offline-plugin-installer: cliEntryPath is not a regular file')
  return path
}

async function terminateProcessTree(
  child: CliChild,
  platform: NodeJS.Platform,
): Promise<void> {
  const pid = child.pid
  if (pid === undefined || child.exitCode !== null || child.signalCode !== null) return
  if (platform === 'win32') {
    await new Promise<void>(resolveTaskkill => {
      const killer = spawn('taskkill', ['/pid', String(pid), '/t', '/f'], {
        stdio: 'ignore',
        windowsHide: true,
      })
      killer.once('error', () => {
        child.kill('SIGKILL')
        resolveTaskkill()
      })
      killer.once('exit', () => { resolveTaskkill() })
    })
    return
  }
  try {
    process.kill(-pid, 'SIGTERM')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGTERM')
  }
  await new Promise(resolveDelay => { setTimeout(resolveDelay, 1_500) })
  if (child.exitCode !== null || child.signalCode !== null) return
  try {
    process.kill(-pid, 'SIGKILL')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') child.kill('SIGKILL')
  }
}

/** Own at most one recursive DSH CLI process and its cancellation lifecycle. */
export class DshCliRunner {
  readonly #options: Required<Pick<CliRunnerOptions, 'platform' | 'executablePath' | 'environment'>>
    & Omit<CliRunnerOptions, 'platform' | 'executablePath' | 'environment'>
  #activeChild: CliChild | undefined
  #activeDone: Promise<void> | undefined

  constructor(options: CliRunnerOptions) {
    this.#options = {
      ...options,
      platform: options.platform ?? process.platform,
      executablePath: options.executablePath ?? process.execPath,
      environment: options.environment ?? process.env,
    }
  }

  /** Add one persistent local tarball with network and lifecycle scripts disabled. */
  async add(archivePath: string, signal: AbortSignal): Promise<CliResult> {
    if (signal.aborted) throw abortedError(signal.reason)
    if (this.#activeChild !== undefined) throw new Error('dsh-offline-plugin-installer: CLI runner is already active')
    const args = [
      this.#options.cliEntryPath,
      'plugin',
      '--profile',
      this.#options.profile,
      'add',
      archivePath,
      '--offline',
      '--ignore-scripts',
      '--save-exact',
    ]
    const child = spawn(this.#options.executablePath, args, {
      cwd: this.#options.profileDir,
      env: {
        ...this.#options.environment,
        npm_config_offline: 'true',
        PNPM_CONFIG_OFFLINE: 'true',
        npm_config_ignore_scripts: 'true',
        PNPM_CONFIG_IGNORE_SCRIPTS: 'true',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: this.#options.platform !== 'win32',
    })
    this.#activeChild = child
    const stdout = new TailBuffer(this.#options.maxOutputBytes)
    const stderr = new TailBuffer(this.#options.maxOutputBytes)
    child.stdout.on('data', (chunk: Buffer) => { stdout.push(chunk) })
    child.stderr.on('data', (chunk: Buffer) => { stderr.push(chunk) })

    let timedOut = false
    let externallyAborted = false
    const timeout = setTimeout(() => {
      timedOut = true
      void terminateProcessTree(child, this.#options.platform)
    }, this.#options.timeoutMs)
    const onAbort = (): void => {
      externallyAborted = true
      void terminateProcessTree(child, this.#options.platform)
    }
    signal.addEventListener('abort', onAbort, { once: true })

    const done = new Promise<void>(resolveDone => {
      child.once('close', () => { resolveDone() })
      child.once('error', () => { resolveDone() })
    })
    this.#activeDone = done
    try {
      const result = await new Promise<CliResult>((resolveResult, reject) => {
        child.once('error', error => {
          reject(new InstallerError(
            'INSTALL_FAILED',
            500,
            'The DSH plugin manager could not be started.',
            { cause: error },
          ))
        })
        child.once('close', (exitCode, exitSignal) => {
          resolveResult({
            exitCode,
            signal: exitSignal,
            stdout: stdout.text(),
            stderr: stderr.text(),
            timedOut,
          })
        })
      })
      if (externallyAborted) throw abortedError(signal.reason)
      if (timedOut) {
        throw new InstallerError('INSTALL_TIMEOUT', 504, 'The offline package installation timed out.')
      }
      return result
    } finally {
      clearTimeout(timeout)
      signal.removeEventListener('abort', onAbort)
      this.#activeChild = undefined
      this.#activeDone = undefined
    }
  }

  /** Stop an active package manager tree before Cordis unload completes. */
  async dispose(): Promise<void> {
    const child = this.#activeChild
    if (child === undefined) return
    await terminateProcessTree(child, this.#options.platform)
    await this.#activeDone
  }
}
