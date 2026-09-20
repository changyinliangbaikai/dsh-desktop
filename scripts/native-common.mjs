import { readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';

export const repository = fileURLToPath(new URL('..', import.meta.url));
export const pin = JSON.parse(readFileSync(join(repository, 'packaging/native-upstream.json'), 'utf8'));
// Generated trees must remain under the integration workspace's artifact plane.
export const artifacts = resolve(repository, '..', '.artifacts', 'native-desktop');
export const upstream = join(artifacts, 'upstream');
export const app = join(upstream, 'apps', 'desktop');
export const target = join(app, '.desktop-build', 'targets', pin.target);
export const release = join(artifacts, 'release');
export function run(command, args, cwd = upstream, env = process.env) {
  const result = spawnSync(command, args, { cwd, env, stdio: 'inherit', shell: false });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${command} failed (${result.status ?? result.signal})`);
}
export function pnpm(args, cwd = upstream, env = process.env) {
  if (!process.env.npm_execpath) throw new Error('Invoke through pnpm run');
  run(process.execPath, [process.env.npm_execpath, ...args], cwd, env);
}
export function verifyUpstream() {
  const revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: upstream, encoding: 'utf8' }).trim();
  if (revision !== pin.commit) throw new Error('Upstream commit does not match native-upstream.json');
  const dirty = execFileSync('git', ['status', '--porcelain', '--untracked-files=normal'], { cwd: upstream, encoding: 'utf8' }).trim();
  if (dirty) throw new Error('Upstream source checkout must remain unchanged');
  for (const directory of [upstream, app]) {
    if (JSON.parse(readFileSync(join(directory, 'package.json'), 'utf8')).version !== pin.version) {
      throw new Error('Native shell and Harness must retain the exact upstream version');
    }
  }
}
