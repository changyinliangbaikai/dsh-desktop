/** Browser half: an offline installation tab in the standard Plugins settings section. */
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import { installOfflinePackage, loadInstallerSession } from './api.js'
import { OfflineInstallerPage, type OfflineInstallerPageInjected } from './OfflineInstallerPage.js'
import { en, zh, type OfflineInstallerLocaleKey } from './locales.js'
import styles from './styles.css?inline'

export type { OfflineInstallerPageInjected, OfflineInstallerPageProps } from './OfflineInstallerPage.js'
export type { OfflineInstallerLocaleKey } from './locales.js'
export { ClientInstallError, parseInstallerSession, parseInstallSuccess } from './api.js'

export const NS = 'settings.offlinePluginInstaller'
export const inject = ['slots', 'locale']

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    'settings.offlinePluginInstaller': OfflineInstallerLocaleKey
  }
}

function installStyles(): () => void {
  if (typeof document === 'undefined') return () => {}
  const previous = document.querySelector('style[data-plugin-css="dsh-offline-plugin-installer"]')
  if (previous !== null) return () => {}
  const tag = document.createElement('style')
  tag.dataset.pluginCss = 'dsh-offline-plugin-installer'
  tag.textContent = styles
  document.head.appendChild(tag)
  return () => { tag.remove() }
}

/** Contribute the localized page without importing Host runtime values. */
export function apply(ctx: ClientContext): void {
  ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'offline-plugin-installer: dictionaries')
  ctx.effect(installStyles, 'offline-plugin-installer: styles')
  const t = ctx.locale.bind(NS)
  const injected = (): OfflineInstallerPageInjected => ({
    loadSession: loadInstallerSession,
    installPackage: installOfflinePackage,
  })
  ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
    name: 'settings.plugins.tab',
    id: 'offline-install',
    order: 20,
    label: () => t('tab'),
    locale: NS,
    inject: injected,
  }, OfflineInstallerPage))
}
