---
timestamp: 2026-06-26T00:00:00Z
session_id: drain-2026-06-26-0000
status: pending
priority: MEDIUM — institutional enforcement of an existing HARD RULE
---

# v0.2.144 (renumber to current) — Automated `check-bundled-vault-bump.mjs` release.sh preflight

## §0 — Goal

Add a release.sh preflight that automatically enforces the existing HARD RULE at `cc-prompt-queue.md:356`:

> **Bundled-vault content changes MUST bump the vault's `forge.toml` version (HARD RULE).** Any prompt that modifies files under a bundled vault path ... must ALSO bump the bundled vault's own `forge.toml` `version` field.

CC's v0.2.135 §C drain violated this rule (modified `assets/vaults/forge-tutorial/_meta/_chips.md` without bumping `assets/vaults/forge-tutorial/forge.toml`). The bug went undetected until driver smoke (v0.2.141 root cause investigation surfaced it). v0.2.141 restored compliance manually.

This preflight catches the same class of violation at release time, BEFORE it ships. Recommended by CC in v0.2.141 §5.1.

## §1 — Investigation phase (per §78)

### §1.1 — Current release.sh state

```bash
grep -n "preflight\|inlined-version\|inline-plugin-version" scripts/release.sh
```

Identify where existing preflights live (v0.2.131 stale-install check, v0.2.134 inlined-version check). Find the right insertion point — after `npm run build` but BEFORE `git tag`.

### §1.2 — Tag baseline question

The preflight needs a baseline to diff against. Options:
- **A. Last git tag** (`git describe --tags --abbrev=0 --match "v*"`) — most natural; compares this release's changes vs last shipped.
- **B. main branch HEAD~1** (parent of release commit) — narrower; only catches issues in the single bump commit.

My pick: **A**. Catches all content changes since last release, even if they landed across multiple commits without their own bumps. This is the actual semantic of the HARD RULE.

### §1.3 — What counts as a "content change"

Any modification under `assets/vaults/{name}/` paths EXCEPT the `forge.toml` itself. Specifically:
- Added/modified/deleted `.md` snippets.
- Added/modified/deleted `_meta/*.md` (chips, etc.).
- Added/modified/deleted any other vault content.

If the only change in a vault dir is `forge.toml` itself (e.g., a version-only bump), no violation — that's just a version bump.

## §2 — Implementation

### §2.1 — `scripts/check-bundled-vault-bump.mjs` (NEW)

```javascript
#!/usr/bin/env node
// Verifies that any bundled-vault content change since the last release tag
// is accompanied by a forge.toml version bump in the same vault.
// Per cc-prompt-queue.md HARD RULE line 356.
// Per v0.2.141 §5.1 (originally surfaced via driver smoke 2026-06-25).

import { execSync } from 'child_process';

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

// Find baseline: last git tag matching v*.
let baseline;
try {
  baseline = run('git describe --tags --abbrev=0 --match "v*"');
} catch {
  console.error('check-bundled-vault-bump: no prior v* tag found; skipping (first release?)');
  process.exit(0);
}

// All files changed since baseline.
const changedFiles = run(`git diff --name-only ${baseline}..HEAD`)
  .split('\n')
  .filter(Boolean);

// Group changes by bundled vault name.
const vaultChanges = new Map(); // vaultName → list of changed paths in that vault
for (const file of changedFiles) {
  const m = file.match(/^assets\/vaults\/([^/]+)\//);
  if (!m) continue;
  const vault = m[1];
  if (!vaultChanges.has(vault)) vaultChanges.set(vault, []);
  vaultChanges.get(vault).push(file);
}

// For each affected vault, verify:
//   1. forge.toml is in the diff (toml file itself changed)
//   2. The toml diff contains an actual version line change
// EXCEPT: if the ONLY change in that vault is forge.toml itself (toml-only bump,
// no content change), skip — nothing to enforce.
const violations = [];
for (const [vault, files] of vaultChanges) {
  const tomlPath = `assets/vaults/${vault}/forge.toml`;
  const contentChanges = files.filter(f => f !== tomlPath);

  if (contentChanges.length === 0) {
    // Toml-only change in this vault; nothing to check.
    continue;
  }

  if (!files.includes(tomlPath)) {
    violations.push({
      vault,
      reason: 'CONTENT_NO_TOML',
      message: `Vault '${vault}' has ${contentChanges.length} content change(s) since ${baseline}, ` +
        `but ${tomlPath} is not in the diff.`,
      contentChanges: contentChanges.slice(0, 5), // first 5 for brevity
    });
    continue;
  }

  // Toml is in the diff — verify version line actually changed.
  const tomlDiff = run(`git diff ${baseline}..HEAD -- ${tomlPath}`);
  const versionLineChanged = /^[-+]\s*version\s*=/m.test(tomlDiff);
  if (!versionLineChanged) {
    violations.push({
      vault,
      reason: 'TOML_NO_VERSION_BUMP',
      message: `Vault '${vault}' has content changes since ${baseline}, ${tomlPath} is in the diff, ` +
        `but no version line change detected.`,
      contentChanges: contentChanges.slice(0, 5),
    });
  }
}

if (violations.length > 0) {
  console.error('');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('Bundled-vault bump check FAILED');
  console.error('═══════════════════════════════════════════════════════════════');
  console.error('');
  console.error(`Per cc-prompt-queue.md HARD RULE (line 356), any bundled-vault`);
  console.error(`content change MUST be accompanied by a forge.toml version bump.`);
  console.error('');
  for (const v of violations) {
    console.error(`Vault: ${v.vault}`);
    console.error(`Reason: ${v.reason}`);
    console.error(`Detail: ${v.message}`);
    console.error(`Content changes (first 5):`);
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

const vaultList = [...vaultChanges.keys()];
if (vaultList.length === 0) {
  console.log('✓ Bundled-vault bump check passed (no bundled-vault changes since ' + baseline + ')');
} else {
  console.log('✓ Bundled-vault bump check passed (vaults bumped: ' + vaultList.join(', ') + ')');
}
```

