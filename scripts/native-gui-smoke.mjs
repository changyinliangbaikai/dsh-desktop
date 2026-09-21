/** Programmatic final-app close/restore/quit check; manual tray clicks stay separate. */
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

export async function smokeNativeWindow(executable, artifacts) {
  const home = mkdtempSync(join(artifacts, 'gui-smoke-'));
  copyFileSync(new URL('../tests/fixtures/native/preview.docx', import.meta.url), join(home, 'preview.docx'));
  const env = { ...process.env, DSH_HOME: home, DSH_TELEMETRY_DISABLED: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NODE_OPTIONS;
  const child = spawn(executable, ['--inspect=127.0.0.1:0'], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  let diagnostic = '';
  let endpoint;
  let ready = false;
  let exited = false;
  const exit = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code, signal) => { exited = true; resolve({ code, signal }); });
  });
  child.stdout.on('data', bytes => {
    // The ready line contains a credential. Retain only a readiness boolean.
    if (String(bytes).includes('dsh web:')) ready = true;
  });
  child.stderr.on('data', bytes => {
    const text = String(bytes);
    endpoint ??= text.match(/ws:\/\/127\.0\.0\.1:\d+\/[^\s]+/u)?.[0];
    diagnostic = (diagnostic + text.replace(/(?:https?|ws):\/\/[^\s]+/gu, '[redacted URL]')).slice(-12000);
  });
  let socket;
  let sequence = 0;
  const pending = new Map();
  async function until(probe, message, timeout = 150000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await probe()) return;
      if (exited) throw new Error(`Native GUI exited before ${message}: ${diagnostic}`);
      await delay(250);
    }
    throw new Error(`Native GUI timed out waiting for ${message}: ${diagnostic}`);
  }
  try {
    await until(() => endpoint !== undefined, 'inspector');
    socket = new WebSocket(endpoint);
    await new Promise((resolve, reject) => {
      socket.addEventListener('open', resolve, { once: true });
      socket.addEventListener('error', reject, { once: true });
    });
    socket.addEventListener('message', event => {
      const reply = JSON.parse(event.data);
      if (reply.id === undefined) return;
      const receiver = pending.get(reply.id);
      if (!receiver) return;
      pending.delete(reply.id);
      clearTimeout(receiver.timer);
      if (reply.error || reply.result?.exceptionDetails) receiver.reject(new Error(JSON.stringify(reply.error ?? reply.result.exceptionDetails)));
      else receiver.resolve(reply.result.result.value);
    });
    const evaluate = (expression, timeout = 10000) => new Promise((resolve, reject) => {
      const id = ++sequence;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error('GUI inspector evaluation timed out')); }, timeout);
      pending.set(id, { resolve, reject, timer });
      socket.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, returnByValue: true, awaitPromise: true } }));
    });
    const electron = "process.getBuiltinModule('module').createRequire(process.execPath)('electron')";
    const windows = `${electron}.BrowserWindow.getAllWindows()`;
    const primary = `${windows}.find(w => w.webContents.getURL() === 'dsh-app://app/')`;
    await until(() => ready, 'native Host');
    await until(() => evaluate(`Boolean(${primary}?.isVisible())`), 'visible application window');
    const previewCode = `(async () => {
      const call = async (method, payload) => {
        const response = await fetch('/api/' + method, { method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ type: 'client-request', rpcId: crypto.randomUUID(), method, payload }) });
        if (!response.ok) throw new Error(method + ': HTTP ' + response.status);
        const envelope = await response.json();
        if (!envelope.result.ok) throw new Error(method + ': ' + JSON.stringify(envelope.result.error));
        return envelope.result.value;
      };
      await call('officeToPdf/generation', {});
      const session = await call('session/create', { request: { cwd: ${JSON.stringify(home)} } });
      const pdf = await call('officeToPdf/render', { workspaceFileScopeId: session.sessionId, path: 'preview.docx', priority: 'foreground' });
      return { bytes: pdf.bytes, header: atob(pdf.data).slice(0, 5) };
    })()`;
    const preview = await evaluate(`${primary}.webContents.executeJavaScript(${JSON.stringify(previewCode)})`, 90000);
    assert.equal(preview.header, '%PDF-');
    assert.ok(preview.bytes > 100);
    await evaluate(`(() => { const w = ${primary}; w.close(); return true; })()`);
    await until(() => evaluate(`Boolean(${primary} && !${primary}.isDestroyed() && !${primary}.isVisible())`), 'close to tray', 10000);
    await evaluate(`${electron}.app.emit('second-instance'); true`);
    await until(() => evaluate(`Boolean(${primary}?.isVisible())`), 'native window restore', 10000);
    // Detach the debugger before quitting, otherwise Node can wait for it.
    await evaluate(`setTimeout(() => ${electron}.app.quit(), 500); true`);
    socket.close(); socket = undefined;
    let quitTimer;
    const outcome = await Promise.race([exit, new Promise((_, reject) => {
      quitTimer = setTimeout(() => reject(new Error('Native GUI did not finish Host shutdown')), 45000);
    })]).finally(() => clearTimeout(quitTimer));
    assert.equal(outcome.code, 0, diagnostic);
    return { closeHides: true, nativeRestore: true, nativeQuit: true, officePreviewRemote: preview, manualTrayClick: 'pending' };
  } finally {
    socket?.close();
    for (const receiver of pending.values()) clearTimeout(receiver.timer);
    if (!exited && child.pid) {
      if (process.platform === 'win32') {
        try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); }
        catch { child.kill(); }
      } else child.kill();
    }
    await exit.catch(() => undefined);
    rmSync(home, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  }
}
