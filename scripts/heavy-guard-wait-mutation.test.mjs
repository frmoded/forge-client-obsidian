// 2026-11-24-1037 mutation pass: the tests that kill the survivors of the guard's WAIT (scripts/heavy-guard.mjs, scripts/heavy-mem-core.mjs waitingLine). Fast: nothing here waits for real except a few hundred milliseconds.
// Two things the first tests did not do: (1) heavy-guard.sh checks --wait-minutes itself (digits and a dot only), so main()'s OWN check of the flag, its usage text and `--rss-mb` were reached by no test: these run `node scripts/heavy-guard.mjs` directly;
// (2) the last step of a wait that is not a whole number of looks, the poll variable's edge (0), and waitingLine at the exact limit were not pinned.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { startOrWait, waitIntervalMs } from './heavy-guard.mjs';
import { waitingLine } from './heavy-mem-core.mjs';

const GUARD_MJS = path.resolve(import.meta.dirname, 'heavy-guard.mjs');
const FINE = { compressedMb: 1000, swapUsedMb: 0, freePct: 80 }, OVER = { compressedMb: 8602, swapUsedMb: 0, freePct: 80 };
const LIMITS = { compressedRefuseMb: 8192, swapRefuseMb: 2048, freePctMin: 35 };
const fakes = (readings) => { let i = 0; const lines = [], slept = []; return { lines, slept, readMem: () => readings[Math.min(i++, readings.length - 1)], readRows: () => [], sleep: async (ms) => { if (slept.push(ms) > 1000) throw new Error('the wait did not end (more than 1000 looks)'); }, print: (l) => lines.push(l) }; };

/** `node scripts/heavy-guard.mjs <args>` itself (not through heavy-guard.sh): the machine faked, no wait variable from the driver's shell. */
function run(args, mem = FINE, extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'heavy-guard-wait-mut-'));
  try {
    const memFile = path.join(dir, 'mem.json'); fs.writeFileSync(memFile, JSON.stringify(mem));
    const env = { ...process.env, FORGE_HEAVY_FAKE_MEM: memFile, ...extra };
    for (const k of ['FORGE_HEAVY_WAIT_MIN', 'FORGE_HEAVY_RSS_MB', 'FORGE_HEAVY_GUARDED', 'FORGE_HEAVY_WAIT_POLL_MS']) if (!(k in extra)) delete env[k];
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [GUARD_MJS, ...args], { encoding: 'utf8', env, timeout: 20_000 });
    return { status: r.status, out: r.stdout, err: r.stderr, ms: Date.now() - t0, dir };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// ---- the poll interval --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('1037 mutation: the look interval is FORGE_HEAVY_WAIT_POLL_MS only when it is above 0; 0, negative, empty and not-a-number fall back to 30 s (a 0 ms look would never advance the wait: it would spin for ever)', () => {
  assert.equal(waitIntervalMs({ FORGE_HEAVY_WAIT_POLL_MS: '40' }), 40);
  assert.equal(waitIntervalMs({ FORGE_HEAVY_WAIT_POLL_MS: '0.5' }), 0.5);
  for (const bad of ['0', '-5', '', 'abc', 'NaN', 'Infinity']) assert.equal(waitIntervalMs({ FORGE_HEAVY_WAIT_POLL_MS: bad }), 30_000, JSON.stringify(bad));
  assert.equal(waitIntervalMs({}), 30_000);
});

// ---- the end of the wait ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('1037 mutation: a wait that is not a whole number of looks ends EXACTLY at N minutes: the last sleep is the rest (45 s at a 30 s look: 30 s then 15 s), never a whole look more', async () => {
  const f = fakes([OVER]);
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 0.75, intervalMs: 30_000, ...f });
  assert.equal(r.refuse, true);
  assert.deepEqual(f.slept, [30_000, 15_000]);
  assert.deepEqual(f.lines, ['waiting for memory: compressor 8.4 GB, limit 8 GB, 0 of 0.75 minutes', 'waiting for memory: compressor 8.4 GB, limit 8 GB, 0.5 of 0.75 minutes']);
});

