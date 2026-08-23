/**
 * Decide whether a Chromium permission request belongs to the validated DSH
 * renderer. The desktop grants the official local surface its browser-host
 * capabilities, while every other origin remains denied.
 * @param candidate - Requesting URL or origin reported by Electron.
 * @param dshOrigin - Ready origin validated from the official DSH process.
 * @returns Whether both values identify the same HTTP origin.
 */
export function isTrustedDshPermissionOrigin(
  candidate: string | undefined,
  dshOrigin: string | undefined,
): boolean {
  if (candidate === undefined || dshOrigin === undefined) return false
  try {
    const requested = new URL(candidate)
    const trusted = new URL(dshOrigin)
    return requested.protocol === 'http:'
      && requested.origin === trusted.origin
      && trusted.protocol === 'http:'
      && trusted.hostname === '127.0.0.1'
  } catch {
    return false
  }
}
