/** Preserve native Electron/NSIS behavior; select downstream deployment metadata. */
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { app, pin, release, repository, target } from './native-common.mjs';
import { preserveNativeDirectory } from '../dist/native/directory.js';

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
// spawn and LibreOffice's native resource readers require real filesystem paths.
configuration.asar = false;
delete configuration.asarUnpack;
configuration.extraMetadata.main = 'downstream/native/entry.js';
configuration.files.push({ from: join(repository, 'dist'), to: 'downstream', filter: ['native/entry.js', 'native/tray.js', 'main/window-lifecycle.js'] });
configuration.extraResources.push({ from: join(repository, 'build/icon.ico'), to: 'tray-icon.ico' });
configuration.productName = 'Harness Desktop Intranet';
configuration.artifactName = 'Harness-Desktop-Intranet-${version}-${arch}.${ext}';
configuration.directories.output = release;
const afterPack = configuration.afterPack;
configuration.afterPack = async context => {
  await afterPack(context);
  preserveNativeDirectory(join(context.appOutDir, 'resources/app'), join(target, 'dsh'));
};
export default configuration;
