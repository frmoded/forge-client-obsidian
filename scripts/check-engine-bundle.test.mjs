// CW-check-engine-bundle-automated-test (drain 2026-07-22-0800).
//
// Automates the three-step manual verification from drain 1730's
// FEEDBACK §Test coverage (clean → mutate → revert). The check
// script is load-bearing on the release path (wired into `prebuild`
// per drain 1500), so a silent behavior regression would break
// every downstream build.
//
// Isolation: mutation lives entirely in the working tree, wrapped
// in try/finally so revert runs even when an assertion fails.
// Revert uses `git checkout --` (matches drain 1730's manual
// cleanup) and the finally block asserts `git status --porcelain`
// is empty for the mutated path so a botched cleanup surfaces
// loudly rather than silently corrupting the tree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CHECK_SCRIPT = path.join(ROOT, 'scripts', 'check-engine-bundle.mjs');

// Option A per drain §2: mutate one specific in-scope file. Picked
// `assets/engine/forge/__init__.py` — smallest (1 line) and the most
// stable path in the bundle tree (package root, unlikely to rename).
// If this file is removed / renamed in a future engine change, update
// the constant here alongside the change.
const MUTATED_REL = 'assets/engine/forge/__init__.py';
const MUTATED_ABS = path.join(ROOT, MUTATED_REL);
const MUTATION_MARKER = '\n# forge test mutation — see check-engine-bundle.test.mjs\n';

function runCheck() {
  return spawnSync('node', [CHECK_SCRIPT], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

function gitStatusPorcelain(relPath) {
  return spawnSync('git', ['status', '--porcelain', '--', relPath], {
    cwd: ROOT,
    encoding: 'utf8',
  }).stdout;
}

function gitCheckoutRevert(relPath) {
  return spawnSync('git', ['checkout', '--', relPath], {
    cwd: ROOT,
    encoding: 'utf8',
  });
}

test('check-engine-bundle: baseline → mutate → revert lifecycle', () => {
  // Pre-flight: the target file must actually exist and be clean
  // relative to git. If a prior test-run leaked a mutation we bail
  // loudly rather than silently proceed with a corrupt baseline.
  assert.ok(
    fs.existsSync(MUTATED_ABS),
    `test target missing: ${MUTATED_REL}. Update MUTATED_REL constant if the ` +
      `engine bundle was reorganized.`,
  );
  const preFlightStatus = gitStatusPorcelain(MUTATED_REL);
  assert.equal(
    preFlightStatus,
    '',
    `test target ${MUTATED_REL} is dirty pre-test (git status: ${JSON.stringify(preFlightStatus)}). ` +
      `Revert manually before re-running.`,
  );

  // Step 1: baseline. Fresh working tree → clean drift check.
  const baseline = runCheck();
  assert.equal(
    baseline.status,
    0,
    `baseline expected exit 0. stdout:\n${baseline.stdout}\nstderr:\n${baseline.stderr}`,
  );
  assert.match(
    baseline.stdout,
    /Engine-bundle drift check: clean/,
    `baseline stdout missing "clean" line. stdout:\n${baseline.stdout}`,
  );

  const originalBytes = fs.readFileSync(MUTATED_ABS);

  try {
    // Step 2: mutate + re-check → drift detected.
    fs.writeFileSync(MUTATED_ABS, Buffer.concat([originalBytes, Buffer.from(MUTATION_MARKER)]));
    const drifted = runCheck();
    assert.notEqual(
      drifted.status,
      0,
      `mutated run expected non-zero exit. stdout:\n${drifted.stdout}\nstderr:\n${drifted.stderr}`,
    );
    // The script emits drift lines on stderr — check both streams
    // for the status token + the mutated path so a future re-route
    // (stdout↔stderr) doesn't silently break the test.
    const drifedCombined = drifted.stdout + drifted.stderr;
    assert.match(
      drifedCombined,
      /content-mismatch/,
      `mutated run missing "content-mismatch" status. combined:\n${drifedCombined}`,
    );
    // Bundle-relative path uses `forge/` prefix per script L107.
    const bundleRel = MUTATED_REL.replace(/^assets\/engine\//, '');
    assert.ok(
      drifedCombined.includes(bundleRel),
      `mutated run missing bundle-relative path ${bundleRel}. combined:\n${drifedCombined}`,
    );
  } finally {
    // Step 3: revert. Use `git checkout --` (canonical revert per
    // drain §4). If git fails for any reason (rare — worktree state
    // corruption), fall back to writing back originalBytes so the
    // finally block still leaves the tree usable, then re-raise via
    // the porcelain assertion below.
    const revert = gitCheckoutRevert(MUTATED_REL);
    if (revert.status !== 0) {
      fs.writeFileSync(MUTATED_ABS, originalBytes);
    }
    // Whatever path we took, working tree MUST be clean now.
    const finalStatus = gitStatusPorcelain(MUTATED_REL);
    assert.equal(
      finalStatus,
      '',
      `working tree dirty after revert (git status: ${JSON.stringify(finalStatus)}). ` +
        `Investigate manually.`,
    );
  }

  // Step 3 verification (post-finally so we don't mask cleanup
  // failure with a check-failure): revert restores clean state.
  const reverted = runCheck();
  assert.equal(
    reverted.status,
    0,
    `reverted run expected exit 0. stdout:\n${reverted.stdout}\nstderr:\n${reverted.stderr}`,
  );
  assert.match(
    reverted.stdout,
    /Engine-bundle drift check: clean/,
    `reverted stdout missing "clean" line. stdout:\n${reverted.stdout}`,
  );
});
