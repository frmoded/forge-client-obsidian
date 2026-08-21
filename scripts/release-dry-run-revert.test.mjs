// Drain 2026-08-21-1410 — release.sh's dry run must leave the tree clean.
//
// The observed failure: `--dry-run` promises "no filesystem-visible side
// effects" and reverted manifest.json, but the build it runs also
// rewrites `assets/.bundle-version`, which the revert missed. The next
// invocation then aborted on the clean-tree guard — the dry run broke
// the script it was rehearsing, and it cost a re-run during the
// v0.2.363 cut.
//
// WHY THIS IS STRUCTURAL RATHER THAN A LIVE DOUBLE-INVOCATION.
// The prompt offered either shape. A test that runs `--dry-run` twice
// would be the most faithful reproduction, but each run performs a full
// `npm run build` plus a 34 MB zip build — minutes per suite run, on
// every unrelated change. These assertions read the production script
// and pin the properties that made the bug possible, at zero cost. The
// live double-invocation WAS run by hand and its transcript is in the
// drain's FEEDBACK; this guards the regression from here on.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SH = readFileSync(join(ROOT, 'scripts', 'release.sh'), 'utf8');

/** Files the build writes that git would notice. A gitignored artifact
 *  cannot dirty the tree, so only tracked ones need reverting. */
function trackedBuildArtifacts() {
  const candidates = [
    'manifest.json',
    'assets/.bundle-version',
    'main.js',
    'src/version-constant.generated.ts',
    'src/asset-manifest.generated.ts',
    'src/bundled-assets.generated.ts',
  ];
  return candidates.filter((f) => {
    try {
      execFileSync('git', ['ls-files', '--error-unmatch', f], {
        cwd: ROOT, stdio: 'ignore',
      });
      return true;
    } catch {
      return false;
    }
  });
}

test('the tracked-build-artifact set is exactly what we think it is', () => {
  // Non-vacuity + drift alarm. If a future build starts tracking another
  // generated file, this fails and whoever added it has to decide
  // whether the revert path needs extending — rather than discovering it
  // when a dry run poisons the next release.
  assert.deepEqual(
    trackedBuildArtifacts().sort(),
    ['assets/.bundle-version', 'manifest.json'],
    'a newly-tracked build artifact must be added to _revert_build_artifacts',
  );
});

test('every tracked build artifact is reverted by the dry-run cleanup', () => {
  const helper = SH.slice(
    SH.indexOf('_revert_build_artifacts() {'),
    SH.indexOf('_cleanup_on_error() {'),
  );
  assert.ok(helper, 'the revert helper must exist');
  for (const f of trackedBuildArtifacts()) {
    assert.ok(
      helper.includes(`git checkout -- ${f}`),
      `${f} is tracked and rewritten by the build, but the dry-run revert does not restore it`,
    );
  }
});

test('both revert sites route through the one helper', () => {
  // The bug was one site knowing about a file the other did not. Two
  // call sites and a single definition means they cannot diverge again.
  const calls = SH.match(/^\s*_revert_build_artifacts\s*$/gm) ?? [];
  assert.equal(calls.length, 2,
    'expected the error-trap and the dry-run-success paths to share the helper');
});

test('no revert site still restores manifest.json on its own', () => {
  // A leftover bare `git checkout -- manifest.json` outside the helper
  // would be a third path free to drift — exactly the shape being fixed.
  const outsideHelper = SH.replace(
    SH.slice(SH.indexOf('_revert_build_artifacts() {'), SH.indexOf('_cleanup_on_error() {')),
    '',
  );
  const stray = outsideHelper
    .split('\n')
    .filter((l) => /^\s*git checkout -- manifest\.json/.test(l));
  assert.deepEqual(stray, [], 'revert manifest.json via the helper, not inline');
});

test('the dry run still promises what it now delivers', () => {
  assert.match(SH, /no filesystem-visible side effects/);
  assert.match(SH, /Manifest \+ build artifacts reverted/);
});

test('the clean-tree guard is intact (§8 — fix what dirties the tree, not the guard)', () => {
  assert.match(SH, /ERROR: working tree has uncommitted changes/);
  assert.match(SH, /Commit or stash before releasing\./);
});
