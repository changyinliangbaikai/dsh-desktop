import type { IncomingMessage, ServerResponse } from 'node:http'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import type {
  InstallerSessionSnapshot,
  InstallErrorResponse,
  InstallSuccessResponse,
} from '../api/types.js'
import { InstallerError, publicInstallerError } from '../errors.js'
import { InstallCoordinator } from '../install/coordinator.js'
import { OfflinePackageInstaller } from '../install/installer.js'
import { ArchiveStore } from '../store/archive-store.js'
import { INSTALLER_SESSION_ROUTE, INSTALLER_UPLOAD_ROUTE } from './paths.js'
import { hasArchiveContentType, hasTgzFilename, isTrustedBrowserRequest, matchesToken } from './security.js'
import { writeUpload } from './upload.js'

export { INSTALLER_SESSION_ROUTE, INSTALLER_UPLOAD_ROUTE } from './paths.js'

/** Host dependencies for the two exact loopback routes. */
export interface InstallerRouteDependencies {
  readonly token: string
  readonly session: InstallerSessionSnapshot
  readonly maxUploadBytes: number
  readonly coordinator: Pick<InstallCoordinator, 'run'>
  readonly store: Pick<ArchiveStore, 'createIncomingPath' | 'discardIncoming'>
  readonly installer: Pick<OfflinePackageInstaller, 'install'>
  warn(error: unknown): void
}

function sendJson(
  request: IncomingMessage,
  response: ServerResponse,
  status: number,
  value: InstallerSessionSnapshot | InstallSuccessResponse | InstallErrorResponse,
  extraHeaders: Record<string, string> = {},
): void {
  const body = Buffer.from(JSON.stringify(value))
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    ...extraHeaders,
  })
  response.end(request.method === 'HEAD' ? undefined : body)
}

function sendError(
  request: IncomingMessage,
  response: ServerResponse,
  error: InstallerError,
  extraHeaders: Record<string, string> = {},
): void {
  sendJson(request, response, error.status, {
    ok: false,
    error: { code: error.code, message: error.message },
  }, extraHeaders)
}

function admitTrusted(request: IncomingMessage, response: ServerResponse): boolean {
  if (isTrustedBrowserRequest(request)) return true
  sendError(request, response, new InstallerError('FORBIDDEN', 403, 'This request is not allowed.'))
  return false
}

async function serveSession(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: InstallerRouteDependencies,
): Promise<void> {
  if (!admitTrusted(request, response)) return
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendError(
      request,
      response,
      new InstallerError('METHOD_NOT_ALLOWED', 405, 'This endpoint accepts GET only.'),
      { allow: 'GET, HEAD' },
    )
    return
  }
  sendJson(request, response, 200, dependencies.session)
}

async function serveInstall(
  request: IncomingMessage,
  response: ServerResponse,
  dependencies: InstallerRouteDependencies,
): Promise<void> {
  if (!admitTrusted(request, response)) return
  if (request.method !== 'POST') {
    sendError(
      request,
      response,
      new InstallerError('METHOD_NOT_ALLOWED', 405, 'This endpoint accepts POST only.'),
      { allow: 'POST' },
    )
    return
  }
  if (!matchesToken(request, dependencies.token)) {
    sendError(request, response, new InstallerError('FORBIDDEN', 403, 'The installation session has expired.'))
    return
  }
  if (!hasTgzFilename(request) || !hasArchiveContentType(request)) {
    sendError(
      request,
      response,
      new InstallerError('INVALID_REQUEST', 400, 'Choose one npm .tgz package and try again.'),
    )
    return
  }

  const requestController = new AbortController()
  const onAborted = (): void => { requestController.abort(new Error('Upload connection closed.')) }
  const onResponseClose = (): void => {
    if (!response.writableEnded) requestController.abort(new Error('Response connection closed.'))
  }
  request.once('aborted', onAborted)
  response.once('close', onResponseClose)
  try {
    const result = await dependencies.coordinator.run(async signal => {
      const incomingPath = dependencies.store.createIncomingPath()
      try {
        await writeUpload(request, incomingPath, dependencies.maxUploadBytes, signal)
        return await dependencies.installer.install(incomingPath, signal)
      } finally {
        await dependencies.store.discardIncoming(incomingPath)
      }
    }, requestController.signal)
    sendJson(request, response, 200, result)
  } catch (error) {
    const publicError = publicInstallerError(error)
    if (publicError.code === 'BUSY') request.resume()
    if (publicError.code === 'INSTALL_FAILED' && !(error instanceof InstallerError)) {
      dependencies.warn(error)
    }
    if (!response.headersSent && !response.destroyed) sendError(request, response, publicError)
  } finally {
    request.off('aborted', onAborted)
    response.off('close', onResponseClose)
  }
}

/** Create the session and upload routes without registering them globally. */
export function createInstallerRoutes(dependencies: InstallerRouteDependencies): readonly WebRoute[] {
  return [
    {
      kind: 'exact',
      path: INSTALLER_SESSION_ROUTE,
      handler: (request, response) => serveSession(request, response, dependencies),
    },
    {
      kind: 'exact',
      path: INSTALLER_UPLOAD_ROUTE,
      handler: (request, response) => serveInstall(request, response, dependencies),
    },
  ]
}
