// 2026-10-27-0715 — the reaper sidecar (scripts/dev/reaper.mjs), proved by RUNNING it with a stub child that sleeps: the parent registers the child's process group and is then killed (-9, SIGHUP: a closed terminal, SIGTERM) and
// the child must be gone a moment later; with the reaper OFF the same flow leaves the child running (the control: it shows the test measures the operation, not a default that happens to pass). Real processes, real signals, no
// mocks of the OS; the only thing this file touches is what it starts itself. A child that ended by itself and was un-registered is never killed (a recycled pid is not ours).
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { reapState } from './dev/reaper.mjs';

const REAPER = path.resolve(import.meta.dirname, 'dev', 'reaper.mjs');
const sleepMs = (ms) => new Promise((r) => setTimeout(r, ms));
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
async function until(cond, ms = 5000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await sleepMs(50); } return cond(); }

/** A parent that starts the reaper, starts a sleeping child in its own group, registers it as told, prints `READY <childPid>` and waits. */
function parentScript(body) {
  return [
    `import { startReaper } from ${JSON.stringify(REAPER)};`,
    "import { spawn } from 'node:child_process';",
    'const reaper = startReaper();',
    "const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });",
    'child.unref();',
    body,
    "console.log('READY ' + child.pid);",
    'setInterval(() => {}, 1000);                         // the parent stays alive (an unsettled await alone would let node exit)',
  ].join('\n');
}

async function withParent(body, env, fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-test-'));
  const file = path.join(dir, 'parent.mjs');
  fs.writeFileSync(file, parentScript(body));
  const parent = spawn(process.execPath, [file], { env: { ...process.env, ...env }, detached: true, stdio: ['ignore', 'pipe', 'inherit'] });
  let out = '';
  parent.stdout.on('data', (d) => { out += d; });
  try {
    assert.ok(await until(() => /READY \d+/.test(out), 8000), `the parent never said READY: ${out}`);
    const childPid = Number(/READY (\d+)/.exec(out)[1]);
    await sleepMs(300);                                                   // the registration line has reached the sidecar
    assert.ok(alive(childPid), 'the child is running before the parent is killed');
    await fn({ parent, childPid, dir });
  } finally {
    try { process.kill(-parent.pid, 'SIGKILL'); } catch { /* gone */ }
    const m = /READY (\d+)/.exec(out);
    if (m) { try { process.kill(Number(m[1]), 'SIGKILL'); } catch { /* gone */ } try { process.kill(-Number(m[1]), 'SIGKILL'); } catch { /* gone */ } }
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('CONTROL: with the reaper OFF a parent killed with -9 leaves its child running (the orphan the reaper exists for)', async () => {
  await withParent('reaper.add(child.pid);', { FORGE_REAPER: 'off' }, async ({ parent, childPid }) => {
    process.kill(parent.pid, 'SIGKILL');
    await sleepMs(1500);
    assert.equal(alive(childPid), true, 'without the reaper the child outlives its parent: if this is false the test below proves nothing');
  });
});

for (const [label, signal] of [['SIGKILL (nothing can be handled)', 'SIGKILL'], ['SIGHUP (the terminal was closed)', 'SIGHUP'], ['SIGTERM', 'SIGTERM']]) {
  test(`a registered child group is killed when its parent dies by ${label}`, async () => {
    await withParent('reaper.add(child.pid);', {}, async ({ parent, childPid }) => {
      process.kill(parent.pid, signal);
      assert.ok(await until(() => !alive(childPid), 5000), `the child (${childPid}) is still running 5 s after its parent was killed with ${signal}`);
    });
  });
}

test('a child that was un-registered (it ended by itself, its pid may be recycled) is NOT killed when the parent dies', async () => {
  await withParent('reaper.add(child.pid); reaper.remove(child.pid);', {}, async ({ parent, childPid }) => {
    process.kill(parent.pid, 'SIGKILL');
    await sleepMs(1500);
    assert.equal(alive(childPid), true, 'the reaper killed a pid it had been told to forget');
  });
});

test('a registered path is removed when the parent dies, and a path that was un-registered is left alone', async () => {
  const gone = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-gone-')), kept = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-kept-'));
  try {
    await withParent(`reaper.add(child.pid); reaper.addPath(${JSON.stringify(gone)}); reaper.addPath(${JSON.stringify(kept)}); reaper.removePath(${JSON.stringify(kept)});`, {}, async ({ parent }) => {
      process.kill(parent.pid, 'SIGKILL');
      assert.ok(await until(() => !fs.existsSync(gone), 5000), 'the registered directory is still there');
      assert.equal(fs.existsSync(kept), true, 'a directory the parent un-registered was removed');
    });
  } finally { fs.rmSync(gone, { recursive: true, force: true }); fs.rmSync(kept, { recursive: true, force: true }); }
});

