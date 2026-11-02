// mutate-map: imports only (this file runs the CLI as a child process and imports the pure rules it tests)
// 2026-10-31-1125 - the mutation runner under a MEMORY BUDGET. The driver's 24 GB machine kernel-panicked three times on 2026-10-31 (watchdog timeout, ~914 free pages), one of them in a default-jobs mutation pass: 8 mutants at once x
// 2 test files each x a 2 GB heap, plus the Pyodide tests. Here: the heap cap defaults to 1024 MB; --jobs x test-concurrency is CAPPED so that (children x heap) fits FORGE_MEM_BUDGET_MB (and says so on stderr); a pause gate stops NEW
// test processes from starting while the machine is short of memory (and says so), and resumes; a mutant killed by the heap cap is reported as such, not as survived. Tests are on a tiny scratch project with real child processes.
import assert from 'node:assert/strict';
import { execFileSync, spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { killedByHeapCap, summarize, formatReport } from './dev/mutate-core.mjs';
import { withHeapCap } from './dev/mutate.mjs';

const CLI = path.resolve(import.meta.dirname, 'dev/mutate.mjs');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const LIB = ['export function countTo(n: number): number {', '  let i = 0;', '  while (i < n) i++;', '  return i;', '}', 'export function twice(n: number): number {', '  return n * 2;', '}'].join('\n');
const TEST = ["import { test } from 'node:test'; import assert from 'node:assert/strict';", "import { countTo, twice } from './lib.ts';", "test('countTo', () => { assert.equal(countTo(4), 4); });", "test('twice', () => { assert.equal(twice(4), 8); });"].join('\n');
function project() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-budget-'));
  const proj = path.join(root, 'proj');
  for (const [f, t] of Object.entries({ 'src/lib.ts': LIB, 'src/lib.test.ts': TEST, 'package.json': '{"type":"module"}' })) { fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true }); fs.writeFileSync(path.join(proj, f), t); }
  git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
  const hand = path.join(root, 'hand.json');
  fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'twice is off by one', 'return n * 2;', 'return n * 2 + 1;'], ['src/lib.ts', 'countTo stops early', 'while (i < n) i++;', 'while (i < n - 1) i++;']]));
  return { root, proj, hand };
}
const envOf = (extra) => ({ ...process.env, FORGE_MEM_BUDGET_MB: '', FORGE_TEST_HEAP_MB: '', FORGE_MEM_READ_FILE: '', ...extra });

test('the heap cap of a mutation test child defaults to 1024 MB (it was 2048); FORGE_TEST_HEAP_MB overrides; a cap the person set is theirs', () => {
  const was = process.env.FORGE_TEST_HEAP_MB;
  try {
    delete process.env.FORGE_TEST_HEAP_MB;
    assert.equal(withHeapCap(undefined), '--max-old-space-size=1024');
    process.env.FORGE_TEST_HEAP_MB = '1536';
    assert.equal(withHeapCap('--no-warnings'), '--no-warnings --max-old-space-size=1536');
    assert.equal(withHeapCap('--max-old-space-size=8192'), '--max-old-space-size=8192');
  } finally { if (was === undefined) delete process.env.FORGE_TEST_HEAP_MB; else process.env.FORGE_TEST_HEAP_MB = was; }
});

test('killedByHeapCap reads node\'s own out-of-memory abort; the summary and the report count those kills apart (not as survivors, not as plain kills)', () => {
  assert.equal(killedByHeapCap('<--- Last few GCs --->\nFATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory'), true);
  assert.equal(killedByHeapCap('not ok 1 - twice\nAssertionError'), false);
  const r = (id, outcome, extra = {}) => ({ id, file: 'src/a.ts', line: 1, op: 'x', outcome, from: 'a', to: 'b', ...extra });
  const s = summarize([r('k1', 'killed'), r('k2', 'killed', { heapCap: true }), r('s1', 'survived')]);
  assert.equal(s.killed, 2); assert.equal(s.heapCap, 1); assert.equal(s.survived.length, 1);
  assert.match(formatReport(s, { wallMs: 1000, jobs: 1, testCount: 1 }), /by heap cap 1/);
});

