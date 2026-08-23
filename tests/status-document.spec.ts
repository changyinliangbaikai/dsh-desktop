import { describe, expect, it } from 'vitest'
import { renderStatusDocument, toDataUrl } from '../src/main/status-document.js'

describe('renderStatusDocument', () => {
  it('escapes every user-controlled field and emits a restrictive CSP', () => {
    const document = renderStatusDocument({
      title: '<title>',
      heading: '<img src=x>',
      message: '"message" & more',
      detail: "'detail' </pre>",
      tone: 'error',
    })

    expect(document).toContain('&lt;title&gt;')
    expect(document).toContain('&lt;img src=x&gt;')
    expect(document).toContain('&quot;message&quot; &amp; more')
    expect(document).toContain('&#39;detail&#39; &lt;/pre&gt;')
    expect(document).toContain("default-src &#39;none&#39;")
    expect(document).not.toContain('<img src=x>')
  })

  it('omits the diagnostic block when no detail exists', () => {
    const document = renderStatusDocument({
      title: 'Loading',
      heading: 'Loading',
      message: 'Please wait',
      tone: 'loading',
    })

    expect(document).not.toContain('<pre>')
    expect(document).toContain('#56c7ff')
  })
})

describe('toDataUrl', () => {
  it('encodes the complete document as UTF-8 data', () => {
    expect(toDataUrl('<h1>中文</h1>')).toBe(
      'data:text/html;charset=UTF-8,%3Ch1%3E%E4%B8%AD%E6%96%87%3C%2Fh1%3E',
    )
  })
})
