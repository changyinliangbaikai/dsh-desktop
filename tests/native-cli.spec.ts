import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { intranetExecutable, nativeCliExecutable, stageNativeCliAlias } from '../src/native/cli.js';

describe('native command executable packaging', () => {
  let directory: string;
  beforeEach(() => { directory = mkdtempSync(join(tmpdir(), 'dsh-cli-中文-')); });
  afterEach(() => { rmSync(directory, { recursive: true, force: true }); });
  it('supplies the exact bytes under the fixed upstream command filename', () => {
    const bytes = Buffer.from([0x4d, 0x5a, 0, 255, 1, 2]);
    writeFileSync(join(directory, intranetExecutable), bytes);
    stageNativeCliAlias(directory);
    expect(readFileSync(join(directory, nativeCliExecutable))).toEqual(bytes);
    expect(readFileSync(join(directory, intranetExecutable))).toEqual(bytes);
  });
  it('refuses to replace an existing executable', () => {
    writeFileSync(join(directory, intranetExecutable), 'intranet');
    writeFileSync(join(directory, nativeCliExecutable), 'existing');
    expect(() => stageNativeCliAlias(directory)).toThrow();
    expect(readFileSync(join(directory, nativeCliExecutable), 'utf8')).toBe('existing');
  });
  it('fails when the final intranet executable is missing', () => {
    expect(() => stageNativeCliAlias(directory)).toThrow();
  });
});
