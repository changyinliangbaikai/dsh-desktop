/** Windows window visibility; the unchanged native application owns Host shutdown. */
import type { App, BrowserWindow, MenuItemConstructorOptions, Tray } from 'electron';
import { handleMainWindowClose, revealMainWindow } from '../main/window-lifecycle.js';

export interface TrayPlatform {
  app: Pick<App, 'on' | 'getLocale' | 'quit'>;
  platform: NodeJS.Platform;
  createTray(): Pick<Tray, 'setToolTip' | 'setContextMenu' | 'destroy'> & { on(event: 'click', listener: () => void): unknown };
  createMenu(items: MenuItemConstructorOptions[]): Electron.Menu;
  onError(error: unknown): void;
}

/** Observe only the upstream application window, never update or recovery dialogs. */
export function installNativeTray(platform: TrayPlatform): void {
  if (platform.platform !== 'win32') return;
  let quitting = false;
  let current: BrowserWindow | undefined;
  let tray: ReturnType<TrayPlatform['createTray']> | undefined;
  platform.app.on('before-quit', () => { quitting = true; });
  platform.app.on('will-quit', () => { tray?.destroy(); tray = undefined; });
  const attached = new WeakSet<BrowserWindow>();
  platform.app.on('browser-window-created', (_event, window) => {
    window.webContents.on('did-start-navigation', details => {
      if (!details.isMainFrame || details.url !== 'dsh-app://app/' || attached.has(window)) return;
      attached.add(window);
      current = window;
      if (tray === undefined) {
        try {
          tray = platform.createTray();
          const chinese = platform.app.getLocale().startsWith('zh');
          const show = (): void => { if (!quitting) revealMainWindow(current); };
          tray.setToolTip('Harness Desktop Intranet');
          tray.on('click', show);
          tray.setContextMenu(platform.createMenu([
            { label: chinese ? '打开窗口' : 'Open window', click: show },
            { type: 'separator' },
            { label: chinese ? '退出' : 'Exit', click: () => { platform.app.quit(); } },
          ]));
        } catch (error) {
          tray?.destroy();
          tray = undefined;
          platform.onError(error);
        }
      }
      window.on('close', event => {
        // If tray creation failed, leave native close/quit intact so no hidden
        // process becomes inaccessible. Explicit quit reaches native cleanup.
        if (tray !== undefined) handleMainWindowClose({ event, window, platform: 'win32', quitRequested: quitting });
      });
      window.on('session-end', () => { quitting = true; });
      window.on('closed', () => { if (current === window) current = undefined; });
    });
  });
}
