/** Use the published operation shared by `dsh plugin`, with the active launcher. */
import type { ProfileContext } from '@deepseek-ai/dsh-app-boot'
import { runPluginCommand } from '@deepseek-ai/dsh-plugin-manager/operations'
import { abortedError, InstallerError } from '../errors.js'
import type { CliResult } from './cli-runner.js'

export class ProfilePackageRunner {
  private active: { abort: AbortController; done: Promise<CliResult> } | undefined

  constructor(private readonly profile: ProfileContext, private readonly timeoutMs: number, private readonly outputBytes: number) {}

  add(archive: string, signal: AbortSignal): Promise<CliResult> {
    if (signal.aborted) return Promise.reject(abortedError(signal.reason))
    if (this.active !== undefined) return Promise.reject(new Error('Package operation already active'))
    const abort = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => { timedOut = true; abort.abort() }, this.timeoutMs)
    const done = (async (): Promise<CliResult> => {
      try {
        const invocation = this.profile.packageManager
        const result = await runPluginCommand({ ...this.profile, profile: this.profile.name },
          ['add', archive, '--offline', '--ignore-scripts', '--save-exact'], {
            ...invocation, execution: 'service', outputBytes: this.outputBytes,
            env: { ...invocation?.env, npm_config_offline: 'true', PNPM_CONFIG_OFFLINE: 'true',
              npm_config_ignore_scripts: 'true', PNPM_CONFIG_IGNORE_SCRIPTS: 'true' },
            signal: AbortSignal.any([signal, abort.signal]),
          })
        if (timedOut) throw new InstallerError('INSTALL_TIMEOUT', 504, 'The offline package installation timed out.')
        if (signal.aborted || abort.signal.aborted) throw abortedError(signal.reason)
        return { exitCode: result.exitCode, signal: null, stdout: result.output, stderr: '', timedOut: false }
      } catch (error) {
        if (timedOut) throw new InstallerError('INSTALL_TIMEOUT', 504, 'The offline package installation timed out.')
        if (signal.aborted || abort.signal.aborted) throw abortedError(signal.reason)
        throw error
      } finally { clearTimeout(timer); this.active = undefined }
    })()
    this.active = { abort, done }
    return done
  }

  async dispose(): Promise<void> {
    const active = this.active
    if (active === undefined) return
    active.abort.abort()
    await active.done.catch(() => undefined)
  }
}
