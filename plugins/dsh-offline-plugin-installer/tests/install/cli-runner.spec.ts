import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { DshCliRunner, resolveCliEntryPath } from '../../src/install/cli-runner.js'

const fixture = fileURLToPath(new URL('../fixtures/fake-dsh-cli.mjs', import.meta.url))

function runner(mode: string, overrides: { timeoutMs?: number; maxOutputBytes?: number } = {}): DshCliRunner {
  return new DshCliRunner({
    cliEntryPath: fixture,
    profile: 'web',
    profileDir: process.cwd(),
    timeoutMs: overrides.timeoutMs ?? 2_000,
    maxOutputBytes: overrides.maxOutputBytes ?? 1024,
    environment: { ...process.env, FAKE_DSH_CLI_MODE: mode },
  })
}

describe('DshCliRunner', () => {
  it('invokes the current CLI entry with offline and script-disabled arguments', async () => {
    const result = await runner('success').add('/profile/archive.tgz', new AbortController().signal)
    expect(result.exitCode).toBe(0)
    const args = JSON.parse(result.stdout) as string[]
    expect(args).toEqual([
      'plugin', '--profile', 'web', 'add', '/profile/archive.tgz',
      '--offline', '--ignore-scripts', '--save-exact',
    ])
  })

  it('returns a bounded diagnostic tail for a package-manager rejection', async () => {
    const failed = await runner('fail').add('/profile/archive.tgz', new AbortController().signal)
    expect(failed).toMatchObject({ exitCode: 17, timedOut: false })
    expect(failed.stderr).toContain('offline dependency unavailable')

    const bounded = await runner('large-output', { maxOutputBytes: 32 })
      .add('/profile/archive.tgz', new AbortController().signal)
    expect(Buffer.byteLength(bounded.stdout)).toBe(32)
  })

  it('terminates on timeout and external cancellation', async () => {
    await expect(runner('hang', { timeoutMs: 20 }).add(
      '/profile/archive.tgz',
      new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INSTALL_TIMEOUT' })

    const controller = new AbortController()
    const pending = runner('hang').add('/profile/archive.tgz', controller.signal)
    setTimeout(() => { controller.abort(new Error('cancelled')) }, 20)
    await expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
  })

  it('disposes an active process and validates explicit CLI paths', async () => {
    const active = runner('hang')
    const pending = active.add('/profile/archive.tgz', new AbortController().signal)
    await new Promise(resolve => { setTimeout(resolve, 20) })
    await active.dispose()
    await expect(pending).resolves.toMatchObject({ exitCode: null })
    expect(resolveCliEntryPath(fixture)).toBe(fixture)
    expect(() => resolveCliEntryPath('/definitely/missing/dsh-cli.js')).toThrow()
  })
})
