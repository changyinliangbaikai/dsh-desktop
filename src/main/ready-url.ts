const READY_MARKER = 'dsh web: '

/**
 * Parse and validate the official DSH Web ready line.
 * @param line - One complete stdout line from the DSH process.
 * @returns The trusted loopback origin, or undefined when the line is unrelated.
 */
export function parseDshReadyUrl(line: string): string | undefined {
  const markerIndex = line.indexOf(READY_MARKER)
  if (markerIndex === -1) return undefined

  const remainder = line.slice(markerIndex + READY_MARKER.length).trim()
  const candidate = remainder.split(/\s/u, 1)[0]
  if (candidate === undefined || candidate.length === 0) {
    throw new Error('DSH emitted an empty Web ready URL.')
  }

  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    throw new Error('DSH emitted an invalid Web ready URL: ' + JSON.stringify(candidate))
  }

  const valid = url.protocol === 'http:'
    && url.hostname === '127.0.0.1'
    && url.port.length > 0
    && url.port !== '0'
    && url.username.length === 0
    && url.password.length === 0
    && url.pathname === '/'
    && url.search.length === 0
    && url.hash.length === 0

  if (!valid) {
    throw new Error('DSH Web ready URL is outside the accepted loopback origin: ' + JSON.stringify(candidate))
  }

  return url.origin
}
