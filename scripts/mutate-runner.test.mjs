// mutate-map: imports only (this file quotes real file names in its fixtures; only what it IMPORTS is a dependency of it, see buildMap)
// The mutation runner (scripts/dev/mutate.mjs + mutate-core.mjs, drain 2026-10-26-1300), tested as a tool: the pure rules on literal inputs, and the whole CLI against a tiny scratch
// project whose tests are known strong, known weak, hanging, skipped or red. The point of every integration test below is that the tool says the TRUE thing about a project we
// built to have exactly that property (a weak test's mutant survives, a hung mutant is timed out, a red baseline stops the run) and that the project's own files are byte-identical
// afterwards. Real-Chrome studies are not involved.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync, execFileSync } from 'node:child_process';

import {
  parseChangedLines, isMutableSource, generateMutants, sample, parseHandList, resolveHand, applyMutant, buildMap, selectTests, orderTests, preferFirst, SLOW_SECONDS, parseTapSummary, classifyRun, summarize,
  formatReport, runPool, confirmRedAlone, capLoops, DEFAULT_MAX_LOOP, importsOnlyNamers, importsOnlyNote,
} from './dev/mutate-core.mjs';

const CLI = path.resolve(import.meta.dirname, 'dev/mutate.mjs');

// ---- the diff ------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('parseChangedLines: the new-side lines of every hunk, per file; a pure deletion and /dev/null add none', () => {
  const diff = [
    'diff --git a/src/a.ts b/src/a.ts', '--- a/src/a.ts', '+++ b/src/a.ts', '@@ -3,0 +4,2 @@ x', '+one', '+two', '@@ -10 +12 @@', '-old', '+new', '@@ -20,3 +22,0 @@', '-gone',
    'diff --git a/src/gone.ts b/src/gone.ts', '--- a/src/gone.ts', '+++ /dev/null', '@@ -1,2 +0,0 @@', '-x', '-y',
    'diff --git a/scripts/n.mjs b/scripts/n.mjs', '--- /dev/null', '+++ b/scripts/n.mjs', '@@ -0,0 +1,3 @@', '+a', '+b', '+c',
  ].join('\n');
  const m = parseChangedLines(diff);
  assert.deepEqual([...m.get('src/a.ts')].sort((x, y) => x - y), [4, 5, 12]);
  assert.ok(!m.has('src/gone.ts'));
  assert.deepEqual([...m.get('scripts/n.mjs')], [1, 2, 3]);
});

test('isMutableSource: source under src/ and scripts/, never tests, generated files, declarations, test-support or the dev tools themselves', () => {
  for (const f of ['src/phrase-core.ts', 'scripts/sync-bundled-vault.mjs']) assert.equal(isMutableSource(f), true, f);
  for (const f of ['src/phrase-core.test.ts', 'scripts/x.test.mjs', 'src/bundled-assets.generated.ts', 'src/types.d.ts', 'src/test-support/real-onload.ts', 'scripts/dev/mutate.mjs', 'README.md', 'docs/a.ts', 'src/style.css'])
    assert.equal(isMutableSource(f), false, f);
});

// ---- mutants -------------------------------------------------------------------------------------------------------------------------------------------------------------------

const SRC = [
  "import { x } from './x.ts';",                                       // 1
  'export function f(a: number, b: number): boolean {',                // 2
  '  if (a < b && b !== 3) {',                                         // 3
  '    return !a;',                                                    // 4
  '  }',                                                               // 5
  "  const s: 'on' | 'off' = 'on';",                                   // 6
  '  const n = a + 1;',                                                // 7
  '  log(s, n, true);',                                                // 8
  '  return false;',                                                   // 9
  '}',                                                                 // 10
  'interface I { k: "key" | number; flag: true }',                     // 11
  'class C extends B { constructor() { super(); this.q = 1; } }',      // 12
].join('\n');

const opsOn = (lines) => generateMutants('src/f.ts', SRC, new Set(lines)).map((m) => m.op).sort();

test('generateMutants: every operator of the prompt, on the lines it is asked about and no others', () => {
  assert.deepEqual(opsOn([3]), ['boundary', 'eq-flip', 'if-false', 'if-true', 'logic', 'number+1']);
  assert.deepEqual(opsOn([4]), ['drop-not', 'early-return']);
  assert.deepEqual(opsOn([7]), ['number+1', 'plus-minus']);
  assert.deepEqual(opsOn([8]), ['bool-flip', 'drop-statement']);
  assert.deepEqual(opsOn([9]), ['bool-flip', 'early-return']);
  assert.deepEqual(opsOn([1, 2, 5, 10]), [], 'an import, a signature, a brace: nothing to mutate');
  assert.ok(generateMutants('src/f.ts', SRC, null).length > generateMutants('src/f.ts', SRC, new Set([3])).length, 'null = every line');
});

test('generateMutants: types are not code (a union of literals, an interface), module specifiers and a super() call are left alone', () => {
  assert.deepEqual(opsOn([6]), ['empty-string'], 'the string VALUE is code, the literal types are not');
  assert.deepEqual(opsOn([11]), [], 'an interface is type-only');
  assert.deepEqual(opsOn([12]), ['drop-statement', 'number+1'], 'super() is never dropped (the class would not construct); the assignment and its constant are mutated');
  assert.ok(!generateMutants('src/f.ts', SRC, new Set([12])).some((m) => m.from.startsWith('super')));
  assert.ok(!generateMutants('src/f.ts', SRC, new Set([1])).length, "'./x.ts' is not emptied");
});

