import { abortedError, InstallerError } from '../errors.js'

/** Serializes upload plus installation and supplies one unload cancellation signal. */
export class InstallCoordinator {
  #activeController: AbortController | undefined
  #activeDone: Promise<void> | undefined

  /** Run one full request or fail before its body is read when another install owns the slot. */
  async run<T>(task: (signal: AbortSignal) => Promise<T>, requestSignal: AbortSignal): Promise<T> {
    if (this.#activeController !== undefined) {
      throw new InstallerError('BUSY', 409, 'Another offline package installation is already running.')
    }
    if (requestSignal.aborted) throw abortedError(requestSignal.reason)
    const controller = new AbortController()
    this.#activeController = controller
    const forwardAbort = (): void => { controller.abort(requestSignal.reason) }
    requestSignal.addEventListener('abort', forwardAbort, { once: true })
    let finish: (() => void) | undefined
    this.#activeDone = new Promise<void>(resolveDone => { finish = resolveDone })
    try {
      return await task(controller.signal)
    } finally {
      requestSignal.removeEventListener('abort', forwardAbort)
      this.#activeController = undefined
      finish?.()
      this.#activeDone = undefined
    }
  }

  /** Cancel and await the active request during plugin unload. */
  async dispose(): Promise<void> {
    this.#activeController?.abort(new Error('Plugin unloaded.'))
    await this.#activeDone
  }
}
