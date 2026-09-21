import { EventEmitter } from 'node:events';
import type { BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';
import { describe, expect, it, vi } from 'vitest';
import { installNativeTray, type TrayPlatform } from '../src/native/tray.js';

function fixture(options: { platform?: NodeJS.Platform; locale?: string; fail?: 'create' | 'menu' } = {}) {
  const app = Object.assign(new EventEmitter(), { getLocale: () => options.locale ?? 'zh-CN', quit: vi.fn(() => { app.emit('before-quit'); }) });
  const tray = Object.assign(new EventEmitter(), { destroy: vi.fn(), setToolTip: vi.fn(), setContextMenu: vi.fn() });
  let menu: MenuItemConstructorOptions[] = [];
  const createTray = vi.fn(() => { if (options.fail === 'create') throw new Error('tray failed'); return tray; });
  const onError = vi.fn();
  installNativeTray({ app: app as unknown as TrayPlatform['app'], platform: options.platform ?? 'win32', createTray,
    createMenu: items => { if (options.fail === 'menu') throw new Error('menu failed'); menu = items; return {} as Menu; }, onError });
  function window(url = 'dsh-app://app/') {
    const win = Object.assign(new EventEmitter(), {
      webContents: new EventEmitter(),
      isDestroyed: vi.fn(() => false), isMinimized: vi.fn(() => true),
      restore: vi.fn(), show: vi.fn(), focus: vi.fn(), hide: vi.fn(),
    });
    app.emit('browser-window-created', {}, win as unknown as BrowserWindow);
    win.webContents.emit('did-start-navigation', { url, isMainFrame: true });
    win.webContents.emit('did-start-navigation', { url, isMainFrame: true });
    return win;
  }
  return { app, tray, window, menu: () => menu, createTray, onError };
}

describe('native Windows tray', () => {
  it('hides close, restores on click, and leaves explicit quit to native cleanup', () => {
    const f = fixture(); const win = f.window(); const preventDefault = vi.fn();
    win.emit('close', { preventDefault });
    expect(preventDefault).toHaveBeenCalledOnce(); expect(win.hide).toHaveBeenCalledOnce();
    expect(f.app.quit).not.toHaveBeenCalled();
    f.tray.emit('click'); expect(win.restore).toHaveBeenCalledOnce(); expect(win.show).toHaveBeenCalledOnce(); expect(win.focus).toHaveBeenCalledOnce();
    f.menu()[0]?.click?.({} as never, undefined, {} as never);
    expect(win.show).toHaveBeenCalledTimes(2);
    f.menu()[2]?.click?.({} as never, undefined, {} as never);
    expect(f.app.quit).toHaveBeenCalledOnce();
    preventDefault.mockClear(); win.emit('close', { preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
    f.tray.emit('click'); expect(win.show).toHaveBeenCalledTimes(2);
    f.app.emit('will-quit'); f.app.emit('will-quit'); expect(f.tray.destroy).toHaveBeenCalledOnce();
  });
  it('ignores dialogs and non-Windows platforms; supports replacement windows', () => {
    const mac = fixture({ platform: 'darwin' }); mac.window(); expect(mac.createTray).not.toHaveBeenCalled();
    const f = fixture({ locale: 'en-US' }); f.window('/native/preload-update-dialog.cjs'); f.window('');
    expect(f.createTray).not.toHaveBeenCalled();
    const old = f.window(); const next = f.window(); old.emit('closed');
    f.tray.emit('click'); expect(next.show).toHaveBeenCalledOnce(); expect(old.show).not.toHaveBeenCalled();
    expect(f.createTray).toHaveBeenCalledOnce(); expect(f.menu()[2]?.label).toBe('Exit');
    next.emit('closed'); f.tray.emit('click'); expect(next.show).toHaveBeenCalledOnce();
  });
  it.each(['create', 'menu'] as const)('never hides an inaccessible window after %s failure', fail => {
    const f = fixture({ fail }); const win = f.window(); const preventDefault = vi.fn();
    win.emit('close', { preventDefault }); expect(preventDefault).not.toHaveBeenCalled(); expect(f.onError).toHaveBeenCalledOnce();
  });
  it('allows session shutdown and does not restore a destroyed window', () => {
    const f = fixture(); const win = f.window(); win.isDestroyed.mockReturnValue(true); f.tray.emit('click'); expect(win.show).not.toHaveBeenCalled();
    win.isDestroyed.mockReturnValue(false); win.isMinimized.mockReturnValue(false); f.tray.emit('click'); expect(win.restore).not.toHaveBeenCalled();
    win.emit('session-end'); const preventDefault = vi.fn(); win.emit('close', { preventDefault }); expect(preventDefault).not.toHaveBeenCalled();
  });
});