test('generateMutants: each mutant is a precise text edit (from/to/start/end), the edit applies, ids are stable and unique, and the same input gives the same list', () => {
  const a = generateMutants('src/f.ts', SRC, null), b = generateMutants('src/f.ts', SRC, null);
  assert.deepEqual(a, b);
  assert.equal(new Set(a.map((m) => m.id)).size, a.length);
  for (const m of a) {
    assert.equal(SRC.slice(m.start, m.end), m.from, m.id);
    assert.notEqual(applyMutant(SRC, m), SRC, m.id);
  }
  const lt = a.find((m) => m.op === 'boundary');
  assert.equal(lt.id, 'src/f.ts:3:boundary#1');
  assert.equal(applyMutant(SRC, lt).split('\n')[2], '  if (a <= b && b !== 3) {');
  const logic = a.find((m) => m.op === 'logic');
  assert.equal(applyMutant(SRC, logic).split('\n')[2], '  if (a < b || b !== 3) {');
  assert.equal(applyMutant(SRC, a.find((m) => m.op === 'drop-not')).split('\n')[3], '    return a;');
  assert.equal(applyMutant(SRC, a.find((m) => m.op === 'early-return' && m.line === 4)).split('\n')[3], '    return;');
});

test('generateMutants reads plain JavaScript too (.mjs scripts)', () => {
  const m = generateMutants('scripts/x.mjs', 'export const f = (a) => { if (a === 2) return 1; return 0; };', null);
  assert.ok(m.some((x) => x.op === 'eq-flip' && x.to === '!=='));
  assert.ok(m.some((x) => x.op === 'number+1'));
});

test('sample: at most max, an even stride across the list, deterministic; fewer than max returns everything', () => {
  const ms = Array.from({ length: 100 }, (_, i) => ({ i }));
  assert.equal(sample(ms, 200), ms);
  const s = sample(ms, 10);
  assert.deepEqual(s.map((x) => x.i), [0, 10, 20, 30, 40, 50, 60, 70, 80, 90]);
  assert.deepEqual(sample(ms, 10), s);
});

test('hand-written lists: today\'s tuple shape and the object shape both parse; a bad row says which; from must occur exactly once', () => {
  const rows = parseHandList([['src/a.ts', 'n1', 'x', 'y', ['src/a.test.ts']], { file: 'src/b.ts', name: 'n2', from: 'p', to: 'q' }]);
  assert.deepEqual(rows[0], { file: 'src/a.ts', name: 'n1', from: 'x', to: 'y', tests: ['src/a.test.ts'] });
  assert.equal(rows[1].tests, undefined);
  assert.throws(() => parseHandList({}), /JSON array/);
  assert.throws(() => parseHandList([['src/a.ts', 3, 'x', 'y']]), /hand-written mutant 0: "name" must be a string/);
  assert.throws(() => parseHandList([['src/a.ts', 'n', 'x', 'y', 'nope']]), /"tests" must be an array/);
  const text = 'aa\nbb target cc\ndd';
  const ok = resolveHand({ file: 'f', name: 'n', from: 'target', to: 'T' }, text);
  assert.equal(ok.line, 2);
  assert.equal(applyMutant(text, ok), 'aa\nbb T cc\ndd');
  assert.equal(resolveHand({ file: 'f', name: 'n', from: 'absent', to: 'T' }, text).status, 'n/a');
  assert.match(resolveHand({ file: 'f', name: 'n', from: 'a', to: 'T' }, text).why, /occurs 3 times; it must occur once/);
});

// ---- the map -------------------------------------------------------------------------------------------------------------------------------------------------------------------

const TEXTS = new Map([
  ['src/leaf.ts', 'export const leaf = 1;'],
  ['src/mid.ts', "import { leaf } from './leaf.ts'; export const mid = leaf;"],
  ['src/reader.ts', "import fs from 'node:fs'; export const src = fs.readFileSync('src/disk-only.ts', 'utf8');"],
  ['src/disk-only.ts', 'export const d = 1;'],
  ['src/unrelated.ts', 'export const u = 1;'],
  ['src/a.test.ts', "import { mid } from './mid.ts';"],
  ['src/pin.test.ts', "import fs from 'node:fs'; fs.readFileSync(path.join(SRC, 'disk-only.ts'));"],
  ['src/lone.test.ts', "import { u } from './unrelated.ts';"],
  ['src/test-support/engine.ts', "export const boot = () => loadPyodide({});"],
  ['src/engine-direct.test.ts', "import { boot } from './test-support/engine.ts'; import { leaf } from './leaf.ts';"],
  ['src/engine-far.test.ts', "import { boot } from './test-support/engine.ts'; import { mid } from './mid.ts';"],
  ['src/pyodide-host.ts', 'export const host = 1;'],
  ['src/engine-glue.test.ts', "import { boot } from './test-support/engine.ts'; import { host } from './pyodide-host.ts';"],
  ['scripts/dev/cdp.mjs', 'export const launch = () => 1;'],
  ['src/browser.test.ts', "import { leaf } from './leaf.ts'; import { launch } from '../scripts/dev/cdp.mjs';"],
  ['src/mentions.test.ts', "import { leaf } from './leaf.ts'; // mentions scripts/dev/cdp.mjs in a comment, drives nothing"],
  ['scripts/tool.mjs', 'export const t = 1;'],
  ['scripts/tool.test.mjs', "import { t } from './tool.mjs';"],
]);
TEXTS.set('src/quoter.test.ts', "// mutate-map: imports only\nconst name = 'leaf.ts'; // a fixture string, not a dependency");
const MAP = buildMap(TEXTS);
const GLUE = /pyodide-host\./;

test('buildMap/selectTests: a test covers every file in its import closure, and a file its text names (an fs.readFileSync a pure import graph cannot see)', () => {
  const sorted = (f) => [...selectTests(MAP, f, GLUE).run].sort();
  assert.deepEqual(sorted('src/leaf.ts'), ['src/a.test.ts', 'src/engine-direct.test.ts', 'src/mentions.test.ts'], 'leaf <- mid <- a.test; the engine test that imports it directly; the far engine test is not run');
  assert.deepEqual(sorted('src/mid.ts'), ['src/a.test.ts', 'src/engine-far.test.ts']);
  assert.deepEqual(selectTests(MAP, 'src/disk-only.ts', GLUE).run, ['src/pin.test.ts'], 'read by name from a test, imported by nobody');
  assert.deepEqual(selectTests(MAP, 'scripts/tool.mjs', GLUE).run, ['scripts/tool.test.mjs']);
});

