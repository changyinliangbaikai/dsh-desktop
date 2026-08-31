import { mkdtemp, readFile, rm } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PassThrough } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { writeUpload } from '../../src/http/upload.js'

let directory: string

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-offline-upload-'))
})

afterEach(async () => {
  await rm(directory, { recursive: true, force: true })
})

function incoming(body: string, contentLength?: string): IncomingMessage {
  const stream = new PassThrough() as PassThrough & IncomingMessage
  Object.defineProperty(stream, 'headers', {
    value: contentLength === undefined ? {} : { 'content-length': contentLength },
  })
  queueMicrotask(() => { stream.end(body) })
  return stream
}

describe('writeUpload', () => {
  it('writes and hashes a bounded body', async () => {
    const path = join(directory, 'upload.tgz')
    const result = await writeUpload(incoming('tgz', '3'), path, 10, new AbortController().signal)
    expect(result).toMatchObject({ bytes: 3 })
    expect(result.sha256).toMatch(/^[a-f0-9]{64}$/u)
    expect(await readFile(path, 'utf8')).toBe('tgz')
  })

  it('rejects malformed, declared-large, streamed-large, empty, and cancelled bodies', async () => {
    await expect(writeUpload(
      incoming('x', 'invalid'), join(directory, 'invalid.tgz'), 10, new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    await expect(writeUpload(
      incoming('large', '5'), join(directory, 'declared.tgz'), 2, new AbortController().signal,
    )).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    await expect(writeUpload(
      incoming('large'), join(directory, 'streamed.tgz'), 2, new AbortController().signal,
    )).rejects.toMatchObject({ code: 'UPLOAD_TOO_LARGE' })
    await expect(writeUpload(
      incoming('', '0'), join(directory, 'empty.tgz'), 2, new AbortController().signal,
    )).rejects.toMatchObject({ code: 'INVALID_REQUEST' })
    const controller = new AbortController()
    controller.abort()
    await expect(writeUpload(
      incoming('x'), join(directory, 'aborted.tgz'), 2, controller.signal,
    )).rejects.toMatchObject({ code: 'ABORTED' })
  })
})
