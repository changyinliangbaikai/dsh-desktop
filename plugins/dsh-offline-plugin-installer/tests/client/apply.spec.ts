// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import { apply, inject, NS } from '../../src/client/index.js'
import { OfflineInstallerPage } from '../../src/client/OfflineInstallerPage.js'

afterEach(() => {
  document.head.querySelectorAll('style[data-plugin-css="dsh-offline-plugin-installer"]')
    .forEach(tag => { tag.remove() })
})

interface TestEntry {
  component: unknown
  options: Record<string, unknown>
}

class TestSlots extends Service {
  readonly records: TestEntry[] = []

  constructor(ctx: Context) {
    super(ctx, 'slots')
  }

  inject(_name: string, register: () => () => void): void {
    this.ctx.effect(register, 'test slot injection')
  }

  register(options: Record<string, unknown>, component: unknown): () => void {
    const entry = { component, options }
    this.records.push(entry)
    return () => { this.records.splice(this.records.indexOf(entry), 1) }
  }
}

describe('offline installer browser client apply', () => {
  it('registers and disposes its localized Plugins tab and inline styles', async () => {
    const ctx = new Context()
    const dictionaries = new Map<string, Record<string, string>>()
    ctx.provide('locale', {
      register(namespace: string, dictionary: { zh: Record<string, string> }) {
        dictionaries.set(namespace, dictionary.zh)
        return () => { dictionaries.delete(namespace) }
      },
      bind(namespace: string) {
        return (key: string) => dictionaries.get(namespace)?.[key] ?? key
      },
    } as never)
    const slots = new TestSlots(ctx)
    expect(inject).toEqual(['slots', 'locale'])
    const fiber = ctx.plugin({ inject: [...inject], apply })
    await fiber

    const entry = slots.records[0]!
    expect(entry.component).toBe(OfflineInstallerPage)
    expect(entry.options).toMatchObject({ id: 'offline-install', order: 20, locale: NS })
    expect((entry.options.label as () => string)()).toBe('离线安装')
    expect(document.head.querySelector('style[data-plugin-css="dsh-offline-plugin-installer"]')).not.toBeNull()
    expect(entry.options.inject).toBeTypeOf('function')

    await fiber.dispose()
    expect(slots.records).toEqual([])
    expect(document.head.querySelector('style[data-plugin-css="dsh-offline-plugin-installer"]')).toBeNull()
    await ctx.fiber.dispose()
  })
})