test('selectTests orders by the speed of a kill: light tests before engine-booting ones, and within each the tests that name the file themselves first', () => {
  const leaf = selectTests(MAP, 'src/leaf.ts', GLUE).run;
  assert.deepEqual(leaf, ['src/mentions.test.ts', 'src/a.test.ts', 'src/engine-direct.test.ts'], 'light and naming leaf; light, reaching leaf only through mid; the test that boots the engine last');
  assert.deepEqual(selectTests(MAP, 'src/pyodide-host.ts', GLUE).run, ['src/engine-glue.test.ts'], 'the glue file: the engine test that imports it is the one that can kill it');
});

test('orderTests: measured seconds order a group cheapest first, and a test measured slower than SLOW_SECONDS joins the engine group', () => {
  assert.deepEqual(orderTests(MAP, 'src/leaf.ts', ['src/engine-direct.test.ts', 'src/mentions.test.ts'], { 'src/mentions.test.ts': SLOW_SECONDS + 1, 'src/engine-direct.test.ts': 30 }),
    ['src/mentions.test.ts', 'src/engine-direct.test.ts'], 'both are in the engine group now: cheapest first');
  assert.deepEqual(orderTests(MAP, 'src/leaf.ts', ['src/a.test.ts', 'src/mentions.test.ts', 'src/engine-direct.test.ts'], { 'src/a.test.ts': 0.2, 'src/mentions.test.ts': 0.1 }),
    ['src/mentions.test.ts', 'src/a.test.ts', 'src/engine-direct.test.ts']);
  assert.deepEqual(orderTests(MAP, 'src/leaf.ts', ['src/a.test.ts', 'src/mentions.test.ts'], { 'src/a.test.ts': 0.1, 'src/mentions.test.ts': 0.2 }),
    ['src/mentions.test.ts', 'src/a.test.ts'], 'naming the file beats being a little cheaper');
  assert.deepEqual(orderTests(MAP, 'src/mid.ts', ['src/a.test.ts', 'src/engine-far.test.ts'], { 'src/a.test.ts': 99 }), ['src/engine-far.test.ts', 'src/a.test.ts'],
    'a.test is measured slow (99 s): it joins the engine group, where engine-far (nothing measured) is cheaper');
});

test('preferFirst moves the tests that killed this mutant before to the front, keeps the rest in order and ignores a killer that is no longer in the list', () => {
  assert.deepEqual(preferFirst(['a', 'b', 'c', 'd'], ['c', 'gone', 'a']), ['c', 'a', 'b', 'd']);
  assert.deepEqual(preferFirst(['a', 'b'], undefined), ['a', 'b']);
  assert.deepEqual(preferFirst(['a', 'b'], []), ['a', 'b']);
});

test('the engine glue interleaves its engine tests with its light ones (one engine test to every two light ones): its killers are the engine tests, its TypeScript half is killed by light ones, neither may wait for the other', () => {
  const run = selectTests(MAP, 'src/pyodide-host.ts', GLUE).run;
  assert.deepEqual(run, ['src/engine-glue.test.ts']);
  const texts = new Map(TEXTS);
  for (const n of ['a', 'b', 'c', 'd']) texts.set(`src/light-${n}.test.ts`, "import { host } from './pyodide-host.ts';");
  for (const n of ['x', 'y']) texts.set(`src/boot-${n}.test.ts`, "import { boot } from './test-support/engine.ts'; import { host } from './pyodide-host.ts';");
  const map = buildMap(texts);
  const ordered = selectTests(map, 'src/pyodide-host.ts', GLUE).run;
  const heavy = (t) => map.tests.get(t).engine;
  assert.equal(heavy(ordered[0]), true, 'an engine test goes first');
  assert.equal(ordered.map((t) => (heavy(t) ? 'E' : 'L')).join(''), 'ELLELLE', 'three engine tests (engine-glue, boot-x, boot-y) and four light ones, one engine to every two light');
  // a non-glue file is NOT interleaved: its light tests all come before its engine ones
  const leaf = selectTests(map, 'src/leaf.ts', GLUE).run;
  assert.deepEqual(leaf, ['src/mentions.test.ts', 'src/a.test.ts', 'src/engine-direct.test.ts']);
});

test('a test that says "mutate-map: imports only" has its imports as dependencies and NOT the file names its text quotes', () => {
  assert.ok(!selectTests(MAP, 'src/leaf.ts', GLUE).run.includes('src/quoter.test.ts'));
  assert.ok(selectTests(MAP, 'src/disk-only.ts', GLUE).run.includes('src/pin.test.ts'), 'an ordinary test that names a file still depends on it');
});

test('selectTests: a file no test can see has NO covering test (a gap by itself); a test file is never its own mutant\'s test', () => {
  assert.deepEqual(selectTests(MAP, 'src/reader.ts', GLUE).run, []);
  assert.deepEqual(selectTests(MAP, 'src/unrelated.ts', GLUE).run, ['src/lone.test.ts']);
  assert.ok(!selectTests(MAP, 'src/a.test.ts', GLUE).run.includes('src/a.test.ts'));
});

test('engine-booting tests run only when the mutated file is one the test names itself, or the engine glue; and Chrome drivers never run', () => {
  assert.equal(MAP.tests.get('src/engine-far.test.ts').engine, true);
  assert.equal(MAP.tests.get('src/a.test.ts').engine, false);
  assert.ok(selectTests(MAP, 'src/pyodide-host.ts', GLUE).run.includes('src/engine-glue.test.ts'), 'glue mutated: the engine test that imports it runs');
  assert.ok(!selectTests(MAP, 'src/pyodide-host.ts', GLUE).run.includes('src/a.test.ts'));
  const leaf = selectTests(MAP, 'src/leaf.ts', GLUE);
  assert.ok(!leaf.run.includes('src/browser.test.ts') && leaf.chrome.includes('src/browser.test.ts'), 'a Chrome-driving test is listed, not run');
  assert.ok(leaf.run.includes('src/mentions.test.ts') && !leaf.chrome.includes('src/mentions.test.ts'), 'a test that only MENTIONS the driver (a comment, a fixture string) drives nothing and runs');
});

// ---- a run ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

const TAP = (tests, pass, fail, skipped) => `TAP version 13\n# tests ${tests}\n# pass ${pass}\n# fail ${fail}\n# cancelled 0\n# skipped ${skipped}\n# todo 0\n`;

