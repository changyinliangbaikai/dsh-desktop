import { expect, it } from 'vitest';
import { assertMinimumNodeVersion, officeValidationEnabled, prepareDshArguments } from '../src/native/validation.js';

it('defers Office conversion on ordinary builds and permits explicit diagnostics', () => {
  expect(prepareDshArguments(officeValidationEnabled({}))).toContain('--defer-runtime-smoke');
  expect(officeValidationEnabled({ DSH_VALIDATE_OFFICE: '0' })).toBe(false);
  expect(prepareDshArguments(officeValidationEnabled({ DSH_VALIDATE_OFFICE: '1' })))
    .toEqual(['run', 'prepare:dsh']);
});

it('rejects an ambiguous validation request instead of silently skipping it', () => {
  expect(() => officeValidationEnabled({ DSH_VALIDATE_OFFICE: 'true' })).toThrow('0 or 1');
});

it('accepts the minimum runtime and newer numeric minor, patch and major versions', () => {
  for (const version of ['24.9.0', '24.9.1', '24.10.0', '25.0.0']) {
    expect(() => assertMinimumNodeVersion(version, '24.9.0')).not.toThrow();
  }
});

it('rejects older runtimes and malformed executable responses or minimum pins', () => {
  for (const version of ['22.19.0', '24.8.99', '24.9.0-rc.1', 'v24.9.0', '24.9', '9007199254740992.0.0']) {
    expect(() => assertMinimumNodeVersion(version, '24.9.0')).toThrow();
  }
  expect(() => assertMinimumNodeVersion('24.9.0', '24.9.1')).toThrow('below required');
  expect(() => assertMinimumNodeVersion('24.9.0', 'invalid')).toThrow('stable numeric');
});
