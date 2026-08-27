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
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const BUNDLE_DIR = path.join(REPO, 'assets', 'vaults', 'forge-tutorial');

function snapshotMtimes(dir: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const entry of fs.readdirSync(dir, { recursive: true, withFileTypes: true })) {
    const p = path.join(entry.parentPath ?? entry.path, entry.name);
    if (entry.isFile()) out.set(p, fs.statSync(p).mtimeMs);
  }
  return out;
}

test('running the bundle suite does not write to the shipped bundle', () => {
  const before = snapshotMtimes(BUNDLE_DIR);
  assert.ok(before.size > 0, 'no bundled files found — the guard would be vacuous');

  // NON-VACUITY. The first version of this guard passed in 39ms — the
  // child had exited immediately and the catch swallowed it, so the
  // measurement never ran the operation under test and reported a clean,
  // confident, meaningless result. Two fixes, both load-bearing:
  //
  //  1. `node --test` exports NODE_TEST_CONTEXT to children, which makes a
  //     nested test-runner invocation short-circuit. Strip it.
  //  2. Require proof, below, that the inner suite actually executed. A
  //     guard that cannot tell "nothing was written" from "nothing ran" is
  //     not a guard.
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;

  let output = '';
  try {
    output = execFileSync(
      process.execPath,
      ['--experimental-strip-types', '--test', 'src/forge-tutorial-bundle.test.ts'],
      { cwd: REPO, encoding: 'utf8', env },
    );
  } catch (e) {
    // The inner suite's own pass/fail is reported by its own run; this
    // test only cares what it touched. Its output is still needed for the
    // did-it-run check.
    output = String((e as { stdout?: string }).stdout ?? '');
  }

  const ran = output.match(/^# pass (\d+)$/m) ?? output.match(/^\u2139 pass (\d+)$/m);
  assert.ok(
    ran && Number(ran[1]) > 0,
    'the inner bundle suite did not run, so this guard proves nothing. '
    + `Output was:\n${output.slice(-800)}`,
  );

  const after = snapshotMtimes(BUNDLE_DIR);
  const written: string[] = [];
  for (const [p, mtime] of after) {
    const was = before.get(p);
    if (was === undefined) written.push(`${path.relative(REPO, p)} (created)`);
    else if (was !== mtime) written.push(path.relative(REPO, p));
  }
  for (const p of before.keys()) {
    if (!after.has(p)) written.push(`${path.relative(REPO, p)} (deleted)`);
  }

  assert.deepEqual(
    written, [],
    'the bundle test suite wrote to the SHIPPED bundle. These tests must '
    + 'operate on a temp copy: a killed run skips their cleanup and leaves '
    + 'the damage inside the asset users install.',
  );
});