test('parseTapSummary reads the four numbers, and says null when there is no summary', () => {
  assert.deepEqual(parseTapSummary(TAP(12, 10, 1, 1)), { tests: 12, pass: 10, fail: 1, skipped: 1 });
  assert.equal(parseTapSummary('garbage'), null);
});

test('classifyRun: killed, survived, timeout, invalid (not valid code) and not-run (exit 0 that passed nothing is NOT a survivor that proves something)', () => {
  assert.equal(classifyRun({ status: 1, timedOut: false, output: TAP(3, 2, 1, 0) + 'AssertionError [ERR_ASSERTION]' }), 'killed');
  assert.equal(classifyRun({ status: 0, timedOut: false, output: TAP(3, 3, 0, 0) }), 'survived');
  assert.equal(classifyRun({ status: 1, timedOut: true, output: '' }), 'timeout');
  assert.equal(classifyRun({ status: 1, timedOut: false, output: TAP(1, 0, 1, 0) + 'SyntaxError: Unexpected token' }), 'invalid');
  assert.equal(classifyRun({ status: 1, timedOut: false, output: TAP(2, 1, 1, 0) + 'SyntaxError appears in a message\nAssertionError: x' }), 'killed', 'a failing assertion beats the word SyntaxError');
  assert.equal(classifyRun({ status: 0, timedOut: false, output: TAP(4, 0, 0, 4) }), 'not-run', 'every test skipped');
  assert.equal(classifyRun({ status: 0, timedOut: false, output: '' }), 'not-run', 'no summary at all');
});

test('summarize + formatReport: generated, killed (by timeout counted), survived, equivalent-explained, invalid, not applicable, uncovered; unexplained drives the exit status', () => {
  const r = (id, outcome, extra = {}) => ({ id, file: 'src/a.ts', line: 3, op: 'x', from: 'a', to: 'b', outcome, ...extra });
  const results = [r('k1', 'killed'), r('k2', 'timeout'), r('s1', 'survived'), r('s2', 'survived', { name: 'hand name' }), r('u1', 'uncovered'), r('i1', 'invalid'), r('n1', undefined, { status: 'n/a', why: 'gone' }), r('r1', 'not-run')];
  const s = summarize(results, { 'hand name': 'unobservable: formatPhraseJson already writes it' });
  assert.equal(s.generated, 8);
  assert.equal(s.killed, 2); assert.equal(s.timeout, 1);
  assert.deepEqual(s.survived.map((x) => x.id), ['s1']);
  assert.deepEqual(s.explained.map((x) => [x.id, x.why]), [['s2', 'unobservable: formatPhraseJson already writes it']]);
  assert.equal(s.uncovered.length, 1); assert.equal(s.invalid.length, 1); assert.equal(s.notApplicable.length, 1); assert.equal(s.notRun.length, 1);
  assert.equal(s.unexplained, 3, 'a survivor, an uncovered mutant and a not-run mutant');
  const text = formatReport(s, { wallMs: 83_000, jobs: 8, testCount: 12, chromeSkipped: ['src/c.test.ts'], treeUnchanged: { ok: true, files: 900 } });
  assert.match(text, /generated 8 \| killed 2 \(by timeout 1\) \| survived 1 \| uncovered 1 \| equivalent-explained 1 \| invalid 1 \| not applicable 1 \| not run 1/);
  assert.match(text, /wall time 1m23s with 8 at a time, 12 test file\(s\)/);
  assert.match(text, /working tree: unchanged \(git status and 900 file hashes identical/);
  assert.match(text, /SURVIVED {5}src\/a\.ts:3 \[s1\] {2}"a" -> "b"/);
  assert.match(text, /NO TEST .*0 tests in the pool for src\/a\.ts: add `--glue` or name the file in a test/);
  assert.doesNotMatch(text, /no test file covers/, 'the old one-line gap message is gone');
  assert.match(formatReport(s, { wallMs: 1, jobs: 1, testCount: 0, baselineRed: ['src/x.test.ts', 'src/y.test.ts'] }).split('\n')[0], /^BASELINE NOT GREEN: kills by these files are unproven: src\/x\.test\.ts, src\/y\.test\.ts$/, 'a red baseline is the FIRST line of the report, loud');
  assert.doesNotMatch(text, /BASELINE NOT GREEN/, 'a green baseline prints no header');
  assert.match(text, /equivalent .*unobservable: formatPhraseJson/);
  assert.match(text, /src\/c\.test\.ts/);
  assert.match(formatReport(s, { wallMs: 1, jobs: 1, testCount: 0, treeUnchanged: { ok: false, why: 'file bytes differ' } }), /WORKING TREE CHANGED: file bytes differ/);
});

test('runPool: never more than n at once, every item once, results in item order', async () => {
  let live = 0, peak = 0;
  const out = await runPool([5, 1, 4, 2, 3, 0, 6], 3, async (x) => { live++; peak = Math.max(peak, live); await new Promise((r) => setTimeout(r, x)); live--; return x * 10; });
  assert.deepEqual(out, [50, 10, 40, 20, 30, 0, 60]);
  assert.equal(peak, 3);
});

// ---- the whole tool on a project we built -------------------------------------------------------------------------------------------------------------------------------------

function makeProject(files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mutate-fixture-'));
  const proj = path.join(root, 'proj');
  for (const [f, t] of Object.entries(files)) { fs.mkdirSync(path.dirname(path.join(proj, f)), { recursive: true }); fs.writeFileSync(path.join(proj, f), t); }
  return { root, proj };
}
const git = (cwd, ...a) => execFileSync('git', ['-c', 'user.email=t@t', '-c', 'user.name=t', ...a], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const hashTree = (dir) => {
  const h = crypto.createHash('sha256');
  const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) { if (e.name === '.git') continue; const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else { h.update(path.relative(dir, p)); h.update(fs.readFileSync(p)); } } };
  walk(dir);
  return h.digest('hex');
};
const mutate = (proj, ...args) => spawnSync(process.execPath, [CLI, '--root', proj, '--jobs', '3', ...args], { encoding: 'utf8', timeout: 120_000 });

