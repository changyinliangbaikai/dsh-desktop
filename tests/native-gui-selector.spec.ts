import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';
import { nativeWindowExpression } from '../src/native/gui-selector.js';

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
});