test('the CLI: a budget that fits 2 test processes lowers --jobs 8 / --test-concurrency 4 to what fits, SAYS so on stderr, and the run still completes with both mutants killed', () => {
  const { root, proj, hand } = project();
  try {
    const r = spawnSync(process.execPath, [CLI, '--root', proj, '--hand', hand, '--jobs', '8', '--test-concurrency', '4', '--timeout', '60'], { encoding: 'utf8', timeout: 120_000, env: envOf({ FORGE_MEM_BUDGET_MB: '3072' }) });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /mutate: memory budget 3072 MB, test heap 1024 MB, 1536 MB a test process at most: 2 test processes at once; --jobs 8 -> 2, test concurrency 4 -> 1/);
    assert.match(r.stdout, /killed 2/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the CLI: a budget that already fits says nothing about lowering; FORGE_MEM_BUDGET_MB raises the limit (the override)', () => {
  const { root, proj, hand } = project();
  try {
    const r = spawnSync(process.execPath, [CLI, '--root', proj, '--hand', hand, '--jobs', '2', '--test-concurrency', '2', '--timeout', '60'], { encoding: 'utf8', timeout: 120_000, env: envOf({ FORGE_MEM_BUDGET_MB: '65536' }) });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.doesNotMatch(r.stderr, /--jobs \d+ ->/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the CLI, a fake LOW-memory reading: the runner PAUSES before starting test processes (says so), and RESUMES when the reading recovers; the run then completes', async () => {
  const { root, proj, hand } = project();
  const readFile = path.join(root, 'mem.json');
  fs.writeFileSync(readFile, JSON.stringify({ availableMb: 100, freePercent: 2 }));
  try {
    const child = spawn(process.execPath, [CLI, '--root', proj, '--hand', hand, '--jobs', '2', '--timeout', '60'], { env: envOf({ FORGE_MEM_READ_FILE: readFile, FORGE_MEM_POLL_MS: '100' }), stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '', out = '';
    child.stderr.on('data', (d) => { err += d; }); child.stdout.on('data', (d) => { out += d; });
    const t0 = Date.now();
    while (!/mem-gate: paused/.test(err) && Date.now() - t0 < 60_000) await new Promise((r) => setTimeout(r, 100));
    assert.match(err, /mem-gate: paused, 100 MB available \(need \d+\), system free 2%/, 'it paused and said so');
    assert.doesNotMatch(out, /killed/, 'nothing ran while memory was short');
    fs.writeFileSync(readFile, JSON.stringify({ availableMb: 9000, freePercent: 60 }));
    const code = await new Promise((res) => child.on('exit', res));
    assert.equal(code, 0, `${out}\n${err}`);
    assert.match(err, /mem-gate: resumed after \d+ s \(9000 MB available\)/);
    assert.match(out, /killed 2/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the CLI: a mutant whose tests blow the heap cap is KILLED and counted as killed by the heap cap (FORGE_TEST_HEAP_MB=64 here), never as a survivor', () => {
  const { root, proj } = project();
  try {
    const hand = path.join(root, 'oom.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'twice eats memory', 'return n * 2;', 'const big: number[][] = []; for (let k = 0; k < 400000; k++) big.push(new Array(1000).fill(k)); return n * 2 + big.length * 0;']]));
    const out = path.join(root, 'out.json');
    const r = spawnSync(process.execPath, [CLI, '--root', proj, '--hand', hand, '--jobs', '1', '--timeout', '90', '--out', out], { encoding: 'utf8', timeout: 150_000, env: envOf({ FORGE_TEST_HEAP_MB: '64' }) });
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const res = JSON.parse(fs.readFileSync(out, 'utf8'));
    const m = res.results.find((x) => x.name === 'twice eats memory');
    assert.equal(m.outcome, 'killed'); assert.equal(m.heapCap, true);
    assert.equal(res.summary.heapCap, 1); assert.equal(res.summary.survived, 0);
    assert.match(r.stdout, /by heap cap 1/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the CLI: a mutant that holds memory OUTSIDE the JS heap (a 600 MB Buffer, which --max-old-space-size does not bound) is killed by the RSS watchdog within seconds - not left to the 60 s timeout - and counted as killed by the memory cap', () => {
  const { root, proj } = project();
  try {
    const hand = path.join(root, 'ext.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'twice holds a buffer', 'return n * 2;', 'const b = Buffer.alloc(600 * 1024 * 1024, 1); const t0 = Date.now(); while (Date.now() - t0 < 40000 && b.length > 0) { /* hold it */ } return n * 2;']]));
    const out = path.join(root, 'out.json');
    const t0 = Date.now();
    const r = spawnSync(process.execPath, [CLI, '--root', proj, '--hand', hand, '--jobs', '1', '--timeout', '60', '--out', out], { encoding: 'utf8', timeout: 150_000, env: envOf({ FORGE_TEST_RSS_MB: '350' }) });
    const secs = (Date.now() - t0) / 1000;
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const res = JSON.parse(fs.readFileSync(out, 'utf8'));
    const m = res.results.find((x) => x.name === 'twice holds a buffer');
    assert.equal(m.outcome, 'killed'); assert.equal(m.heapCap, true);
    assert.equal(res.summary.timeout, 0); assert.equal(res.summary.heapCap, 1);
    assert.ok(secs < 30, `killed by the watchdog in ${secs} s, far under the 40 s hold and the 60 s timeout`);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
