/** Stage the reviewed plugin archive; its own package retains all installation behavior. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pin, repository } from './native-common.mjs';

export function embedOfflineInstaller(runtime) {
  assert.equal(pin.embeddedPlugins.length, 1);
  const plugin = pin.embeddedPlugins[0];
  assert.equal(plugin.name, 'dsh-offline-plugin-installer');
  assert.equal(plugin.profile, 'desktop');
  const archive = join(repository, 'packaging/plugins', plugin.archive);
  const bytes = readFileSync(archive);
  assert.equal('sha512-' + createHash('sha512').update(bytes).digest('base64'), plugin.integrity);
  const destination = join(runtime, 'node_modules', plugin.name);
  assert.ok(!existsSync(destination), 'Native preparation must not contain an earlier installer');
  mkdirSync(destination, { recursive: true });
  execFileSync('tar', ['-xzf', archive, '--strip-components=1', '-C', destination]);
  const manifest = JSON.parse(readFileSync(join(destination, 'package.json'), 'utf8'));
  assert.equal(manifest.name, plugin.name);
  assert.equal(manifest.version, plugin.version);
  for (const [name, version] of Object.entries(manifest.peerDependencies)) {
    assert.equal(JSON.parse(readFileSync(join(runtime, 'node_modules', name, 'package.json'), 'utf8')).version, version, name);
  }
  const patch = readFileSync(join(destination, 'cordis.patch.yml'), 'utf8');
  assert.equal((patch.match(/profile: web/g) ?? []).length, 1);
  const file = 'node_modules/@deepseek-ai/dsh-web-app/cordis.patch.yml';
  const original = readFileSync(join(runtime, file), 'utf8');
  assert.ok(!original.includes(plugin.name));
  const configured = original + '\n# Desktop-owned offline installation package.\n' + patch.replace('profile: web', 'profile: desktop');
  writeFileSync(join(runtime, file), configured);
  // The public runtime resolver traverses declared dependencies. A loose
  // node_modules directory alone is deliberately not an installation package.
  const metadataFile = 'node_modules/@deepseek-ai/dsh-web-app/package.json';
  const metadataOriginal = readFileSync(join(runtime, metadataFile), 'utf8');
  const web = JSON.parse(metadataOriginal);
  assert.equal(web.dependencies[plugin.name], undefined);
  web.dependencies[plugin.name] = plugin.version;
  const metadataConfigured = JSON.stringify(web, null, 2) + '\n';
  writeFileSync(join(runtime, metadataFile), metadataConfigured);
  const archivePath = `bootstrap-plugins/${plugin.archive}`;
  mkdirSync(join(runtime, 'bootstrap-plugins'), { recursive: true });
  copyFileSync(archive, join(runtime, archivePath));
  return { plugin, file, original, configured, archivePath,
    metadata: { file: metadataFile, original: metadataOriginal, configured: metadataConfigured } };
}
