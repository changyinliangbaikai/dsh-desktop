import { app, BrowserWindow, Menu, shell, Tray } from 'electron'
import { join } from 'node:path'
import { DshRuntime, type DshRuntimeEvent } from './dsh-runtime.js'
import { seedEmbeddedProfilePlugins } from './embedded-plugins.js'
import { classifyNavigation } from './navigation-policy.js'
import { isTrustedDshPermissionOrigin } from './permission-policy.js'
import { resolveDshLaunchSpec } from './runtime-config.js'
import { renderStatusDocument, toDataUrl } from './status-document.js'
import {
  createTrayMenuTemplate,
  handleMainWindowClose,
  resolveTrayIconPath,
  revealMainWindow,
} from './window-lifecycle.js'

let mainWindow: BrowserWindow | undefined
let tray: Tray | undefined
let runtime: DshRuntime | undefined
let dshOrigin: string | undefined
let quitRequested = false
let runtimeStopStarted = false
let runtimeStopped = false

function loadStatus(
  window: BrowserWindow,
  status: Parameters<typeof renderStatusDocument>[0],
): Promise<void> {
  return window.loadURL(toDataUrl(renderStatusDocument(status)))
}

function recentDiagnostics(error: unknown): string {
  const message = error instanceof Error ? error.stack ?? error.message : String(error)
  const output = runtime?.getRecentOutput().slice(-30).join('\n') ?? ''
  return output.length === 0 ? message : message + '\n\n' + output
}

function observeRuntime(event: DshRuntimeEvent): void {
  if (event.type === 'output') {
    const method = event.stream === 'stderr' ? console.error : console.log
    method('[dsh] ' + event.line)
    return
  }
  if (event.type === 'exit' && dshOrigin !== undefined && !quitRequested && mainWindow !== undefined) {
    const detail = runtime?.getRecentOutput().slice(-30).join('\n')
    void loadStatus(mainWindow, {
      title: 'Harness Desktop',
      heading: 'DeepSeek Harness 已停止',
      message: '运行时意外退出。请重新启动客户端；诊断信息已保留。',
      ...(detail === undefined ? {} : { detail }),
      tone: 'error',
    })
  }
}

function configureRenderer(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (dshOrigin !== undefined && classifyNavigation(url, dshOrigin) === 'internal') {
      void window.loadURL(url)
    } else if (dshOrigin !== undefined && classifyNavigation(url, dshOrigin) === 'external') {
      void shell.openExternal(url)
    }
    return { action: 'deny' }
  })

  window.webContents.on('will-navigate', (event, url) => {
    if (dshOrigin !== undefined && classifyNavigation(url, dshOrigin) === 'internal') return
    event.preventDefault()
    if (dshOrigin !== undefined && classifyNavigation(url, dshOrigin) === 'external') {
      void shell.openExternal(url)
    }
  })

  window.webContents.session.setPermissionCheckHandler((webContents, _permission, requestingOrigin, details) => {
    if (webContents !== window.webContents) return false
    return isTrustedDshPermissionOrigin(details.requestingUrl || requestingOrigin, dshOrigin)
  })
  window.webContents.session.setPermissionRequestHandler((webContents, _permission, callback, details) => {
    callback(webContents === window.webContents
      && isTrustedDshPermissionOrigin(details.requestingUrl || webContents.getURL(), dshOrigin))
  })
}

function showMainWindow(): void {
  revealMainWindow(mainWindow)
}

function configureWindowsTray(): void {
  if (process.platform !== 'win32' || tray !== undefined) return
  const nextTray = new Tray(resolveTrayIconPath({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    isPackaged: app.isPackaged,
  }))
  nextTray.setToolTip('Harness Desktop')
  nextTray.setContextMenu(Menu.buildFromTemplate(createTrayMenuTemplate({
    showWindow: showMainWindow,
    quitApplication: () => app.quit(),
  })))
  nextTray.on('click', showMainWindow)
  tray = nextTray
}

async function bootstrap(): Promise<void> {
  const window = new BrowserWindow({
    title: 'Harness Desktop',
    width: 1440,
    height: 920,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#08111f',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
    },
  })
  mainWindow = window
  configureRenderer(window)
  configureWindowsTray()
  window.once('ready-to-show', () => {
    window.show()
  })
  window.on('close', event => {
    handleMainWindowClose({
      event,
      window,
      platform: process.platform,
      quitRequested,
    })
  })
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = undefined
  })

  await loadStatus(window, {
    title: 'Harness Desktop',
    heading: '正在启动 DeepSeek Harness',
    message: '正在初始化官方 Web Profile，请稍候。',
    tone: 'loading',
  })

  const launch = resolveDshLaunchSpec({
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    userDataPath: app.getPath('userData'),
    defaultWorkspace: app.getPath('documents'),
    isPackaged: app.isPackaged,
    platform: process.platform,
    env: process.env,
  })
  runtime = new DshRuntime({ launch, onEvent: observeRuntime })

  try {
    if (app.isPackaged) {
      await seedEmbeddedProfilePlugins({
        runtimeRoot: join(process.resourcesPath, 'runtime'),
        launch,
      })
    }
    const readyUrl = await runtime.start()
    dshOrigin = new URL(readyUrl).origin
    await window.loadURL(readyUrl)
  } catch (error) {
    await loadStatus(window, {
      title: 'Harness Desktop',
      heading: 'DeepSeek Harness 启动失败',
      message: '请检查运行时、Profile 和日志后重新启动客户端。',
      detail: recentDiagnostics(error),
      tone: 'error',
    })
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock()
if (!hasSingleInstanceLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    showMainWindow()
  })

  app.whenReady().then(bootstrap).catch(error => {
    console.error(error)
    app.quit()
  })

  app.on('window-all-closed', () => {
    app.quit()
  })

  app.on('before-quit', event => {
    quitRequested = true
    if (runtime === undefined || runtimeStopped) return
    event.preventDefault()
    if (runtimeStopStarted) return
    runtimeStopStarted = true
    void runtime.stop().catch(error => {
      console.error('[dsh] Failed to stop the managed runtime cleanly.', error)
    }).finally(() => {
      runtimeStopped = true
      app.quit()
    })
  })

  app.on('will-quit', () => {
    tray?.destroy()
    tray = undefined
  })
}
