// 2026-11-20-1001z - scripts/heavy-guard.sh: the refusal (exit 75), the kill of the WHOLE tree (exit 76), the exit codes, the lock, the switches. Proved by RUNNING the real script with a stand-in for the machine (FORGE_HEAVY_FAKE_MEM, a file the test
// rewrites while a command runs) so nothing here depends on the Mac it runs on, and with a small memory hog of its own: a node process that allocates 20 MB at a time under a TEST cap of 150 MB (FORGE_HEAVY_RSS_MB), with a grandchild, so the test
// itself stays small (at most a few hundred MB for about a second) and the whole tree must be dead afterwards. Light: seconds. The in-process users of the guard (the mutation runner, the real-Chrome helper, run-tests) are tested in heavy-guard-wiring.test.mjs.
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

const GUARD = path.resolve(import.meta.dirname, 'heavy-guard.sh');
const mk = () => fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-guard-test-'));
const FINE = JSON.stringify({ compressedMb: 1000, swapUsedMb: 0, freePct: 80 });
/** The environment of a guard run: the guard ON (a test run switches it off by default), its own lock in the scratch directory, the machine faked. */
const envFor = (dir, extra = {}) => {
  const e = { ...process.env, FORGE_HEAVY_GUARD: 'on', FORGE_HEAVY_LOCK: path.join(dir, 'forge-heavy.lock'), FORGE_HEAVY_LOCK_HELD: '', FORGE_HEAVY_FAKE_MEM: FINE, FORGE_HEAVY_POLL_MS: '100', FORGE_HEAVY_SYS_MS: '100' };
  delete e.NODE_TEST_CONTEXT;
  for (const k of Object.keys(e)) if (/^FORGE_HEAVY_(RSS|COMPRESSED|SWAP|SAMPLE|FREE|KILL|ALSO|WAIT)/.test(k)) delete e[k];
  return { ...e, ...extra };
};
const sh = (dir, args, extra = {}) => { const r = spawnSync('bash', [GUARD, ...args], { encoding: 'utf8', env: envFor(dir, extra), timeout: 60_000 }); return { status: r.status, out: r.stdout, err: r.stderr }; };
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const until = async (cond, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (cond()) return true; await new Promise((r) => setTimeout(r, 50)); } return cond(); };

/** A memory hog with a grandchild: the pids go to <dir>/pids; it allocates 20 MB every 40 ms up to 400 MB, and ends by itself after 20 s (so a guard that fails leaves nothing for long). */
const hog = (dir) => {
  const f = path.join(dir, 'hog.mjs');
  fs.writeFileSync(f, `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const gc = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 20000)'], { stdio: 'ignore' });
fs.writeFileSync(${JSON.stringify(path.join(dir, 'pids'))}, process.pid + '\\n' + gc.pid + '\\n');
const keep = [];
setInterval(() => { if (keep.length < 20) keep.push(Buffer.alloc(20 * 1024 * 1024, 1)); }, 40);
setTimeout(() => process.exit(0), 20000);
`);
  return f;
};
const pidsOf = (dir) => fs.readFileSync(path.join(dir, 'pids'), 'utf8').trim().split('\n').map(Number);

