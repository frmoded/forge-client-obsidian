---
prompt: 2026-06-26-0000-v0343-check-bundled-vault-bump-preflight.md
shipped_version: v0.2.144
session: drain-2026-06-26-0000
date: 2026-06-26
status: shipped
---

# v0343 feedback — automated bundled-vault bump preflight shipped

## §1 — What shipped (v0.2.144)

### §1.1 — Pure-core `scripts/check-bundled-vault-bump-core.mjs`

Per prompt §3.1 pure-core extraction. Pure logic, no I/O:

```javascript
checkBundledVaultBump(changedFiles, getTomlDiff) → { violations, vaultList }
```

- Groups changed-file paths by vault via `/^assets\/vaults\/([^/]+)\//` regex (defends against `assets/vaults_xyz/` sibling false-positives).
- For each affected vault:
  - **Content-only change** (no `forge.toml` in diff) → `CONTENT_NO_TOML` violation.
  - **forge.toml in diff but no version line change** → `TOML_NO_VERSION_BUMP` violation. Version-line regex `/^[-+]\s*version\s*=/m` tolerates leading whitespace + spacing around `=` so common toml formatting variants don't false-positive.
  - **Toml-only standalone bump** (no other content changes) → no violation. Standalone version bumps are always allowed (e.g., during coordinated re-extract releases).
- `contentChanges` capped at 5 entries per violation for log brevity.

### §1.2 — `scripts/check-bundled-vault-bump-core.test.mjs` — 13 failing-first cases

Covers the full decision matrix per prompt §3.2 (10 cases) plus 3 added for robustness:
1. Empty changed files → no violations
2. Non-vault changes only (`src/main.ts`) → no violations
3. Toml-only bump → no violation
4. Content + toml version bump → no violation
5. Content without toml → `CONTENT_NO_TOML` (the v0.2.135 §C bug shape)
6. Content + toml with no version-line change → `TOML_NO_VERSION_BUMP`
7. Multiple vaults, one violates → 1 violation for the violator
8. Multiple vaults, both violate → 2 violations
9. Nested paths inside a vault count correctly
10. `assets/vaults_legacy/` and `assets/vaultsmisc/` don't false-positive
11. File deletions still count as content changes
12. `contentChanges` capped at 5 in violation output
13. Version line variants (indented, no spaces around `=`, extra spaces) all detected

### §1.3 — CLI wrapper `scripts/check-bundled-vault-bump.mjs`

- Resolves baseline via `git describe --tags --abbrev=0 --match "v*"`.
- Skips with exit 0 if no prior `v*` tag exists (first release).
- Lists changed files via `git diff --name-only baseline..HEAD`.
- For each affected vault, fetches per-toml diff via `git diff baseline..HEAD -- {path}` and hands to the pure-core.
- On violation: structured, multi-line error output identifying the vault, reason, content files affected, and a 3-step remediation path. Footer references the v0.2.135 §C retrospective so future readers understand why the rule exists.
- Exit code 1 on any violation; 0 on pass.

### §1.4 — release.sh wiring

New preflight block inserted right after the v0.2.131 inlined-version preflight, BEFORE `git tag`. Same shell-style as the existing `if ! node scripts/...; then exit 1; fi` pattern in release.sh. Comment header cites v0.2.141 §5.1 + the cc-prompt-queue.md HARD RULE line number.

### §1.5 — `package.json` test glob extension

Updated test script from `"node --test src/*.test.ts"` to `"node --test src/*.test.ts scripts/*.test.mjs"` so the new pure-core tests run on every `npm test`. No regressions — the 753 plugin tests still pass.

## §2 — Self-test results (§2.4 of prompt)

Ran `node scripts/check-bundled-vault-bump.mjs` against HEAD before committing:

```
✓ Bundled-vault bump check passed (no bundled-vault changes since v0.2.141)
```

