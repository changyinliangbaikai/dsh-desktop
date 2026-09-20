import * as asar from '@electron/asar';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { archivePath, preserveNativeRuntime } from '../src/native/archive.js';

const roots: string[] = [];
afterEach(() => { asar.uncacheAll(); for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'native-archive-'));
  roots.push(root);
  const tree = join(root, 'tree');
  const runtime = join(root, 'runtime');
  const module = 'node_modules/example';
  mkdirSync(join(tree, 'dsh', module), { recursive: true });
  mkdirSync(join(runtime, module), { recursive: true });
  writeFileSync(join(tree, 'package.json'), '{"main":"native-main.js"}');
  writeFileSync(join(tree, 'dsh', module, 'package.json'), '{"name":"example"}');
  writeFileSync(join(runtime, module, 'package.json'), '{"name":"example","scripts":{"start":"node app.js"},"bugs":"https://example.com"}');
  return { root, tree, runtime, module, archive: join(root, 'app.asar') };
}

it('preserves original package metadata, shell bytes and native unpacked files', async () => {
  const f = fixture();
  for (const base of [join(f.tree, 'dsh'), f.runtime]) writeFileSync(join(base, f.module, 'addon.node'), 'native-binary');
  await asar.createPackageWithOptions(f.tree, f.archive, { unpack: '*.node' });
  await preserveNativeRuntime(f.archive, f.runtime);
  expect(archivePath('dsh/node_modules/example/package.json')).toBe(join('dsh', 'node_modules', 'example', 'package.json'));
  expect(asar.extractFile(f.archive, archivePath('dsh/node_modules/example/package.json'))).toEqual(readFileSync(join(f.runtime, f.module, 'package.json')));
  expect(asar.extractFile(f.archive, 'package.json').toString()).toBe('{"main":"native-main.js"}');
  expect(asar.statFile(f.archive, archivePath('dsh/node_modules/example/addon.node'))).toMatchObject({ unpacked: true });
  expect(asar.extractFile(f.archive, archivePath('dsh/node_modules/example/addon.node')).toString()).toBe('native-binary');
});

it('rejects missing runtime resources without replacing the original archive', async () => {
  const f = fixture();
  await asar.createPackage(f.tree, f.archive);
  const before = readFileSync(f.archive);
  writeFileSync(join(f.runtime, f.module, 'LICENSE'), 'license');
  await expect(preserveNativeRuntime(f.archive, f.runtime)).rejects.toThrow('Native archive omitted');
  expect(readFileSync(f.archive)).toEqual(before);
});

it('handles archives without unpacked files', async () => {
  const f = fixture();
  await asar.createPackage(f.tree, f.archive);
  await preserveNativeRuntime(f.archive, f.runtime);
  expect(asar.extractFile(f.archive, archivePath('dsh/node_modules/example/package.json'))).toEqual(readFileSync(join(f.runtime, f.module, 'package.json')));
});