test('1037 mutation: the wait ENDS (survivor 3, the one that timed out): over for the whole wait, the loop stops after N minutes with the refusal; a sleep that throws after 100 looks turns a loop that never ends into a failure here, not a hang', async () => {
  let looks = 0;
  const f = { ...fakes([OVER]), sleep: async () => { if (++looks > 100) throw new Error('the wait did not end: more than 100 looks for a 2 minute wait at a 30 s look'); } };
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 2, intervalMs: 30_000, ...f });
  assert.equal(r.refuse, true); assert.equal(looks, 4, 'exactly N minutes / the look: 4 sleeps, then the refusal');
  const g = { ...fakes([OVER]), sleep: async () => { if (++looks > 100) throw new Error('the wait did not end'); } };
  looks = 0;
  const r2 = await startOrWait({ env: {}, what: 'job', waitMinutes: 0.5, intervalMs: 30_000, ...g });
  assert.equal(r2.refuse, true); assert.equal(looks, 1, 'a wait of exactly one look: one sleep, then the refusal (not one more at the end of the wait)');
});

test('1037 mutation: a look interval LONGER than the whole wait sleeps the wait and no more (0.01 minutes = 600 ms at a 30 s look)', async () => {
  const f = fakes([OVER]);
  const r = await startOrWait({ env: {}, what: 'job', waitMinutes: 0.01, intervalMs: 30_000, ...f });
  assert.equal(r.refuse, true); assert.deepEqual(f.slept, [600]);
});

test('1037 mutation: the wait ENDS the moment the machine is fine: a start that is fine at once sleeps nothing and prints nothing however long the wait; one that gets fine after the first look stops there (a loop that keeps waiting on a fine machine never ends)', async () => {
  const fine = fakes([FINE]);
  const a = await startOrWait({ env: {}, what: 'job', waitMinutes: 20, intervalMs: 30_000, ...fine });
  assert.equal(a.refuse, false); assert.deepEqual(fine.slept, []); assert.deepEqual(fine.lines, []);
  const later = fakes([OVER, FINE]);
  const b = await startOrWait({ env: {}, what: 'job', waitMinutes: 20, intervalMs: 30_000, ...later });
  assert.equal(b.refuse, false); assert.deepEqual(later.slept, [30_000]); assert.equal(later.lines.length, 1);
});

test('1037 mutation, the real CLI: on a fine machine `--wait-minutes 0.5` runs the command AT ONCE (well under the 30 s wait), prints no waiting line, and the command\'s exit code is the guard\'s', () => {
  const r = run(['--wait-minutes', '0.5', '--what', 'probe', '--', process.execPath, '-e', 'process.exit(7)'], FINE, { FORGE_HEAVY_WAIT_POLL_MS: '40' });
  assert.equal(r.status, 7, r.err); assert.ok(r.ms < 12_000, `it started at once, took ${r.ms} ms`);
  assert.ok(!/waiting for memory/.test(r.err), r.err); assert.match(r.err, /heavy-guard: probe: stops its whole tree over 6144 MB/);
});

test('1037 mutation, the real CLI: FORGE_HEAVY_WAIT_MIN alone waits (a short wait, bad machine the whole time) and refuses 75 at the end', () => {
  const r = run(['--what', 'probe', '--', process.execPath, '-e', '0'], OVER, { FORGE_HEAVY_WAIT_MIN: '0.01', FORGE_HEAVY_WAIT_POLL_MS: '100' });
  assert.equal(r.status, 75, r.err); assert.match(r.err, /waiting for memory: compressor 8\.4 GB, limit 8 GB, \S+ of 0\.01 minutes/); assert.match(r.err, /memory pressure high, wait \(probe\)/);
});

