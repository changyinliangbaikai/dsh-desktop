/** Preserve native Electron/NSIS behavior; select downstream deployment metadata. */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { app, pin, release, target } from './native-common.mjs';
import { preserveNativeRuntime } from '../dist/native/archive.js';

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
configuration.extraMetadata.dshIntranetBuild = { upstream: pin.commit, webSearch: false };
configuration.productName = 'Harness Desktop Intranet';
configuration.artifactName = 'Harness-Desktop-Intranet-${version}-${arch}.${ext}';
configuration.directories.output = release;
const afterPack = configuration.afterPack;
configuration.afterPack = async context => {
  await afterPack(context);
  await preserveNativeRuntime(join(context.appOutDir, 'resources/app.asar'), join(target, 'dsh'));
};
export default configuration;
