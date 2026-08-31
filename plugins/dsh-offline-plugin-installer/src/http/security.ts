import { timingSafeEqual } from 'node:crypto'
import type { IncomingMessage } from 'node:http'

function singleHeader(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function isLoopback(hostname: string): boolean {
  return hostname === '127.0.0.1' || hostname === 'localhost' || hostname === '[::1]'
}

/** Accept only same-origin requests whose HTTP authority is loopback. */
export function isTrustedBrowserRequest(request: IncomingMessage): boolean {
  const authority = singleHeader(request.headers.host)
  if (authority === undefined) return false
  let host: URL
  try {
    host = new URL(`http://${authority}`)
  } catch {
    return false
  }
  if (host.host !== authority || !isLoopback(host.hostname)) return false
  if (singleHeader(request.headers['sec-fetch-site']) === 'cross-site') return false
  const origin = singleHeader(request.headers.origin)
  if (origin === undefined) return true
  try {
    const parsed = new URL(origin)
    return parsed.protocol === 'http:' && parsed.host === host.host && parsed.origin === origin
  } catch {
    return false
  }
}

/** Compare the per-process mutation token without early-exit byte differences. */
export function matchesToken(request: IncomingMessage, expected: string): boolean {
  const supplied = singleHeader(request.headers['x-dsh-installer-token'])
  if (supplied === undefined) return false
  const suppliedBytes = Buffer.from(supplied)
  const expectedBytes = Buffer.from(expected)
  return suppliedBytes.byteLength === expectedBytes.byteLength
    && timingSafeEqual(suppliedBytes, expectedBytes)
}

/** Validate the advisory browser filename without using it as a filesystem path. */
export function hasTgzFilename(request: IncomingMessage): boolean {
  const filename = singleHeader(request.headers['x-dsh-plugin-filename'])
  return filename !== undefined && filename.length <= 255 && filename.toLowerCase().endsWith('.tgz')
}

/** Accept only raw gzip/octet-stream bodies; multipart parsing is deliberately absent. */
export function hasArchiveContentType(request: IncomingMessage): boolean {
  const header = singleHeader(request.headers['content-type'])
  if (header === undefined) return false
  const mediaType = header.split(';', 1)[0]?.trim().toLowerCase()
  return mediaType === 'application/gzip'
    || mediaType === 'application/x-gzip'
    || mediaType === 'application/octet-stream'
}
