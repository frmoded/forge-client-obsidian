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
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SH = readFileSync(join(ROOT, 'scripts', 'release.sh'), 'utf8');

/** The single list of what the build writes (scripts/build-outputs.txt),
 *  shared with release.sh so neither can drift from the other. */
function buildOutputCandidates() {
  return readFileSync(join(ROOT, 'scripts', 'build-outputs.txt'), 'utf8')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '' && !l.startsWith('#'));
}

function isTracked(f) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', f], {
      cwd: ROOT, stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

/** Files the build writes that git would notice. A gitignored artifact
 *  cannot dirty the tree, so only tracked ones need reverting via
 *  `git checkout` — the untracked ones need the snapshot path instead
 *  (drain 2026-08-22-1100). */
function trackedBuildArtifacts() {
  return buildOutputCandidates().filter(isTracked);
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
  // Drain 2026-08-22-1100 — the helper used to name each file in a
  // `git checkout -- <file>` line and this test matched them one by
  // one. It now loops the shared build-output list and checks out the
  // tracked ones, so the assertion moves to the mechanism: every
  // tracked artifact must be REACHED by that loop.
  const helper = SH.slice(
    SH.indexOf('_revert_build_artifacts() {'),
    SH.indexOf('_cleanup_on_error() {'),
  );
  assert.ok(helper, 'the revert helper must exist');
  assert.match(helper, /_build_outputs/, 'the revert must iterate the shared list');
  assert.match(helper, /git ls-files --error-unmatch/, 'and partition it by tracked-ness');
  assert.match(helper, /git checkout -- "\$f"/, 'checking out each tracked entry');
  for (const f of trackedBuildArtifacts()) {
    assert.ok(
      buildOutputCandidates().includes(f),
      `${f} is tracked and rewritten by the build but is not in the list the revert walks`,
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

// ---------------------------------------------------------------------
// Drain 2026-08-22-0910 — the REAL-run side of the same inconsistency.
//
// Drain 1410 fixed the dry run's revert and, in doing so, surfaced that
// `release.sh`'s release commit stages only manifest.json. The build
// also regenerates the tracked `assets/.bundle-version`, so every cut
// left the sentinel uncommitted — HEAD carrying manifest 0.2.363 beside
// sentinel 0.2.362 was exactly that. The standing release HARD RULE
// ("the release commit MUST include the regenerated sentinel") was
// enforced only by drain-time vigilance until now.

/** The pathspec the release commit actually stages. */
function releaseCommitPathspec() {
  const idx = SH.indexOf('git commit -m "Release v${NEW_VERSION}"');
  assert.ok(idx > 0, 'release commit site must exist');
  const before = SH.slice(0, idx);
  const addLine = before.split('\n').reverse().find((l) => /^\s*git add /.test(l));
  assert.ok(addLine, 'the release commit must stage something explicitly');
  return addLine.trim().replace(/^git add\s+/, '').split(/\s+/);
}

test('the release commit stages every tracked build artifact', () => {
  // Derived, not listed: whatever the build rewrites AND git tracks
  // must be in the release commit, or HEAD ships internally
  // inconsistent metadata.
  const staged = releaseCommitPathspec();
  for (const f of trackedBuildArtifacts()) {
    assert.ok(
      staged.includes(f),
      `${f} is a tracked build artifact but the release commit does not stage it — ` +
      `HEAD would carry a stale ${f} beside a bumped manifest`,
    );
  }
});

test('the sentinel and the manifest are committed together, not in separate commits', () => {
  // Same commit or the window between them is a state where the two
  // disagree — which is what the bundle-version-sentinel test asserts
  // can never be true at HEAD.
  const staged = releaseCommitPathspec();
  assert.ok(staged.includes('manifest.json'));
  assert.ok(staged.includes('assets/.bundle-version'));
});

// ---------------------------------------------------------------------
// Drain 2026-08-22-1100 — a rehearsal restores what it rewrote,
// TRACKED OR NOT.
//
// The observed gap: `_revert_build_artifacts` restores the tracked
// artifacts, and drain 1410 reasoned (correctly, for the clean-tree
// guard) that a gitignored file cannot dirty the tree. But main.js
// carries an inlined version stamp, so after a dry run the working
// copy is stamped at the rehearsed version while manifest.json has
// gone back — `git status` clean, next preflight refusing:
//
//   ✗ version stamp — main.js version stamp (0.2.364) does not match
//     manifest.json version (0.2.363).
//
// Note the stamp cannot be repaired by re-running the inliner: that
// writes src/version-constant.generated.ts, which only reaches main.js
// through esbuild. Hence snapshot-and-restore rather than re-generate.

/** Build outputs that git does NOT track — the ones a `git checkout`
 *  can never bring back, so the dry run must save them itself. */
function untrackedBuildArtifacts() {
  return buildOutputCandidates().filter((f) => !isTracked(f));
}

test('the untracked build-output set is exactly what we think it is', () => {
  // Non-vacuity + drift alarm, mirroring the tracked-set test above.
  assert.deepEqual(
    untrackedBuildArtifacts().sort(),
    [
      'main.js',
      'src/asset-manifest.generated.ts',
      'src/bundled-assets.generated.ts',
      'src/version-constant.generated.ts',
    ],
    'a new gitignored build output must be added to the snapshot set',
  );
});

test('every untracked build output is snapshotted and restored', () => {
  const sh = SH;
  assert.ok(sh.includes('_snapshot_build_outputs'), 'a snapshot step must exist');
  for (const f of untrackedBuildArtifacts()) {
    assert.ok(
      sh.includes(f) || sh.includes('BUILD_OUTPUTS_FILE'),
      `${f} must be covered by the snapshot/restore set`,
    );
  }
});

test('the snapshot is taken before the build overwrites anything', () => {
  const snapAt = SH.search(/^_snapshot_build_outputs$/m);
  const buildAt = SH.search(/^npm run build$/m);
  assert.ok(snapAt > 0, 'snapshot must be invoked, not just defined');
  assert.ok(
    snapAt < buildAt,
    'snapshotting after the build would save the rewritten copies',
  );
});

test('an output that did not exist before is removed again, not left behind', () => {
  // Restoring "absent" is part of restoring. Without this, a dry run on
  // a fresh clone leaves a main.js the developer never built.
  assert.match(SH, /\.absent/, 'the snapshot must record non-existence too');
});

test('the build-output list has one definition, shared by script and test', () => {
  // Drain 0920's lesson applied here before a second copy could exist.
  assert.ok(
    existsSync(join(ROOT, 'scripts', 'build-outputs.txt')),
    'scripts/build-outputs.txt is the single list',
  );
  assert.ok(SH.includes('build-outputs.txt'), 'release.sh reads it');
});
