/** Apply the reviewed config-only resource delta and let upstream reseal it. */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { disableWebSearch } from '../dist/native/intranet.js';
import { app, pin, target, verifyUpstream } from './native-common.mjs';

verifyUpstream();
const runtime = join(target, 'dsh');
const { verifyDesktopRuntime, writeDesktopRuntime } = await import(pathToFileURL(join(app, 'lib/types/runtime-tree.js')).href);
const before = await verifyDesktopRuntime(runtime, pin.version, { platform: 'win32', arch: 'x64' });
const changes = [
  ['node_modules/@deepseek-ai/dsh-base/cordis.patch.yml', 'base'],
  ...pin.presets.map(name => [`node_modules/@deepseek-ai/dsh-agent-presets/presets/${name}/agent.cordis.yml`, 'preset']),
];
const hash = body => createHash('sha256').update(body).digest('hex');
const evidence = changes.map(([file, kind]) => {
  const original = readFileSync(join(runtime, file), 'utf8');
  const configured = disableWebSearch(original, kind);
  return { file, original, configured };
});
for (const { file, configured } of evidence) writeFileSync(join(runtime, file), configured);
const after = writeDesktopRuntime(runtime, before.release, before.sharedPackages.map(entry => entry.name), { platform: 'win32', arch: 'x64' });
const allowed = new Set(changes.map(([file]) => file));
const originalFiles = new Map(before.files.map(file => [file.path, file.sha256]));
if (after.files.length !== before.files.length || after.files.some(file =>
  originalFiles.get(file.path) !== file.sha256 && !allowed.has(file.path))) {
  throw new Error('Unexpected runtime change outside the configuration allowlist');
}
await verifyDesktopRuntime(runtime, pin.version, { platform: 'win32', arch: 'x64' });
writeFileSync(join(target, 'intranet-overlay.json'), JSON.stringify({
  upstream: pin.commit, version: pin.version, webSearch: false,
  files: evidence.map(({ file, original, configured }) => ({ file, originalSha256: hash(original), sha256: hash(configured) })),
}, null, 2) + '\n');
verifyUpstream();
