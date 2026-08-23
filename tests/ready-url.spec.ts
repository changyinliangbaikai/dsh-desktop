import { describe, expect, it } from 'vitest'
import { parseDshReadyUrl } from '../src/main/ready-url.js'

describe('parseDshReadyUrl', () => {
  it('extracts the official loopback ready origin from a log line', () => {
    expect(parseDshReadyUrl('prefix dsh web: http://127.0.0.1:49152'))
      .toBe('http://127.0.0.1:49152')
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
    'dsh web: http://127.0.0.1:49152/?query=1',
    'dsh web: http://127.0.0.1:49152/#fragment',
  ])('rejects an unsafe ready line: %s', line => {
    expect(() => parseDshReadyUrl(line)).toThrow()
  })
})