test('REFUSES to start (exit 75, "memory pressure high, wait", the command never runs) on compressed memory over 8 GB, on used swap over 2 GB with a sign of pressure, or on a free percentage under 35', () => {
  const dir = mk();
  try {
    const marker = path.join(dir, 'ran');
    const cmd = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`];
    // 2026-11-26-1042z (deliberate): swap over 2 GB no longer refuses ALONE: here it comes with a compressor over half of its limit (5000 MB); a flat swap level alone starts (the 1042z tests below)
    for (const [mem, reason] of [[{ compressedMb: 9000, swapUsedMb: 0, freePct: 90 }, /compressed memory 9000 MB is over 8192 MB/], [{ compressedMb: 5000, swapUsedMb: 2500, freePct: 90 }, /swap used 2500 MB is over 2048 MB/], [{ compressedMb: 100, swapUsedMb: 0, freePct: 20 }, /free percentage 20 % is under 35 %/]]) {
      const r = sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: JSON.stringify(mem) });
      assert.equal(r.status, 75, r.err);
      assert.match(r.err, /memory pressure high, wait/);
      assert.match(r.err, reason);
      assert.match(r.err, /nothing was started/);
      assert.ok(!fs.existsSync(marker), 'the command did not run');
    }
    // the same machine reading as the cron logger's 13:29 block: free 42 % (a free-percentage gate says fine), compressed 10738 MB: refused all the same
    assert.equal(sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: JSON.stringify({ compressedMb: 10738, swapUsedMb: 0, freePct: 42 }) }).status, 75);
    assert.ok(!fs.existsSync(marker));
    // the limits are the user's to move
    const raised = sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: JSON.stringify({ compressedMb: 9000, swapUsedMb: 0, freePct: 90 }), FORGE_HEAVY_COMPRESSED_MB: '9500' });
    assert.equal(raised.status, 0, raised.err);
    assert.ok(fs.existsSync(marker));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the refusal lists the other big programs ("also running": wrangler/workerd and other dev servers, Chrome as one family) - and big programs alone are NEVER a reason to refuse', () => {
  const dir = mk();
  try {
    const ps = path.join(dir, 'ps.txt');
    const chrome = Array.from({ length: 10 }, (_, i) => `${5000 + i} 1 ${600 * 1024} /Applications/Google Chrome.app/Contents/MacOS/Google Chrome Helper`).join('\n');
    fs.writeFileSync(ps, `29135 1 ${900 * 1024} node /home/x/hello-cloudflare/node_modules/.bin/wrangler dev --test-scheduled\n29136 29135 ${700 * 1024} /usr/local/bin/node --no-warnings /home/x/hello-cloudflare/node_modules/wrangler/wrangler-dist/cli.js\n300 1 ${50 * 1024} /usr/bin/small\n${chrome}\n`);
    const cmd = ['node', '-e', 'process.exit(0)'];
    const refused = sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: JSON.stringify({ compressedMb: 9000 }), FORGE_HEAVY_FAKE_PS: ps });
    assert.equal(refused.status, 75);
    assert.match(refused.err, /heavy-guard: also running: Google Chrome \(10 processes, 6000 MB\), wrangler\/workerd \[dev server\] \(2 processes, 1600 MB\)/);
    assert.ok(!/small/.test(refused.err), 'a small program is not listed');
    const fine = sh(dir, cmd, { FORGE_HEAVY_FAKE_PS: ps });
    assert.equal(fine.status, 0, fine.err);
    assert.ok(!/also running/.test(fine.err), 'a machine that is fine says nothing about the big programs');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('THE KILL: a command whose tree passes the cap (a TEST cap of 150 MB) is killed WHOLE - the hog, its grandchild - exit 76, "stopped by the memory guard", the biggest process named, not a test failure', async () => {
  const dir = mk();
  try {
    const t0 = Date.now();
    const r = sh(dir, ['node', hog(dir)], { FORGE_HEAVY_RSS_MB: '150' });
    assert.equal(r.status, 76, r.err);
    assert.match(r.err, /stopped by the memory guard/);
    assert.match(r.err, /its process tree holds \d+ MB, over the 150 MB cap \(FORGE_HEAVY_RSS_MB\)/);
    const [hogPid, grandchild] = pidsOf(dir);
    assert.match(r.err, new RegExp(`Biggest process in the tree: pid ${hogPid},`), 'the hog is named as the biggest');
    assert.match(r.err, /NOT a test failure/);
    assert.ok(Date.now() - t0 < 15_000, 'it did not wait for the hog to end by itself');
    assert.ok(await until(() => !alive(hogPid) && !alive(grandchild)), `the whole tree is dead: hog ${hogPid} alive ${alive(hogPid)}, grandchild ${grandchild} alive ${alive(grandchild)}`);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('CONTROL (the test can fail): the same hog under a cap that it does not reach ends by itself with its own exit code 0 - the guard stops nothing it should not', () => {
  const dir = mk();
  try {
    const f = path.join(dir, 'small.mjs');
    fs.writeFileSync(f, `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const gc = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 1000)'], { stdio: 'ignore' });
const keep = Buffer.alloc(30 * 1024 * 1024, 1);
setTimeout(() => { console.log('fine ' + keep.length + ' ' + gc.pid); process.exit(0); }, 800);
`);
    const r = sh(dir, ['node', f], { FORGE_HEAVY_RSS_MB: '1000' });
    assert.equal(r.status, 0, r.err);
    assert.match(r.out, /^fine 31457280 \d+/);
    assert.ok(!/stopped by the memory guard/.test(r.err));
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('THE KILL by the MACHINE: the compressor passes its limit while a command (with a grandchild) runs: the whole tree is killed, exit 76, the reason names the compressed MB; a swap limit does the same', async () => {
  for (const [flip, reason] of [[{ compressedMb: 11000, swapUsedMb: 0, freePct: 50 }, /compressed memory is 11000 MB, over 10240 MB/], [{ compressedMb: 1000, swapUsedMb: 4500, freePct: 50 }, /swap used is 4500 MB, over 4096 MB/]]) {
    const dir = mk();
    try {
      const mem = path.join(dir, 'mem.json');
      fs.writeFileSync(mem, FINE);
      const f = path.join(dir, 'sleeper.mjs');
      fs.writeFileSync(f, `import { spawn } from 'node:child_process'; import fs from 'node:fs';
const gc = spawn(process.execPath, ['-e', 'setTimeout(() => process.exit(0), 20000)'], { stdio: 'ignore' });
fs.writeFileSync(${JSON.stringify(path.join(dir, 'pids'))}, process.pid + '\\n' + gc.pid + '\\n');
setTimeout(() => process.exit(0), 20000);
`);
      const child = spawn('bash', [GUARD, 'node', f], { env: envFor(dir, { FORGE_HEAVY_FAKE_MEM: mem }), stdio: ['ignore', 'pipe', 'pipe'] });
      let err = ''; child.stderr.on('data', (d) => { err += d; });
      const ended = new Promise((r) => child.on('close', (code) => r(code)));
      assert.ok(await until(() => fs.existsSync(path.join(dir, 'pids'))), 'the command started: ' + err);
      await new Promise((r) => setTimeout(r, 400));              // it runs for a while on a machine that is fine: nothing is stopped
      assert.equal(child.exitCode, null, 'still running on a fine machine');
      fs.writeFileSync(mem, JSON.stringify(flip));               // the machine gets worse
      const code = await ended;
      assert.equal(code, 76, err);
      assert.match(err, /stopped by the memory guard/);
      assert.match(err, reason);
      const pids = pidsOf(dir);
      assert.ok(await until(() => pids.every((p) => !alive(p))), `the whole tree is dead: ${pids.map((p) => `${p}:${alive(p)}`).join(' ')}`);
    } finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
});

test('exit codes: the command\'s own code (0, 3, 42) passes through with its output; a command that cannot be started is 127; no command is a usage error (2)', () => {
  const dir = mk();
  try {
    const ok = sh(dir, ['node', '-e', "console.log('hello'); process.exit(0)"]);
    assert.equal(ok.status, 0, ok.err); assert.equal(ok.out, 'hello\n');
    assert.equal(sh(dir, ['node', '-e', 'process.exit(3)']).status, 3);
    assert.equal(sh(dir, ['bash', '-c', 'exit 42']).status, 42);
    const missing = sh(dir, ['definitely-not-a-command-1001z']);
    assert.equal(missing.status, 127, missing.err); assert.match(missing.err, /could not start/);
    const none = sh(dir, []);
    assert.equal(none.status, 2); assert.match(none.err, /usage/);
    assert.equal(sh(dir, ['--bogus', 'x']).status, 2);
    assert.match(sh(dir, ['--rss-mb']).err, /needs a number/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the heavy lock: the command runs holding the SAME lock file (scripts/dev/heavy-lock.mjs) with FORGE_HEAVY_LOCK_HELD set for what it starts; the lock is gone afterwards; a command started BY a holder does not wait (no second lock, no deadlock)', () => {
  const dir = mk();
  try {
    const lock = path.join(dir, 'forge-heavy.lock');
    const probe = ['node', '-e', `const fs = require('fs'); const h = JSON.parse(fs.readFileSync(${JSON.stringify(lock)}, 'utf8')); console.log(JSON.stringify({ what: h.what, held: process.env.FORGE_HEAVY_LOCK_HELD === String(h.pid) }))`];
    const r = sh(dir, ['--what', 'my-job', ...probe]);
    assert.equal(r.status, 0, r.err);
    assert.deepEqual(JSON.parse(r.out), { what: 'my-job', held: true });
    assert.ok(!fs.existsSync(lock), 'released at the end');
    // started by a holder: FORGE_HEAVY_LOCK_HELD is set, so the guard takes no lock at all (the holder's pid here is just this test process)
    const nested = sh(dir, ['node', '-e', `console.log(require('fs').existsSync(${JSON.stringify(lock)}))`], { FORGE_HEAVY_LOCK_HELD: String(process.pid) });
    assert.equal(nested.status, 0, nested.err); assert.equal(nested.out.trim(), 'false');
    // FORGE_HEAVY_LOCK=off: no lock either, the guard still guards
    const off = sh(dir, ['node', '-e', 'process.exit(0)'], { FORGE_HEAVY_LOCK: 'off', FORGE_HEAVY_FAKE_MEM: JSON.stringify({ compressedMb: 9000 }) });
    assert.equal(off.status, 75, 'a lock that is off does not switch the memory guard off');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the switches: inside a test run (NODE_TEST_CONTEXT) the guard is off by default, FORGE_HEAVY_GUARD=off turns it off, =on turns it on; the lock is taken either way', () => {
  const dir = mk();
  try {
    const bad = JSON.stringify({ compressedMb: 9000, swapUsedMb: 9000, freePct: 5 });
    const cmd = ['node', '-e', 'process.exit(0)'];
    assert.equal(sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: bad }).status, 75, 'on');
    assert.equal(sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: bad, FORGE_HEAVY_GUARD: 'off' }).status, 0, 'off');
    assert.equal(sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: bad, FORGE_HEAVY_GUARD: 'auto', NODE_TEST_CONTEXT: 'child-v8' }).status, 0, 'auto inside a test run: off');
    assert.equal(sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: bad, FORGE_HEAVY_GUARD: 'auto' }).status, 75, 'auto outside a test run: on');
    assert.equal(sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: bad, FORGE_HEAVY_GUARD: 'on', NODE_TEST_CONTEXT: 'child-v8' }).status, 75, 'on inside a test run: on');
    const off = sh(dir, ['node', '-e', `console.log(require('fs').existsSync(${JSON.stringify(path.join(dir, 'forge-heavy.lock'))}))`], { FORGE_HEAVY_GUARD: 'off' });
    assert.equal(off.out.trim(), 'true', 'guard off: the command ran under the lock exactly as heavy-lock.mjs always ran it');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('--limits prints the limits in force (the defaults, and what the environment changes)', () => {
  const dir = mk();
  try {
    const r = spawnSync('node', [path.resolve(import.meta.dirname, 'heavy-guard.mjs'), '--limits'], { encoding: 'utf8', env: envFor(dir, { FORGE_HEAVY_RSS_MB: '777', FORGE_HEAVY_SWAP_MB: '3000' }) });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /^rssMb 777$/m); assert.match(r.stdout, /^swapRefuseMb 3000$/m); assert.match(r.stdout, /^compressedRefuseMb 8192$/m); assert.match(r.stdout, /^compressedKillMb 10240$/m);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- 2026-11-24-1037 Part A: the guard WAITS instead of refusing (--wait-minutes N / FORGE_HEAVY_WAIT_MIN; default 0 = refuse at once as always) ------------------------------------------------------------------------------
// The unit tests feed a FAKE memory reader and an injected sleep (no real waiting); the script-level ones run the real heavy-guard.sh with FORGE_HEAVY_FAKE_MEM and a 40 ms look interval (FORGE_HEAVY_WAIT_POLL_MS).
const { startOrWait, waitMinutesFrom, waitIntervalMs } = await import('./heavy-guard.mjs');
const { waitingLine } = await import('./heavy-mem-core.mjs');
const OVER = { compressedMb: 8602, swapUsedMb: 0, freePct: 80 }, UNDER = { compressedMb: 1000, swapUsedMb: 0, freePct: 80 };
/** A fake reader that answers `readings` one per call (the last one for ever), a sleep that only counts, and a print that collects. */
const fakes = (readings) => { let i = 0; const lines = [], slept = []; return { lines, slept, readMem: () => readings[Math.min(i++, readings.length - 1)], readRows: () => [], sleep: async (ms) => { slept.push(ms); }, print: (l) => lines.push(l) }; };

test('1037 A: the waiting line, exactly: `waiting for memory: compressor 8.4 GB, limit 8 GB, 3 of 20 minutes`; swap and free-memory limits are named the same way', () => {
  const limits = { compressedRefuseMb: 8192, swapRefuseMb: 2048, freePctMin: 35 };
  assert.equal(waitingLine({ mem: OVER, limits, elapsedMin: 3, totalMin: 20 }), 'waiting for memory: compressor 8.4 GB, limit 8 GB, 3 of 20 minutes');
  assert.equal(waitingLine({ mem: { compressedMb: 100, swapUsedMb: 2560, freePct: 90 }, limits, elapsedMin: 0.5, totalMin: 2 }), 'waiting for memory: swap 2.5 GB, limit 2 GB, 0.5 of 2 minutes');
  assert.equal(waitingLine({ mem: { compressedMb: 100, swapUsedMb: 0, freePct: 20 }, limits, elapsedMin: 1, totalMin: 20 }), 'waiting for memory: free memory 20 %, limit 35 %, 1 of 20 minutes');
});

test('1037 A: under the limits at once: starts at once, nothing printed, nothing slept', async () => {
  const f = fakes([UNDER]);
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 20, intervalMs: 30000, ...f });
  assert.equal(r.refuse, false); assert.deepEqual(f.lines, []); assert.deepEqual(f.slept, []);
});

test('1037 A: over, then under: one line per wait (the elapsed minutes counted from 0), then it starts; the limits it used are the real ones', async () => {
  const f = fakes([OVER, OVER, OVER, UNDER]);
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 20, intervalMs: 30000, ...f });
  assert.equal(r.refuse, false);
  assert.deepEqual(f.lines, ['waiting for memory: compressor 8.4 GB, limit 8 GB, 0 of 20 minutes', 'waiting for memory: compressor 8.4 GB, limit 8 GB, 0.5 of 20 minutes', 'waiting for memory: compressor 8.4 GB, limit 8 GB, 1 of 20 minutes']);
  assert.deepEqual(f.slept, [30000, 30000, 30000]);
  assert.equal(r.limits.compressedRefuseMb, 8192, 'a limit is never lowered or raised by waiting');
});

test('1037 A: over for the whole wait: refuses as today (the same message, nothing started) after N minutes, having slept exactly N minutes in all', async () => {
  const f = fakes([OVER]);
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 2, intervalMs: 30000, ...f });
  assert.equal(r.refuse, true);
  assert.match(r.text, /heavy-guard: memory pressure high, wait \(job\): compressed memory 8602 MB is over 8192 MB \(FORGE_HEAVY_COMPRESSED_MB\)/);
  assert.match(r.text, /nothing was started/);
  assert.equal(f.slept.reduce((a, b) => a + b, 0), 2 * 60_000, 'it waited the whole N minutes and no more');
  assert.equal(f.lines.length, 4); assert.match(f.lines[3], /1\.5 of 2 minutes$/);
});

test('1037 A: N = 0 (the default) refuses at once: no sleep, no waiting line; a wait that is not a positive number is 0; the flag wins over FORGE_HEAVY_WAIT_MIN', async () => {
  const f = fakes([OVER]);
  const r = await startOrWait({ env: {}, what: 'job', ...f });
  assert.equal(r.refuse, true); assert.deepEqual(f.slept, []); assert.deepEqual(f.lines, []);
  assert.equal(waitMinutesFrom({}, undefined), 0);
  assert.equal(waitMinutesFrom({ FORGE_HEAVY_WAIT_MIN: '12' }, undefined), 12);
  assert.equal(waitMinutesFrom({ FORGE_HEAVY_WAIT_MIN: '12' }, 5), 5, 'the flag wins');
  assert.equal(waitMinutesFrom({ FORGE_HEAVY_WAIT_MIN: '12' }, 0), 0, 'a flag of 0 wins too');
  for (const bad of ['', 'abc', '-3', 'NaN']) assert.equal(waitMinutesFrom({ FORGE_HEAVY_WAIT_MIN: bad }, undefined), 0, `env ${JSON.stringify(bad)}`);
  assert.equal(waitIntervalMs({}), 30000); assert.equal(waitIntervalMs({ FORGE_HEAVY_WAIT_POLL_MS: '40' }), 40);
});

test('1037 A, the real script: --wait-minutes waits until the machine is fine and then runs the command; with the machine bad for the whole wait it refuses 75 with the same message; the flag wins over the variable; without either it refuses at once', () => {
  const dir = mk();
  try {
    const marker = path.join(dir, 'ran'), mem = path.join(dir, 'mem.json');
    const cmd = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`];
    const BADM = { compressedMb: 9000, swapUsedMb: 0, freePct: 90 };
    // bad for the whole wait: 0.02 minutes (1.2 s) at a 40 ms look
    fs.writeFileSync(mem, JSON.stringify(BADM));
    const t0 = Date.now();
    const whole = sh(dir, ['--wait-minutes', '0.02', ...cmd], { FORGE_HEAVY_FAKE_MEM: mem, FORGE_HEAVY_WAIT_POLL_MS: '40' });
    assert.equal(whole.status, 75, whole.err); assert.match(whole.err, /waiting for memory: compressor 8\.8 GB, limit 8 GB, \S+ of 0\.02 minutes/); assert.match(whole.err, /memory pressure high, wait/); assert.match(whole.err, /nothing was started/);
    assert.ok(Date.now() - t0 >= 1000, 'it did wait'); assert.ok(!fs.existsSync(marker));
    // no wait given: at once, no waiting line
    const none = sh(dir, cmd, { FORGE_HEAVY_FAKE_MEM: mem, FORGE_HEAVY_WAIT_POLL_MS: '40' });
    assert.equal(none.status, 75); assert.ok(!/waiting for memory/.test(none.err));
    // the variable alone waits; the flag (0) wins over it and refuses at once
    const env0 = sh(dir, ['--wait-minutes', '0', ...cmd], { FORGE_HEAVY_FAKE_MEM: mem, FORGE_HEAVY_WAIT_MIN: '5', FORGE_HEAVY_WAIT_POLL_MS: '40' });
    assert.equal(env0.status, 75); assert.ok(!/waiting for memory/.test(env0.err), 'flag 0 beats FORGE_HEAVY_WAIT_MIN=5');
    // over, then under: the machine gets better after about 0.4 s
    const child = spawn('bash', [GUARD, '--wait-minutes', '1', ...cmd], { env: envFor(dir, { FORGE_HEAVY_FAKE_MEM: mem, FORGE_HEAVY_WAIT_POLL_MS: '40' }), stdio: ['ignore', 'pipe', 'pipe'] });
    return new Promise((resolve, reject) => {
      let err = ''; child.stderr.on('data', (d) => { err += d; });
      setTimeout(() => fs.writeFileSync(mem, FINE), 400);
      child.on('close', (code) => { try { assert.equal(code, 0, err); assert.match(err, /waiting for memory: compressor 8\.8 GB, limit 8 GB, \S+ of 1 minutes/); assert.ok(fs.existsSync(marker), 'the command ran once the machine was fine'); assert.match(err, /heavy-guard: .*stops its whole tree/); resolve(); } catch (e) { reject(e); } finally { fs.rmSync(dir, { recursive: true, force: true }); } });
    });
  } catch (e) { fs.rmSync(dir, { recursive: true, force: true }); throw e; }
});

