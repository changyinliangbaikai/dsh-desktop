/** Invoke the pinned upstream preparation stages, with its supported smoke deferral. */
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, pin, pnpm, upstream, verifyUpstream } from './native-common.mjs';
import { officeValidationEnabled, prepareDshArguments } from '../dist/native/validation.js';

verifyUpstream();
const upstreamScript = file => import(pathToFileURL(join(app, 'scripts', file)).href);
const { desktopTargetBuildPaths } = await upstreamScript('desktop-build-paths.mjs');
const { loadDesktopPackageEnvironment, validateDesktopPackageEnvironment } = await upstreamScript('desktop-package-environment.mjs');
const { desktopElectronBuilderEnvironment } = await upstreamScript('package-target.ts');
const { requireDesktopToolchain } = await upstreamScript('desktop-toolchain-preflight.ts');
const environment = loadDesktopPackageEnvironment('win32');
const paths = desktopTargetBuildPaths(pin.target, environment);
validateDesktopPackageEnvironment(environment, { platform: 'win32', arch: 'x64' }, { unsigned: true, prepareOnly: true });
await requireDesktopToolchain('win32', environment);
const env = {
  ...desktopElectronBuilderEnvironment(environment, true),
  DSH_DESKTOP_TARGET_PLATFORM: 'win32', DSH_DESKTOP_TARGET_ARCH: 'x64',
  DSH_DESKTOP_BUILD_COMMIT: pin.commit, DSH_DESKTOP_BUILD_DIRTY: '0',
};
const execute = (args, cwd = upstream) => pnpm(args, cwd, env);
execute(['run', 'build', '--profile', 'local']);
execute(['exec', 'tsx', 'apps/desktop/scripts/pack-local-packages.ts', '--out', paths.packedDsh]);
execute(['--dir', 'apps/desktop-host', 'pack', '--pack-destination', paths.packedDsh]);
execute(['run', 'release:pack', '--family', 'vendor', '--out', paths.packedVendor]);
rmSync(paths.packedLandlock, { recursive: true, force: true });
mkdirSync(paths.packedLandlock, { recursive: true });
execute(['--dir', 'native/system', 'run', 'build:ts']);
execute(['--dir', 'native/system/packages/entry', 'pack', '--pack-destination', paths.packedLandlock]);
execute(['run', 'prepare:runtime'], app);
execute(['run', 'prepare:packages'], app);
execute(prepareDshArguments(officeValidationEnabled(process.env)), app);
verifyUpstream();
