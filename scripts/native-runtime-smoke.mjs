/** Keyless assembled-profile check, executed by the packaged Electron runtime. */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

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
const profile = loadProfileDirectory('dsh', profileDir, installAnchor);
const { ctx, shutdown } = await runProfile({
  environment: loadLayeredEnv('dsh'), profile: 'desktop', resolutionMode: 'runtime',
  resolvedProfile: { profile, installAnchor }, patchFiles: [], args: ['--no-open', '--port', '0'],
});
try {
  const ready = ctx.connection.authenticatedUrl(`http://127.0.0.1:${ctx.webServer.port}`);
  const login = await fetch(ready, { redirect: 'manual' });
  const cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
  const response = await fetch(new URL('/', ready), { headers: { cookie } });
  assert.equal(response.status, 200);
  assert.ok((await response.text()).includes('<html'));
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
  console.log('INTRANET_SMOKE ' + JSON.stringify({ web: 'passed', presets: evidence }));
} finally { await shutdown.shutdown(0); }
