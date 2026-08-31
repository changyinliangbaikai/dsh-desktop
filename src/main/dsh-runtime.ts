import { spawn, type ChildProcessByStdio } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import type { Readable } from 'node:stream'
import { signalProcessTree } from './process-tree.js'
import { parseDshReadyUrl, redactDshReadyLine } from './ready-url.js'
import type { DshLaunchSpec } from './runtime-config.js'

export type DshRuntimeState = 'idle' | 'starting' | 'ready' | 'stopping' | 'stopped'
export type DshOutputStream = 'stdout' | 'stderr'

export type DshRuntimeEvent =
  | { readonly type: 'state'; readonly state: DshRuntimeState }
  | { readonly type: 'output'; readonly stream: DshOutputStream; readonly line: string }
  | { readonly type: 'exit'; readonly code: number | null; readonly signal: NodeJS.Signals | null }

export interface DshRuntimeOptions {
  readonly launch: DshLaunchSpec
  readonly startupTimeoutMs?: number
  readonly shutdownTimeoutMs?: number
  readonly outputHistoryLimit?: number
  readonly onEvent?: (event: DshRuntimeEvent) => void
}

type DshChild = ChildProcessByStdio<null, Readable, Readable>

function describeExit(code: number | null, signal: NodeJS.Signals | null): string {
  if (signal !== null) return 'signal ' + signal
  return 'exit code ' + String(code)
}

function delay(milliseconds: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, milliseconds)
  })
}

/**
 * Own the lifecycle and ready-line contract of one official DSH Web process.
 */
export class DshRuntime {
  readonly #options: Required<Pick<DshRuntimeOptions, 'startupTimeoutMs' | 'shutdownTimeoutMs' | 'outputHistoryLimit'>>
    & Pick<DshRuntimeOptions, 'launch' | 'onEvent'>
  #child: DshChild | undefined
  #state: DshRuntimeState = 'idle'
  #recentOutput: string[] = []

  /**
   * Create a stopped runtime.
   * @param options - Launch specification, deadlines, and event observer.
   */
  constructor(options: DshRuntimeOptions) {
    this.#options = {
      launch: options.launch,
      startupTimeoutMs: options.startupTimeoutMs ?? 90_000,
      shutdownTimeoutMs: options.shutdownTimeoutMs ?? 5_500,
      outputHistoryLimit: options.outputHistoryLimit ?? 200,
      ...(options.onEvent === undefined ? {} : { onEvent: options.onEvent }),
    }
  }

  /**
   * Current lifecycle state.
   * @returns The runtime state.
   */
  get state(): DshRuntimeState {
    return this.#state
  }

  /**
   * Recent merged stdout/stderr lines for diagnostics.
   * @returns A defensive copy ordered by observation time.
   */
  getRecentOutput(): readonly string[] {
    return [...this.#recentOutput]
  }

  /**
   * Start DSH and wait for its validated authenticated Web URL.
   * @returns The trusted loopback bootstrap URL, including its one-time token.
   */
  async start(): Promise<string> {
    if (this.#state !== 'idle' && this.#state !== 'stopped') {
      throw new Error('Cannot start DSH while runtime state is ' + this.#state + '.')
    }

    this.#transition('starting')
    try {
      const dshHome = this.#options.launch.env.DSH_HOME
      if (dshHome !== undefined && dshHome.length > 0) mkdirSync(dshHome, { recursive: true })
      mkdirSync(this.#options.launch.cwd, { recursive: true })
    } catch (error) {
      this.#transition('stopped')
      const reason = error instanceof Error ? error.message : String(error)
      throw new Error('Failed to prepare DSH runtime directories: ' + reason, { cause: error })
    }
    const child = spawn(this.#options.launch.command, [...this.#options.launch.args], {
      cwd: this.#options.launch.cwd,
      env: this.#options.launch.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      detached: process.platform !== 'win32',
    })
    this.#child = child

    return await new Promise<string>((resolve, reject) => {
      let settled = false
      let stdoutBuffer = ''
      let stderrBuffer = ''

      const settleFailure = (error: Error): void => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        reject(error)
      }

      const consume = (stream: DshOutputStream, chunk: Buffer): void => {
        const combined = (stream === 'stdout' ? stdoutBuffer : stderrBuffer) + chunk.toString('utf8')
        const lines = combined.split(/\r?\n/u)
        const remainder = lines.pop() ?? ''
        if (stream === 'stdout') stdoutBuffer = remainder
        else stderrBuffer = remainder

        for (const line of lines) {
          this.#recordOutput(stream, redactDshReadyLine(line))
          if (stream !== 'stdout' || settled) continue
          try {
            const readyUrl = parseDshReadyUrl(line)
            if (readyUrl === undefined) continue
            settled = true
            clearTimeout(timer)
            this.#transition('ready')
            resolve(readyUrl)
          } catch (error) {
            settleFailure(error instanceof Error ? error : new Error(String(error)))
            void this.stop()
          }
        }
      }

      const timer = setTimeout(() => {
        settleFailure(new Error('DSH did not emit a Web ready URL within '
          + String(this.#options.startupTimeoutMs) + 'ms.'))
        void this.stop()
      }, this.#options.startupTimeoutMs)

      child.stdout.on('data', (chunk: Buffer) => {
        consume('stdout', chunk)
      })
      child.stderr.on('data', (chunk: Buffer) => {
        consume('stderr', chunk)
      })
      child.once('error', error => {
        this.#child = undefined
        this.#transition('stopped')
        settleFailure(new Error('Failed to start DSH: ' + error.message, { cause: error }))
      })
      child.once('exit', (code, signal) => {
        if (stdoutBuffer.length > 0) this.#recordOutput('stdout', stdoutBuffer)
        if (stderrBuffer.length > 0) this.#recordOutput('stderr', stderrBuffer)
        this.#child = undefined
        this.#transition('stopped')
        this.#emit({ type: 'exit', code, signal })
        settleFailure(new Error('DSH exited before becoming ready with ' + describeExit(code, signal) + '.'))
      })
    })
  }

  /**
   * Ask DSH to stop, then force termination after the shutdown deadline.
   */
  async stop(): Promise<void> {
    const child = this.#child
    if (child === undefined || child.exitCode !== null || child.signalCode !== null) {
      this.#child = undefined
      this.#transition('stopped')
      return
    }

    this.#transition('stopping')
    const exited = new Promise<void>(resolve => {
      child.once('exit', () => {
        resolve()
      })
    })

    this.#signal(child, 'SIGTERM')
    const graceful = await Promise.race([
      exited.then(() => true),
      delay(this.#options.shutdownTimeoutMs).then(() => false),
    ])
    if (graceful) return

    this.#signal(child, 'SIGKILL')
    await exited
  }

  #signal(child: DshChild, signal: 'SIGTERM' | 'SIGKILL'): void {
    signalProcessTree(process.platform, child.pid, signal, {
      killDirect: directSignal => {
        child.kill(directSignal)
      },
    })
  }

  #recordOutput(stream: DshOutputStream, line: string): void {
    const record = '[' + stream + '] ' + line
    this.#recentOutput.push(record)
    const overflow = this.#recentOutput.length - this.#options.outputHistoryLimit
    if (overflow > 0) this.#recentOutput.splice(0, overflow)
    this.#emit({ type: 'output', stream, line })
  }

  #transition(state: DshRuntimeState): void {
    if (this.#state === state) return
    this.#state = state
    this.#emit({ type: 'state', state })
  }

  #emit(event: DshRuntimeEvent): void {
    this.#options.onEvent?.(event)
  }
}
