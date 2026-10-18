// Drain 2026-10-18-1500 — the bundle-write guard's "did the inner suite run" check, made robust and deterministic.
//
// bundle-tests-do-not-write-the-bundle.test.ts runs `node --test src/forge-tutorial-bundle.test.ts` as a child and measures what it touched. To
// know the measurement bracketed a real run it parses the child's summary. That parse read the child's DEFAULT reporter, so it depended on
// the environment the child inherited: with FORCE_COLOR set the summary line is `ESC[34mℹ pass 7ESC[39m` and `^ℹ pass (\d+)$` finds nothing
// (the driver's failure: the inner suite ran and passed 7 of 7, the guard said it did not run); with NODE_OPTIONS=--test-reporter=dot|junit
// there is no summary at all. The fix is to stop depending on the environment: pick the reporter explicitly (TAP), scrub the child's env of
// everything that changes output, and parse tolerantly (ANSI, CR, trailing whitespace). What must NOT change: an output we cannot parse is a
// LOUD failure with the output tail — a guard that cannot tell "nothing was written" from "nothing ran" is not a guard.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { assertInnerSuiteRan, innerSuiteArgs, innerSuiteEnv, parseInnerSuiteRun } from './test-support/inner-suite-run.ts';

const TAP = '# Subtest: a\nok 1 - a\n1..7\n# tests 7\n# suites 0\n# pass 7\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n# duration_ms 721.35\n';
const SPEC = '✔ a (1ms)\nℹ tests 7\nℹ suites 0\nℹ pass 7\nℹ fail 0\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\nℹ duration_ms 733.2\n';
const ESC = String.fromCharCode(27);

test('parses the TAP summary (the reporter the guard now asks for)', () => {
  assert.deepEqual(parseInnerSuiteRun(TAP), { tests: 7, pass: 7, fail: 0 });
});

test('parses the spec summary too (a child that ignores the explicit reporter must still be readable)', () => {
  assert.deepEqual(parseInnerSuiteRun(SPEC), { tests: 7, pass: 7, fail: 0 });
});

test('THE DRIVER\'S FAILURE: ANSI colour codes around the summary lines do not hide them', () => {
  const coloured = SPEC.replace(/^ℹ (.*)$/gm, `${ESC}[34mℹ $1${ESC}[39m`);
  assert.ok(coloured.includes(ESC), 'the premise: the escape codes are really there');
  assert.equal(/^ℹ pass (\d+)$/m.exec(coloured), null, 'the premise: the OLD regex cannot read this');
  assert.deepEqual(parseInnerSuiteRun(coloured), { tests: 7, pass: 7, fail: 0 });
  const colouredTap = TAP.replace(/^# (tests|pass|fail) (\d+)$/gm, `${ESC}[32m# $1 $2${ESC}[0m`);
  assert.deepEqual(parseInnerSuiteRun(colouredTap), { tests: 7, pass: 7, fail: 0 });
});

test('CRLF line endings, trailing whitespace and indentation do not hide the summary', () => {
  assert.deepEqual(parseInnerSuiteRun(TAP.replace(/\n/g, '\r\n')), { tests: 7, pass: 7, fail: 0 });
  assert.deepEqual(parseInnerSuiteRun(TAP.replace(/\n/g, '   \n')), { tests: 7, pass: 7, fail: 0 });
  assert.deepEqual(parseInnerSuiteRun(SPEC.replace(/^ℹ/gm, ' ℹ')), { tests: 7, pass: 7, fail: 0 });
});

test('a failing inner suite is still READABLE (the guard cares what it wrote, not whether it passed) and reports its failures', () => {
  assert.deepEqual(parseInnerSuiteRun(TAP.replace('# pass 7', '# pass 5').replace('# fail 0', '# fail 2')), { tests: 7, pass: 5, fail: 2 });
});

test('output with no summary (dot / junit reporters, a crashed child, nothing at all) is null — never a made-up zero', () => {
  for (const out of ['', '.......\n', '<testsuites>\n<testcase name="a"/></testsuites>\n', 'Error: Cannot find module\n']) {
    assert.equal(parseInnerSuiteRun(out), null, JSON.stringify(out.slice(0, 30)));
  }
});

test('assertInnerSuiteRan: zero tests, or no parsable summary, FAILS LOUDLY and shows the output tail (escapes visible)', () => {
  assert.doesNotThrow(() => assertInnerSuiteRan(TAP));
  assert.throws(() => assertInnerSuiteRan(TAP.replace('# tests 7', '# tests 0')), /did not run/);
  const garbage = 'x'.repeat(2000) + `${ESC}[31mtail-marker`;
  assert.throws(() => assertInnerSuiteRan(garbage), (e: Error) => /did not run/.test(e.message) && e.message.includes('tail-marker') && e.message.includes('\\u001b'), 'unparsable: loud, with the tail JSON-quoted so the escape codes are visible');
  assert.throws(() => assertInnerSuiteRan(garbage), (e: Error) => !e.message.includes('x'.repeat(1500)), 'and only the tail, not 2000 chars of it');
});

test('innerSuiteEnv: scrubs everything that changes the child\'s output, keeps the rest', () => {
  const env = innerSuiteEnv({
    FORCE_COLOR: '1', NO_COLOR: '1', NODE_TEST_CONTEXT: 'child-v8', PATH: '/bin', HOME: '/h', NODE_DISABLE_COLORS: '1',
    NODE_OPTIONS: '--max-old-space-size=4096 --test-reporter=dot --test-reporter-destination stdout --test-reporter tap --enable-source-maps',
  });
  for (const k of ['FORCE_COLOR', 'NO_COLOR', 'NODE_TEST_CONTEXT', 'NODE_DISABLE_COLORS']) assert.equal(k in env, false, k);
  assert.equal(env.PATH, '/bin');
  assert.equal(env.HOME, '/h');
  assert.equal(env.NODE_OPTIONS, '--max-old-space-size=4096 --enable-source-maps', 'reporter options are removed (both = and space forms), unrelated ones survive');
  assert.equal('NODE_OPTIONS' in innerSuiteEnv({ NODE_OPTIONS: '--test-reporter=junit' }), false, 'nothing left → the variable is dropped, not set to ""');
  assert.deepEqual(Object.keys(innerSuiteEnv({})), [], 'no env in → no env out');
});

test('innerSuiteArgs: an explicit TAP reporter to stdout, so the output never depends on the Node default', () => {
  const args = innerSuiteArgs('src/forge-tutorial-bundle.test.ts');
  assert.deepEqual(args.slice(-1), ['src/forge-tutorial-bundle.test.ts']);
  assert.ok(args.includes('--test'));
  assert.ok(args.includes('--test-reporter=tap'));
  assert.ok(args.includes('--test-reporter-destination=stdout'));
  assert.ok(args.includes('--experimental-strip-types'));
});

test('MECHANISM pin: runInnerSuite hands the child innerSuiteArgs and innerSuiteEnv (the determinism lives there — if the call moves, reassess, do not just rewrite)', () => {
  const src = fs.readFileSync(path.resolve(import.meta.dirname, 'test-support', 'inner-suite-run.ts'), 'utf8');
  assert.match(src, /execFileSync\(process\.execPath, innerSuiteArgs\(testFile\), \{[^}]*env: innerSuiteEnv\(parentEnv\)/);
});
