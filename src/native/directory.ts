/** Keep native executables and every adjacent resource on the real filesystem. */
import { cpSync, rmSync } from 'node:fs';
import { join } from 'node:path';

/** Restore sealed bytes after builder's dependency metadata cleanup. */
export function preserveNativeDirectory(application: string, runtime: string): void {
  rmSync(join(application, 'dsh'), { recursive: true, force: true });
  cpSync(runtime, join(application, 'dsh'), { recursive: true });
}
