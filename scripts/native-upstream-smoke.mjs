/** Run unchanged upstream final-layout acceptance, including its native Host. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { officeValidationEnabled } from '../dist/native/validation.js';

const [application, runtime, executable, resources, descriptorFile] = process.argv.slice(2);
const descriptor = JSON.parse(readFileSync(descriptorFile, 'utf8'));
if (officeValidationEnabled(process.env)) {
  const { smokePreparedRuntime } = await import(pathToFileURL(join(application, 'scripts/smoke-prepared-runtime.ts')).href);
  await smokePreparedRuntime(runtime, executable, resources, descriptor);
} else {
  // This unchanged upstream fixture covers pnpm, PTY, native modules and search,
  // without generating or converting Office documents. The separate downstream
  // profile and native GUI gates cover Host startup, plugins and clean shutdown.
  const { desktopNodeEnvironment } = await import(pathToFileURL(join(application, 'src/node-environment.ts')).href);
  execFileSync(executable, ['--expose-internals', join(application, 'tests/fixtures/runtime-payload-smoke.mjs'), runtime, resources], {
    env: desktopNodeEnvironment(executable, join(resources, 'bin'), { ...process.env, NODE_OPTIONS: '' }),
    timeout: 120000, windowsHide: true, stdio: 'inherit',
  });
}
console.log('UPSTREAM_FINAL_LAYOUT_PAYLOAD_SMOKE passed');
