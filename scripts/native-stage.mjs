/** Orchestrate the pinned upstream preparation; never patch its sources. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { app, pin, pnpm, verifyUpstream } from './native-common.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Native staging requires Windows x64');
verifyUpstream();
mkdirSync(app, { recursive: true });
// This ignored deployment file belongs only to the disposable artifact checkout.
// The downstream builder omits policy metadata and all vendor update feeds.
writeFileSync(join(app, '.env.windows'), [
  `DSH_DESKTOP_APP_ID=${pin.appId}`,
  'DSH_DESKTOP_AUTO_UPDATE_ENV=production',
  'DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN=https://harness.deepseek.com',
  '',
].join('\n'));
pnpm(['run', 'prepare:desktop', '--', 'win-x64']);
verifyUpstream();
