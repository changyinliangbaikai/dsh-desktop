import { describe, expect, it, vi } from 'vitest'
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations'
import { ProfilePackageRunner } from '../../src/install/profile-runner.js'
vi.mock('@deepseek-ai/dsh-plugin-manager/operations', () => ({ runPluginCommand: vi.fn() }))
const run = vi.mocked(runPluginCommand)
const profile: ProfileContext = { patchPath: '/patch', startedBundles: [], overlays: [], telemetryDisabledEnv: undefined, name: 'desktop', dir: '/home/profiles/desktop', installAnchor: '/runtime/dsh/package.json', cwd: '/workspace', home: '/home',
  packageManager: { command: '/app/electron', args: ['--expose-internals', '/app/pnpm.mjs'], env: { ELECTRON_RUN_AS_NODE: '1' } },
}

describe('active Profile package operation', () => {
  it('uses the bundled manager, active Profile and mandatory offline/script-disabled flags', async () => {
    run.mockResolvedValueOnce({ exitCode: 0, output: 'done', logPath: '/log', truncated: false })
    const runner = new ProfilePackageRunner(profile, 1000, 1024)
    expect(await runner.add('/archive.tgz', new AbortController().signal)).toMatchObject({ exitCode: 0, stdout: 'done' })
    expect(run).toHaveBeenLastCalledWith(expect.objectContaining({ profile: 'desktop', dir: profile.dir }),
      ['add', '/archive.tgz', '--offline', '--ignore-scripts', '--save-exact'], expect.objectContaining({
        command: '/app/electron', args: profile.packageManager?.args, execution: 'service',
        env: expect.objectContaining({ ELECTRON_RUN_AS_NODE: '1', npm_config_offline: 'true', npm_config_ignore_scripts: 'true' }),
      }))
    await runner.dispose()
  })
  it('preserves command failure and supports an ordinary CLI Profile', async () => {
    const error = new Error('manager failure'); run.mockRejectedValueOnce(error)
    const { packageManager: _ignored, ...plain } = profile
    await expect(new ProfilePackageRunner(plain, 1000, 10).add('/a', new AbortController().signal)).rejects.toBe(error)
  })
  it('rejects cancelled calls and refuses overlapping operations until disposal finishes', async () => {
    const runner = new ProfilePackageRunner(profile, 1000, 10)
    await expect(runner.add('/a', AbortSignal.abort())).rejects.toMatchObject({ code: 'ABORTED' })
    run.mockImplementationOnce((_context, _args, options) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('cancelled')), { once: true })
    }))
    const pending = runner.add('/a', new AbortController().signal)
    const settled = expect(pending).rejects.toMatchObject({ code: 'ABORTED' })
    await expect(runner.add('/b', new AbortController().signal)).rejects.toThrow('already active')
    await runner.dispose(); await settled
  })
  it.each([true, false])('classifies timeout even if the manager %s cancellation rejection', async rejects => {
    run.mockImplementationOnce((_context, _args, options) => new Promise((resolve, reject) => {
      options.signal?.addEventListener('abort', () => rejects ? reject(new Error('timeout')) : resolve({ exitCode: 1, output: '', logPath: '/log', truncated: false }), { once: true })
    }))
    await expect(new ProfilePackageRunner(profile, 5, 10).add('/a', new AbortController().signal)).rejects.toMatchObject({ code: 'INSTALL_TIMEOUT' })
  })
  it('propagates caller cancellation even when the manager resolves', async () => {
    const abort = new AbortController()
    run.mockImplementationOnce(async () => { abort.abort(); return { exitCode: 1, output: '', logPath: '/log', truncated: false } })
    await expect(new ProfilePackageRunner(profile, 1000, 10).add('/a', abort.signal)).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
