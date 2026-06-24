// v0.2.144 — failing-first tests for checkBundledVaultBump.
//
// Per v0343 §3.2: 10 cases covering the (vault, content change,
// forge.toml change, version-line change) decision matrix.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkBundledVaultBump } from './check-bundled-vault-bump-core.mjs';

/** A diff stub that always returns the empty string. Tests that don't
 *  exercise the diff path use this. */
const emptyDiff = () => '';

/** Build a getTomlDiff stub that returns a canned string for one
 *  specific path. */
function fakeDiff(map) {
  return (path) => (path in map ? map[path] : '');
}

test('checkBundledVaultBump: no changed files → no violations', () => {
  const r = checkBundledVaultBump([], emptyDiff);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.vaultList, []);
});

test('checkBundledVaultBump: non-vault changes only → no violations', () => {
  const r = checkBundledVaultBump(['src/main.ts', 'README.md'], emptyDiff);
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.vaultList, []);
});

test('checkBundledVaultBump: toml-only bump → no violation (standalone version bumps allowed)', () => {
  const r = checkBundledVaultBump(
    ['assets/vaults/foo/forge.toml'],
    fakeDiff({
      'assets/vaults/foo/forge.toml': '-version = "0.1.5"\n+version = "0.1.6"\n',
    }),
  );
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.vaultList, ['foo']);
});

test('checkBundledVaultBump: content change + toml version bump → no violation', () => {
  const r = checkBundledVaultBump(
    [
      'assets/vaults/foo/_meta/_chips.md',
      'assets/vaults/foo/forge.toml',
    ],
    fakeDiff({
      'assets/vaults/foo/forge.toml': '-version = "0.1.5"\n+version = "0.1.6"\n',
    }),
  );
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.vaultList, ['foo']);
});

test('checkBundledVaultBump: content change without toml → CONTENT_NO_TOML violation (the v0.2.135 §C bug shape)', () => {
  const r = checkBundledVaultBump(
    ['assets/vaults/foo/_meta/_chips.md'],
    emptyDiff,
  );
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].vault, 'foo');
  assert.equal(r.violations[0].reason, 'CONTENT_NO_TOML');
  assert.match(r.violations[0].message, /1 content change/);
  assert.deepEqual(r.violations[0].contentChanges, [
    'assets/vaults/foo/_meta/_chips.md',
  ]);
});

test('checkBundledVaultBump: content change + toml diff with no version line → TOML_NO_VERSION_BUMP violation', () => {
  const r = checkBundledVaultBump(
    [
      'assets/vaults/foo/_meta/_chips.md',
      'assets/vaults/foo/forge.toml',
    ],
    fakeDiff({
      // forge.toml diff with only a comment change; version line absent.
      'assets/vaults/foo/forge.toml': '-# old comment\n+# new comment\n',
    }),
  );
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].vault, 'foo');
  assert.equal(r.violations[0].reason, 'TOML_NO_VERSION_BUMP');
});

test('checkBundledVaultBump: multiple vaults, one violates', () => {
  const r = checkBundledVaultBump(
    [
      // foo: clean (content + toml version bump)
      'assets/vaults/foo/snippet.md',
      'assets/vaults/foo/forge.toml',
      // bar: content only, no toml
      'assets/vaults/bar/snippet.md',
    ],
    fakeDiff({
      'assets/vaults/foo/forge.toml': '-version = "0.1.0"\n+version = "0.1.1"\n',
    }),
  );
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].vault, 'bar');
  assert.equal(r.violations[0].reason, 'CONTENT_NO_TOML');
  assert.deepEqual(r.vaultList.sort(), ['bar', 'foo']);
});

test('checkBundledVaultBump: multiple vaults, both violate', () => {
  const r = checkBundledVaultBump(
    [
      'assets/vaults/foo/x.md',
      'assets/vaults/bar/y.md',
    ],
    emptyDiff,
  );
  assert.equal(r.violations.length, 2);
  const reasons = r.violations.map((v) => v.reason).sort();
  assert.deepEqual(reasons, ['CONTENT_NO_TOML', 'CONTENT_NO_TOML']);
  const vaults = r.violations.map((v) => v.vault).sort();
  assert.deepEqual(vaults, ['bar', 'foo']);
});

test('checkBundledVaultBump: nested paths inside a vault count correctly', () => {
  const r = checkBundledVaultBump(
    ['assets/vaults/foo/sub/dir/deep/file.md'],
    emptyDiff,
  );
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].vault, 'foo');
  assert.deepEqual(r.violations[0].contentChanges, [
    'assets/vaults/foo/sub/dir/deep/file.md',
  ]);
});

test('checkBundledVaultBump: assets/vaults_not_a_vault/... does not false-positive', () => {
  // The regex requires `/` immediately after `assets/vaults`, so a
  // sibling directory like `assets/vaults_legacy/` shouldn't match.
  const r = checkBundledVaultBump(
    ['assets/vaults_legacy/foo/x.md', 'assets/vaultsmisc/y.md'],
    emptyDiff,
  );
  assert.deepEqual(r.violations, []);
  assert.deepEqual(r.vaultList, []);
});

test('checkBundledVaultBump: file deletions still count as content changes', () => {
  // git diff --name-only doesn't distinguish add/modify/delete; any
  // path in the changed list triggers the check. The rule is about ANY
  // content change to the vault, including deletions (removing a chip
  // is still a content change cohort users should re-extract for).
  const r = checkBundledVaultBump(
    ['assets/vaults/foo/retired_snippet.md'],
    emptyDiff,
  );
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].reason, 'CONTENT_NO_TOML');
});

test('checkBundledVaultBump: contentChanges list capped at 5 in violation output (for brevity)', () => {
  const files = Array.from({ length: 10 }, (_, i) => `assets/vaults/foo/file_${i}.md`);
  const r = checkBundledVaultBump(files, emptyDiff);
  assert.equal(r.violations.length, 1);
  assert.equal(r.violations[0].contentChanges.length, 5);
});

test('checkBundledVaultBump: version line variants are detected (whitespace tolerance)', () => {
  // `-  version = "..."` with leading spaces, `+version="..."` no space —
  // both forms should be detected. Regex: `/^[-+]\s*version\s*=/m`.
  const variants = [
    '-version = "0.1.0"\n+version = "0.1.1"\n',
    '-  version = "0.1.0"\n+  version = "0.1.1"\n',  // indented
    '-version="0.1.0"\n+version="0.1.1"\n',  // no space around =
    '-version  =  "0.1.0"\n+version  =  "0.1.1"\n',  // extra space around =
  ];
  for (const diff of variants) {
    const r = checkBundledVaultBump(
      ['assets/vaults/foo/x.md', 'assets/vaults/foo/forge.toml'],
      fakeDiff({ 'assets/vaults/foo/forge.toml': diff }),
    );
    assert.deepEqual(
      r.violations,
      [],
      `expected no violation for diff variant: ${JSON.stringify(diff)}`,
    );
  }
});