const LIB = [
  'export function clamp(n: number, lo: number, hi: number): number {',
  '  if (n < lo) return lo;',
  '  if (n > hi) return hi;',
  '  return n;',
  '}',
  'export function sign(n: number): number {',
  '  return n > 0 ? 1 : n < 0 ? -1 : 0;',
  '}',
  'export function countTo(n: number): number {',
  '  let i = 0;',
  '  while (i < n) i++;',
  '  return i;',
  '}',
].join('\n');
const STRONG = [
  "import { test } from 'node:test'; import assert from 'node:assert/strict';",
  "import { clamp, countTo } from './lib.ts';",
  "test('clamp', () => { assert.equal(clamp(5, 0, 3), 3); assert.equal(clamp(-1, 0, 3), 0); assert.equal(clamp(2, 0, 3), 2); assert.equal(clamp(0, 0, 3), 0); assert.equal(clamp(3, 0, 3), 3); });",
  "test('countTo', () => { assert.equal(countTo(4), 4); });",
].join('\n');
// a deliberately weak test of sign(): it only ever looks at a positive number, so every mutant on the other two branches survives
const WEAK = [
  "import { test } from 'node:test'; import assert from 'node:assert/strict';",
  "import { sign } from './lib.ts';",
  "test('sign of a positive', () => { assert.equal(sign(7), 1); });",
].join('\n');

