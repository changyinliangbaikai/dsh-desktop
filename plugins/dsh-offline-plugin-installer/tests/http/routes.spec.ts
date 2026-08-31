import { createServer, type Server } from 'node:http'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InstallSuccessResponse } from '../../src/api/types.js'
import { createInstallerRoutes, type InstallerRouteDependencies } from '../../src/http/routes.js'
import { InstallCoordinator } from '../../src/install/coordinator.js'

const TOKEN = 'a'.repeat(43)
const SUCCESS: InstallSuccessResponse = {
  ok: true,
  package: {
    name: 'dsh-fixture-plugin',
    version: '1.2.3',
    sha256: 'b'.repeat(64),
    archiveBytes: 3,
    expandedBytes: 10,
    entryCount: 3,
    runtimeDependencies: [],
  },
  restartRequired: true,
  warningCodes: [],
}

let directory: string
let server: Server | undefined

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'dsh-offline-routes-'))
})

afterEach(async () => {
  if (server !== undefined) await new Promise<void>(resolve => { server?.close(() => { resolve() }) })
  server = undefined
  await rm(directory, { recursive: true, force: true })
})

async function start(overrides: Partial<InstallerRouteDependencies> = {}): Promise<{
  readonly origin: string
  readonly install: ReturnType<typeof vi.fn>
}> {
  const install = vi.fn(async (path: string) => {
    expect(await readFile(path, 'utf8')).toBe('tgz')
    return SUCCESS
  })
  let counter = 0
  const dependencies: InstallerRouteDependencies = {
    token: TOKEN,
    session: {
      token: TOKEN,
      profile: 'web',
      maxUploadBytes: 1024,
      acceptedExtension: '.tgz',
      networkDisabled: true,
      lifecycleScriptsDisabled: true,
    },
    maxUploadBytes: 1024,
    coordinator: new InstallCoordinator(),
    store: {
      createIncomingPath: () => join(directory, `incoming-${String(counter += 1)}.tgz`),
      discardIncoming: path => rm(path, { force: true }),
    },
    installer: { install },
    warn: vi.fn(),
    ...overrides,
  }
  const routes = createInstallerRoutes(dependencies)
  server = createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://x').pathname
    const route = routes.find(candidate => candidate.path === pathname)
    if (route === undefined) {
      response.writeHead(404).end()
      return
    }
    Promise.resolve(route.handler(request, response)).catch(error => {
      response.writeHead(500).end(String(error))
    })
  })
  await new Promise<void>(resolve => { server?.listen(0, '127.0.0.1', () => { resolve() }) })
  const port = (server.address() as AddressInfo).port
  return { origin: `http://127.0.0.1:${String(port)}`, install }
}

function uploadHeaders(token = TOKEN): Record<string, string> {
  return {
    'content-type': 'application/gzip',
    'x-dsh-installer-token': token,
    'x-dsh-plugin-filename': 'plugin.tgz',
  }
}

describe('offline installer Web routes', () => {
  it('serves a no-store session only to same-origin loopback requests', async () => {
    const { origin } = await start()
    const response = await fetch(`${origin}/dsh-offline-plugin-installer/session.json`)
    expect(response.status).toBe(200)
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toMatchObject({ token: TOKEN, profile: 'web' })

    const forbidden = await fetch(`${origin}/dsh-offline-plugin-installer/session.json`, {
      headers: { origin: 'https://attacker.example' },
    })
    expect(forbidden.status).toBe(403)
    expect(await forbidden.json()).toMatchObject({ error: { code: 'FORBIDDEN' } })

    const wrongMethod = await fetch(`${origin}/dsh-offline-plugin-installer/session.json`, { method: 'POST' })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('GET, HEAD')

    const head = await fetch(`${origin}/dsh-offline-plugin-installer/session.json`, { method: 'HEAD' })
    expect(head.status).toBe(200)
    expect(await head.text()).toBe('')
  })

  it('streams a raw tarball, installs it, and returns restart-required metadata', async () => {
    const { origin, install } = await start()
    const response = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`, {
      method: 'POST',
      headers: uploadHeaders(),
      body: Buffer.from('tgz'),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual(SUCCESS)
    expect(install).toHaveBeenCalledTimes(1)
  })

  it('rejects methods, expired tokens, media types, sizes, and concurrent installs before mutation', async () => {
    const coordinator = new InstallCoordinator()
    let release: (() => void) | undefined
    const occupied = coordinator.run(async () => new Promise<void>(resolve => { release = resolve }), new AbortController().signal)
    const { origin, install } = await start({ coordinator })

    const method = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`)
    expect(method.status).toBe(405)
    expect(method.headers.get('allow')).toBe('POST')

    const token = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`, {
      method: 'POST', headers: uploadHeaders('wrong'), body: Buffer.from('tgz'),
    })
    expect(token.status).toBe(403)

    const media = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`, {
      method: 'POST', headers: { ...uploadHeaders(), 'content-type': 'text/plain' }, body: 'tgz',
    })
    expect(media.status).toBe(400)

    const busy = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`, {
      method: 'POST', headers: uploadHeaders(), body: Buffer.from('tgz'),
    })
    expect(busy.status).toBe(409)
    expect(await busy.json()).toMatchObject({ error: { code: 'BUSY' } })
    expect(install).not.toHaveBeenCalled()
    release?.()
    await occupied
  })

  it('enforces the streamed byte ceiling and removes the partial file', async () => {
    const { origin, install } = await start({ maxUploadBytes: 2 })
    const response = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`, {
      method: 'POST', headers: uploadHeaders(), body: Buffer.from('tgz'),
    })
    expect(response.status).toBe(413)
    expect(await response.json()).toMatchObject({ error: { code: 'UPLOAD_TOO_LARGE' } })
    expect(install).not.toHaveBeenCalled()
  })

  it('contains unexpected installer errors and logs them only on the Host', async () => {
    const warn = vi.fn()
    const { origin } = await start({
      installer: { install: () => Promise.reject(new Error('/private/path secret')) },
      warn,
    })
    const response = await fetch(`${origin}/dsh-offline-plugin-installer/install.tgz`, {
      method: 'POST', headers: uploadHeaders(), body: Buffer.from('tgz'),
    })
    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toMatchObject({ error: { code: 'INSTALL_FAILED' } })
    expect(JSON.stringify(body)).not.toContain('/private/path')
    expect(warn).toHaveBeenCalledWith(expect.any(Error))
  })
})
