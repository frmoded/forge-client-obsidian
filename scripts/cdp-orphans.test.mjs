// 2026-10-27-0715 — scripts/dev/cdp.mjs leaves no Chrome behind. Measured on 2026-10-27: a script that had opened a page through cdp.mjs and was then killed with -9, or stopped with Ctrl-C, left the whole headless Chrome (11 processes, about a
// gigabyte) running with ppid 1, and its temp profile directory. Proved by RUNNING cdp.mjs with CHROME pointed at a stub that sleeps (no real Chrome needed, nothing visible, nothing heavy): the stub records its pid, the parent is
// killed, and the stub must be gone within seconds with its profile directory; with the reaper OFF it outlives the parent (the control). TMPDIR is private to each case, so nothing here touches anything it did not start.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const CDP = path.resolve(import.meta.dirname, 'dev', 'cdp.mjs');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(cond, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleepMs(100); } return cond(); }

async function scenario(signal, env = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-orphans-'));
  const tmp = path.join(dir, 'tmp'); fs.mkdirSync(tmp);
  const pidfile = path.join(dir, 'stub.pid'), stub = path.join(dir, 'stub-chrome.sh'), parentFile = path.join(dir, 'parent.mjs');
  fs.writeFileSync(stub, '#!/bin/sh\necho $$ > "$STUB_PIDFILE"\nexec sleep 300\n', { mode: 0o755 });
  fs.writeFileSync(parentFile, [`import { openPage } from ${JSON.stringify(CDP)};`, "openPage({ dir: '.', pageHtml: '<p>x</p>' }).catch(() => {});", 'setInterval(() => {}, 1000);'].join('\n'));
  const parent = spawn(process.execPath, [parentFile], { cwd: dir, env: { ...process.env, ...env, CHROME: stub, STUB_PIDFILE: pidfile, TMPDIR: tmp }, detached: true, stdio: 'ignore' });
  let stubPid = 0;
  try {
    assert.ok(await until(() => fs.existsSync(pidfile) && fs.readFileSync(pidfile, 'utf8').trim() !== '', 10000), 'cdp.mjs never started its browser');
    stubPid = Number(fs.readFileSync(pidfile, 'utf8').trim());
    await sleepMs(800);                                                   // the registration has reached the sidecar
    assert.ok(alive(stubPid), 'the stub browser is running before the parent is ended');
    process.kill(parent.pid, signal);
    const gone = await until(() => !alive(stubPid), 6000);
    await sleepMs(300);
    const profiles = fs.readdirSync(tmp).filter((n) => n.startsWith('cdp-'));
    return { gone, profiles, stubPid };
  } finally {
    if (stubPid) { try { process.kill(-stubPid, 'SIGKILL'); } catch { /* not a group leader */ } try { process.kill(stubPid, 'SIGKILL'); } catch { /* gone */ } }
    try { process.kill(-parent.pid, 'SIGKILL'); } catch { /* gone */ }
    await sleepMs(200);
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('CONTROL: with the reaper OFF a parent killed with -9 leaves the browser running and its profile directory behind', async () => {
  const r = await scenario('SIGKILL', { FORGE_REAPER: 'off' });
  assert.equal(r.gone, false, 'without the reaper the browser was gone anyway: the tests below prove nothing');
  assert.equal(r.profiles.length, 1, `profiles: ${r.profiles}`);
});

for (const [signal, why] of [['SIGKILL', 'nothing can be handled'], ['SIGINT', 'Ctrl-C'], ['SIGHUP', 'the terminal was closed'], ['SIGTERM', 'terminated']]) {
  test(`a parent ended by ${signal} (${why}) leaves no browser and no profile directory`, async () => {
    const r = await scenario(signal);
    assert.ok(r.gone, `the browser (${r.stubPid}) was still running 6 s after the parent got ${signal}`);
    assert.deepEqual(r.profiles, [], `profile directories left behind: ${r.profiles}`);
  });
}
