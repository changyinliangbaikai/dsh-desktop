import { describe, expect, it } from 'vitest'
import { isTrustedDshPermissionOrigin } from '../src/main/permission-policy.js'

describe('isTrustedDshPermissionOrigin', () => {
  const origin = 'http://127.0.0.1:4567'

  it('trusts the validated DSH origin and its paths', () => {
    expect(isTrustedDshPermissionOrigin(origin, origin)).toBe(true)
    expect(isTrustedDshPermissionOrigin(origin + '/workspace/1', origin)).toBe(true)
  })

  it.each([
    undefined,
    '',
    'not a URL',
    'http://127.0.0.1:4568',
    'http://localhost:4567',
    'https://127.0.0.1:4567',
    'data:text/html,hello',
  ])('denies an untrusted candidate: %s', candidate => {
    expect(isTrustedDshPermissionOrigin(candidate, origin)).toBe(false)
  })

  it('denies an absent or malformed trusted origin', () => {
    expect(isTrustedDshPermissionOrigin(origin, undefined)).toBe(false)
    expect(isTrustedDshPermissionOrigin(origin, 'not a URL')).toBe(false)
    expect(isTrustedDshPermissionOrigin(origin, 'https://127.0.0.1:4567')).toBe(false)
  })
})
