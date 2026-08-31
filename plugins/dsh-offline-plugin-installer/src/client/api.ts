import type { InstallerSessionSnapshot, InstallSuccessResponse } from '../api/types.js'
import { INSTALLER_SESSION_ROUTE, INSTALLER_UPLOAD_ROUTE } from '../http/paths.js'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Browser failure with the Host's stable public category. */
export class ClientInstallError extends Error {
  constructor(readonly code: string, message: string) {
    super(message)
    this.name = 'ClientInstallError'
  }
}

/** Parse the untrusted session response from the Host route. */
export function parseInstallerSession(value: unknown): InstallerSessionSnapshot {
  if (!isRecord(value)
    || typeof value.token !== 'string'
    || value.token.length < 32
    || typeof value.profile !== 'string'
    || typeof value.maxUploadBytes !== 'number'
    || value.acceptedExtension !== '.tgz'
    || value.networkDisabled !== true
    || value.lifecycleScriptsDisabled !== true) {
    throw new Error('The installer session response is invalid.')
  }
  return {
    token: value.token,
    profile: value.profile,
    maxUploadBytes: value.maxUploadBytes,
    acceptedExtension: '.tgz',
    networkDisabled: true,
    lifecycleScriptsDisabled: true,
  }
}

/** Parse a successful install response without trusting package metadata fields. */
export function parseInstallSuccess(value: unknown): InstallSuccessResponse {
  if (!isRecord(value) || value.ok !== true || value.restartRequired !== true || !isRecord(value.package)) {
    throw new Error('The installation response is invalid.')
  }
  const summary = value.package
  if (typeof summary.name !== 'string'
    || typeof summary.version !== 'string'
    || typeof summary.sha256 !== 'string'
    || typeof summary.archiveBytes !== 'number'
    || typeof summary.expandedBytes !== 'number'
    || typeof summary.entryCount !== 'number'
    || !Array.isArray(summary.runtimeDependencies)
    || !summary.runtimeDependencies.every(item => typeof item === 'string')
    || !Array.isArray(value.warningCodes)
    || !value.warningCodes.every(code => code === 'RUNTIME_DEPENDENCIES_REQUIRE_OFFLINE_STORE')) {
    throw new Error('The installation response contains invalid package metadata.')
  }
  return {
    ok: true,
    package: {
      name: summary.name,
      version: summary.version,
      sha256: summary.sha256,
      archiveBytes: summary.archiveBytes,
      expandedBytes: summary.expandedBytes,
      entryCount: summary.entryCount,
      runtimeDependencies: summary.runtimeDependencies,
    },
    restartRequired: true,
    warningCodes: value.warningCodes,
  }
}

async function responseValue(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown
  } catch {
    return undefined
  }
}

/** Fetch a fresh per-process token and upload constraints. */
export async function loadInstallerSession(signal: AbortSignal): Promise<InstallerSessionSnapshot> {
  const response = await fetch(INSTALLER_SESSION_ROUTE, {
    method: 'GET',
    headers: { accept: 'application/json' },
    credentials: 'same-origin',
    signal,
  })
  if (!response.ok) throw new Error(`Installer session request failed with HTTP ${String(response.status)}.`)
  return parseInstallerSession(await responseValue(response))
}

/** Upload and install one raw npm tarball through the current session. */
export async function installOfflinePackage(
  file: File,
  session: InstallerSessionSnapshot,
  signal: AbortSignal,
): Promise<InstallSuccessResponse> {
  const response = await fetch(INSTALLER_UPLOAD_ROUTE, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/gzip',
      'x-dsh-installer-token': session.token,
      'x-dsh-plugin-filename': 'offline-plugin.tgz',
    },
    credentials: 'same-origin',
    body: file,
    signal,
  })
  const value = await responseValue(response)
  if (!response.ok) {
    if (isRecord(value) && value.ok === false && isRecord(value.error)
      && typeof value.error.code === 'string' && typeof value.error.message === 'string') {
      throw new ClientInstallError(value.error.code, value.error.message)
    }
    throw new ClientInstallError('HTTP_ERROR', `Offline installation failed with HTTP ${String(response.status)}.`)
  }
  return parseInstallSuccess(value)
}
