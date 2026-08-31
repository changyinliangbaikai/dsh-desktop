/** Stable browser-facing failure categories. */
export type InstallerErrorCode =
  | 'ABORTED'
  | 'BUSY'
  | 'FORBIDDEN'
  | 'INSTALL_FAILED'
  | 'INSTALL_TIMEOUT'
  | 'INVALID_ARCHIVE'
  | 'INVALID_REQUEST'
  | 'METHOD_NOT_ALLOWED'
  | 'NOT_FOUND'
  | 'PACKAGE_INCOMPATIBLE'
  | 'STORE_FULL'
  | 'UPLOAD_TOO_LARGE'

/** Expected failure with an intentionally bounded public message. */
export class InstallerError extends Error {
  /**
   * @param code - Stable machine-readable category.
   * @param status - HTTP status for the Web route.
   * @param message - User-safe message without local paths or secrets.
   * @param cause - Optional internal failure retained for Host diagnostics.
   */
  constructor(
    readonly code: InstallerErrorCode,
    readonly status: number,
    message: string,
    options: { readonly cause?: unknown } = {},
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause })
    this.name = 'InstallerError'
  }
}

/** Normalize cancellation from streams and subprocesses. */
export function abortedError(cause?: unknown): InstallerError {
  return new InstallerError('ABORTED', 499, 'The installation was cancelled.', { cause })
}

/** Preserve expected failures and hide implementation details from all others. */
export function publicInstallerError(error: unknown): InstallerError {
  if (error instanceof InstallerError) return error
  if (error instanceof Error && error.name === 'AbortError') return abortedError(error)
  return new InstallerError(
    'INSTALL_FAILED',
    500,
    'The offline package could not be installed. Check the DSH Host log for details.',
    { cause: error },
  )
}
