import { describe, expect, it, vi } from 'vitest'
import { signalProcessTree } from '../src/main/process-tree.js'

describe('signalProcessTree', () => {
  it('uses taskkill tree mode on Windows and escalates with force', () => {
    const taskkill = vi.fn()
    const killDirect = vi.fn()

    signalProcessTree('win32', 42, 'SIGTERM', { killDirect, taskkill })
    signalProcessTree('win32', 42, 'SIGKILL', { killDirect, taskkill })

    expect(taskkill).toHaveBeenNthCalledWith(1, 42, false)
    expect(taskkill).toHaveBeenNthCalledWith(2, 42, true)
    expect(killDirect).not.toHaveBeenCalled()
  })

  it('contains a missing taskkill executable like an already-exited tree', () => {
    expect(() => {
      signalProcessTree('win32', 0x7FFFFFFF, 'SIGTERM', { killDirect: vi.fn() })
    }).not.toThrow()
  })

  it('signals a detached POSIX process group', () => {
    const killGroup = vi.fn()
    const killDirect = vi.fn()

    signalProcessTree('linux', 91, 'SIGTERM', { killDirect, killGroup })

    expect(killGroup).toHaveBeenCalledWith(91, 'SIGTERM')
    expect(killDirect).not.toHaveBeenCalled()
  })

  it('uses process.kill for the default POSIX group signal', () => {
    const processKill = vi.spyOn(process, 'kill').mockReturnValue(true)
    const killDirect = vi.fn()

    try {
      signalProcessTree('linux', 92, 'SIGTERM', { killDirect })

      expect(processKill).toHaveBeenCalledWith(-92, 'SIGTERM')
      expect(killDirect).not.toHaveBeenCalled()
    } finally {
      processKill.mockRestore()
    }
  })

  it('falls back to the direct child when the group is already absent', () => {
    const killDirect = vi.fn()
    const missingGroup = Object.assign(new Error('missing'), { code: 'ESRCH' })

    signalProcessTree('darwin', 73, 'SIGKILL', {
      killDirect,
      killGroup: () => { throw missingGroup },
    })

    expect(killDirect).toHaveBeenCalledWith('SIGKILL')
  })

  it('does not hide permission failures or signal invalid PIDs', () => {
    const killDirect = vi.fn()
    const denied = Object.assign(new Error('denied'), { code: 'EPERM' })
    expect(() => {
      signalProcessTree('linux', 5, 'SIGTERM', {
        killDirect,
        killGroup: () => { throw denied },
      })
    }).toThrow(denied)

    signalProcessTree('linux', undefined, 'SIGTERM', { killDirect })
    signalProcessTree('linux', 0, 'SIGTERM', { killDirect })
    expect(killDirect).not.toHaveBeenCalled()
  })
})
