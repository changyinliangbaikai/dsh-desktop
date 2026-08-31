import type { IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import {
  hasArchiveContentType,
  hasTgzFilename,
  isTrustedBrowserRequest,
  matchesToken,
} from '../../src/http/security.js'

function request(headers: IncomingMessage['headers']): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('HTTP request security predicates', () => {
  it('accepts only loopback same-origin authorities', () => {
    expect(isTrustedBrowserRequest(request({ host: '127.0.0.1:1234' }))).toBe(true)
    expect(isTrustedBrowserRequest(request({
      host: 'localhost:1234', origin: 'http://localhost:1234', 'sec-fetch-site': 'same-origin',
    }))).toBe(true)
    expect(isTrustedBrowserRequest(request({}))).toBe(false)
    expect(isTrustedBrowserRequest(request({ host: ['127.0.0.1'] as never }))).toBe(false)
    expect(isTrustedBrowserRequest(request({ host: 'bad host' }))).toBe(false)
    expect(isTrustedBrowserRequest(request({ host: '192.168.1.2:1234' }))).toBe(false)
    expect(isTrustedBrowserRequest(request({ host: '127.0.0.1:1234', 'sec-fetch-site': 'cross-site' }))).toBe(false)
    expect(isTrustedBrowserRequest(request({
      host: '127.0.0.1:1234', origin: 'https://attacker.example',
    }))).toBe(false)
    expect(isTrustedBrowserRequest(request({ host: '127.0.0.1:1234', origin: 'not a url' }))).toBe(false)
  })

  it('validates token, advisory filename, and raw archive media type', () => {
    const token = 'a'.repeat(43)
    expect(matchesToken(request({ 'x-dsh-installer-token': token }), token)).toBe(true)
    expect(matchesToken(request({}), token)).toBe(false)
    expect(matchesToken(request({ 'x-dsh-installer-token': 'short' }), token)).toBe(false)
    expect(matchesToken(request({ 'x-dsh-installer-token': [token] }), token)).toBe(false)

    expect(hasTgzFilename(request({ 'x-dsh-plugin-filename': 'PLUGIN.TGZ' }))).toBe(true)
    expect(hasTgzFilename(request({ 'x-dsh-plugin-filename': 'plugin.zip' }))).toBe(false)
    expect(hasTgzFilename(request({ 'x-dsh-plugin-filename': 'x'.repeat(256) + '.tgz' }))).toBe(false)

    for (const value of ['application/gzip', 'application/x-gzip', 'application/octet-stream; charset=binary']) {
      expect(hasArchiveContentType(request({ 'content-type': value }))).toBe(true)
    }
    expect(hasArchiveContentType(request({}))).toBe(false)
    expect(hasArchiveContentType(request({ 'content-type': 'text/plain' }))).toBe(false)
  })
})
