// Drain 2026-08-26-2130 — the test suite must not write to the shipped bundle.
//
// THE HAZARD. `forge-tutorial-bundle.test.ts` used to operate on the REAL
// `assets/vaults/forge-tutorial/` tree: the idempotency test ran
// sync-bundled-vault.mjs against it twice, and the drift test
// `appendFileSync`'d a `# DRIFT_TEST_MARKER` line into the real bundled
// `forge.toml`, relying on a `finally` to strip it back out. A killed run
// — Ctrl-C, OOM, CI timeout — skips the `finally` and leaves the marker
// inside the bundle that ships to users.
//
// WHY THIS ASSERTS ON mtime AND NOT ON CONTENT. A content hash cannot see
// this defect: the `finally` restores the bytes, so before and after are
// equal even when the write happened. Only the modification time reveals
// that the real file was written at all. That is the whole point — the
// claim is "the suite does not touch the shipped asset", not "the suite
// puts it back".
//
// It runs the bundle suite in a subprocess so the measurement brackets a
// real execution of the tests under scrutiny, rather than re-implementing
// what they do.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { assertInnerSuiteRan, parseInnerSuiteRun, runInnerSuite } from './test-support/inner-suite-run.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(REPO, 'assets', 'vaults', 'forge-tutorial');
const INNER_SUITE = 'src/forge-tutorial-bundle.test.ts';

function snapshotMtimes(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const p = path.join(entry.parentPath ?? entry.path, entry.name);
    if (entry.isFile()) out.set(p, fs.statSync(p).mtimeMs);
  }
  return out;
}

/**
 * The guard's measurement, with the child injectable so every way it can go wrong is testable without touching the shipped bundle.
 * Snapshots `dir`, runs the child, REQUIRES proof the child executed tests, and returns what changed under `dir`.
 */
function measureBundleWrites(runChild: () => string, dir: string): string[] {
  const before = snapshotMtimes(dir);
  assert.ok(before.size > 0, 'no bundled files found — the guard would be vacuous');

  // NON-VACUITY. The first version of this guard passed in 39ms — the
  // child had exited immediately and the catch swallowed it, so the
  // measurement never ran the operation under test and reported a clean,
  // confident, meaningless result. The proof that the inner suite actually
  // executed is `assertInnerSuiteRan`: a guard that cannot tell "nothing
  // was written" from "nothing ran" is not a guard.
  //
  // DETERMINISM (drain 2026-10-18-1500). This used to read the child's
  // DEFAULT reporter through whatever environment it inherited, so FORCE_COLOR
  // (ANSI around every summary line) or a NODE_OPTIONS reporter made the
  // inner suite "not run" although it passed 7 of 7. `runInnerSuite` picks
  // the reporter explicitly (TAP), scrubs the child's env, and an output it
  // cannot parse is a loud failure showing the tail — see
  // test-support/inner-suite-run.ts and inner-suite-run.test.ts.
  assertInnerSuiteRan(runChild());

  const after = snapshotMtimes(dir);
  const written: string[] = [];
  for (const [p, mtime] of after) {
    const was = before.get(p);
    if (was === undefined) written.push(`${path.relative(dir, p)} (created)`);
    else if (was !== mtime) written.push(path.relative(dir, p));
  }
  for (const p of before.keys()) {
    if (!after.has(p)) written.push(`${path.relative(dir, p)} (deleted)`);
  }
  return written;
}

test('running the bundle suite does not write to the shipped bundle', () => {
  const written = measureBundleWrites(() => runInnerSuite(INNER_SUITE, REPO), BUNDLE_DIR);
  assert.deepEqual(
    written, [],
    'the bundle test suite wrote to the SHIPPED bundle. These tests must '
    + 'operate on a temp copy: a killed run skips their cleanup and leaves '
    + 'the damage inside the asset users install.',
  );
});

// The guard's own failure modes, on a TEMP directory (never the shipped bundle): each must be loud, never a quiet "nothing written".
const OK_SUMMARY = '# tests 1\n# pass 1\n# fail 0\n';
function tempBundle(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-guard-'));
  fs.mkdirSync(path.join(dir, 'sub'));
  fs.writeFileSync(path.join(dir, 'forge.toml'), 'name = "x"\n');
  fs.writeFileSync(path.join(dir, 'sub', 'a.md'), 'a\n');
  const old = new Date(Date.now() - 60_000);
  for (const f of ['forge.toml', 'sub/a.md']) fs.utimesSync(path.join(dir, f), old, old);       // a write is then always a visible mtime change
  return dir;
}