// ---- main()'s own checks of the flag and the usage (heavy-guard.sh never lets these reach it) ---------------------------------------------------------------------------------------------------------------
const NEEDS = 'heavy-guard: --wait-minutes needs a number (0 or more)';
test('1037 mutation, the real CLI: a --wait-minutes that is not a number (abc, negative, empty, blank, missing, or the next word is `--`) is exit 2 with the sentence `--wait-minutes needs a number (0 or more)`; the command never runs', () => {
  for (const args of [['--wait-minutes', 'abc', '--', 'node', '-e', '0'], ['--wait-minutes', '-1', '--', 'node', '-e', '0'], ['--wait-minutes', '', '--', 'node', '-e', '0'], ['--wait-minutes', '  ', '--', 'node', '-e', '0'],
    ['--wait-minutes', 'Infinity', '--', 'node', '-e', '0'], ['--wait-minutes'], ['--wait-minutes', '--', 'node', '-e', '0']]) {
    const r = run(args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}: ${r.status} ${r.err}`);
    assert.equal(r.err.trim(), NEEDS, JSON.stringify(args));
  }
});

test('1037 mutation, the real CLI: --wait-minutes 0 is a number (0 = no wait): the command runs on a fine machine; the flag is only looked at when it is given (a line without it never says "needs a number")', () => {
  const zero = run(['--wait-minutes', '0', '--', process.execPath, '-e', 'process.exit(3)']);
  assert.equal(zero.status, 3, zero.err); assert.ok(!/needs a number/.test(zero.err));
  const none = run(['--', process.execPath, '-e', 'process.exit(4)']);
  assert.equal(none.status, 4, none.err); assert.ok(!/needs a number/.test(none.err));
});

test('1037 mutation, the real CLI: no command is exit 2 with the usage line (every option named), with or without a wait', () => {
  const USAGE = 'usage: heavy-guard.mjs [--what label] [--rss-mb n] [--wait-minutes n] -- <command...>';
  for (const args of [[], ['--'], ['--what', 'x'], ['--wait-minutes', '5'], ['--wait-minutes', '5', '--']]) {
    const r = run(args);
    assert.equal(r.status, 2, `${JSON.stringify(args)}: ${r.err}`); assert.equal(r.err.trim(), USAGE, JSON.stringify(args));
  }
});

test('1037 mutation, the real CLI: --rss-mb n sets the tree cap (printed by --limits and in the start line); without it the default 6144 stands', () => {
  const withFlag = run(['--rss-mb', '777', '--limits']);
  assert.equal(withFlag.status, 0, withFlag.err); assert.match(withFlag.out, /^rssMb 777$/m);
  const without = run(['--limits']);
  assert.match(without.out, /^rssMb 6144$/m);
  const start = run(['--rss-mb', '777', '--what', 'probe', '--', process.execPath, '-e', '0']);
  assert.equal(start.status, 0, start.err); assert.match(start.err, /heavy-guard: probe: stops its whole tree over 777 MB/);
});

// ---- waitingLine: the limits are strict, the parts are joined with `; ` ----------------------------------------------------------------------------------------------------------------------------------------
test('1037 mutation: waitingLine names a figure only when it is OVER its limit: exactly at the limit (compressor 8192, swap 2048, free 35 %) it is not named, one over (or one under, for free memory) it is', () => {
  const only = (mem) => waitingLine({ mem: { compressedMb: 100, swapUsedMb: 0, freePct: 90, ...mem }, limits: LIMITS, elapsedMin: 1, totalMin: 20 });
  // exactly at the limit: not named; a second figure that is over is the only one named
  assert.equal(only({ compressedMb: 8192, swapUsedMb: 2560 }), 'waiting for memory: swap 2.5 GB, limit 2 GB, 1 of 20 minutes');
  assert.equal(only({ swapUsedMb: 2048, compressedMb: 8602 }), 'waiting for memory: compressor 8.4 GB, limit 8 GB, 1 of 20 minutes');
  assert.equal(only({ freePct: 35, compressedMb: 8602 }), 'waiting for memory: compressor 8.4 GB, limit 8 GB, 1 of 20 minutes');
  // one past the limit: named
  assert.match(only({ compressedMb: 8193 }), /^waiting for memory: compressor 8 GB, limit 8 GB, /);
  assert.match(only({ swapUsedMb: 2049 }), /^waiting for memory: swap 2 GB, limit 2 GB, /);
  assert.match(only({ freePct: 34 }), /^waiting for memory: free memory 34 %, limit 35 %, /);
});

test('1037 mutation: waitingLine with two or three limits over joins them with `; ` in the order compressor, swap, free memory; a figure the machine did not give is never named', () => {
  const l = (mem) => waitingLine({ mem, limits: LIMITS, elapsedMin: 3, totalMin: 20 });
  assert.equal(l({ compressedMb: 8602, swapUsedMb: 2560, freePct: 20 }), 'waiting for memory: compressor 8.4 GB, limit 8 GB; swap 2.5 GB, limit 2 GB; free memory 20 %, limit 35 %, 3 of 20 minutes');
  assert.equal(l({ compressedMb: 8602, swapUsedMb: 2560, freePct: 90 }), 'waiting for memory: compressor 8.4 GB, limit 8 GB; swap 2.5 GB, limit 2 GB, 3 of 20 minutes');
  assert.equal(l({ compressedMb: null, swapUsedMb: 2560, freePct: null }), 'waiting for memory: swap 2.5 GB, limit 2 GB, 3 of 20 minutes');
});
