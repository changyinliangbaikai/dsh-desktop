import type { InstalledPackageSummary, InstallSuccessResponse } from '../api/types.js'
import { inspectArchive, type ArchivePolicy } from '../archive/inspect.js'
import { InstallerError } from '../errors.js'
import { ArchiveStore } from '../store/archive-store.js'
import { DshCliRunner } from './cli-runner.js'

/** Minimal logger face used to retain package-manager diagnostics on the Host only. */
export interface InstallerLogger {
  warn(message: string): void
}

/** Validate, persist, install, and finalize one already bounded request body. */
export class OfflinePackageInstaller {
  constructor(
    private readonly policy: ArchivePolicy,
    private readonly store: ArchiveStore,
    private readonly cli: DshCliRunner,
    private readonly logger: InstallerLogger,
  ) {}

  /** Install one archive through the official DSH CLI. */
  async install(incomingPath: string, signal: AbortSignal): Promise<InstallSuccessResponse> {
    const inspection = await inspectArchive(incomingPath, this.policy, signal)
    const reservation = await this.store.promote(incomingPath, inspection)
    try {
      const result = await this.cli.add(reservation.archivePath, signal)
      if (result.exitCode !== 0) {
        const diagnostic = [result.stdout, result.stderr]
          .filter(value => value.length > 0)
          .join('\n')
        this.logger.warn(
          `dsh-offline-plugin-installer: DSH CLI failed with exit ${String(result.exitCode)}${diagnostic.length === 0 ? '' : `\n${diagnostic}`}`,
        )
        throw new InstallerError(
          'INSTALL_FAILED',
          422,
          'The package manager rejected this offline package. Its dependencies may be missing from the offline store.',
        )
      }
      await reservation.commit()
      const summary: InstalledPackageSummary = {
        name: inspection.name,
        version: inspection.version,
        sha256: inspection.sha256,
        archiveBytes: inspection.archiveBytes,
        expandedBytes: inspection.expandedBytes,
        entryCount: inspection.entryCount,
        runtimeDependencies: inspection.runtimeDependencies,
      }
      return {
        ok: true,
        package: summary,
        restartRequired: true,
        warningCodes: inspection.runtimeDependencies.length === 0
          ? []
          : ['RUNTIME_DEPENDENCIES_REQUIRE_OFFLINE_STORE'],
      }
    } catch (error) {
      await reservation.rollback()
      throw error
    }
  }

  /** Stop the subprocess layer during unload. */
  async dispose(): Promise<void> {
    await this.cli.dispose()
  }
}
