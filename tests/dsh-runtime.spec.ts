import { fileURLToPath } from 'node:url'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  DshRuntime,
  type DshRuntimeEvent,
} from '../src/main/dsh-runtime.js'

const fixture = fileURLToPath(new URL('./fixtures/fake-dsh.mjs', import.meta.url))

function runtimeFor(
  mode: string,
  options: {
    readonly startupTimeoutMs?: number
    readonly shutdownTimeoutMs?: number
    readonly outputHistoryLimit?: number
    readonly events?: DshRuntimeEvent[]
  } = {},
): DshRuntime {
  return new DshRuntime({
    launch: {
      command: process.execPath,
      args: [fixture],
      cwd: process.cwd(),
      env: { ...process.env, FAKE_DSH_MODE: mode },
    },
    startupTimeoutMs: options.startupTimeoutMs ?? 1_000,
    shutdownTimeoutMs: options.shutdownTimeoutMs ?? 100,
    outputHistoryLimit: options.outputHistoryLimit ?? 20,
    ...(options.events === undefined
      ? {}
      : { onEvent: event => options.events?.push(event) }),
  })
}

describe('DshRuntime', () => {
  it('assembles partial output, reaches ready, records events, and stops gracefully', async () => {
    const events: DshRuntimeEvent[] = []
    const runtime = runtimeFor('ready', { events })

    await expect(runtime.start()).resolves.toBe('http://127.0.0.1:4567')
    expect(runtime.state).toBe('ready')
    await expect(runtime.start()).rejects.toThrow('Cannot start DSH')

    await runtime.stop()

    expect(runtime.state).toBe('stopped')
    expect(runtime.getRecentOutput()).toContain('[stdout] dsh web: http://127.0.0.1:4567')
    expect(events).toContainEqual({ type: 'state', state: 'ready' })
    expect(events).toContainEqual({
      type: 'output',
      stream: 'stderr',
      line: 'graceful stop',
    })
  })

  it('reports an early process exit with captured stderr', async () => {
    const runtime = runtimeFor('early-exit')

    await expect(runtime.start()).rejects.toThrow('exit code 23')
    expect(runtime.state).toBe('stopped')
    expect(runtime.getRecentOutput()).toContain('[stderr] profile failed')
    await expect(runtime.stop()).resolves.toBeUndefined()
  })

  it('reports a process spawn failure and returns to stopped', async () => {
    const runtime = new DshRuntime({
      launch: {
        command: '/definitely/missing/dsh-node',
        args: [],
        cwd: process.cwd(),
        env: process.env,
      },
      startupTimeoutMs: 100,
    })

    await expect(runtime.start()).rejects.toThrow('Failed to start DSH')
    expect(runtime.state).toBe('stopped')
  })

  it('reports an unusable DSH home and returns to stopped before spawning', async () => {
    const root = mkdtempSync(join(tmpdir(), 'dsh-desktop-home-error-'))
    const blocker = join(root, 'not-a-directory')
    writeFileSync(blocker, 'x')
    const runtime = new DshRuntime({
      launch: {
        command: process.execPath,
        args: [fixture],
        cwd: process.cwd(),
        env: { ...process.env, DSH_HOME: join(blocker, 'home') },
      },
    })

    try {
      await expect(runtime.start()).rejects.toThrow('Failed to prepare DSH runtime directories')
      expect(runtime.state).toBe('stopped')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('rejects an unsafe ready URL and stops the process', async () => {
    const runtime = runtimeFor('remote-url')

    await expect(runtime.start()).rejects.toThrow('outside the accepted loopback origin')
    await vi.waitFor(() => {
      expect(runtime.state).toBe('stopped')
    })
  })

  it('times out a silent process and stops it', async () => {
    const runtime = runtimeFor('silent', { startupTimeoutMs: 25 })

    await expect(runtime.start()).rejects.toThrow('within 25ms')
    await vi.waitFor(() => {
      expect(runtime.state).toBe('stopped')
    })
  })

  it('forces a process that ignores the graceful signal', async () => {
    const runtime = runtimeFor('ignore-term', { shutdownTimeoutMs: 20 })

    await expect(runtime.start()).resolves.toBe('http://127.0.0.1:4567')
    await expect(runtime.stop()).resolves.toBeUndefined()
    expect(runtime.state).toBe('stopped')
  })

  it('caps recent diagnostic output', async () => {
    const runtime = runtimeFor('ready', { outputHistoryLimit: 1 })

    await runtime.start()
    await runtime.stop()

    expect(runtime.getRecentOutput()).toHaveLength(1)
  })
})
