/** Run unchanged upstream final-layout acceptance, including its native Host. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const [application, runtime, executable, resources, descriptorFile] = process.argv.slice(2);
const { smokePreparedRuntime } = await import(pathToFileURL(join(application, 'scripts/smoke-prepared-runtime.ts')).href);
const descriptor = JSON.parse(readFileSync(descriptorFile, 'utf8'));
await smokePreparedRuntime(runtime, executable, resources, descriptor);
console.log('UPSTREAM_FINAL_LAYOUT_SMOKE passed');
