import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ClientInstallError,
  installOfflinePackage,
  loadInstallerSession,
  parseInstallerSession,
  parseInstallSuccess,
} from '../../src/client/api.js'

const session = {
  token: 'a'.repeat(43),
  profile: 'web',
  maxUploadBytes: 1024,
  acceptedExtension: '.tgz' as const,
  networkDisabled: true as const,
  lifecycleScriptsDisabled: true as const,
}

const success = {
  ok: true as const,
  package: {
    name: 'dsh-fixture-plugin', version: '1.2.3', sha256: 'b'.repeat(64),
    archiveBytes: 12, expandedBytes: 24, entryCount: 3, runtimeDependencies: [],
  },
  restartRequired: true as const,
  warningCodes: [],
}

afterEach(() => { vi.unstubAllGlobals() })

describe('offline installer browser API', () => {
  it('parses complete session and success responses and rejects malformed values', () => {
    expect(parseInstallerSession(session)).toEqual(session)
    expect(parseInstallSuccess(success)).toEqual(success)
    expect(() => parseInstallerSession({ ...session, token: 'short' })).toThrow('invalid')
    expect(() => parseInstallSuccess({ ...success, package: { name: 1 } })).toThrow('invalid')
  })

  it('loads a same-origin session and uploads a raw file with the mutation token', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(session), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify(success), {
        status: 200, headers: { 'content-type': 'application/json' },
      }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    const loaded = await loadInstallerSession(controller.signal)
    const file = new File(['tgz'], 'plugin.tgz', { type: 'application/gzip' })
    await expect(installOfflinePackage(file, loaded, controller.signal)).resolves.toEqual(success)
    expect(fetchMock).toHaveBeenNthCalledWith(1, '/dsh-offline-plugin-installer/session.json', expect.objectContaining({
      method: 'GET', credentials: 'same-origin',
    }))
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/dsh-offline-plugin-installer/install.tgz', expect.objectContaining({
      method: 'POST', body: file, credentials: 'same-origin',
      headers: expect.objectContaining({ 'x-dsh-installer-token': session.token }),
    }))
  })

  it('preserves public Host errors and contains invalid HTTP responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: false,
      error: { code: 'PACKAGE_INCOMPATIBLE', message: 'peer mismatch' },
    }), { status: 422, headers: { 'content-type': 'application/json' } })))
    await expect(installOfflinePackage(
      new File(['x'], 'plugin.tgz'), session, new AbortController().signal,
    )).rejects.toEqual(new ClientInstallError('PACKAGE_INCOMPATIBLE', 'peer mismatch'))

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('not json', { status: 500 })))
    await expect(loadInstallerSession(new AbortController().signal)).rejects.toThrow('HTTP 500')
  })
})
