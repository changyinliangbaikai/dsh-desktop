import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { nativeDialogContentsExpression, nativeWindowExpression } from '../src/native/gui-selector.js';

describe('native window transitions in the inspector smoke', () => {
  const destroyedWindow = { isDestroyed: () => true,
    get webContents(): never { throw new Error('Object has been destroyed'); } };
  const destroyedContents = { isDestroyed: () => false, webContents: {
    isDestroyed: () => true, getURL: () => { throw new Error('Object has been destroyed'); },
  } };
  it.each([
    ['primary', 'dsh-app://app/'],
    ['welcome', 'file:///application/renderer/welcome.html'],
    ['dialog', 'dsh-app://shell/update-dialog.html'],
  ] as const)('finds the live %s window without reading destroyed objects', (kind, url) => {
    const live = { isDestroyed: () => false, webContents: { isDestroyed: () => false, getURL: () => url } };
    expect(runInNewContext(nativeWindowExpression('windows', kind), {
      windows: [destroyedWindow, destroyedContents, live],
    })).toBe(live);
  });
  it('keeps waiting when only destroyed windows remain', () => {
    expect(runInNewContext(nativeWindowExpression('windows', 'primary'), {
      windows: [destroyedWindow, destroyedContents],
    })).toBeUndefined();
  });
  it('finds an embedded close-confirmation renderer absent from the BrowserWindow roster', () => {
    const dialog = { isDestroyed: () => false, getURL: () => 'dsh-app://shell/update-dialog.html' };
    const primary = { isDestroyed: () => false,
      webContents: { isDestroyed: () => false, getURL: () => 'dsh-app://app/' } };
    expect(runInNewContext(nativeWindowExpression('windows', 'dialog'), { windows: [primary] })).toBeUndefined();
    expect(runInNewContext(nativeDialogContentsExpression('contents'), {
      contents: [destroyedContents.webContents, primary.webContents, dialog],
    })).toBe(dialog);
  });
  it('does not acknowledge unrelated renderers or a destroyed dialog', () => {
    expect(runInNewContext(nativeDialogContentsExpression('contents'), {
      contents: [destroyedContents.webContents, {
        isDestroyed: () => false, getURL: () => 'https://example.test/update-dialog.html',
      }, { isDestroyed: () => false, getURL: () => 'dsh-app://shell/mandatory-update.html' }],
    })).toBeUndefined();
  });
});
