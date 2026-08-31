import { describe, expect, it } from 'vitest'
import { parseDshReadyUrl, redactDshReadyLine } from '../src/main/ready-url.js'

const token = 'A'.repeat(43)

describe('parseDshReadyUrl', () => {
  it('extracts the official authenticated loopback URL from a log line', () => {
    expect(parseDshReadyUrl(`prefix dsh web: http://127.0.0.1:49152/?token=${token}`))
      .toBe(`http://127.0.0.1:49152/?token=${token}`)
  })

  it('redacts the bootstrap token from diagnostic output', () => {
    const line = `dsh web: http://127.0.0.1:49152/?token=${token}`
    expect(redactDshReadyLine(line))
      .toBe('dsh web: http://127.0.0.1:49152/?token=<redacted>')
    expect(redactDshReadyLine('ordinary output token=visible')).toBe('ordinary output token=visible')
  })

  it('does not expose a rejected bootstrap token in its error', () => {
    expect(() => parseDshReadyUrl(`dsh web: http://127.0.0.1:49152/?token=${token}&extra=1`))
      .toThrow('token=<redacted>')
  })

  it('ignores unrelated output', () => {
    expect(parseDshReadyUrl('loader ready')).toBeUndefined()
  })

  it.each([
    'dsh web: ',
    'dsh web: not-a-url',
    'dsh web: https://127.0.0.1:49152',
    'dsh web: http://localhost:49152',
    'dsh web: http://0.0.0.0:49152',
    'dsh web: http://127.0.0.1',
    'dsh web: http://127.0.0.1:0',
    'dsh web: http://user@127.0.0.1:49152',
    'dsh web: http://127.0.0.1:49152/path',
    'dsh web: http://127.0.0.1:49152/',
    'dsh web: http://127.0.0.1:49152/?query=1',
    `dsh web: http://127.0.0.1:49152/?token=${'A'.repeat(42)}`,
    `dsh web: http://127.0.0.1:49152/?token=${token}&extra=1`,
    `dsh web: http://127.0.0.1:49152/?token=${token}&token=${token}`,
    `dsh web: http://127.0.0.1:49152/?token=${token}#fragment`,
  ])('rejects an unsafe ready line: %s', line => {
    expect(() => parseDshReadyUrl(line)).toThrow(/authenticated loopback surface|empty|invalid/u)
  })
})