test('1037 A: usage: --wait-minutes needs a number (exit 2); a negative or non-numeric value is a usage error too', () => {
  const dir = mk();
  try {
    assert.match(sh(dir, ['--wait-minutes']).err, /needs a number/);
    for (const bad of ['abc', '-1']) { const r = sh(dir, ['--wait-minutes', bad, 'node', '-e', '0']); assert.equal(r.status, 2, r.err); assert.match(r.err, /needs a number/); }
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

// ---- 2026-11-26-1042z (deliberate): a swap LEVEL alone no longer refuses; it refuses with a sign (growth, swap-ins, compressor over half its limit, low free percentage) or with no history at all -----------------------------------
// The case of the prompt (called 2026-11-25 there; the figures are those of 11-26): swap 2279 MB, flat, against a 2048 MB start limit, the compressor 2.4 GB. Fixture readings only: a fake reader, a fake clock, a sleep that only counts.
const { checkStart } = await import('./heavy-guard.mjs');
const NOW = new Date(2026, 10, 26, 13, 0, 0).getTime();
const stamp = (ms) => { const d = new Date(ms), two = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}T${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`; };
/** A sampler file (scripts/dev/sample-memory.sh): [secondsBeforeNow, swapUsedMb] rows. */
const sampleFile = (rows, now = NOW) => ['time\tcompressor_mb\tswap_used_mb\tfree_mb', ...rows.map(([ago, swap]) => `${stamp(now - ago * 1000)}\t2400\t${swap}\t900`)].join('\n') + '\n';
const QUIET = { compressedMb: 2426, swapUsedMb: 2279, freePct: 81, swapins: 613767 };
/** checkStart on fake readings (one per call, the last for ever); returns the answer and what it did. */
function look(readings, { log = '', env = {} } = {}) {
  let i = 0; const lines = [], slept = [];
  const r = checkStart({ env, what: 'job', readMem: () => readings[Math.min(i++, readings.length - 1)], readRows: () => [], readLog: () => log, now: () => NOW, sleepSync: (ms) => slept.push(ms), print: (l) => lines.push(l) });
  return { ...r, lines, slept, reads: i };
}

test('1042z (1): the 2026-11-25 case (swap 2279 MB flat, compressed 2426 MB, free fine) STARTS and says so in one line', () => {
  const logged = look([QUIET], { log: sampleFile([[50, 2279], [30, 2279], [10, 2279]]) });
  assert.equal(logged.refuse, false, logged.text);
  assert.deepEqual(logged.lines, ['heavy-guard: swap 2279 MB is over 2048 MB but flat (+0 MB in 60 s), compressed 2426 MB: starting']);
  const sampled = look([QUIET]);
  assert.equal(sampled.refuse, false, sampled.text);
  assert.deepEqual(sampled.slept, [10000], 'no log: two readings 10 s apart');
  assert.equal(sampled.reads, 2);
  assert.deepEqual(sampled.lines, ['heavy-guard: swap 2279 MB is over 2048 MB but flat (+0 MB in 10 s), compressed 2426 MB: starting']);
  assert.deepEqual(look([QUIET], { env: { FORGE_HEAVY_SAMPLE_GAP_S: '3' } }).slept, [3000]);
});

test('1042z (2): the 2026-11-20 freeze (compressed 10738 MB, free 42 %) is REFUSED at once, with no second reading, whatever the swap says', () => {
  for (const swapUsedMb of [null, 0, 2279]) {
    const r = look([{ compressedMb: 10738, swapUsedMb, freePct: 42 }]);
    assert.equal(r.refuse, true); assert.match(r.text, /compressed memory 10738 MB is over 8192 MB \(FORGE_HEAVY_COMPRESSED_MB\)/);
    assert.deepEqual([r.slept, r.reads, r.lines], [[], 1, []]);
  }
});

test('1042z (3): swap 2300 MB climbing +600 MB in 60 s is REFUSED (from the log, and from two readings with the limit scaled to their gap)', () => {
  const climbing = look([{ ...QUIET, swapUsedMb: 2300 }], { log: sampleFile([[50, 1700], [30, 1900], [10, 2100]]) });
  assert.equal(climbing.refuse, true);
  assert.match(climbing.text, /swap used 2300 MB is over 2048 MB \(FORGE_HEAVY_SWAP_MB\), and it grew \+600 MB in 60 s \(more than \+256 MB: FORGE_HEAVY_SWAP_GROW_MB per FORGE_HEAVY_SWAP_WINDOW_S\)/);
  assert.match(climbing.text, /nothing was started/);
  assert.deepEqual(climbing.lines, []);
  // two readings: +100 MB in 10 s is over 256 MB per 60 s; +40 MB is not
  const fast = look([{ ...QUIET, swapUsedMb: 2200 }, { ...QUIET, swapUsedMb: 2300 }]);
  assert.equal(fast.refuse, true); assert.match(fast.text, /it grew \+100 MB in 10 s \(more than \+42 MB/);
  const slow = look([{ ...QUIET, swapUsedMb: 2260 }, { ...QUIET, swapUsedMb: 2300 }]);
  assert.equal(slow.refuse, false, slow.text); assert.match(slow.lines[0], /but flat \(\+40 MB in 10 s\)/);
  // the two numbers are the user's to move
  assert.equal(look([{ ...QUIET, swapUsedMb: 2200 }, { ...QUIET, swapUsedMb: 2300 }], { env: { FORGE_HEAVY_SWAP_GROW_MB: '700' } }).refuse, false);
  assert.equal(look([{ ...QUIET, swapUsedMb: 2200 }, { ...QUIET, swapUsedMb: 2300 }], { env: { FORGE_HEAVY_SWAP_WINDOW_S: '20' } }).refuse, false, '256 MB per 20 s: 128 MB in 10 s');
});

test('1042z (4): swap 2300 MB flat but the compressor at 5000 MB (over half of 8192) is REFUSED, with no second reading', () => {
  const r = look([{ ...QUIET, swapUsedMb: 2300, compressedMb: 5000 }]);
  assert.equal(r.refuse, true); assert.match(r.text, /swap used 2300 MB is over 2048 MB \(FORGE_HEAVY_SWAP_MB\), and compressed memory 5000 MB is over 4096 MB \(half of the FORGE_HEAVY_COMPRESSED_MB limit\)/);
  assert.deepEqual([r.slept, r.lines], [[], []]);
});

test('1042z (5): swap 2300 MB flat, free percentage 20 is REFUSED', () => {
  const r = look([{ ...QUIET, swapUsedMb: 2300, freePct: 20 }]);
  assert.equal(r.refuse, true); assert.match(r.text, /swap used 2300 MB is over 2048 MB \(FORGE_HEAVY_SWAP_MB\), and the free percentage 20 % is under 35 %/); assert.match(r.text, /memory_pressure free percentage 20 % is under 35 % \(FORGE_HEAVY_FREE_PCT\)/);
});

test('1042z (6): swap under the limit (or exactly on it, or unknown) is unchanged: one reading, no wait, no line, even with a climbing log', () => {
  for (const swapUsedMb of [0, 2000, 2048, null]) {
    const r = look([{ ...QUIET, swapUsedMb }], { log: sampleFile([[50, 0], [10, 1000]]) });
    assert.deepEqual([r.refuse, r.slept, r.reads, r.lines], [false, [], 1, []], String(swapUsedMb));
  }
});

test('1042z (7): no history (no log) and no second reading: refuses on the level as before, and says why; a log with one sample in the window is no history; a log with two is', () => {
  const GONE = { compressedMb: null, swapUsedMb: null, freePct: null };
  const none = look([QUIET, GONE]);
  assert.equal(none.refuse, true);
  assert.match(none.text, /swap used 2279 MB is over 2048 MB \(FORGE_HEAVY_SWAP_MB\), and nothing says whether it is growing \(FORGE_HEAVY_SAMPLE_LOG is not set and the second reading gave no swap figure\): refused on the level/);
  const one = look([QUIET, GONE], { env: { FORGE_HEAVY_SAMPLE_LOG: '/x/mem.tsv' }, log: sampleFile([[10, 2279], [600, 2279]]) });
  assert.equal(one.refuse, true);
  assert.match(one.text, /\(\/x\/mem\.tsv has fewer than 2 samples in the last 60 s and the second reading gave no swap figure\): refused on the level/);
  // two samples in the window: the log is enough when the second reading fails; swap-ins cannot be read then, and the line says so
  const two = look([QUIET, GONE], { env: { FORGE_HEAVY_SAMPLE_LOG: '/x/mem.tsv' }, log: sampleFile([[40, 2279], [20, 2279]]) });
  assert.equal(two.refuse, false, two.text);
  assert.deepEqual(two.lines, ['heavy-guard: swap 2279 MB is over 2048 MB but flat (+0 MB in 40 s), compressed 2426 MB: starting (swap-ins not read: that signal was skipped)']);   // 40 s: from the oldest sample to the one reading that has a figure
});

test('1042z: swap-ins: over 200 pages/s between the two readings REFUSES; under it starts; without a Swapins counter the signal is skipped and the line says so', () => {
  const busy = look([{ ...QUIET, swapins: 1000 }, { ...QUIET, swapins: 4000 }]);
  assert.equal(busy.refuse, true); assert.match(busy.text, /swap used 2279 MB is over 2048 MB \(FORGE_HEAVY_SWAP_MB\), and swap-ins run at 300 pages\/s \(more than 200: FORGE_HEAVY_SWAPIN_PPS\)/);
  assert.equal(look([{ ...QUIET, swapins: 1000 }, { ...QUIET, swapins: 2900 }]).refuse, false, '190 pages/s');
  assert.equal(look([{ ...QUIET, swapins: 1000 }, { ...QUIET, swapins: 4000 }], { env: { FORGE_HEAVY_SWAPIN_PPS: '301' } }).refuse, false);
  // a flat log does not hide swap-ins: they are read from the two readings
  assert.equal(look([{ ...QUIET, swapins: 1000 }, { ...QUIET, swapins: 4000 }], { log: sampleFile([[50, 2279], [10, 2279]]) }).refuse, true);
  const { swapins, ...noCounter } = QUIET;
  const r = look([noCounter]);
  assert.equal(r.refuse, false, r.text);
  assert.deepEqual(r.lines, ['heavy-guard: swap 2279 MB is over 2048 MB but flat (+0 MB in 10 s), compressed 2426 MB: starting (swap-ins not read: that signal was skipped)']);
});

test('1042z: the SECOND reading is judged: a compressor that jumped over its limit during the gap refuses; swap that fell under the level starts with no line', () => {
  const jumped = look([QUIET, { ...QUIET, compressedMb: 9000 }]);
  assert.equal(jumped.refuse, true); assert.match(jumped.text, /compressed memory 9000 MB is over 8192 MB/);
  const fell = look([QUIET, { ...QUIET, swapUsedMb: 1500 }]);
  assert.deepEqual([fell.refuse, fell.lines], [false, []]);
});

test('1042z: --wait-minutes: each look applies the new rule: refused while swap climbs, starts the moment it is flat; the time between the two readings counts as waiting', async () => {
  const f = fakes([{ ...QUIET, swapUsedMb: 2200 }, { ...QUIET, swapUsedMb: 2500 }, { ...QUIET, swapUsedMb: 2500 }, { ...QUIET, swapUsedMb: 2500 }]);
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 20, intervalMs: 30000, readLog: () => '', now: () => NOW, ...f });
  assert.equal(r.refuse, false, r.text);
  assert.deepEqual(f.slept, [10000, 30000, 10000]);
  assert.deepEqual(f.lines, ['waiting for memory: swap 2.4 GB, limit 2 GB, 0.17 of 20 minutes', 'heavy-guard: swap 2500 MB is over 2048 MB but flat (+0 MB in 10 s), compressed 2426 MB: starting']);
  // climbing for the whole wait: refused at the end, having slept N minutes and at most one gap more
  let swap = 2100;
  const g = { ...fakes([QUIET]), readMem: () => ({ ...QUIET, swapUsedMb: (swap += 100) }) };
  const bad = await startOrWait({ env: {}, what: 'job', waitMinutes: 2, intervalMs: 30000, readLog: () => '', now: () => NOW, ...g });
  assert.equal(bad.refuse, true); assert.match(bad.text, /it grew \+100 MB in 10 s/);
  const total = g.slept.reduce((a, b) => a + b, 0);
  assert.ok(total >= 120000 && total <= 130000, `slept ${total} ms`);
});

test('1042z, the real script: a flat swap level over the limit STARTS the command after the two readings and says so; a climbing sample log named by FORGE_HEAVY_SAMPLE_LOG refuses 75; the kill limit still stops at 4096', () => {
  const dir = mk();
  try {
    const marker = path.join(dir, 'ran'), cmd = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`];
    const flat = { FORGE_HEAVY_FAKE_MEM: JSON.stringify({ ...QUIET, swapUsedMb: 2500 }), FORGE_HEAVY_SAMPLE_GAP_S: '0.4' };
    const t0 = Date.now();
    const ok = sh(dir, cmd, flat);
    assert.equal(ok.status, 0, ok.err); assert.ok(Date.now() - t0 >= 400, 'it took the second reading after the gap');
    assert.match(ok.err, /^heavy-guard: swap 2500 MB is over 2048 MB but flat \(\+0 MB in 0\.4 s\), compressed 2426 MB: starting$/m);
    assert.ok(fs.existsSync(marker)); fs.rmSync(marker);
    const log = path.join(dir, 'mem.tsv'); fs.writeFileSync(log, sampleFile([[40, 1500], [20, 2000]], Date.now()));
    const no = sh(dir, cmd, { ...flat, FORGE_HEAVY_SAMPLE_LOG: log });
    assert.equal(no.status, 75, no.err); assert.match(no.err, /it grew \+1000 MB in \S+ s/); assert.ok(!fs.existsSync(marker));
    const missing = sh(dir, cmd, { ...flat, FORGE_HEAVY_SAMPLE_LOG: path.join(dir, 'none.tsv') });
    assert.equal(missing.status, 0, `a log that cannot be read: the two readings alone: ${missing.err}`);
    // flat but over the STOP limit: the start rule lets it in and the stop rule ends it, exit 76 (the kill limit is untouched)
    const over = sh(dir, ['node', '-e', 'setTimeout(() => {}, 20000)'], { ...flat, FORGE_HEAVY_FAKE_MEM: JSON.stringify({ ...QUIET, swapUsedMb: 4500 }) });
    assert.equal(over.status, 76, over.err); assert.match(over.err, /swap used is 4500 MB, over 4096 MB/);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('1042z: checkStart as the test runner and the mutation tool call it (no sleep given) really waits for the gap between its two readings', () => {
  const t0 = Date.now(), lines = [];
  const r = checkStart({ env: { FORGE_HEAVY_SAMPLE_GAP_S: '0.3' }, what: 'job', readMem: () => QUIET, readRows: () => [], print: (l) => lines.push(l) });
  assert.equal(r.refuse, false); assert.ok(Date.now() - t0 >= 290, `${Date.now() - t0} ms`); assert.equal(lines.length, 1);
});
