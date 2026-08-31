import { describe, expect, it } from 'vitest'
import { InstallCoordinator } from '../../src/install/coordinator.js'

describe('InstallCoordinator', () => {
  it('rejects concurrent work and becomes reusable after completion', async () => {
    const coordinator = new InstallCoordinator()
    let release: (() => void) | undefined
    const first = coordinator.run(async () => new Promise<string>(resolve => { release = () => { resolve('done') } }), new AbortController().signal)
    await Promise.resolve()
    await expect(coordinator.run(async () => 'second', new AbortController().signal))
      .rejects.toMatchObject({ code: 'BUSY' })
    release?.()
    await expect(first).resolves.toBe('done')
    await expect(coordinator.run(async () => 'again', new AbortController().signal)).resolves.toBe('again')
  })

  it('forwards request cancellation and unload cancellation', async () => {
    const coordinator = new InstallCoordinator()
    const request = new AbortController()
    const cancelled = coordinator.run(async signal => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    }), request.signal)
    request.abort(new Error('request closed'))
    await expect(cancelled).rejects.toThrow('request closed')

    const unload = coordinator.run(async signal => new Promise<void>((_resolve, reject) => {
      signal.addEventListener('abort', () => { reject(signal.reason) }, { once: true })
    }), new AbortController().signal)
    await coordinator.dispose()
    await expect(unload).rejects.toThrow('Plugin unloaded')
  })
})
