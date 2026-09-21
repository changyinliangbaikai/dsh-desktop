/** Await GUI-subsystem Electron even when PowerShell would return immediately. */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const expected = process.argv[2];
assert.ok(expected === 'allowed' || expected === 'blocked');
const executable = join(process.env.PREVIEW_DIAG_ROOT, 'app/Harness Desktop Intranet.exe');
const probe = spawnSync(executable, ['-e', `fetch('https://github.com/', { signal: AbortSignal.timeout(6000) })
  .then(() => process.exit(0), error => { console.error(error.cause?.code ?? error.name); process.exit(3); })`], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 12000,
});
assert.ifError(probe.error);
assert.equal(probe.status, expected === 'allowed' ? 0 : 3, `Outbound probe ${expected}: ${probe.stderr}`);
console.log(`Outbound application probe: ${expected}`);