### §2.2 — Wire into release.sh

After `npm run build` and after the existing v0.2.131 inlined-version preflight, BEFORE `git tag`:

```bash
# Bundled-vault bump preflight — per v0.2.141 §5.1.
# Enforces cc-prompt-queue.md HARD RULE (line 356).
if ! node scripts/check-bundled-vault-bump.mjs; then
  echo "ERROR: bundled-vault bump check failed. See output above."
  exit 1
fi
```

Insert at the same level as the inlined-version preflight (they share the "release sanity check" concern).

### §2.3 — Make script executable

```bash
chmod +x scripts/check-bundled-vault-bump.mjs
```

(Or invoke via `node scripts/...` per the release.sh snippet; both work.)

### §2.4 — Self-test (run locally to confirm semantics)

Manual verification before committing the wiring:

```bash
# Should pass (assuming current HEAD doesn't violate):
node scripts/check-bundled-vault-bump.mjs

# Synthetic violation test:
# 1. Edit a bundled vault's _meta/_chips.md (e.g., add a comment).
# 2. Commit WITHOUT bumping the corresponding forge.toml.
# 3. Run the script: should FAIL with CONTENT_NO_TOML violation.
# 4. Bump the forge.toml.
# 5. Re-run: should PASS.
# 6. Revert the synthetic commits.
```

Document the manual self-test result in feedback.

## §3 — Tests required

### §3.1 — Pure-core extraction (per §86–118)

The check logic SHOULD be extractable to a pure-core for testing in isolation:

`scripts/check-bundled-vault-bump-core.mjs` (or `.ts` if the build supports):

```javascript
export function checkBundledVaultBump(
  changedFiles,       // string[] — list of paths changed since baseline
  getTomlDiff,        // (path: string) => string — closure to fetch a path's diff text
) {
  // Pure logic; no I/O. Returns { violations: [...], vaultList: [...] }.
}
```

The CLI wrapper (`scripts/check-bundled-vault-bump.mjs`) handles git invocation and exits with a code based on the result. The pure-core gets unit tests.

### §3.2 — Pure-core tests

`scripts/check-bundled-vault-bump-core.test.mjs` (NEW):

1. **No vault changes**: `changedFiles = ['main.ts']` → no violations, vaultList empty.
2. **Toml-only bump**: `changedFiles = ['assets/vaults/foo/forge.toml']` + diff shows version bump → no violations, vaultList = ['foo'].
3. **Content change with toml bump**: `changedFiles = ['assets/vaults/foo/x.md', 'assets/vaults/foo/forge.toml']` + diff shows version bump → no violations.
4. **Content change without toml**: `changedFiles = ['assets/vaults/foo/x.md']` → 1 violation, reason CONTENT_NO_TOML.
5. **Content change with toml but no version bump**: `changedFiles = ['assets/vaults/foo/x.md', 'assets/vaults/foo/forge.toml']` + diff shows comment-only change → 1 violation, reason TOML_NO_VERSION_BUMP.
6. **Multiple vaults, one violates**: foo properly bumped + bar with content only → 1 violation for bar.
7. **Multiple vaults, both violate**: both with content-only → 2 violations.
8. **Edge: nested paths**: `changedFiles = ['assets/vaults/foo/sub/dir/file.md']` → matches vault 'foo' correctly.
9. **Edge: false positive guard**: `changedFiles = ['assets/vaults_not_a_vault/x.md']` → doesn't match (the regex requires exactly `assets/vaults/{name}/`).
10. **Edge: file deletions count as content changes**: deleted file still triggers the check (the rule is about ANY content change).