test('the guard: a child that never ran (no output / no summary / zero tests) FAILS — it is not "nothing was written"', () => {
  const dir = tempBundle();
  assert.throws(() => measureBundleWrites(() => '', dir), /did not run/);
  assert.throws(() => measureBundleWrites(() => 'Error: Cannot find module x\n', dir), /did not run/);
  assert.throws(() => measureBundleWrites(() => '# tests 0\n# pass 0\n# fail 0\n', dir), /did not run/);
});

test('the guard: an unparsable output fails LOUDLY with the output tail in the message', () => {
  assert.throws(() => measureBundleWrites(() => 'tail-marker-xyz', tempBundle()), /did not run[\s\S]*tail-marker-xyz/);
});

test('the guard: a child that ran AND wrote is caught — a changed file, a created file, a deleted file', () => {
  const dir = tempBundle();
  const touch = () => { const t = new Date(); fs.utimesSync(path.join(dir, 'forge.toml'), t, t); return OK_SUMMARY; };
  assert.deepEqual(measureBundleWrites(touch, dir), ['forge.toml']);
  assert.deepEqual(measureBundleWrites(() => { fs.writeFileSync(path.join(dir, 'new.md'), 'n'); return OK_SUMMARY; }, dir), ['new.md (created)']);
  assert.deepEqual(measureBundleWrites(() => { fs.rmSync(path.join(dir, 'sub', 'a.md')); return OK_SUMMARY; }, dir), [path.join('sub', 'a.md') + ' (deleted)']);
});

test('the guard: a restored-bytes write is still a write (mtime, not content, is the claim)', () => {
  const dir = tempBundle();
  const rewrite = () => { fs.writeFileSync(path.join(dir, 'forge.toml'), 'name = "x"\n'); return OK_SUMMARY; };   // same bytes, new mtime
  assert.deepEqual(measureBundleWrites(rewrite, dir), ['forge.toml']);
});

test('the guard: a clean run over an untouched bundle reports nothing, and an empty directory is refused (vacuous)', () => {
  assert.deepEqual(measureBundleWrites(() => OK_SUMMARY, tempBundle()), []);
  assert.throws(() => measureBundleWrites(() => OK_SUMMARY, fs.mkdtempSync(path.join(os.tmpdir(), 'bundle-guard-empty-'))), /vacuous/);
});

// END TO END, against the real inner suite, under the environments that broke the old parse. Each of these is a driver-shell variable
// (a coloured terminal, a Node reporter set in the profile): the guard must read the same 7-of-7 whatever the parent's environment is.
const HOSTILE_ENVS: Array<[string, NodeJS.ProcessEnv]> = [
  ['FORCE_COLOR=1', { FORCE_COLOR: '1' }],
  ['FORCE_COLOR=3', { FORCE_COLOR: '3' }],
  ['NO_COLOR=1', { NO_COLOR: '1' }],
  ['NODE_OPTIONS=--test-reporter=dot', { NODE_OPTIONS: '--test-reporter=dot' }],
  ['NODE_OPTIONS=--test-reporter=junit --test-reporter-destination=stdout', { NODE_OPTIONS: '--test-reporter=junit --test-reporter-destination=stdout' }],
  ['NODE_OPTIONS=--test-reporter=spec', { NODE_OPTIONS: '--test-reporter=spec' }],
  ['all of them', { FORCE_COLOR: '1', NODE_OPTIONS: '--test-reporter=dot --max-old-space-size=2048' }],
];

test('the inner suite reads as RAN, with the same counts, under every hostile parent environment', () => {
  const baseline = parseInnerSuiteRun(runInnerSuite(INNER_SUITE, REPO, process.env));
  assert.ok(baseline && baseline.tests > 0, 'the premise: a clean environment reads');
  for (const [label, hostile] of HOSTILE_ENVS) {
    const run = parseInnerSuiteRun(runInnerSuite(INNER_SUITE, REPO, { ...process.env, ...hostile }));
    assert.deepEqual(run, baseline, label);
  }
});
