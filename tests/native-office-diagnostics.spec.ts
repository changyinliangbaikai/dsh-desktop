import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { auditOfficeResources, errorCodes } from '../src/native/office-diagnostics.js';

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
