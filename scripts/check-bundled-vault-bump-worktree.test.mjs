// Drain 2026-08-03-1335 — tests for check-bundled-vault-bump.mjs's
// `--worktree` flag.
//
// The flag is the safety mechanism behind release.sh's auto-sync: the
// sync's output is validated while it is still uncommitted, so a
// violation aborts with nothing on main. If --worktree silently stopped
// seeing working-tree or untracked changes it would report "passed" on
// unbumped content and release.sh would commit it — precisely the
// failure the flag exists to prevent, and a silent one. Hence tests
// that assert the flag actually widens the comparison, not just that
// the script runs.
//
// The pure-core (checkBundledVaultBump) is covered separately. What is
// exercised here is the CLI wiring: diffRange selection and the folding
// in of untracked files.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  'check-bundled-vault-bump.mjs',
);

/** Run the checker in `cwd`; return its exit code (never throws). */
function check(cwd, args = []) {
  try {
    execFileSync(process.execPath, [SCRIPT, ...args], {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return 0;
  } catch (e) {
    return e.status ?? 1;
  }
}

/**
 * Build a throwaway repo with one bundled vault committed and tagged
 * v0.0.1, so `git describe --match v*` has a baseline to compare to.
 */
function makeRepo() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bump-worktree-'));
  const git = (cmd) => execSync(`git ${cmd}`, { cwd: dir, stdio: 'ignore' });

  git('init -q');
  git('config user.email test@local');
  git('config user.name test');
  // Keep the test independent of the host's commit.gpgsign setting.
  git('config commit.gpgsign false');

  const vault = path.join(dir, 'assets', 'vaults', 'demo');
  fs.mkdirSync(vault, { recursive: true });
  fs.writeFileSync(path.join(vault, 'forge.toml'), 'version = "0.1.0"\n');
  fs.writeFileSync(path.join(vault, 'note.md'), 'original\n');

  git('add -A');
  git('commit -q -m baseline');
  git('tag v0.0.1');

  return { dir, vault };
}

test('drain-1335 --worktree: uncommitted content edit without a bump fails', () => {
  const { dir, vault } = makeRepo();
  fs.writeFileSync(path.join(vault, 'note.md'), 'edited\n');

  assert.equal(
    check(dir, ['--worktree']), 1,
    'uncommitted content change with no forge.toml bump must fail',
  );
});

test('drain-1335 --worktree: untracked new file without a bump fails', () => {
  const { dir, vault } = makeRepo();
  // A sync that adds a brand-new note leaves it untracked. `git diff`
  // alone cannot see it, so this is the case the explicit
  // `git ls-files --others` fold-in exists for.
  fs.writeFileSync(path.join(vault, 'added.md'), 'brand new\n');

  assert.equal(
    check(dir, ['--worktree']), 1,
    'untracked bundle file must count as a content change',
  );
});

test('drain-1335 --worktree: content edit WITH an uncommitted bump passes', () => {
  const { dir, vault } = makeRepo();
  fs.writeFileSync(path.join(vault, 'note.md'), 'edited\n');
  fs.writeFileSync(path.join(vault, 'forge.toml'), 'version = "0.1.1"\n');

  // Regression guard: getTomlDiff must use the same range as
  // changedFiles. A `baseline..HEAD` diff here would miss the
  // still-uncommitted bump and report a false TOML_NO_VERSION_BUMP.
  assert.equal(
    check(dir, ['--worktree']), 0,
    'a bump in the working tree must count, not just a committed one',
  );
});

test('drain-1335 default mode ignores the working tree (flag is what widens it)', () => {
  const { dir, vault } = makeRepo();
  fs.writeFileSync(path.join(vault, 'note.md'), 'edited\n');
  fs.writeFileSync(path.join(vault, 'added.md'), 'brand new\n');

  // Same tree that fails above. Without the flag the comparison is
  // baseline..HEAD, which is unchanged — so this passing is what proves
  // the two earlier failures came from --worktree and not from some
  // pre-existing condition in the fixture.
  assert.equal(
    check(dir, []), 0,
    'default mode must still compare baseline..HEAD only',
  );
});

test('drain-1335 --worktree: clean tree passes', () => {
  const { dir } = makeRepo();

  assert.equal(check(dir, ['--worktree']), 0, 'no changes must pass');
});
