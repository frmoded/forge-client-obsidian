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
  for (const k of Object.keys(e)) if (/^FORGE_HEAVY_(RSS|COMPRESSED|SWAP|FREE|KILL|ALSO)/.test(k)) delete e[k];
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

test('REFUSES to start (exit 75, "memory pressure high, wait", the command never runs) on compressed memory over 8 GB, on used swap over 2 GB, or on a free percentage under 35 - each alone', () => {
  const dir = mk();
  try {
    const marker = path.join(dir, 'ran');
    const cmd = ['node', '-e', `require('fs').writeFileSync(${JSON.stringify(marker)}, 'x')`];
    for (const [mem, reason] of [[{ compressedMb: 9000, swapUsedMb: 0, freePct: 90 }, /compressed memory 9000 MB is over 8192 MB/], [{ compressedMb: 100, swapUsedMb: 2500, freePct: 90 }, /swap used 2500 MB is over 2048 MB/], [{ compressedMb: 100, swapUsedMb: 0, freePct: 20 }, /free percentage 20 % is under 35 %/]]) {
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
