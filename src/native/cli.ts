/** Preserve the upstream command launcher without changing the intranet executable identity. */
import { constants, copyFileSync } from 'node:fs';
import { join } from 'node:path';

export const intranetExecutable = 'Harness Desktop Intranet.exe';
export const nativeCliExecutable = 'DeepSeek Harness.exe';

/** Add the exact final executable expected by upstream dsh.cmd; never overwrite another payload. */
export function stageNativeCliAlias(directory: string): void {
  copyFileSync(join(directory, intranetExecutable), join(directory, nativeCliExecutable), constants.COPYFILE_EXCL);
}
