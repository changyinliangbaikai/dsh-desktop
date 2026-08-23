import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { resolveDshLaunchSpec } from '../src/main/runtime-config.js'

const BASE = {
  appPath: '/app/desktop',
  resourcesPath: '/app/resources',
  userDataPath: '/users/bond/appdata',
  defaultWorkspace: '/users/bond/Documents',
  env: { EXISTING: 'yes', ELECTRON_RUN_AS_NODE: '1' },
} as const

describe('resolveDshLaunchSpec', () => {
  it('resolves the sibling official checkout in development', () => {
    const result = resolveDshLaunchSpec({
      ...BASE,
      isPackaged: false,
      platform: 'linux',
    })

    expect(result).toEqual({
      command: 'node',
      args: [
        join('/app/desktop', '..', 'deepseek-harness', 'apps', 'cli', 'lib', 'bin.js'),
        'web',
        '--no-open',
        '--host',
        '127.0.0.1',
        '--port',
        '0',
      ],
      cwd: '/users/bond/Documents',
      env: {
        EXISTING: 'yes',
        DSH_HOME: join('/users/bond/appdata', 'dsh-home'),
      },
    })
  })

  it('uses staged Windows paths in a packaged build', () => {
    const result = resolveDshLaunchSpec({
      ...BASE,
      isPackaged: true,
      platform: 'win32',
      env: {},
    })

    expect(result.command).toBe(join('/app/resources', 'runtime', 'node', 'node.exe'))
    expect(result.args[0]).toBe(join(
      '/app/resources',
      'runtime',
      'dsh',
      'node_modules',
      '@deepseek-ai',
      'dsh',
      'lib',
      'bin.js',
    ))
    expect(result.env.PATH).toBe([
      join('/app/resources', 'runtime', 'node'),
      join('/app/resources', 'runtime', 'dsh', 'node_modules', '.bin'),
    ].join(';'))
  })

  it('supports explicit non-empty development overrides', () => {
    const result = resolveDshLaunchSpec({
      ...BASE,
      isPackaged: true,
      platform: 'linux',
      env: {
        DSH_DESKTOP_NODE_PATH: ' /custom/node ',
        DSH_DESKTOP_ENTRY_PATH: ' /custom/dsh.js ',
        DSH_DESKTOP_HOME: ' /custom/home ',
        DSH_DESKTOP_WORKSPACE: ' /custom/workspace ',
      },
    })

    expect(result.command).toBe('/custom/node')
    expect(result.args[0]).toBe('/custom/dsh.js')
    expect(result.cwd).toBe('/custom/workspace')
    expect(result.env.DSH_HOME).toBe('/custom/home')
  })

  it('ignores whitespace-only overrides and uses packaged POSIX Node', () => {
    const result = resolveDshLaunchSpec({
      ...BASE,
      isPackaged: true,
      platform: 'linux',
      env: {
        DSH_DESKTOP_NODE_PATH: ' ',
        DSH_DESKTOP_ENTRY_PATH: '',
        EXISTING: 'yes',
        PATH: '/usr/bin',
      },
    })

    expect(result.command).toBe(join('/app/resources', 'runtime', 'node', 'bin', 'node'))
    expect(result.args[0]).toContain(join('runtime', 'dsh', 'node_modules'))
    expect(result.env.EXISTING).toBe('yes')
    expect(result.env.PATH).toBe([
      join('/app/resources', 'runtime', 'node', 'bin'),
      join('/app/resources', 'runtime', 'dsh', 'node_modules', '.bin'),
      '/usr/bin',
    ].join(':'))
  })

  it('preserves the inherited Windows Path key and appends its value', () => {
    const result = resolveDshLaunchSpec({
      ...BASE,
      isPackaged: true,
      platform: 'win32',
      env: { Path: 'C:\\Windows\\System32' },
    })

    expect(result.env.Path).toBe([
      join('/app/resources', 'runtime', 'node'),
      join('/app/resources', 'runtime', 'dsh', 'node_modules', '.bin'),
      'C:\\Windows\\System32',
    ].join(';'))
    expect(result.env.PATH).toBeUndefined()
  })
})
