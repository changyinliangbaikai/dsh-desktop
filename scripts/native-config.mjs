/** Preserve native Electron/NSIS behavior; select downstream deployment metadata. */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { app, pin, release, target, repository } from './native-common.mjs';
import { readFileSync } from 'node:fs';
import { preserveNativeRuntime } from '../dist/native/archive.js';
import { stageNativeCliAlias } from '../dist/native/cli.js';

const { createElectronBuilderConfig } = await import(pathToFileURL(join(app, 'scripts/electron-builder-config.mjs')).href);
const configuration = createElectronBuilderConfig({
  ...process.env,
  DSH_DESKTOP_APP_ID: pin.appId,
  DSH_DESKTOP_UNSIGNED: '1',
  DSH_DESKTOP_TARGET_PLATFORM: 'win32',
  DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_AUTO_UPDATE_ENV: 'production',
  DSH_DESKTOP_MANDATORY_UPDATE_PROD_ORIGIN: 'https://harness.deepseek.com',
});
// Native runtime supports absence of policy config. An intranet pilot must not
// inherit an upstream public update service or Feishu test authentication.
delete configuration.extraMetadata.dshMandatoryUpdatePolicy;
const downstream = JSON.parse(readFileSync(join(repository, 'package.json'), 'utf8')).version;
configuration.extraMetadata.dshIntranetBuild = { upstream: pin.commit, downstream, webSearch: false, productAnalytics: false };
// Upstream now owns complete Office unpacking and the Windows tray lifecycle.
configuration.productName = 'Harness Desktop Intranet';
configuration.artifactName = `Harness-Desktop-Intranet-${downstream}-\${arch}.\${ext}`;
configuration.directories.output = release;
const afterPack = configuration.afterPack;
configuration.afterPack = async context => {
  await afterPack(context);
  await preserveNativeRuntime(join(context.appOutDir, 'resources/app.asar'), join(target, 'dsh'));
};
const afterSign = configuration.afterSign;
configuration.afterSign = async context => {
  await afterSign(context);
  // Upstream's new dsh.cmd names DeepSeek Harness.exe. Preserve that launcher
  // and the existing intranet install identity with a byte-identical alias.
  stageNativeCliAlias(context.appOutDir);
};
export default configuration;
