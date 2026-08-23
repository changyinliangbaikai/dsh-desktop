import { describe, expect, it } from 'vitest'
import { classifyNavigation } from '../src/main/navigation-policy.js'

const ORIGIN = 'http://127.0.0.1:49152'

describe('classifyNavigation', () => {
  it.each([
    'http://127.0.0.1:49152/',
    'http://127.0.0.1:49152/session/abc',
    'http://127.0.0.1:49152/?view=settings',
  ])('keeps the active DSH origin internal: %s', target => {
    expect(classifyNavigation(target, ORIGIN)).toBe('internal')
  })

  it.each([
    'https://example.com/docs',
    'http://127.0.0.1:49153/',
  ])('hands ordinary Web URLs to the external browser: %s', target => {
    expect(classifyNavigation(target, ORIGIN)).toBe('external')
  })

  it.each([
    'file:///C:/Windows/System32/calc.exe',
    'javascript:alert(1)',
    'data:text/html,test',
    'not a url',
  ])('blocks non-Web or malformed navigation: %s', target => {
    expect(classifyNavigation(target, ORIGIN)).toBe('blocked')
  })

  it('blocks all navigation when the configured origin is malformed', () => {
    expect(classifyNavigation('https://example.com', 'not an origin')).toBe('blocked')
  })
})
