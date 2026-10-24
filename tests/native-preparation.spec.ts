import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, it } from 'vitest';

it('prepares unsigned native packages with matching local build provenance before runtime assembly', () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'native-preparation-')));
  const scripts = join(root, 'scripts');
  const appScripts = join(root, 'upstream/apps/desktop/scripts');
  const validation = pathToFileURL(join(process.cwd(), 'src/native/validation.ts')).href;
  try {
    mkdirSync(scripts, { recursive: true });
    mkdirSync(appScripts, { recursive: true });
    mkdirSync(join(root, 'dist/native'), { recursive: true });
    copyFileSync('scripts/native-prepare.mjs', join(scripts, 'native-prepare.mjs'));
    writeFileSync(join(root, 'dist/native/validation.js'), `export * from ${JSON.stringify(validation)};`);
    writeFileSync(join(root, 'package.json'), '{"type":"module"}');
    writeFileSync(join(scripts, 'native-common.mjs'), `
      import { appendFileSync } from 'node:fs';
      import { resolve } from 'node:path';
      export const upstream = resolve('upstream');
      export const app = resolve('upstream/apps/desktop');
      export const pin = { target: 'win-x64', commit: 'fixture-commit' };
      export function verifyUpstream() {}
      export function pnpm(args, cwd, env) {
        appendFileSync('commands.jsonl', JSON.stringify({ args, cwd, env }) + '\\n');
      }
    `);
    writeFileSync(join(appScripts, 'desktop-build-paths.mjs'), `
      import { resolve } from 'node:path';
      export const desktopTargetBuildPaths = () => Object.fromEntries(
        ['packedDsh', 'packedVendor', 'packedLandlock'].map(key => [key, resolve('packed', key)]));
    `);
    writeFileSync(join(appScripts, 'desktop-package-environment.mjs'), `
      export const loadDesktopPackageEnvironment = () => ({});
      export function validateDesktopPackageEnvironment() {}
    `);
    writeFileSync(join(appScripts, 'package-target.ts'), 'export const desktopElectronBuilderEnvironment = value => value;');
    writeFileSync(join(appScripts, 'desktop-toolchain-preflight.ts'), 'export async function requireDesktopToolchain() {}');
    execFileSync(process.execPath, [join(scripts, 'native-prepare.mjs')], {
      cwd: root, env: { ...process.env, DSH_VALIDATE_OFFICE: '0' },
    });
    const calls = readFileSync(join(root, 'commands.jsonl'), 'utf8').trim().split('\n')
      .map(line => JSON.parse(line) as { args: string[]; cwd: string; env: Record<string, string> });
    expect(calls[0]?.args).toEqual(['run', 'build', '--profile', 'local']);
    expect(calls[1]?.args.slice(0, 3)).toEqual(['exec', 'tsx', 'apps/desktop/scripts/pack-local-packages.ts']);
    expect(calls[1]?.args).toContain(join(root, 'packed/packedDsh'));
    expect(calls.slice(-3).map(call => call.args)).toEqual([
      ['run', 'prepare:runtime'], ['run', 'prepare:packages'],
      ['run', 'prepare:dsh', '--defer-runtime-smoke'],
    ]);
    expect(calls.every(call => call.env.DSH_DESKTOP_BUILD_COMMIT === 'fixture-commit'
      && call.env.DSH_DESKTOP_TARGET_PLATFORM === 'win32' && call.env.DSH_DESKTOP_TARGET_ARCH === 'x64')).toBe(true);
    expect(calls.at(-1)?.cwd).toBe(join(root, 'upstream/apps/desktop'));
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
