import { describe, expect, it } from 'vitest'
import { en, zh } from '../../src/client/locales.js'

describe('keyless user-visible offline installer copy', () => {
  it('matches the reviewed bilingual safety and restart contract', () => {
    expect({
      tab: { zh: zh.tab, en: en.tab },
      title: { zh: zh.title, en: en.title },
      security: { zh: zh.securityBody, en: en.securityBody },
      dependency: { zh: zh.offlineNote, en: en.offlineNote },
      success: { zh: zh.successBody, en: en.successBody },
    }).toMatchSnapshot()
  })
})
