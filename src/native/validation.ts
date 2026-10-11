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
