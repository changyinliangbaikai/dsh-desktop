/** Retest immutable release bytes without waiting for another installer build. */
import assert from 'node:assert/strict';
import { join, resolve, sep } from 'node:path';
import { smokeNativeWindow } from './native-gui-smoke.mjs';

const root = resolve(process.env.PREVIEW_DIAG_ROOT ?? '');
assert.ok(root.split(sep).includes('.artifacts'), 'Diagnosis outputs must stay in the artifact plane');
const result = await smokeNativeWindow(join(root, 'app/Harness Desktop Intranet.exe'), root);
console.log(JSON.stringify({ release: 'desktop-v0.3.0-native.2', result }));
