import { join } from 'node:path';
import { app, pnpm, repository, verifyUpstream } from './native-common.mjs';

if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('Native packaging requires Windows x64');
verifyUpstream();
pnpm(['exec', 'electron-builder', '--config', join(repository, 'scripts/native-config.mjs'), '--win', '--x64', '--publish', 'never'], app);
verifyUpstream();
