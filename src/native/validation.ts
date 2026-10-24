/** Office regression probes are opt-in after the customer confirmed the repair. */
export function officeValidationEnabled(environment: NodeJS.ProcessEnv): boolean {
  const value = environment.DSH_VALIDATE_OFFICE;
  if (value === undefined || value === '0') return false;
  if (value === '1') return true;
  throw new Error('DSH_VALIDATE_OFFICE must be 0 or 1');
}

/** Defer the combined upstream Office/Host smoke; final payload and Host gates still run. */
export function prepareDshArguments(office: boolean): string[] {
  return ['run', 'prepare:dsh', ...(office ? [] : ['--defer-runtime-smoke'])];
}

/** Check the actual packaged Electron Node runtime against the reviewed upstream minimum. */
export function assertMinimumNodeVersion(actual: string, minimum: string): void {
  const parse = (value: string): number[] => {
    const parts = value.split('.').map(Number);
    if (!/^\d+\.\d+\.\d+$/u.test(value) || !parts.every(Number.isSafeInteger)) {
      throw new Error('Expected a stable numeric Node version');
    }
    return parts;
  };
  const installed = parse(actual);
  const required = parse(minimum);
  for (let index = 0; index < 3; index++) {
    const difference = installed[index]! - required[index]!;
    if (difference > 0) return;
    if (difference < 0) throw new Error(`Packaged Node ${actual} is below required ${minimum}`);
  }
}
