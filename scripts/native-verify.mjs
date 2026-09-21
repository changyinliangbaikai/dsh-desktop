/** Verify final filesystem resources, native shell provenance, and an isolated Host. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { readCordisConfiguration } from '../dist/native/intranet.js';
import { app, artifacts, pin, release, repository, target, verifyUpstream } from './native-common.mjs';
import { smokeNativeWindow } from './native-gui-smoke.mjs';

verifyUpstream();
const unpacked = join(release, 'win-unpacked');
const application = join(unpacked, 'resources/app');
assert.ok(!existsSync(join(unpacked, 'resources/app.asar')), 'Native spawn paths must not enter ASAR');
const read = file => readFileSync(join(application, file));
const metadata = JSON.parse(read('package.json'));
assert.equal(metadata.version, pin.version);
assert.equal(metadata.dshIntranetBuild.upstream, pin.commit);
assert.equal(metadata.dshMandatoryUpdatePolicy, undefined);
assert.equal(metadata.main, 'downstream/native/entry.js');
for (const file of ['native/entry.js', 'native/tray.js', 'main/window-lifecycle.js']) {
  assert.deepEqual(read(`downstream/${file}`), readFileSync(join(repository, 'dist', file)));
}
assert.deepEqual(readFileSync(join(unpacked, 'resources/tray-icon.ico')), readFileSync(join(repository, 'build/icon.ico')));
assert.ok(!existsSync(join(unpacked, 'resources/app-update.yml')));
assert.deepEqual(read('lib/main.js'), readFileSync(join(app, 'lib/main.js')));
const inventory = JSON.parse(read('dsh/desktop-runtime.json'));
assert.equal(inventory.release.version, pin.version);
assert.equal(inventory.platform, 'win32');
assert.equal(inventory.arch, 'x64');
for (const file of inventory.files) {
  const body = read(`dsh/${file.path}`);
  assert.equal(body.length, file.bytes, file.path);
  assert.equal(createHash('sha256').update(body).digest('hex'), file.sha256, file.path);
}
const overlay = JSON.parse(readFileSync(join(target, 'intranet-overlay.json')));
const embedded = pin.embeddedPlugins[0];
assert.equal(overlay.embeddedPlugin.integrity, embedded.integrity);
assert.equal('sha512-' + createHash('sha512').update(read(`dsh/bootstrap-plugins/${embedded.archive}`)).digest('base64'), embedded.integrity);
assert.equal(JSON.parse(read(`dsh/node_modules/${embedded.name}/package.json`)).version, embedded.version);
for (const { file, sha256 } of overlay.embeddedPlugin.files) {
  assert.equal(createHash('sha256').update(read(`dsh/${file}`)).digest('hex'), sha256, file);
}
for (const { file, sha256 } of overlay.files) {
  assert.equal(createHash('sha256').update(read(`dsh/${file}`)).digest('hex'), sha256);
  const rows = readCordisConfiguration(read(`dsh/${file}`).toString());
  const flat = rows.flatMap(row => row.insert ?? [row]);
  assert.equal(flat.find(row => row.id === 'tool-web').config.search, false);
  if (file.includes('/dsh-base/')) assert.equal(flat.find(row => row.id === 'web-search-deepseek').disabled, true);
}
const installer = readdirSync(release).filter(name => name.endsWith('.exe'));
assert.equal(installer.length, 1, 'Exactly one installer is required');
const scratch = mkdtempSync(join(artifacts, 'smoke-'));
let smoke;
try {
  const output = execFileSync(join(unpacked, 'Harness Desktop Intranet.exe'), [
    '--expose-internals', join(repository, 'scripts/native-runtime-smoke.mjs'), join(application, 'dsh'), join(unpacked, 'resources/runtime'),
  ], {
    timeout: 300_000, maxBuffer: 16 * 1024 * 1024, encoding: 'utf8',
    env: { ...process.env, DSH_HOME: scratch, DSH_TELEMETRY_DISABLED: '1', ELECTRON_RUN_AS_NODE: '1', NODE_OPTIONS: '' },
  });
  const line = output.split(/\r?\n/u).find(value => value.startsWith('INTRANET_SMOKE '));
  assert.ok(line, 'The final packaged runtime must pass the profile/tool registry smoke');
  smoke = JSON.parse(line.slice('INTRANET_SMOKE '.length));
} catch (error) {
  // Never publish raw ready URLs, which can carry authentication credentials.
  const detail = String(error.stderr ?? error.message).replace(/https?:\/\/[^\s]+/gu, '[redacted URL]');
  throw new Error(`Packaged Host smoke failed: ${detail}`);
} finally { rmSync(scratch, { recursive: true, force: true }); }
copyFileSync(join(target, 'intranet-overlay.json'), join(release, 'intranet-overlay.json'));
const windowLifecycle = await smokeNativeWindow(join(unpacked, 'Harness Desktop Intranet.exe'), artifacts);
writeFileSync(join(release, 'build-evidence.json'), JSON.stringify({
  upstream: pin, shell: 'byte-identical native main.js', signing: 'unsigned',
  verifiedRuntimeFiles: inventory.files.length,
  automaticUpdates: false, mandatoryUpdatePolicy: false, smoke,
  runtimeLayout: 'real-filesystem', nativeTray: 'downstream entry; native Host lifecycle retained',
  windowLifecycle,
  manualWindowsAcceptance: 'pending user testing',
}, null, 2) + '\n');
const files = readdirSync(release).filter(name => /\.(exe|blockmap|json)$/u.test(name)).sort();
writeFileSync(join(release, 'SHA256SUMS.txt'), files.map(name =>
  `${createHash('sha256').update(readFileSync(join(release, name))).digest('hex')}  ${name}\n`).join(''));
mkdirSync(join(artifacts, 'evidence'), { recursive: true });
verifyUpstream();
console.log(JSON.stringify({ installer, smoke, verified: true }));
