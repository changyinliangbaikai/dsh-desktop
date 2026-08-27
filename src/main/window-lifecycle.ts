import type { MenuItemConstructorOptions } from 'electron'
import { join } from 'node:path'

export interface MainWindowTarget {
  isDestroyed(): boolean
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
  hide(): void
}

export interface PreventableCloseEvent {
  preventDefault(): void
}

export interface TrayActions {
  showWindow(): void
  quitApplication(): void
}

export interface TrayIconPaths {
  readonly appPath: string
  readonly resourcesPath: string
  readonly isPackaged: boolean
}

/** Restore a minimized or tray-hidden main window and bring it to the foreground. */
export function revealMainWindow(window: MainWindowTarget | undefined): boolean {
  if (window === undefined || window.isDestroyed()) return false
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
  return true
}

/** Hide a normal Windows close request while allowing an intentional app quit. */
export function handleMainWindowClose(input: {
  readonly event: PreventableCloseEvent
  readonly window: MainWindowTarget
  readonly platform: NodeJS.Platform
  readonly quitRequested: boolean
}): 'close' | 'hide-to-tray' {
  if (input.platform !== 'win32' || input.quitRequested) return 'close'
  input.event.preventDefault()
  input.window.hide()
  return 'hide-to-tray'
}

/** Build the native tray menu without coupling lifecycle policy to Electron globals. */
export function createTrayMenuTemplate(actions: TrayActions): MenuItemConstructorOptions[] {
  return [
    { label: '打开 Harness Desktop', click: actions.showWindow },
    { type: 'separator' },
    { label: '退出', click: actions.quitApplication },
  ]
}

/** Resolve an unpacked ICO because Windows tray icons cannot rely on build metadata. */
export function resolveTrayIconPath(paths: TrayIconPaths): string {
  return paths.isPackaged
    ? join(paths.resourcesPath, 'tray-icon.ico')
    : join(paths.appPath, 'build', 'icon.ico')
}
