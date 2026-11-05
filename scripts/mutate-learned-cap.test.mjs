// mutate-map: imports only (this file runs the CLI as a child process and imports the pure rules it tests)
// 2026-11-02-1151 - the mutation runner and a test file that NEEDS more memory than the cap. The cap (FORGE_TEST_RSS_MB, 1536 MB by default) is one number for every test file; a real-plugin test (it bundles the plugin: esbuild and node, the
// resident memory of the whole tree summed, about 2 GB) is over it WITHOUT any mutant, so the runner killed it at once, called its baseline red ("fails on the UNMUTATED tree, alone too") and called every kill by it unproven: BASELINE NOT
// GREEN for a file that passes in the real tree (src/phrase-registration.test.ts, drains 1135 and 1149). The scratch copy was never the difference. Here: a file whose unmutated tree is over the cap is MEASURED (alone, unmutated), its cap is
// raised to what it needs plus a margin for this run (and the runner says so), the mutants it was killed in under the old cap are run again, a REAL runaway is still killed by the cap, and a baseline that is red for a real reason names the
// test and the first failing line (it said only the file).
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';

import { capKilledFiles, firstFailure } from './dev/mutate-core.mjs';
import { groupMbs, groupsOverCap } from './dev/mem-core.mjs';

const CLI = path.resolve(import.meta.dirname, 'dev/mutate.mjs');
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const LIB = [
  'export function twice(n: number): number {', '  return n * 2;', '}',
  '/** Holds `mb` megabytes, touched and KEPT (the resident size counts them): what a real-plugin test does while it bundles. */',
  'const held: Buffer[] = [];', 'export function hold(mb: number): number {', '  held.push(Buffer.alloc(mb * 1024 * 1024, 1));', '  return held.length;', '}',
].join('\n');
// 2026-11-05-1176: the fixture used to sleep a fixed 2.5 s and the runaway mutant (three-fold memory) had to be SEEN by the runner's memory watchdog inside that window - on a thrashing machine the watchdog's sample came late, the mutant ended first and "survived". Now a process that holds more than 650 MB (the runaway; the honest 300 MB file is about 350 MB) waits until it is killed (90 s at most), so the watchdog may sample whenever it gets to; the honest file still ends after 2.5 s.
const HUNGRY = ["import { test } from 'node:test'; import assert from 'node:assert/strict';", "import { hold, twice } from './lib.ts';", "test('twice, holding 300 MB for a while', async () => { assert.equal(twice(2), 4); assert.ok(hold(300) > 0); const runaway = process.memoryUsage().rss > 650 * 1024 * 1024; await new Promise((r) => setTimeout(r, runaway ? 90_000 : 2500)); });"].join('\n');
const RED = ["import { test } from 'node:test'; import assert from 'node:assert/strict';", "import { twice } from './lib.ts';", "test('always red', () => {", "  assert.equal(twice(2), 5, 'two doubled is four');", '});'].join('\n');
function project(extra = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-learned-cap-'));
  const proj = path.join(root, 'proj');
  for (const [f, t] of Object.entries({ 'src/lib.ts': LIB, 'src/hungry.test.ts': HUNGRY, 'package.json': '{"type":"module"}', ...extra })) { fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true }); fs.writeFileSync(path.join(proj, f), t); }
  git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
  return { root, proj };
}
const envOf = (extra) => ({ ...process.env, FORGE_MEM_BUDGET_MB: '9000', FORGE_TEST_HEAP_MB: '', FORGE_MEM_READ_FILE: '', FORGE_HEAVY_LOCK: 'off', ...extra });
const run = (proj, hand, extra = {}) => spawnSync(process.execPath, [CLI, '--root', proj, '--hand', hand, '--no-fail', '--jobs', '1', '--test-concurrency', '1', '--timeout', '120'], { encoding: 'utf8', timeout: 240_000, env: envOf(extra) });

