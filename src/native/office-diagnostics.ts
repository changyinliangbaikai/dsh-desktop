/** Read-only checks for the installed Office runtime; no Profile or document access. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const officePath = /^node_modules\/@deepseek-ai\/(?:libreoffice-kit(?:-win32-(?:x64|arm64))?|dsh-office-to-pdf)\//u;

/** Keep only machine-independent error identifiers, never paths, stacks, or messages. */
export function errorCodes(error: unknown): string[] {
  const codes: string[] = [];
  const seen = new Set<unknown>();
  while (typeof error === 'object' && error !== null && !seen.has(error) && codes.length < 8) {
    seen.add(error);
    const value = 'code' in error ? error.code : 'name' in error ? error.name : undefined;
    codes.push(typeof value === 'string' && /^[a-zA-Z0-9_-]{1,64}$/u.test(value) ? value : 'unknown');
    error = 'cause' in error ? error.cause : undefined;
  }
  return codes.length ? codes : ['unknown'];
}

/** Compare Office package bytes to the bundled inventory without following arbitrary paths. */
export function auditOfficeResources(root: string): { checked: number; failures: { file: string; codes: string[] }[] } {
  const manifest: unknown = JSON.parse(readFileSync(join(root, 'desktop-runtime.json'), 'utf8'));
  if (typeof manifest !== 'object' || manifest === null || !('files' in manifest) || !Array.isArray(manifest.files)) {
    throw new Error('Invalid runtime inventory');
  }
  let checked = 0;
  const failures: { file: string; codes: string[] }[] = [];
  for (const row of manifest.files as unknown[]) {
    if (typeof row !== 'object' || row === null || !('path' in row) || typeof row.path !== 'string') throw new Error('Invalid file row');
    if (!officePath.test(row.path)) continue;
    if (row.path.split('/').some(part => !part || part === '.' || part === '..') || /[\\:]/u.test(row.path) || [...row.path].some(char => char.charCodeAt(0) < 32)
      || !('sha256' in row) || typeof row.sha256 !== 'string' || !/^[a-f0-9]{64}$/u.test(row.sha256)
      || !('bytes' in row) || typeof row.bytes !== 'number' || !Number.isSafeInteger(row.bytes) || row.bytes < 0) {
      throw new Error('Invalid Office inventory row');
    }
    checked++;
    try {
      const bytes = readFileSync(join(root, row.path));
      if (bytes.length !== row.bytes || createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
        failures.push({ file: row.path, codes: ['integrity-mismatch'] });
      }
    } catch (error) { failures.push({ file: row.path, codes: errorCodes(error) }); }
  }
  if (!checked) throw new Error('Office files absent from inventory');
  return { checked, failures };
}
