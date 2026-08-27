import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  createTrayMenuTemplate,
  handleMainWindowClose,
  resolveTrayIconPath,
  revealMainWindow,
  type MainWindowTarget,
} from '../src/main/window-lifecycle.js'

function createWindow(options: { destroyed?: boolean; minimized?: boolean } = {}): MainWindowTarget {
  return {
    isDestroyed: vi.fn(() => options.destroyed ?? false),
    isMinimized: vi.fn(() => options.minimized ?? false),
    restore: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    hide: vi.fn(),
  }
}

describe('Windows window lifecycle', () => {
  it('hides a normal Windows close request in the tray', () => {
    const event = { preventDefault: vi.fn() }
    const window = createWindow()

    expect(handleMainWindowClose({ event, window, platform: 'win32', quitRequested: false }))
      .toBe('hide-to-tray')
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(window.hide).toHaveBeenCalledOnce()
  })

  it('allows close while explicitly quitting and on non-Windows platforms', () => {
    const event = { preventDefault: vi.fn() }
    const quittingWindow = createWindow()
    const posixWindow = createWindow()

    expect(handleMainWindowClose({
      event,
      window: quittingWindow,
      platform: 'win32',
      quitRequested: true,
    })).toBe('close')
    expect(handleMainWindowClose({
      event,
      window: posixWindow,
      platform: 'darwin',
      quitRequested: false,
    })).toBe('close')
    expect(event.preventDefault).not.toHaveBeenCalled()
    expect(quittingWindow.hide).not.toHaveBeenCalled()
    expect(posixWindow.hide).not.toHaveBeenCalled()
  })

  it('restores and focuses an available main window', () => {
    const minimizedWindow = createWindow({ minimized: true })
    const hiddenWindow = createWindow()

    expect(revealMainWindow(minimizedWindow)).toBe(true)
    expect(minimizedWindow.restore).toHaveBeenCalledOnce()
    expect(minimizedWindow.show).toHaveBeenCalledOnce()
    expect(minimizedWindow.focus).toHaveBeenCalledOnce()
    expect(revealMainWindow(hiddenWindow)).toBe(true)
    expect(hiddenWindow.restore).not.toHaveBeenCalled()
    expect(hiddenWindow.show).toHaveBeenCalledOnce()
    expect(hiddenWindow.focus).toHaveBeenCalledOnce()
  })

  it('does not act on a missing or destroyed window', () => {
    const window = createWindow({ destroyed: true })

    expect(revealMainWindow(undefined)).toBe(false)
    expect(revealMainWindow(window)).toBe(false)
    expect(window.show).not.toHaveBeenCalled()
    expect(window.focus).not.toHaveBeenCalled()
  })

  it('offers native open and exit actions from the tray menu', () => {
    const showWindow = vi.fn()
    const quitApplication = vi.fn()
    const menu = createTrayMenuTemplate({ showWindow, quitApplication })

    expect(menu).toHaveLength(3)
    expect(menu[0]).toMatchObject({ label: '打开 Harness Desktop', click: showWindow })
    expect(menu[1]).toEqual({ type: 'separator' })
    expect(menu[2]).toMatchObject({ label: '退出', click: quitApplication })
  })

  it('uses an unpacked packaged icon and the build icon during development', () => {
    expect(resolveTrayIconPath({
      appPath: 'C:\\app',
      resourcesPath: 'C:\\resources',
      isPackaged: true,
    })).toBe(join('C:\\resources', 'tray-icon.ico'))
    expect(resolveTrayIconPath({
      appPath: '/project',
      resourcesPath: '/unused',
      isPackaged: false,
    })).toBe(join('/project', 'build', 'icon.ico'))
  })
})