test('a test file that NEEDS more than the cap is measured and run under what it needs: a mutant that changes nothing SURVIVES (it was "killed by the cap" and the baseline "red"), the runner says what the file needs, a real mutant is still killed by an ASSERTION, and a real runaway is still killed by the cap', () => {
  const { root, proj } = project();
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([
      ['src/lib.ts', 'changes nothing', 'export function twice', 'export function  twice', ['src/hungry.test.ts']],
      ['src/lib.ts', 'twice is off by one', 'return n * 2;', 'return n * 2 + 1;', ['src/hungry.test.ts']],
      ['src/lib.ts', 'hold grows three-fold', 'held.push(Buffer.alloc(mb * 1024 * 1024, 1))', 'held.push(Buffer.alloc(mb * 3 * 1024 * 1024, 1))', ['src/hungry.test.ts']],
    ]));
    const r = run(proj, hand, { FORGE_TEST_RSS_MB: '250' });       // 2026-11-02-1155: 300 MB held under a 250 MB cap (it was 700 under 400: two matrix legs at once compress a 2 GB runaway before the watchdog's next look)
    assert.doesNotMatch(`${r.stdout}\n${r.stderr}`, /BASELINE NOT GREEN/, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stderr, /mutate: src\/hungry\.test\.ts needs about \d+ MB of process tree unmutated \(the cap is 250 MB, FORGE_TEST_RSS_MB\): its cap is raised to \d+ MB for this run/, r.stderr);
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    assert.match(r.stdout, /generated 3 \| killed 2 .*survived 1/, r.stdout);
    assert.match(r.stdout, /by heap cap 1\b/, 'only the runaway is a kill by the cap');
    assert.match(r.stdout, /changes nothing/, 'and the mutant that changes nothing is named among the survivors');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a baseline that is red for a REAL reason names the test and the first failing line (it named only the file)', () => {
  const { root, proj } = project({ 'src/red.test.ts': RED });
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'twice triples', 'return n * 2;', 'return n * 3;', ['src/red.test.ts']]]));
    const r = run(proj, hand);
    const all = `${r.stdout}\n${r.stderr}`;
    assert.match(all, /BASELINE NOT GREEN: kills by these files are unproven:/, all);
    assert.match(all, /src\/red\.test\.ts: test "always red" failed: .*two doubled is four.* \(src\/red\.test\.ts:4\)/s, all);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('the pure parts: the resident size of every tree (not only those over the cap), a cap per tree, the files a cap killed, and the first failure of a TAP report', () => {
  const rows = [{ pid: 10, ppid: 1, rssKb: 100 * 1024 }, { pid: 11, ppid: 10, rssKb: 700 * 1024 }, { pid: 20, ppid: 1, rssKb: 300 * 1024 }, { pid: 21, ppid: 20, rssKb: 50 * 1024 }];
  assert.deepEqual(groupMbs(rows, [10, 20, 99]), [{ root: 10, mb: 800 }, { root: 20, mb: 350 }]);
  assert.deepEqual(groupsOverCap(rows, [10, 20], 500), [{ root: 10, mb: 800 }], 'a number, as before');
  assert.deepEqual(groupsOverCap(rows, [10, 20], (root) => (root === 10 ? 1000 : 300)), [{ root: 20, mb: 350 }], 'a cap for each tree');
  const killed = { file: 'src/a.test.ts', output: 'x\nforge-mutate: memory cap exceeded (2066 MB)\n' };
  const failed = { file: 'src/b.test.ts', output: 'not ok 1 - x' };
  assert.deepEqual(capKilledFiles({ failed: [killed, failed] }), [{ file: 'src/a.test.ts', mb: 2066 }]);
  assert.deepEqual(capKilledFiles({ failed: [failed] }), []);
  const tap = ['TAP version 13', '# Subtest: first', 'ok 1 - first', '# Subtest: second', 'not ok 2 - second', '  ---', '  duration_ms: 1', "  error: 'expected 4, got 5'", '  stack: |-', '    TestContext.<anonymous> (file:///tmp/p/src/a.test.ts:7:10)', '    at async Test.run (node:internal/test_runner/test:1:1)', '  ...'].join('\n');
  assert.deepEqual(firstFailure(tap, 'src/a.test.ts'), { test: 'second', error: 'expected 4, got 5', at: 'src/a.test.ts:7' });
  assert.equal(firstFailure('ok 1 - fine', 'src/a.test.ts'), null);
});
