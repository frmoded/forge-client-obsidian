#!/usr/bin/env node
// v0.2.144 — CLI wrapper around check-bundled-vault-bump-core.
//
// Enforces cc-prompt-queue.md HARD RULE (line 356) at release time:
// any bundled-vault content change MUST be accompanied by a forge.toml
// version bump in the same vault. The check runs as a release.sh
// preflight after `npm run build` and before `git tag`.
//
// Per v0.2.141 §5.1: institutional encoding of the v0.2.135 §C
// retrospective. v0.2.135 shipped a chips fix to bundled forge-tutorial
// without bumping its forge.toml; cohort users never received the fix
// until v0.2.141 corrected the omission. This preflight catches the
// same class of violation BEFORE it ships.
//
// Baseline: the last `v*` git tag (per v0343 §1.2 option A). Catches
// all content changes since last release, even if they landed across
// multiple commits without their own bumps.
//
// Exit codes:
//   0 — passed (or no v* tag exists yet, i.e. first release).
//   1 — at least one vault has content changes without a version bump.
//
// Usage:
//   node scripts/check-bundled-vault-bump.mjs

import { execSync } from 'child_process';
import { checkBundledVaultBump } from './check-bundled-vault-bump-core.mjs';

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    // Re-throw with a clearer message; the caller decides how to handle.
    throw new Error(`command failed: ${cmd}\n${e.stderr ?? e.message ?? ''}`);
  }
}

// Drain 2026-08-03-1335 — `--worktree` widens the comparison from
// `baseline..HEAD` to `baseline..working-tree`, so UNCOMMITTED (and
// untracked) bundle changes are checked too.
//
// Why it exists: release.sh now auto-syncs the bundled vaults as its
// first preflight. Without this flag the only way to check the sync's
// output would be to commit it first — and if the check then failed,
// the driver would be left with an auto-generated commit on main that
// has to be reset or reverted. With it, release.sh validates the sync
// while it is still just working-tree edits, so a failure is undone
// with `git checkout -- assets/vaults/`.
//
// The default (no flag) is unchanged: `baseline..HEAD`, which is what
// the late preflight at release.sh:241 still uses.
const WORKTREE = process.argv.includes('--worktree');

let baseline;
try {
  baseline = run('git describe --tags --abbrev=0 --match "v*"');
} catch {
  // No prior v* tag — first release. Nothing to compare against.
  console.log('check-bundled-vault-bump: no prior v* tag found; skipping (first release).');
  process.exit(0);
}

// `git diff <baseline>` (no `..HEAD`) compares the baseline against the
// working tree, which is the whole point of --worktree.
const diffRange = WORKTREE ? baseline : `${baseline}..HEAD`;

let changedFiles;
try {
  changedFiles = run(`git diff --name-only ${diffRange}`)
    .split('\n')
    .filter(Boolean);
  if (WORKTREE) {
    // `git diff` only sees tracked files. A sync that adds a brand-new
    // note leaves it untracked, and that is exactly the content change
    // the bump rule cares about — so fold untracked files in too.
    const untracked = run('git ls-files --others --exclude-standard -- assets/vaults/')
      .split('\n')
      .filter(Boolean);
    changedFiles = [...new Set([...changedFiles, ...untracked])];
  }
} catch (e) {
  console.error('check-bundled-vault-bump: failed to compute changed files vs', baseline);
  console.error(e.message);
  process.exit(1);
}

const getTomlDiff = (tomlPath) => {
  try {
    // Must use the same range as changedFiles. Under --worktree a
    // forge.toml bumped by the sync is still uncommitted, so a
    // `..HEAD` diff would miss it and report a false
    // TOML_NO_VERSION_BUMP against a vault that did bump correctly.
    return run(`git diff ${diffRange} -- ${tomlPath}`);
  } catch {
    return '';
  }
};

const { violations, vaultList } = checkBundledVaultBump(changedFiles, getTomlDiff);

if (violations.length > 0) {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('Bundled-vault bump check FAILED');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('');
  console.error('Per cc-prompt-queue.md HARD RULE (line 356), any bundled-vault');
  console.error('content change MUST be accompanied by a forge.toml version bump.');
  console.error('');
  for (const v of violations) {
    console.error(`Vault: ${v.vault}`);
    console.error(`Reason: ${v.reason}`);
    console.error(`Detail: ${v.message}`);
    console.error(`Content changes (first ${v.contentChanges.length}):`);
    for (const f of v.contentChanges) console.error(`  - ${f}`);
    console.error('');
  }
  console.error('Resolution:');
  if (WORKTREE) {
    // Drain 1335 — in --worktree mode the changes came from
    // release.sh's auto-sync and are still UNCOMMITTED. Bumping the
    // bundled copy by hand would be undone by the next sync, so send
    // the driver to the source vault instead.
    console.error(`  1. Bump the SOURCE vault's forge.toml version field`);
    console.error(`     (e.g., ~/projects/<vault>/forge.toml: 0.1.5 → 0.1.6)`);
    console.error(`     Do NOT edit assets/vaults/<vault>/forge.toml directly —`);
    console.error(`     the auto-sync overwrites it from the source vault.`);
    console.error(`  2. Commit that bump in the source vault repo.`);
    console.error(`  3. Re-run release.sh. The auto-sync picks the bump up.`);
    console.error('');
    console.error('  Nothing has been committed in this repo. To discard the');
    console.error('  auto-sync output entirely:');
    console.error('    git checkout -- assets/vaults/ && git clean -fd assets/vaults/');
  } else {
    console.error(`  1. Bump the affected vault's forge.toml version field`);
    console.error(`     (e.g., assets/vaults/<vault>/forge.toml: 0.1.5 → 0.1.6)`);
    console.error(`  2. Also bump the canonical source repo's forge.toml`);
    console.error(`     (e.g., ~/projects/<vault>/forge.toml — same version)`);
    console.error(`  3. Commit and retry release.`);
  }
  console.error('');
  console.error('Note: this check exists because v0.2.135 §C shipped a chips fix to');
  console.error('bundled forge-tutorial without bumping its forge.toml. Cohort users');
  console.error('never received the fix until v0.2.141 corrected the omission.');
  console.error('');
  process.exit(1);
}

if (vaultList.length === 0) {
  console.log(`✓ Bundled-vault bump check passed (no bundled-vault changes since ${baseline})`);
} else {
  console.log(`✓ Bundled-vault bump check passed (vaults bumped: ${vaultList.join(', ')})`);
}