test('the tool kills what a strong test sees, lets the weak test\'s mutants SURVIVE and names them, times out a hung mutant, and leaves the project byte-identical', () => {
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/lib.test.ts': STRONG, 'src/sign.test.ts': WEAK, 'package.json': '{"type":"module"}' });
  try {
    git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
    fs.writeFileSync(path.join(proj, 'src/lib.ts'), LIB.replace('return n > 0 ? 1 : n < 0 ? -1 : 0;', 'return n > 0 ? 1 : n < 0 ? -1 : 0; // changed'));
    git(proj, 'commit', '-qam', 'two');
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'hang: the loop never ends', 'while (i < n) i++;', 'while (true) i++;'], ['src/lib.ts', 'clamp: low bound', 'if (n < lo) return lo;', 'if (n < lo) return n;']]));
    const before = hashTree(proj);
    const out = path.join(root, 'out.json');
    const r = mutate(proj, '--diff', 'HEAD~1', '--hand', hand, '--timeout', '6', '--max-loop', '0', '--out', out);          // 2026-10-29-0840: the loop cap is OFF here, so the per-mutant timeout is still proven on a real hang
    const body = r.stdout;
    assert.equal(r.status, 1, `unexplained survivors => exit 1\n${body}\n${r.stderr}`);
    const res = JSON.parse(fs.readFileSync(out, 'utf8'));
    const by = (id) => res.results.find((x) => x.id === id || x.name === id);
    assert.equal(by('hang: the loop never ends').outcome, 'timeout', 'a hung mutant is killed at the per-mutant timeout and counted as killed-by-timeout');
    assert.equal(by('clamp: low bound').outcome, 'killed');
    assert.ok(res.results.some((x) => x.op !== 'hand' && x.file === 'src/lib.ts' && x.outcome === 'survived'), 'the changed line of sign() has mutants the weak test cannot see: they survive');
    assert.match(body, /SURVIVED\s+src\/lib\.ts:\d+ \[src\/lib\.ts:\d+:/);
    assert.match(body, /working tree: unchanged/);
    assert.match(body, /\(by timeout 1\)/);
    assert.equal(hashTree(proj), before, 'every byte of the project is as it was');
    assert.equal(git(proj, 'status', '--porcelain'), '');
    assert.ok(res.summary.wallMs < 90_000);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a survivor listed in --equivalent is reported as equivalent-explained and no longer fails the run; --no-fail never fails', () => {
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/sign.test.ts': WEAK, 'package.json': '{"type":"module"}' });
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'sign: the negative branch', 'n < 0 ? -1 : 0', 'n < 0 ? 5 : 0']]));
    const plain = mutate(proj, '--hand', hand);
    assert.equal(plain.status, 1);
    assert.match(plain.stdout, /SURVIVED\s+src\/lib\.ts:7 \[sign: the negative branch\]/);
    const eq = path.join(root, 'eq.json');
    fs.writeFileSync(eq, JSON.stringify({ 'sign: the negative branch': 'pretend: unobservable' }));
    const explained = mutate(proj, '--hand', hand, '--equivalent', eq);
    assert.equal(explained.status, 0, explained.stdout);
    assert.match(explained.stdout, /equivalent-explained 1/);
    assert.match(explained.stdout, /equivalent\s+src\/lib\.ts:7 .*pretend: unobservable/);
    assert.equal(mutate(proj, '--hand', hand, '--no-fail').status, 0);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a red baseline is never trusted (exit 2): by default the tests that KILLED are re-run on the unmutated tree after the mutants; --baseline first refuses before any mutant runs', () => {
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/lib.test.ts': STRONG.replace('countTo(4), 4', 'countTo(4), 5'), 'package.json': '{"type":"module"}' });
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'clamp: low bound', 'if (n < lo) return lo;', 'if (n < lo) return n;']]));
    const after = mutate(proj, '--hand', hand);
    assert.equal(after.status, 2, after.stdout + after.stderr);
    assert.match(after.stderr, /the baseline is not green: 1 of the 1 test file\(s\) that killed mutants also fail on the UNMUTATED tree/);
    assert.match(after.stderr, /src\/lib\.test\.ts/);
    assert.match(after.stdout.split('\n')[0], /^BASELINE NOT GREEN: kills by these files are unproven: src\/lib\.test\.ts$/, 'the report is ALWAYS printed (a 20-60 minute run is never lost), headed by the red files');
    assert.match(after.stdout, /generated 1 \| killed 1/, 'the full report follows the header');
    const first = mutate(proj, '--hand', hand, '--baseline', 'first');
    assert.equal(first.status, 2);
    assert.match(first.stderr, /the baseline is not green \(the unmutated tests of the pool: .*1 fail/);
    assert.doesNotMatch(first.stderr, /\[1\/1\]/, 'refused before any mutant ran');
    assert.equal(mutate(proj, '--hand', hand, '--baseline', 'sometimes').status, 2);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('confirmRedAlone: each red file is re-run ALONE, one at a time, and only a file that fails alone is named (a file red in the batch but green alone is load, not a red baseline)', async () => {
  let running = 0, peak = 0; const calls = [];
  const runOne = async (f) => { running++; peak = Math.max(peak, running); calls.push(f); await new Promise((r) => setTimeout(r, 5)); running--; return { status: f === 'b.test.ts' ? 1 : 0 }; };
  const out = await confirmRedAlone(['a.test.ts', 'b.test.ts', 'c.test.ts'], runOne);
  assert.deepEqual(out.redAlone, ['b.test.ts']);
  assert.deepEqual(out.flaky, ['a.test.ts', 'c.test.ts'], 'failed in the batch, passed alone: reported as flaky under load, not named red');
  assert.equal(peak, 1, 'alone means one at a time');
  assert.deepEqual(calls, ['a.test.ts', 'b.test.ts', 'c.test.ts']);
  assert.deepEqual(await confirmRedAlone([], runOne), { redAlone: [], flaky: [] });
});

test('a mutated file no test can see is reported as NO TEST (a gap by itself) and fails the run; a test that skips everything is NOT RUN, not a survivor', () => {
  const skipped = "import { test } from 'node:test'; import { clamp } from './lib.ts'; test('skipped', { skip: 'no wheels' }, () => { clamp(1, 2, 3); });";
  const ok = "import { test } from 'node:test'; import { z } from './other.ts'; test('ok', () => { void z; });";
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/untested.ts': 'export const k = 1 < 2;\n', 'src/other.ts': 'export const z = 1 + 1;\n', 'src/skip.test.ts': skipped, 'src/ok.test.ts': ok, 'package.json': '{"type":"module"}' });
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/untested.ts', 'untested: flipped', '1 < 2', '1 > 2'], ['src/lib.ts', 'clamp: skipped test only', 'if (n < lo) return lo;', 'if (n < lo) return n;'], ['src/other.ts', 'other: plus to minus', '1 + 1', '1 - 1']]));
    const r = mutate(proj, '--hand', hand);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /NO TEST .*src\/untested\.ts.*0 tests in the pool for src\/untested\.ts: add `--glue` or name the file in a test/);
    assert.match(r.stderr, /0 tests in the pool for src\/untested\.ts: add `--glue` or name the file in a test/, 'the progress line says it too, not a bare "uncovered"');
    assert.match(r.stdout, /NOT RUN .*clamp: skipped test only/);
    assert.match(r.stdout, /SURVIVED .*other: plus to minus/, 'a test that passes and asserts nothing about the value lets the mutant survive');
    assert.match(r.stdout, /uncovered 1/); assert.match(r.stdout, /not run 1/); assert.match(r.stdout, /survived 1/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a pool whose tests ALL skip proves nothing: every mutant is NOT RUN (default), and --baseline first refuses the pool (exit 2)', () => {
  const skipped = "import { test } from 'node:test'; import { clamp } from './lib.ts'; test('skipped', { skip: 'no wheels' }, () => { clamp(1, 2, 3); });";
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/skip.test.ts': skipped, 'package.json': '{"type":"module"}' });
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'clamp', 'if (n < lo) return lo;', 'if (n < lo) return n;']]));
    const r = mutate(proj, '--hand', hand);
    assert.equal(r.status, 1, r.stdout + r.stderr);
    assert.match(r.stdout, /NOT RUN .*clamp/);
    const first = mutate(proj, '--hand', hand, '--baseline', 'first');
    assert.equal(first.status, 2, first.stdout + first.stderr);
    assert.match(first.stderr, /the baseline is not green/);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('a hand-written mutant whose text does not occur is "n/a", said out loud and never a silent skip; --list prints the mutants and their tests and runs nothing', () => {
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/lib.test.ts': STRONG, 'package.json': '{"type":"module"}' });
  try {
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'gone', 'this text is not in the file', 'x'], ['src/lib.ts', 'clamp: low bound', 'if (n < lo) return lo;', 'if (n < lo) return n;']]));
    const listed = mutate(proj, '--hand', hand, '--list');
    assert.equal(listed.status, 0);
    assert.match(listed.stdout, /n\/a\s+gone/);
    assert.match(listed.stdout, /clamp: low bound .*tests: 1/);
    const r = mutate(proj, '--hand', hand);
    assert.equal(r.status, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /not applicable 1/);
    assert.match(r.stdout, /n\/a\s+src\/lib\.ts \[gone\]\s+the text to replace does not occur/);
    assert.match(r.stdout, /killed 1 /);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('usage errors exit 2 and say what is wrong', () => {
  const run = (...a) => spawnSync(process.execPath, [CLI, ...a], { encoding: 'utf8' });
  assert.equal(run().status, 2);
  assert.match(run().stderr, /nothing to mutate: give --diff/);
  assert.match(run('--wat').stderr, /unknown option --wat/);
  assert.match(run('--diff', 'HEAD', '--jobs', '0').stderr, /--jobs must be a number of at least 1/);
  assert.match(run('--diff').stderr, /--diff needs a value/);
});

// ---- the loop cap (drain 2026-10-29-0840, CC 0820 recommendation 4) ----------------------------------------------------------------------------------------------------------
// A mutant that removes a loop's exit used to be detected only by the per-mutant timeout (90 s by default, three of them in the 0820 run). `capLoops` rewrites the UNBOUNDED loop headers of the mutated file
// (`while (true)`, `for (;;)`, `for (init; ; update)`) to count their iterations, so such a mutant throws after `--max-loop` iterations (default 5,000,000) and is killed in a fraction of a second.

const run = (code, entry = 'f') => new Function(`${code}\n; return ${entry};`)();

