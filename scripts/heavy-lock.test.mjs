// 2026-10-31-1125 - the heavy lock: two runs never overlap (the second waits and says who holds it), a stale lock (holder killed with -9, pid reused) is taken over, a live one is never cleared, a tool started BY the holder does not wait for it.
// The decisions are pure (decide/describeHolder, fake clock and fake liveness); the serialisation and the kill -9 are proven on REAL processes.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { acquire, clearStale, decide, describeHolder, status } from './dev/heavy-lock.mjs';

const LOCKJS = path.join(import.meta.dirname, 'dev', 'heavy-lock.mjs');
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'forge-heavylock-'));
const envFor = (dir, extra = {}) => ({ ...process.env, FORGE_HEAVY_LOCK: path.join(dir, 'forge-heavy.lock'), FORGE_HEAVY_LOCK_HELD: '', ...extra });
const waitFor = async (pred, ms = 8000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (pred()) return true; await new Promise((r) => setTimeout(r, 50)); } return false; };

test('decide: no file / garbage is free; a live holder is held; a dead holder and dead child is stale; a LIVE CHILD of a dead holder keeps it held; a reused pid (other start time) is stale', () => {
  const alive = (set) => (pid) => set.includes(pid);
  assert.equal(decide(null).state, 'free');
  assert.equal(decide({ nope: 1 }).state, 'free');
  const h = { pid: 10, lstart: 'Fri Oct 31 10:00:00 2026', what: 'matrix', since: 0 };
  assert.equal(decide(h, { alive: alive([10]), started: () => h.lstart }).state, 'held');
  assert.equal(decide(h, { alive: alive([]), started: () => '' }).state, 'stale');
  const withChild = { ...h, childPid: 11, childLstart: 'c' };
  assert.equal(decide(withChild, { alive: alive([11]), started: (p) => (p === 11 ? 'c' : '') }).state, 'held', 'the wrapper was killed but the run it started is still going');
  assert.equal(decide(h, { alive: alive([10]), started: () => 'Sat Nov  1 09:00:00 2026' }).state, 'stale', 'pid 10 is a different process now');
});

