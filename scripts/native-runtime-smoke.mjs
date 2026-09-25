/** Keyless assembled-profile check, executed by the packaged Electron runtime. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, delimiter } from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';

const root = process.argv[2];
const runtimeRequire = createRequire(join(root, 'package.json'));
const fromRuntime = name => import(pathToFileURL(runtimeRequire.resolve(name)).href);
const { initProfile, PROFILE_TEMPLATES, loadProfileDirectory, loadLayeredEnv } = await fromRuntime('@deepseek-ai/dsh-app-boot');
const { runProfile } = await fromRuntime('@deepseek-ai/dsh/profile-boot');
const profileDir = join(process.env.DSH_HOME, 'profiles', 'desktop');
mkdirSync(profileDir, { recursive: true });
initProfile(profileDir, PROFILE_TEMPLATES.web.bundles);
writeFileSync(join(profileDir, 'cordis.patch.yml'), '- id: webserver\n  config:\n    host: 127.0.0.1\n    port: 0\n');
const installAnchor = join(root, 'node_modules/@deepseek-ai/dsh/package.json');
const runtime = process.argv[3];
const launch = () => runProfile({
  environment: loadLayeredEnv('dsh'), profile: 'desktop', resolutionMode: 'runtime',
  resolvedProfile: { profile: loadProfileDirectory('dsh', profileDir, installAnchor), installAnchor }, patchFiles: [], args: ['--no-open', '--port', '0'],
  packageManager: { command: process.execPath, args: ['--expose-internals', join(runtime, 'pnpm/bin/pnpm.cjs')],
    env: { ELECTRON_RUN_AS_NODE: '1', DSH_DESKTOP_NODE_EXECUTABLE: process.execPath,
      PATH: `${join(runtime, 'bin')}${delimiter}${process.env.PATH ?? ''}` } },
});
const { ctx, shutdown } = await launch();
let result;
try {
  const ready = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`);
  const login = await fetch(ready, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const response = await fetch(new URL('/', ready), { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('<html'));
  const fixtures = fileURLToPath(new URL('../tests/fixtures/native/', import.meta.url));
  const sessionPath = new URL('/dsh-offline-plugin-installer/session.json', ready);
  assert.equal((await fetch(sessionPath)).status, 401, 'Installer metadata requires native authentication');
  const installerResponse = await fetch(sessionPath, { headers: { cookie } });
  assert.equal(installerResponse.status, 200);
  const installer = await installerResponse.json();
  assert.equal(installer.profile, 'desktop');
  assert.equal(installer.networkDisabled, true);
  assert.ok(JSON.stringify(ctx.webServer.collectIndexInjections()).includes('dsh-offline-plugin-installer'));
  const archive = join(process.env.DSH_HOME, 'smoke-plugin.tgz');
  execFileSync('tar', ['--format=ustar', '-czf', archive, '-C', join(fixtures, 'offline-plugin'), 'package']);
  const install = await fetch(new URL('/dsh-offline-plugin-installer/install.tgz', ready), {
    method: 'POST', headers: { cookie, 'content-type': 'application/gzip', 'x-dsh-plugin-filename': 'smoke.tgz', 'x-dsh-installer-token': installer.token },
    body: readFileSync(archive),
  });
  const installed = await install.json();
  assert.equal(install.status, 200, JSON.stringify(installed));
  assert.equal(installed.restartRequired, true);
  assert.equal(ctx.get('desktopOfflineSmoke'), undefined, 'Installation must not claim hot activation');
  const presets = await ctx.agentPresets.list();
  assert.deepEqual(presets.map(preset => preset.id).sort(), ['cordis', 'minimal', 'ptc', 'standard']);
  const evidence = [];
  for (const id of ['standard', 'ptc', 'cordis', 'minimal']) {
    const handle = await ctx.agents.create({
      sessionId: `intranet-smoke-${id}`,
      setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, id); },
    });
    try {
      const names = ctx.tools.schemas(handle.agent).map(tool => tool.name);
      assert.ok(!names.includes('web_search'), `${id} must not expose web_search`);
      if (id !== 'minimal') assert.ok(names.includes('web_fetch'), `${id} must preserve web_fetch`);
      evidence.push({ preset: id, webSearch: false, webFetch: names.includes('web_fetch'), tools: names.length });
    } finally { await handle.dispose(); }
  }
  result = { web: 'passed', presets: evidence,
    offlineInstaller: { archiveInstalled: true, clientDiscovered: true, authenticated: true, restartRequired: true } };
} finally { await shutdown.shutdown(0); }
const restarted = await launch();
try {
  assert.equal(restarted.ctx.get('desktopOfflineSmoke'), true, 'Installed archive must activate after restart');
  result.offlineInstaller.restartActivated = true;
  console.log('INTRANET_SMOKE ' + JSON.stringify(result));
} finally { await restarted.shutdown.shutdown(0); }
