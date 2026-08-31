import { describe, expect, it } from 'vitest'
import { InstallerError, publicInstallerError } from '../src/errors.js'

describe('publicInstallerError', () => {
  it('preserves expected errors and contains aborts and unknown failures', () => {
    const expected = new InstallerError('INVALID_REQUEST', 400, 'safe')
    expect(publicInstallerError(expected)).toBe(expected)
    const abort = new DOMException('aborted', 'AbortError')
    expect(publicInstallerError(abort)).toMatchObject({ code: 'ABORTED', status: 499 })
    expect(publicInstallerError(new Error('/private/path secret'))).toMatchObject({
      code: 'INSTALL_FAILED',
      status: 500,
      message: 'The offline package could not be installed. Check the DSH Host log for details.',
    })
  })
})
