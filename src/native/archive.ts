/** Preserve the sealed native runtime across electron-builder metadata cleanup. */
import * as asar from '@electron/asar';
import { createReadStream, cpSync, existsSync, mkdtempSync, readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';

/** ASAR's reader expects native path separators, including on Windows. */
export function archivePath(path: string): string {
  return join(...path.split('/'));
}

/**
 * Reassemble the builder-produced archive with the complete sealed DSH bytes.
 * Keep builder-selected unpack flags and every non-DSH file unchanged.
 */
export async function preserveNativeRuntime(archive: string, runtime: string): Promise<void> {
  const scratch = mkdtempSync(join(dirname(archive), '.native-archive-'));
  const tree = join(scratch, 'tree');
  const output = join(scratch, 'app.asar');
  const unpacked = new Map<string, boolean>();
  for (const entry of asar.listPackage(archive, { isPack: false })) {
    const name = entry.replace(/^[/\\]/u, '');
    const info = asar.statFile(archive, name, false);
    unpacked.set(name, 'unpacked' in info && info.unpacked === true);
  }
  try {
    asar.extractAll(archive, tree);
    rmSync(join(tree, 'dsh'), { recursive: true, force: true });
    cpSync(runtime, join(tree, 'dsh'), { recursive: true });
    const streams: asar.AsarStreamType[] = [];
    function visit(directory: string): void {
      for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        const file = join(directory, entry.name);
        const path = relative(tree, file);
        // Every runtime file must have been selected by native packaging. A
        // missing file is a separate packaging failure, not a hash exception.
        // ASAR omits empty directories; the native inventory contains files
        // only. Restore those directories without relaxing file checks.
        if (!entry.isDirectory() && !unpacked.has(path)) throw new Error(`Native archive omitted ${path.split(sep).join('/')}`);
        const selected = unpacked.get(path) === true;
        if (entry.isDirectory()) {
          streams.push({ path, type: 'directory', unpacked: selected });
          visit(file);
        } else {
          streams.push({ path, type: 'file', unpacked: selected, stat: statSync(file), streamGenerator: () => createReadStream(file) });
        }
      }
    }
    visit(tree);
    await asar.createPackageFromStreams(output, streams);
    asar.uncache(archive);
    rmSync(archive);
    rmSync(`${archive}.unpacked`, { recursive: true, force: true });
    renameSync(output, archive);
    if (existsSync(`${output}.unpacked`)) renameSync(`${output}.unpacked`, `${archive}.unpacked`);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
