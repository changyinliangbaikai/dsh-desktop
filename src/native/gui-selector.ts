/** Inspector expressions for live native windows during asynchronous window transitions. */
export function nativeWindowExpression(windows: string, kind: 'primary' | 'welcome' | 'dialog'): string {
  const url = 'w.webContents.getURL()';
  const match = kind === 'welcome' ? `${url}.endsWith('/renderer/welcome.html')`
    : `${url} === ${JSON.stringify(kind === 'primary' ? 'dsh-app://app/' : 'dsh-app://shell/update-dialog.html')}`;
  return `${windows}.find(w => !w.isDestroyed() && !w.webContents.isDestroyed() && ${match})`;
}
