/** Exercise the actual NSIS installation after app/engine outbound traffic is blocked. */
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { artifacts, release, pin } from './native-common.mjs';
import { smokeNativeWindow } from './native-gui-smoke.mjs';

assert.equal(process.env.PREVIEW_OUTBOUND_BLOCKED, '1', 'Verify the outbound probe before installed acceptance');
assert.ok(process.env.PREVIEW_DIAG_APP, 'Pass the installed application directory');
const executable = join(process.env.PREVIEW_DIAG_APP, 'Harness Desktop Intranet.exe');
const identity = spawnSync(executable, ['-e', `const fs = require('node:fs'), path = require('node:path');
process.stdout.write(fs.readFileSync(path.join(path.dirname(process.execPath), 'resources/app.asar/package.json'), 'utf8'));`],
{ env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' }, encoding: 'utf8', timeout: 15000 });
assert.ifError(identity.error);
assert.equal(identity.status, 0);
const metadata = JSON.parse(identity.stdout);
assert.equal(metadata.dshIntranetBuild.upstream, pin.commit, 'Upgrade must replace the previous application');
assert.equal(metadata.dshIntranetBuild.productAnalytics, false);
const result = await smokeNativeWindow(executable, artifacts);
const evidence = { upstream: pin.commit, nsisInstalled: true, appAndEngineOutboundBlocked: true, result };
writeFileSync(join(release, 'installed-offline-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
console.log(JSON.stringify(evidence));