Plugin/script test count goes up modestly.

### §3.3 — Integration test (release.sh)

Optional: a shell test that synthesizes a small git history, runs release.sh up to the preflight, asserts pass/fail per scenario. May be overkill for this drain; the §2.4 manual self-test covers the wiring smoke.

## §4 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §1 traces the existing preflight surface + the rule's semantic.
- ✓ §57–74 (TDD): §3.2 enumerates 10 failing-first cases.
- ✓ §86–118 (pure-core convention): §3.1 extracts the check logic as a pure-core.
- ✓ §76 (don't ship speculative fix): driver-flagged via v0.2.141 root cause; concrete prior violation.
- ✓ §347 (version-bump sanity check): release.sh handled automatically.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.120 console.error HARD RULE: any catches use console.error with method-name prefix.
- ✓ v0.2.124 pure-core dispatch HARD RULE: check logic in pure-core; CLI wrapper is the only I/O.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: this check is the institutional encoding of that rule for bundled-vault drift.
- ✓ v0.2.134 §5 inlined-version preflight: runs alongside without conflict.
- ✓ cc-prompt-queue.md:356 bundled-vault HARD RULE: THIS DRAIN IS the automated enforcement of that rule.

## §5 — User-side smoke

After ship:

```
# Confirm the script runs cleanly on a healthy release:
cd ~/projects/forge-client-obsidian
node scripts/check-bundled-vault-bump.mjs
# Expected: "✓ Bundled-vault bump check passed ..."

# Synthetic violation test (optional):
# 1. Edit assets/vaults/forge-tutorial/_meta/_chips.md (add a comment line).
# 2. Commit without bumping the forge.toml.
# 3. Run release.sh — should ABORT with the bundled-vault bump check failure
#    and clear remediation steps.
# 4. Bump assets/vaults/forge-tutorial/forge.toml (e.g., 0.1.6 → 0.1.7).
# 5. Commit, re-run release.sh — should PASS the check.
# 6. Revert the synthetic commits.
```

This synthetic test is optional but recommended to confirm the wiring fires on real violations.

## §6 — Open follow-ups

1. **Source-repo cross-check** — the preflight only checks the plugin repo's diff. The canonical source repos (`~/projects/forge-tutorial/`, etc.) need bumps too, but cross-repo checks are fragile (paths may vary across machines). The remediation message reminds the human; not automated. Future: could add a config field in the plugin repo pointing at known source repos and verify their HEAD commits also bump.

2. **Prompt template update** — bundled-vault-content prompts should default-include the forge.toml bump step in their hand-off checklist (v0.2.141 §5.2). Could be codified as a prompt-template snippet.

3. **Sibling rule enforcement** — the same preflight pattern could enforce other "X must accompany Y" rules: e.g., `manifest.json` version bump must match the `PLUGIN_VERSION_AT_BUILD` constant (already enforced by v0.2.131 inlined-version preflight; pattern consistent).

## §7 — Architectural framing

V1 institutional enforcement. Encodes an existing HARD RULE into automated CI-side checks. Same shape as v0.2.131 stale-install detection (codify a known failure mode) and v0.2.134 §5 inlined-version preflight (catch a release-pipeline drift class).

The combination of preflights now catches:
- Plugin-version drift (v0.2.131 stale-install on user side, v0.2.134 inlined-version on release side)
- Bundled-vault drift (this drain)

Future preflights can layer on the same pattern without disrupting existing ones.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

Single small focused drain. Suggested order:
1. §1 investigation (~10 min).
2. §3.1 pure-core extraction + §3.2 tests (~30 min).
3. §2.1 CLI wrapper + §2.2 release.sh wiring (~15 min).
4. §2.4 self-test (~10 min).
5. Release v0.2.144.

Total estimated CC time: 60-75 min.

If §1.2 baseline question (last tag vs HEAD~1) surfaces complications (e.g., release.sh runs from a non-tagged context), CC's call on alternate baseline.

Side-note for CC: this drain's own release.sh run is the FIRST time the new preflight will execute against a real release. If it surfaces ANY violations in the current HEAD (i.e., unbumped vault content already in the codebase), surface and fix in this drain before tagging.
