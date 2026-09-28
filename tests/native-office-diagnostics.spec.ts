import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { auditOfficeResources, diagnosticErrors, errorCodes, officeDiagnosticLayout } from '../src/native/office-diagnostics.js';

it('distinguishes intact, missing, and corrupted installed Office resources', () => {
  const root = mkdtempSync(join(tmpdir(), 'office-audit-'));
  const prefix = 'node_modules/@deepseek-ai/libreoffice-kit-win32-x64/';
  try {
    mkdirSync(join(root, prefix), { recursive: true });
    const row = (name: string) => ({ path: prefix + name, bytes: 4, sha256: createHash('sha256').update('test').digest('hex') });
    writeFileSync(join(root, 'desktop-runtime.json'), JSON.stringify({ files: [row('ok'), row('missing'), row('changed'), { path: 'unrelated' }] }));
    writeFileSync(join(root, prefix, 'ok'), 'test');
    writeFileSync(join(root, prefix, 'changed'), 'oops');
    expect(auditOfficeResources(root)).toEqual({ checked: 3, failures: [
      { file: prefix + 'missing', codes: ['ENOENT'] }, { file: prefix + 'changed', codes: ['integrity-mismatch'] },
    ] });
    for (const files of [undefined, [], [null], [{ path: prefix + '../escape' }], [{ path: prefix + 'bad', sha256: 'bad', bytes: -1 }]]) {
      writeFileSync(join(root, 'desktop-runtime.json'), JSON.stringify({ files }));
      expect(() => auditOfficeResources(root)).toThrow();
    }
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('retains nested error codes without leaking document paths or credentials', () => {
  const cause = { code: 'ENOENT', message: 'C:\\Users\\secret\\document.docx' };
  expect(errorCodes({ code: 'unavailable', cause })).toEqual(['unavailable', 'ENOENT']);
  expect(errorCodes(new Error('https://localhost/?token=secret'))).toEqual(['Error']);
  expect(errorCodes({ code: 'C:\\secret' })).toEqual(['unknown']);
  expect(errorCodes(null)).toEqual(['unknown']);
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  expect(errorCodes(cycle)).toEqual(['unknown']);
});

it('resolves native ASAR engine files from their physical package closure', () => {
  const root = mkdtempSync(join(tmpdir(), 'office-layout-'));
  try {
    const executable = join(root, 'app.exe');
    expect(officeDiagnosticLayout(executable)).toMatchObject({ asar: false, engineRuntime: join(root, 'resources/app/dsh') });
    mkdirSync(join(root, 'resources')); writeFileSync(join(root, 'resources/app.asar'), 'archive');
    expect(officeDiagnosticLayout(executable)).toEqual({ asar: true, application: join(root, 'resources/app.asar'),
      runtime: join(root, 'resources/app.asar/dsh'), engineRuntime: join(root, 'resources/app.asar.unpacked/dsh') });
  } finally { rmSync(root, { recursive: true, force: true }); }
});

it('retains native exit diagnostics while redacting paths and tokens, including aggregate causes', () => {
  const error = new AggregateError([
    new Error('Native helper failed (exit 3221225781). C:\\Users\\张 三\\secret.docx'),
    new Error('Read failed: /Users/private person/fonts/font.ttf'),
    new Error('https://localhost/?token=secret\ntoken=private'),
    { message: 'Read failed: \\\\server\\private\\secret' },
  ], 'Conversion failed');
  const result = diagnosticErrors(error);
  expect(result).toHaveLength(5);
  expect(result[1]?.message).toContain('exit 3221225781');
  expect(JSON.stringify(result)).not.toMatch(/张 三|secret|private person|server|token=/u);
  const cycle: { cause?: unknown } = {}; cycle.cause = cycle;
  expect(diagnosticErrors(cycle)).toHaveLength(1);
  expect(diagnosticErrors(null)).toEqual([]);
});
