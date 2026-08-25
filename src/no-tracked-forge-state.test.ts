// TDD failing-test-first — drain 2026-08-25-0140.
//
// Driver adjudicated: `.forge/` is local runtime record, not repo
// content. Snapshots keep being written locally; they stop living in
// git, and they never ship in the plugin bundle.
//
// WHY A GUARD AND NOT JUST THE EXCLUSION. `.forge` was ALREADY in
// scripts/exclusions.mjs `EXCLUDED_NAMES` — and two snapshot files
// were shipping in assets/vaults/forge-moda/.forge/ anyway. The sync
// script uses one filter for two jobs: deciding what to copy, and
// deciding what counts as a bundle orphan to delete. A path the filter
// hides is a path the cleanup cannot see, so anything that got in
// before the exclusion existed stays in forever.
//
// The general shape, worth naming: AN EXCLUSION PREVENTS ARRIVAL, IT
// DOES NOT ENFORCE ABSENCE. If absence is the property you care about,
// assert absence — through a mechanism that does not share the
// exclusion's blind spot.
//
// So both checks below use `git ls-files`, which is what production
// tracking actually is, rather than the walker's own filter.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const REPO = join(import.meta.dirname, '..');

function tracked(repo: string, pathspec: string): string[] {
  return execFileSync('git', ['-C', repo, 'ls-files', '--', pathspec], { encoding: 'utf8' })
    .split('\n').filter(Boolean);
}

test('the shipped bundle carries no .forge/ runtime state', () => {
  const leaked = tracked(REPO, 'assets/vaults/*/.forge/*');
  assert.deepEqual(leaked, [],
    `Bundled vaults must not ship .forge/ snapshots — one user's runtime ` +
    `records would be installed for every cohort member. Found:\n  ` +
    leaked.join('\n  '));
});

test('no vault repo tracks .forge/**', () => {
  // Sibling repos, resolved the way the forge suite resolves them.
  // Skips (rather than fails) where a repo is absent, so this is
  // meaningful on the driver's machine without being a landmine
  // anywhere else.
  const vaults = ['forge-moda', 'music-theory', 'music-core', 'forge-tutorial', 'forge-music'];
  const projects = join(REPO, '..');
  let checked = 0;
  for (const v of vaults) {
    const repo = join(projects, v);
    if (!existsSync(join(repo, '.git'))) continue;
    checked += 1;
    assert.deepEqual(tracked(repo, '.forge'), [],
      `${v} still tracks .forge/ paths — untrack with ` +
      `\`git rm -r --cached .forge/\` and gitignore it (drain 2026-08-25-0140).`);
  }
  assert.ok(checked > 0, 'no vault repo was reachable — this guard proved nothing');
});

test('non-vacuity: the detector fires on a planted path', () => {
  // The guards above are `deepEqual([], [])` when clean, which is also
  // what a broken `tracked()` returns. Prove the mechanism sees a real
  // tracked path before trusting its silence.
  const anyTracked = tracked(REPO, 'src/*.ts');
  assert.ok(anyTracked.length > 0, 'git ls-files returned nothing for src/*.ts');
  assert.ok(anyTracked.includes('src/no-tracked-forge-state.test.ts')
         || anyTracked.includes('src/main.ts'),
    'git ls-files did not report a file we know is tracked');
  // And that the .forge pathspec itself is not silently malformed:
  // it must match when a .forge path IS tracked. Verified against the
  // plugin repo's own history, where the leak existed.
  const historical = execFileSync('git', ['-C', REPO, 'log', '--oneline', '--all',
    '--', 'assets/vaults/*/.forge/*'], { encoding: 'utf8' }).trim();
  assert.ok(historical.length > 0,
    'the pathspec matched nothing in history either — it is probably wrong, ' +
    'so the empty result above means nothing');
});