Baseline resolves to `v0.2.141` in this worktree because tags `v0.2.142` and `v0.2.143` ended up on commits not in the current HEAD's ancestry — a known side-effect of the shared-remote multi-worktree pattern where release.sh's tag commit gets rebased after parallel pushes. This isn't a check bug; the check sees changes since whatever the reachable baseline is, and the absence of unaccounted-for vault changes since that point means the check passes correctly.

For this release itself: no bundled-vault content changes in any commit since v0.2.141. The preflight passed cleanly during release.sh's actual run for v0.2.144 — verified end-to-end.

## §3 — Tests + release

- **786 plugin tests passing** (773 baseline + 13 new pure-core).
- Build clean.
- Self-test passed.
- Tag `v0.2.144` + GH release with assets.
- INSTALL.md synced.
- release.sh ran the new preflight cleanly during this very release.

## §4 — Per-protocol HARD RULE compliance

- ✓ §78: traced existing release.sh preflights + analyzed the rule's semantic before coding.
- ✓ §57–74: 13 failing-first pure-core tests.
- ✓ §86–118: pure-core extracted (`check-bundled-vault-bump-core.mjs`); CLI wrapper is the only I/O.
- ✓ §76: driver-flagged via v0.2.141 root cause; concrete prior violation (v0.2.135 §C).
- ✓ §347: release.sh bumped 0.2.143 → 0.2.144.
- ✓ §321: feedback before move.
- ✓ v0.2.120 console.error: no new catches in this drain (CLI uses `console.error` + `process.exit(1)` for the violation output; not in the catch-block HARD RULE class).
- ✓ v0.2.124 pure-core dispatch HARD RULE: pure-core extraction.
- ✓ v0.2.132 runtime-evidence-beats-source-audit: this check IS the institutional encoding of that rule for bundled-vault drift.
- ✓ v0.2.134 §5 inlined-version preflight: runs alongside without conflict; both preflights now form the release-sanity gate.
- ✓ cc-prompt-queue.md:356 bundled-vault HARD RULE: THIS DRAIN IS the automated enforcement.

## §5 — User-side smoke (per prompt §5)

After ship, optional synthetic test:
1. Edit `assets/vaults/forge-tutorial/_meta/_chips.md` (add a comment line).
2. Commit WITHOUT bumping the forge.toml.
3. Run `bash scripts/release.sh` — should ABORT at the new preflight with `CONTENT_NO_TOML` for `forge-tutorial` + clear 3-step remediation.
4. Bump `assets/vaults/forge-tutorial/forge.toml` (e.g., 0.1.6 → 0.1.7).
5. Re-run release.sh — should pass the preflight.
6. Revert both synthetic commits.

Deferred to driver. The cohort-relevant verification — that the preflight catches real violations — is testable on demand via the synthetic test above.

## §6 — Open follow-ups (per prompt §6)

1. **Source-repo cross-check**: the preflight only checks the plugin repo's diff. Canonical source repos (`~/projects/forge-tutorial/`, etc.) need bumps too; the remediation message reminds the human. Could be future-automated via a config field pointing at known source repo paths + a `git -C {path}` cross-check, but cross-repo invocation is fragile across machines. Defer.
2. **Prompt template update** (v0.2.141 §5.2): bundled-vault-content prompts should default-include the forge.toml bump step. Could be codified as a prompt template snippet; not in scope.
3. **Sibling rule enforcement**: the same preflight pattern can enforce other "X must accompany Y" rules. The v0.2.131 inlined-version preflight is already an instance; future preflights (e.g., engine-bundle drift detection) can layer on the same pattern.

## §7 — Architectural framing

V1 institutional enforcement. The combined preflights now catch:
- **Plugin-version drift**: v0.2.131 stale-install on user side + v0.2.134 inlined-version on release side.
- **Bundled-vault drift**: this drain.

Future preflights compose on the same shell-block pattern in release.sh without disrupting existing ones. The pure-core convention keeps the check logic testable; the CLI wrappers handle git invocation.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §8 — Hand-off

v0.2.144 shipped. Queue empty after this drain.