test('acquire on a fake clock: free -> ours; held by a live pid -> it WAITS, says who holds it once, and gives up with the limit named; the same holder is not announced twice', async () => {
  const dir = tmp(), env = envFor(dir), p = env.FORGE_HEAVY_LOCK;
  try {
    fs.writeFileSync(p, JSON.stringify({ pid: 4242, lstart: 'L', what: 'mutation pass', since: 0 }));
    let t = 60_000; const said = [];
    await assert.rejects(acquire({ what: 'matrix', env, say: (s) => said.push(s), now: () => t, sleep: async (ms) => { t += ms; }, pollMs: 2000, maxWaitMs: 20_000, alive: (pid) => pid === 4242, started: () => 'L' }), /gave up after 20 s waiting for mutation pass \(pid 4242/);
    assert.equal(said.length, 1, 'said once'); assert.match(said[0], /waiting - mutation pass \(pid 4242, running 60 s\) holds .*"matrix" starts when it is done/);
    assert.ok(fs.existsSync(p), 'a live holder\'s lock is untouched');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('acquire takes a stale lock over and says so; release removes ONLY our own lock', async () => {
  const dir = tmp(), env = envFor(dir), p = env.FORGE_HEAVY_LOCK;
  try {
    fs.writeFileSync(p, JSON.stringify({ pid: 999999, lstart: 'gone', what: 'old run', since: 0 }));
    const said = [];
    const lock = await acquire({ what: 'matrix', env, say: (s) => said.push(s), alive: (pid) => pid === process.pid, started: (pid) => (pid === process.pid ? 'me' : '') });
    assert.match(said.join('\n'), /taking over a STALE lock \(pid 999999 gone; it was held by old run/);
    assert.equal(JSON.parse(fs.readFileSync(p, 'utf8')).pid, process.pid);
    fs.writeFileSync(p, JSON.stringify({ pid: 123, lstart: 'x', what: 'someone else', since: 0 }));   // the file changed hands behind our back
    lock.release(); assert.ok(fs.existsSync(p), 'not ours any more: release leaves it alone');
    fs.writeFileSync(p, JSON.stringify({ pid: process.pid, lstart: 'me', what: 'matrix', since: 0 })); lock.release(); assert.ok(!fs.existsSync(p), 'ours: removed');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a heavy tool started BY the holder (FORGE_HEAVY_LOCK_HELD = the holder\'s pid) does not wait for it; FORGE_HEAVY_LOCK=off is no lock at all', async () => {
  const dir = tmp(), env = envFor(dir), p = env.FORGE_HEAVY_LOCK;
  try {
    fs.writeFileSync(p, JSON.stringify({ pid: process.pid, lstart: 'me', what: 'matrix', since: 0 }));
    const nested = await acquire({ env: { ...env, FORGE_HEAVY_LOCK_HELD: String(process.pid) }, alive: (pid) => pid === process.pid, started: () => 'me', maxWaitMs: 0 });
    assert.equal(nested.nested, true); nested.release(); assert.ok(fs.existsSync(p), 'a nested handle never removes the holder\'s lock');
    await assert.rejects(acquire({ env, say() {}, alive: (pid) => pid === process.pid, started: () => 'me', maxWaitMs: 0 }), /gave up/, 'without the marker it waits');
    const off = await acquire({ env: { ...env, FORGE_HEAVY_LOCK: 'off' }, maxWaitMs: 0 });
    assert.equal(off.disabled, true);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('REAL processes: two `run`s are serialised (the second prints who holds the lock and starts only after the first ends), and the order of their work is first, then second', async () => {
  const dir = tmp(), env = envFor(dir), log = path.join(dir, 'order.log');
  try {
    const job = (name, ms) => spawn('node', [LOCKJS, 'run', '--what', name, '--', 'node', '-e', `require('fs').appendFileSync(${JSON.stringify(log)}, 'start ${name}\\n'); setTimeout(() => { require('fs').appendFileSync(${JSON.stringify(log)}, 'end ${name}\\n'); }, ${ms});`], { env, stdio: ['ignore', 'pipe', 'pipe'] });
    const first = job('first', 1500);
    assert.ok(await waitFor(() => fs.existsSync(log) && fs.readFileSync(log, 'utf8').includes('start first')), 'the first run started');
    const second = job('second', 100);
    let err = ''; second.stderr.on('data', (d) => { err += d; });
    const codes = await Promise.all([first, second].map((c) => new Promise((res) => c.on('exit', res))));
    assert.deepEqual(codes, [0, 0]);
    assert.deepEqual(fs.readFileSync(log, 'utf8').trim().split('\n'), ['start first', 'end first', 'start second', 'end second'], 'no overlap');
    assert.match(err, /heavy-lock: waiting - first \(pid \d+/);
    assert.ok(!fs.existsSync(env.FORGE_HEAVY_LOCK), 'released at the end');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('REAL kill -9 of the holder AND of the run it started: the lock stays on disk but is STALE, `status` says so, the next run takes it over; kill -9 of the holder alone while its run still works keeps the lock HELD', async () => {
  const dir = tmp(), env = envFor(dir), p = env.FORGE_HEAVY_LOCK;
  try {
    const holder = spawn('node', [LOCKJS, 'run', '--what', 'doomed', '--', 'node', '-e', 'setTimeout(() => {}, 60000)'], { env, stdio: 'ignore' });
    assert.ok(await waitFor(() => { try { return JSON.parse(fs.readFileSync(p, 'utf8')).childPid > 0; } catch { return false; } }), 'the holder wrote its lock with the child pid');
    const held = JSON.parse(fs.readFileSync(p, 'utf8'));
    process.kill(holder.pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(status(env).state, 'held', 'the wrapper is dead but the run it started still works: not stale');
    process.kill(held.childPid, 'SIGKILL');
    assert.ok(await waitFor(() => status(env).state === 'stale'), 'now both are gone');
    assert.ok(fs.existsSync(p), 'kill -9 left the file behind');
    const s = spawnSync('node', [LOCKJS, 'status'], { env, encoding: 'utf8' });
    assert.match(s.stdout, /STALE/); assert.equal(s.status, 0);
    const next = spawnSync('node', [LOCKJS, 'run', '--what', 'next', '--', 'node', '-e', '0'], { env, encoding: 'utf8' });
    assert.equal(next.status, 0, next.stderr); assert.match(next.stderr, /taking over a STALE lock \(pid \d+ and its child \d+ gone; it was held by doomed/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('clear-stale (what reap.sh calls) removes a stale lock and never a live one', () => {
  const dir = tmp(), env = envFor(dir), p = env.FORGE_HEAVY_LOCK;
  try {
    fs.writeFileSync(p, JSON.stringify({ pid: 999999, lstart: 'gone', what: 'old', since: 0 }));
    assert.equal(clearStale(env).cleared, true); assert.ok(!fs.existsSync(p));
    const live = spawn('node', ['-e', 'setTimeout(() => {}, 20000)'], { stdio: 'ignore' });
    try {
      const lstart = spawnSync('ps', ['-o', 'lstart=', '-p', String(live.pid)], { encoding: 'utf8' }).stdout.trim();
      fs.writeFileSync(p, JSON.stringify({ pid: live.pid, lstart, what: 'busy', since: Date.now() }));
      const r = clearStale(env); assert.equal(r.cleared, false); assert.equal(r.state, 'held'); assert.ok(fs.existsSync(p));
      assert.match(describeHolder(JSON.parse(fs.readFileSync(p, 'utf8'))), /busy \(pid \d+, running \d+ s\)/);
      const cli = spawnSync('node', [LOCKJS, 'clear-stale'], { env, encoding: 'utf8' });
      assert.match(cli.stdout, /NOT cleared - held by busy/);
    } finally { live.kill('SIGKILL'); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