test('a parent that ends ON PURPOSE (stop) has what is still registered reaped; the sidecar goes away with it', async () => {
  await withParent('reaper.add(child.pid); setTimeout(() => reaper.stop(), 1500);', {}, async ({ childPid }) => {
    assert.ok(await until(() => !alive(childPid), 5000), 'stop() did not reap the registered child');
  });
});

test('the state machine on its own: pids 0 and 1 and garbage are never registered (reap() would kill them: a group of -1 is every process of the user); a registered group dies at reap() and an un-registered one does not', async () => {
  const mk = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { detached: true, stdio: 'ignore' });
  const a = mk(), b = mk();
  try {
    const s = reapState();
    for (const l of ['g 1', 'g 0', 'g abc', 'g -5', 'g 1.5', 'g 1e3', 'g', 'z whatever', '', `g ${a.pid}`, `g ${b.pid}`, `u ${b.pid}`, 'd %2Ftmp%2Fx', 'd %2Ftmp%2Fy', 'x %2Ftmp%2Fy']) s.line(l);
    assert.deepEqual(s.snapshot(), { groups: [a.pid], paths: ['/tmp/x'] }, 'only well-formed pids above 1 are kept; an un-registered one and an un-registered path are gone');
    const noPaths = reapState(); noPaths.line(`g ${a.pid}`);
    noPaths.reap();
    assert.ok(await until(() => !alive(a.pid), 3000), 'the registered group survived reap()');
    assert.equal(alive(b.pid), true, 'the un-registered group was killed');
    assert.deepEqual(noPaths.snapshot(), { groups: [], paths: [] }, 'reap() empties the state');
  } finally { for (const c of [a, b]) { try { process.kill(c.pid, 'SIGKILL'); } catch { /* gone */ } } }
});

test('a registered group is killed WHOLE: a grandchild it started dies with its leader (a hung test file under `node --test` is exactly that)', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'reaper-grand-')), pidfile = path.join(dir, 'grand.pid');
  const leader = spawn('sh', ['-c', `sleep 300 & echo $! > "${pidfile}"; wait`], { detached: true, stdio: 'ignore' });
  try {
    assert.ok(await until(() => fs.existsSync(pidfile) && fs.readFileSync(pidfile, 'utf8').trim() !== '', 5000));
    const grand = Number(fs.readFileSync(pidfile, 'utf8'));
    assert.ok(alive(grand));
    const s = reapState(); s.line(`g ${leader.pid}`); s.reap();
    assert.ok(await until(() => !alive(grand), 3000), 'the grandchild outlived its group leader');
  } finally { try { process.kill(-leader.pid, 'SIGKILL'); } catch { /* gone */ } fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the registered groups are listed in pid order', () => {
  const s = reapState();
  for (const l of ['g 9000', 'g 300', 'g 42000']) s.line(l);
  assert.deepEqual(s.snapshot().groups, [300, 9000, 42000]);
  s.line('u 300'); s.line('u 12345');
  assert.deepEqual(s.snapshot().groups, [9000, 42000], 'un-registering one that is there removes it; one that never was is nothing');
});
