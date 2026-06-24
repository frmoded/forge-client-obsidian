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

let baseline;
try {
  baseline = run('git describe --tags --abbrev=0 --match "v*"');
} catch {
  // No prior v* tag — first release. Nothing to compare against.
  console.log('check-bundled-vault-bump: no prior v* tag found; skipping (first release).');
  process.exit(0);
}

let changedFiles;
try {
  changedFiles = run(`git diff --name-only ${baseline}..HEAD`)
    .split('\n')
    .filter(Boolean);
} catch (e) {
  console.error('check-bundled-vault-bump: failed to compute changed files vs', baseline);
  console.error(e.message);
  process.exit(1);
}

const getTomlDiff = (tomlPath) => {
  try {
    return run(`git diff ${baseline}..HEAD -- ${tomlPath}`);
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
  console.error(`  1. Bump the affected vault's forge.toml version field`);
  console.error(`     (e.g., assets/vaults/<vault>/forge.toml: 0.1.5 → 0.1.6)`);
  console.error(`  2. Also bump the canonical source repo's forge.toml`);
  console.error(`     (e.g., ~/projects/<vault>/forge.toml — same version)`);
  console.error(`  3. Commit and retry release.`);
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
