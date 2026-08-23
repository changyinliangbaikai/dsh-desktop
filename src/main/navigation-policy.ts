export type NavigationDisposition = 'internal' | 'external' | 'blocked'

/**
 * Classify a renderer navigation against the active DSH origin.
 * @param target - The requested navigation URL.
 * @param dshOrigin - The validated DSH loopback origin.
 * @returns How Electron Main must handle the request.
 */
export function classifyNavigation(target: string, dshOrigin: string): NavigationDisposition {
  let targetUrl: URL
  let originUrl: URL
  try {
    targetUrl = new URL(target)
    originUrl = new URL(dshOrigin)
  } catch {
    return 'blocked'
  }

  if (targetUrl.origin === originUrl.origin) return 'internal'
  if (targetUrl.protocol === 'http:' || targetUrl.protocol === 'https:') return 'external'
  return 'blocked'
}
