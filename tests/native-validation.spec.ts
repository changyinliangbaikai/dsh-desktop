import { expect, it } from 'vitest';
import { officeValidationEnabled, prepareDshArguments } from '../src/native/validation.js';

it('defers Office conversion on ordinary builds and permits explicit diagnostics', () => {
  expect(prepareDshArguments(officeValidationEnabled({}))).toContain('--defer-runtime-smoke');
  expect(officeValidationEnabled({ DSH_VALIDATE_OFFICE: '0' })).toBe(false);
  expect(prepareDshArguments(officeValidationEnabled({ DSH_VALIDATE_OFFICE: '1' })))
    .toEqual(['run', 'prepare:dsh']);
});

it('rejects an ambiguous validation request instead of silently skipping it', () => {
  expect(() => officeValidationEnabled({ DSH_VALIDATE_OFFICE: 'true' })).toThrow('0 or 1');
});
