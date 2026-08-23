import { spawnSync } from 'node:child_process'

export type ProcessTreeSignal = 'SIGTERM' | 'SIGKILL'

export interface ProcessTreeSignalInternals {
  readonly killGroup: (pid: number, signal: ProcessTreeSignal) => void
  readonly killDirect: (signal: ProcessTreeSignal) => void
  readonly taskkill: (pid: number, force: boolean) => void
}

function defaultTaskkill(pid: number, force: boolean): void {
  spawnSync('taskkill', ['/PID', String(pid), '/T', ...(force ? ['/F'] : [])], {
    stdio: 'ignore',
    windowsHide: true,
  })
}

/**
 * Signal a complete DSH process tree on the current host.
 *
 * POSIX launches DSH as a detached process group, so the negative PID reaches
 * descendants. Windows has no equivalent Node signal API and uses the same
 * taskkill /T boundary as upstream DSH subprocess management.
 * @param platform - Host platform.
 * @param pid - Direct DSH process identifier.
 * @param signal - Graceful or forced escalation tier.
 * @param overrides - Injectable operating-system operations for tests.
 */
export function signalProcessTree(
  platform: NodeJS.Platform,
  pid: number | undefined,
  signal: ProcessTreeSignal,
  overrides: Partial<ProcessTreeSignalInternals> & Pick<ProcessTreeSignalInternals, 'killDirect'>,
): void {
  if (pid === undefined || pid <= 0) return
  const taskkill = overrides.taskkill ?? defaultTaskkill
  if (platform === 'win32') {
    taskkill(pid, signal === 'SIGKILL')
    return
  }

  const killGroup = overrides.killGroup ?? ((groupPid, groupSignal) => {
    process.kill(-groupPid, groupSignal)
  })
  try {
    killGroup(pid, signal)
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code !== 'ESRCH') throw error
    overrides.killDirect(signal)
  }
}
