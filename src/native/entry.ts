/** Downstream native integrations around the byte-identical upstream entry. */
import { app, Menu, Tray } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { installNativeTray } from './tray.js';

installNativeTray({
  app, platform: process.platform,
  createTray: () => new Tray(join(process.resourcesPath, 'tray-icon.ico')),
  createMenu: items => Menu.buildFromTemplate(items),
  onError: error => { console.error('Desktop tray unavailable:', error); },
});
await import(pathToFileURL(join(app.getAppPath(), 'lib/main.js')).href);
