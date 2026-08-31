import { fileURLToPath } from 'node:url'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Context, Service } from '@deepseek-ai/cordis'
import type { WebRoute } from '@deepseek-ai/dsh-host-webserver'
import * as Plugin from '../../src/index.js'

const cliFixture = fileURLToPath(new URL('../fixtures/fake-dsh-cli.mjs', import.meta.url))

class TestWebServer extends Service {
  readonly routes: WebRoute[] = []
  readonly port = 0

  constructor(ctx: Context, readonly host: '127.0.0.1' | '0.0.0.0') {
    super(ctx, 'webServer')
  }

  register(route: WebRoute): () => void {
    this.routes.push(route)
    return () => { this.routes.splice(this.routes.indexOf(route), 1) }
  }
}

let home: string
let previousHome: string | undefined

beforeEach(async () => {
  home = await mkdtemp(join(tmpdir(), 'dsh-offline-host-'))
  previousHome = process.env.DSH_HOME
  process.env.DSH_HOME = home
  const profileDir = join(home, 'profiles', 'web')
  await mkdir(profileDir, { recursive: true })
  await writeFile(join(profileDir, 'package.json'), JSON.stringify({ dependencies: {} }))
})

afterEach(async () => {
  if (previousHome === undefined) delete process.env.DSH_HOME
  else process.env.DSH_HOME = previousHome
  await rm(home, { recursive: true, force: true })
})

describe('Host plugin apply', () => {
  it('registers exactly two loopback routes and disposes them', async () => {
    const ctx = new Context()
    const webServer = new TestWebServer(ctx, '127.0.0.1')
    const fiber = ctx.plugin({
      name: Plugin.name,
      inject: Plugin.inject,
      Config: Plugin.Config,
      apply: Plugin.apply,
    }, { cliEntryPath: cliFixture })
    await fiber
    expect(Plugin.inject).toEqual(['webServer'])
    expect(webServer.routes.map(route => route.path).sort()).toEqual([
      '/dsh-offline-plugin-installer/install.tgz',
      '/dsh-offline-plugin-installer/session.json',
    ])
    await fiber.dispose()
    expect(webServer.routes).toEqual([])
    await ctx.fiber.dispose()
  })

  it('fails before registering a mutation route on a network-exposed Web server', async () => {
    const ctx = new Context()
    const webServer = new TestWebServer(ctx, '0.0.0.0')
    const fiber = ctx.plugin({
      name: Plugin.name,
      inject: Plugin.inject,
      Config: Plugin.Config,
      apply: Plugin.apply,
    }, { cliEntryPath: cliFixture })
    await expect(fiber).rejects.toThrow('loopback-only')
    expect(webServer.routes).toEqual([])
    await ctx.fiber.dispose()
  })
})