test('capLoops: every unbounded loop header is rewritten, a bounded loop and a for-of are left alone, the line count and the text before the helper are unchanged, and no site = no change at all', () => {
  const src = [
    'function a(i) { while (true) { i++; if (i > 3) return i; } }',
    'function b(i) { for (;;) { if (++i > 3) return i; } }',
    'function c(n) { for (let k = 2; ; k++) if (k * k > n) return k; }',
    'function d(n) { let t = 0; for (let k = 0; k < n; k++) t += k; for (const x of [1, 2]) t += x; while (t < 100) t++; return t; }',
  ].join('\n');
  const out = capLoops(src, 1000);
  const code = out.slice(0, out.indexOf('\nfunction __forgeLoopCap'));
  assert.equal((code.match(/__forgeLoopCap\(/g) ?? []).length, 3, 'three unbounded loops, three call sites');
  assert.ok(!/while \(true\)|for \(;;\)|; ;|;  ;/.test(code), 'no unbounded header is left');
  assert.match(code, /for \(let k = 0; k < n; k\+\+\)/, 'the bounded for is as it was');
  assert.match(code, /for \(const x of \[1, 2\]\)/);
  assert.match(code, /while \(t < 100\)/);
  assert.equal(code.split('\n').length, src.split('\n').length, 'the helper goes AFTER the code: no line moves');
  assert.equal(capLoops('const x = 1;\nfor (let i = 0; i < 3; i++) {}\n', 1000), 'const x = 1;\nfor (let i = 0; i < 3; i++) {}\n', 'no unbounded loop: byte-identical');
  assert.equal(capLoops(src, 0), src, 'a cap of 0 is "off"');
  assert.equal(DEFAULT_MAX_LOOP, 5_000_000);
});

test('capLoops: a loop that exits on its own still runs to its exit; a loop whose exit is gone throws the named error after the cap; each site counts for itself', () => {
  const good = capLoops('function f(i) { while (true) { i++; if (i > 3) return i; } }', 1000);
  assert.equal(run(good)(0), 4, 'the working loop is untouched in behaviour');
  const bad = capLoops('function f(i) { while (true) { i++; if (false) return i; } }', 1000);
  assert.throws(() => run(bad)(0), /forge-mutate: loop cap exceeded/);
  const freeName = capLoops('function f(taken) { for (let n = 2; ; n++) if (!taken(n)) return n; }', 50);
  assert.equal(run(freeName)((n) => n < 10), 10);
  const exitRemoved = capLoops('function f(taken) { for (let n = 2; ; n++) if (false) return n; }', 50);
  assert.throws(() => run(exitRemoved)(() => false), /forge-mutate: loop cap exceeded at/);
  const two = capLoops('function f() { let a = 0; while (true) { if (++a > 40) break; } let b = 0; for (;;) { if (++b > 40) break; } return a + b; }', 50);
  assert.equal(run(two)(), 82, 'two sites of 41 iterations each stay under a cap of 50: the count is per site, not total');
});

test('capLoops: the cap is exact - a loop that goes round exactly `max` times passes, one more throws', () => {
  const body = 'function f(stop) { for (let i = 0; ; i++) { if (i === stop) return i; } }';       // the header is evaluated stop + 1 times
  assert.equal(run(capLoops(body, 10))(9), 9, 'ten evaluations under a cap of ten');
  assert.throws(() => run(capLoops(body, 10))(10), /loop cap exceeded/, 'eleven do not');
});

test('classifyRun + summarize + formatReport: a kill by the loop cap is a kill, counted apart, and the report says how many', () => {
  assert.equal(classifyRun({ status: 1, timedOut: false, output: 'Error: forge-mutate: loop cap exceeded at L12\n' }), 'killed');
  const r = (id, outcome, extra = {}) => ({ id, file: 'src/a.ts', line: 1, op: 'x', outcome, from: 'a', to: 'b', ...extra });
  const s = summarize([r('k1', 'killed'), r('k2', 'killed', { loopCap: true }), r('t1', 'timeout')]);
  assert.equal(s.killed, 3); assert.equal(s.timeout, 1); assert.equal(s.loopCap, 1);
  assert.match(formatReport(s, { wallMs: 1000, jobs: 1, testCount: 1 }), /killed 3 \(by timeout 1, by loop cap 1\)/);
  assert.match(formatReport(summarize([r('k1', 'killed')]), { wallMs: 1000, jobs: 1, testCount: 1 }), /killed 1 \(by timeout 0\) \|/, 'no loop-cap kill: the line is as it always was');
});

test('the CLI: a hand mutant that removes a loop exit is killed by the CAP in a fraction of the timeout, says so, and the timeout never fires (--max-loop 0 would leave that to the timeout)', () => {
  const { root, proj } = makeProject({ 'src/lib.ts': LIB, 'src/lib.test.ts': STRONG, 'package.json': '{"type":"module"}' });
  try {
    git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
    const hand = path.join(root, 'hand.json');
    fs.writeFileSync(hand, JSON.stringify([['src/lib.ts', 'hang: the loop never ends', 'while (i < n) i++;', 'while (true) i++;']]));
    const out = path.join(root, 'out.json');
    const t0 = Date.now();
    const r = mutate(proj, '--hand', hand, '--timeout', '60', '--out', out);
    const secs = (Date.now() - t0) / 1000;
    assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
    const res = JSON.parse(fs.readFileSync(out, 'utf8'));
    const hang = res.results.find((x) => x.name === 'hang: the loop never ends');
    assert.equal(hang.outcome, 'killed');
    assert.equal(hang.loopCap, true);
    assert.ok(secs < 30, `the cap killed it in ${secs} s, far under the 60 s timeout`);
    assert.equal(res.summary.timeout, 0);
    assert.equal(res.summary.loopCap, 1);
    assert.match(r.stdout, /killed 1 \(by timeout 0, by loop cap 1\)/);
    assert.equal(git(proj, 'status', '--porcelain'), '', 'the project is as it was');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

// ---- 2026-10-29-0930 item 2: a test that is marked "imports only" but NAMES the mutated file --------------------------------------------------------------------------------------------------
// The incident (0840): a mutant in scripts/dev/mutate.mjs ran only the tests that IMPORT it; mutate-runner.test.mjs runs it as a CLI (names it, does not import it) and is marked imports-only (it quotes file names in its fixtures),
// so it was not in the pool and a mutant that disabled the loop cap in the CLI survived until the test was named by hand. The report now says so.

test('importsOnlyNamers: the imports-only tests that name the file but are not in its pool; a test that imports it, an ordinary naming test and a file nobody quotes give none', () => {
  assert.deepEqual(importsOnlyNamers(TEXTS, MAP, 'src/leaf.ts'), ['src/quoter.test.ts'], 'the marked test quotes leaf.ts and does not import it');
  const ordinary = new Map(TEXTS); ordinary.set('src/quoter.test.ts', "const name = 'leaf.ts';");
  assert.deepEqual(importsOnlyNamers(ordinary, buildMap(ordinary), 'src/leaf.ts'), [], 'control: without the marker the test names leaf.ts and IS in the pool, so there is nothing to say');
  const importing = new Map(TEXTS); importing.set('src/quoter.test.ts', "// mutate-map: imports only\nimport { leaf } from './leaf.ts'; const name = 'leaf.ts';");
  assert.deepEqual(importsOnlyNamers(importing, buildMap(importing), 'src/leaf.ts'), [], 'a marked test that imports the file is in the pool anyway');
  const helper = new Map(TEXTS); helper.set('src/helper.ts', "// mutate-map: imports only\nexport const x = 'leaf.ts';");
  assert.deepEqual(importsOnlyNamers(helper, buildMap(helper), 'src/leaf.ts'), ['src/quoter.test.ts'], 'a marked file that is not a test is not a test of anything');
  const unnamed = new Map(TEXTS); unnamed.set('src/quoter.test.ts', '// mutate-map: imports only\nconst name = "something else";');
  assert.deepEqual(importsOnlyNamers(unnamed, buildMap(unnamed), 'src/leaf.ts'), [], 'a marked test that does not name the file says nothing about it');
  assert.deepEqual(importsOnlyNamers(TEXTS, MAP, 'src/unrelated.ts'), []);
  assert.deepEqual(importsOnlyNamers(TEXTS, MAP, 'src/quoter.test.ts'), [], 'a test is not its own subject');
});

test('importsOnlyNote says which test, which file, why it is not in the pool, and how to put it there; one or several tests read as a sentence', () => {
  assert.equal(importsOnlyNote('f.mjs', ['a.test.mjs']), `note: a.test.mjs names f.mjs but is marked "mutate-map: imports only" (it runs the file, it does not import it), so it is not in the pool and the file's CLI wiring is covered by no test of this run: name it in the 'tests' field of a --hand mutant (or --glue) to cover it`);
  assert.equal(importsOnlyNote('f.mjs', ['a.test.mjs', 'b.test.mjs']), `note: a.test.mjs, b.test.mjs name f.mjs but are marked "mutate-map: imports only" (they run the file, they do not import it), so they are not in the pool and the file's CLI wiring is covered by no test of this run: name them in the 'tests' field of a --hand mutant (or --glue) to cover it`);
  const one = importsOnlyNote('scripts/dev/mutate.mjs', ['scripts/mutate-runner.test.mjs']);
  assert.match(one, /^note: scripts\/mutate-runner\.test\.mjs names scripts\/dev\/mutate\.mjs but is marked "mutate-map: imports only"/);
  assert.match(one, /it is not in the pool/);
  assert.match(one, /'tests' field of a --hand mutant \(or --glue\)/);
  const two = importsOnlyNote('f.mjs', ['a.test.mjs', 'b.test.mjs']);
  assert.match(two, /^note: a\.test\.mjs, b\.test\.mjs name f\.mjs but are marked/);
  assert.match(two, /they are not in the pool/);
});

test('formatReport prints the notes it is given, after the counts and before the survivors, and nothing when there are none', () => {
  const s = summarize([{ id: 'x:1:eq-flip#1', file: 'src/leaf.ts', line: 1, op: 'eq-flip', from: '===', to: '!==', status: 'ok', outcome: 'survived' }], {});
  const base = { wallMs: 1000, jobs: 1, testCount: 1 };
  const without = formatReport(s, base).split('\n');
  const withNote = formatReport(s, { ...base, notes: ['note: a names b'] }).split('\n');
  assert.ok(!without.some((l) => l.startsWith('note:')));
  const at = withNote.indexOf('note: a names b');
  assert.ok(at > 1 && at < withNote.findIndex((l) => l.startsWith('SURVIVED')), withNote.join('|'));
});

test('the CLI: when a test marked "imports only" names the mutated file (a CLI test that runs it) the report carries the note; without the marker the same test is in the pool and there is no note', () => {
  const NAMER = (mark) => `${mark}import { test } from 'node:test'; import assert from 'node:assert/strict'; import { spawnSync } from 'node:child_process';\ntest('runs src/tool.ts as a process', () => { assert.ok(spawnSync(process.execPath, ['--experimental-strip-types', 'src/tool.ts']).status === 0); });\n`;
  const TOOL = 'export const answer = 1;\nif (answer !== 1) process.exit(1);\n';
  const run = (mark) => {
    const { root, proj } = makeProject({ 'src/tool.ts': TOOL, 'src/tool-cli.test.ts': NAMER(mark), 'src/alone.test.ts': "import { test } from 'node:test'; test('x', () => {});\n", 'package.json': '{"type":"module"}' });
    try {
      git(proj, 'init', '-q'); git(proj, 'add', '-A'); git(proj, 'commit', '-qm', 'one');
      const hand = path.join(root, 'hand.json');
      fs.writeFileSync(hand, JSON.stringify([['src/tool.ts', 'answer changed', 'export const answer = 1;', 'export const answer = 2;', ['src/alone.test.ts']]]));
      const r = mutate(proj, '--hand', hand, '--no-fail', '--timeout', '30');
      return r.stdout + r.stderr;
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  };
  const marked = run('// mutate-map: imports only\n');
  assert.match(marked, /note: src\/tool-cli\.test\.ts names src\/tool\.ts but is marked "mutate-map: imports only"/, marked);
  assert.match(marked, /'tests' field of a --hand mutant/);
  const plain = run('');
  assert.ok(!/note: .*imports only/.test(plain), `control: no marker, no note\n${plain}`);
});
