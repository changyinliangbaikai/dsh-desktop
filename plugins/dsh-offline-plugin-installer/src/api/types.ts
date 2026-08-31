/** Constraints and anti-CSRF token for the current Host process. */
export interface InstallerSessionSnapshot {
  readonly token: string
  readonly profile: string
  readonly maxUploadBytes: number
  readonly acceptedExtension: '.tgz'
  readonly networkDisabled: true
  readonly lifecycleScriptsDisabled: true
}

/** Manifest facts returned only after a successful CLI installation. */
export interface InstalledPackageSummary {
  readonly name: string
  readonly version: string
  readonly sha256: string
  readonly archiveBytes: number
  readonly expandedBytes: number
  readonly entryCount: number
  readonly runtimeDependencies: readonly string[]
}

/** Successful mutation response. Activation always waits for a restart. */
export interface InstallSuccessResponse {
  readonly ok: true
  readonly package: InstalledPackageSummary
  readonly restartRequired: true
  readonly warningCodes: readonly ('RUNTIME_DEPENDENCIES_REQUIRE_OFFLINE_STORE')[]
}

/** Browser-safe error response. */
export interface InstallErrorResponse {
  readonly ok: false
  readonly error: {
    readonly code: string
    readonly message: string
  }
}
