import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

describe('offline installer styles', () => {
  it('uses the published DSH light-and-dark theme aliases for surfaces and borders', async () => {
    const css = await readFile(new URL('../../src/client/styles.css', import.meta.url), 'utf8')
    expect(css).toContain('--dsw-alias-bg-layer-1')
    expect(css).toContain('--dsw-alias-border-l2')
    expect(css).toContain('--dsw-alias-brand-primary-new-colorprimary-new-color')
    expect(css).not.toMatch(/--dsw-alias-(?:surface-secondary|border-subtle|border-strong|accent)\b/u)
  })
})
