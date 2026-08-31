import { createHash } from 'node:crypto'
import { createWriteStream } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { Transform } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { abortedError, InstallerError } from '../errors.js'

/** Facts measured while streaming the compressed request body to disk. */
export interface UploadResult {
  readonly bytes: number
  readonly sha256: string
}

/** Write a request body once while enforcing the compressed-byte ceiling. */
export async function writeUpload(
  request: IncomingMessage,
  path: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<UploadResult> {
  const declared = request.headers['content-length']
  if (declared !== undefined) {
    if (!/^\d+$/u.test(declared)) {
      throw new InstallerError('INVALID_REQUEST', 400, 'The upload Content-Length is invalid.')
    }
    if (Number(declared) > maxBytes) {
      throw new InstallerError('UPLOAD_TOO_LARGE', 413, 'The uploaded package exceeds the configured size limit.')
    }
  }
  const hash = createHash('sha256')
  let bytes = 0
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytes += chunk.byteLength
      if (bytes > maxBytes) {
        callback(new InstallerError(
          'UPLOAD_TOO_LARGE',
          413,
          'The uploaded package exceeds the configured size limit.',
        ))
        return
      }
      hash.update(chunk)
      callback(null, chunk)
    },
  })
  try {
    await pipeline(
      request,
      limiter,
      createWriteStream(path, { flags: 'wx', mode: 0o600 }),
      { signal },
    )
  } catch (error) {
    if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
      throw abortedError(error)
    }
    throw error
  }
  if (bytes === 0) throw new InstallerError('INVALID_REQUEST', 400, 'The uploaded package is empty.')
  return { bytes, sha256: hash.digest('hex') }
}
