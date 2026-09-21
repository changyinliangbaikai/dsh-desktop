import { randomBytes } from 'node:crypto'
import type { Context } from '@deepseek-ai/cordis'
import type {} from '@deepseek-ai/dsh-host-webserver'
import type {} from '@deepseek-ai/dsh-client-connection'
import type { InstallerSessionSnapshot } from './api/types.js'
import { Config, resolveConfig, type Config as PluginConfig } from './config.js'
import { createInstallerRoutes } from './http/routes.js'
import { InstallCoordinator } from './install/coordinator.js'
import { DshCliRunner, resolveCliEntryPath } from './install/cli-runner.js'
import { ProfilePackageRunner } from './install/profile-runner.js'
import { OfflinePackageInstaller } from './install/installer.js'
import { ArchiveStore } from './store/archive-store.js'

export const name = 'dsh-offline-plugin-installer'
export const inject = ['webServer', 'connection', 'profileContext']
export { Config }
export type { PluginConfig }

/** Register the loopback installer routes and their shared lifecycle owners. */
export async function apply(ctx: Context, config: PluginConfig): Promise<void> {
  const resolved = resolveConfig(config)
  if (resolved.profileDir !== ctx.profileContext.dir || resolved.profile !== ctx.profileContext.name) {
    throw new Error('dsh-offline-plugin-installer: configured Profile must match the active Profile')
  }
  if (ctx.webServer.host !== '127.0.0.1') {
    throw new Error('dsh-offline-plugin-installer: the mutation route requires a loopback-only Web server')
  }
  const logger = ctx.logger(name)
  const store = new ArchiveStore({
    profileDir: resolved.profileDir,
    storePath: resolved.archiveStorePath,
    maxStoredBytes: resolved.maxStoredBytes,
    maxStoredPackages: resolved.maxStoredPackages,
  })
  await store.initialize()
  const cli = resolved.cliEntryPath === ''
    ? new ProfilePackageRunner(ctx.profileContext, resolved.installTimeoutMs, resolved.maxCliOutputBytes)
    : new DshCliRunner({
    cliEntryPath: resolveCliEntryPath(resolved.cliEntryPath),
    profile: resolved.profile,
    profileDir: resolved.profileDir,
    timeoutMs: resolved.installTimeoutMs,
    maxOutputBytes: resolved.maxCliOutputBytes,
  })
  const coordinator = new InstallCoordinator()
  const installer = new OfflinePackageInstaller(resolved, store, cli, {
    warn: message => { logger.warn(message) },
  })
  const token = randomBytes(32).toString('base64url')
  const session: InstallerSessionSnapshot = {
    token,
    profile: resolved.profile,
    maxUploadBytes: resolved.maxUploadBytes,
    acceptedExtension: '.tgz',
    networkDisabled: true,
    lifecycleScriptsDisabled: true,
  }

  ctx.effect(() => async () => {
    await coordinator.dispose()
    await installer.dispose()
  }, 'dsh-offline-plugin-installer:lifecycle')
  const routes = createInstallerRoutes({
    token,
    session,
    maxUploadBytes: resolved.maxUploadBytes,
    coordinator,
    store,
    installer,
    warn: error => {
      logger.warn(error instanceof Error ? error : new Error(String(error)))
    },
  })
  for (const route of routes) {
    ctx.effect(
      () => ctx.webServer.register({ ...route, handler: (request, response) => {
        const rejection = ctx.connection.requestRejection(request)
        if (rejection !== undefined) { response.writeHead(rejection); response.end(); return }
        return route.handler(request, response)
      } }),
      `dsh-offline-plugin-installer:route:${route.path}`,
    )
  }
}
