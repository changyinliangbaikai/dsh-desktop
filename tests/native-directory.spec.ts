import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { preserveNativeDirectory } from '../src/native/directory.js';

it('restores the complete sealed runtime on disk, including native companion resources', () => {
  const scratch = mkdtempSync(join(tmpdir(), 'native-directory-'));
  try {
    const app = join(scratch, 'app'); const source = join(scratch, 'runtime');
    mkdirSync(join(app, 'dsh'), { recursive: true }); mkdirSync(join(source, 'engine/program'), { recursive: true });
    writeFileSync(join(app, 'main.js'), 'native-shell'); writeFileSync(join(app, 'dsh/package.json'), '{}');
    writeFileSync(join(source, 'package.json'), '{"scripts":{"kept":"true"}}');
    writeFileSync(join(source, 'engine/program/bootstrap.ini'), 'native-bootstrap');
    writeFileSync(join(source, 'engine/program/services.rdb'), 'native-services');
    preserveNativeDirectory(app, source);
    expect(readFileSync(join(app, 'dsh/package.json'), 'utf8')).toContain('scripts');
    expect(readFileSync(join(app, 'dsh/engine/program/bootstrap.ini'), 'utf8')).toBe('native-bootstrap');
    expect(existsSync(join(app, 'dsh/engine/program/services.rdb'))).toBe(true);
    expect(readFileSync(join(app, 'main.js'), 'utf8')).toBe('native-shell');
  } finally { rmSync(scratch, { recursive: true, force: true }); }
});
