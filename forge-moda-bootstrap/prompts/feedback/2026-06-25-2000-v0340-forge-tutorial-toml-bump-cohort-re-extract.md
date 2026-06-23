---
prompt: 2026-06-25-2000-v0340-forge-tutorial-toml-bump-cohort-re-extract.md
shipped_version: v0.2.141
session: drain-2026-06-25-2000
date: 2026-06-25
status: shipped
---

# v0340 feedback — forge-tutorial forge.toml bump to propagate v0.2.135 chips fix

## §1 — Pre-bump confirmation (§2 of prompt)

```
~/projects/forge-tutorial/forge.toml: version = "0.1.5"
~/projects/forge-client-obsidian/assets/vaults/forge-tutorial/forge.toml: version = "0.1.5"
```

Both confirmed at 0.1.5 before bump.

Drift check `diff -rq` on forge-tutorial source vs bundle: clean (no content drift).

Sibling vault drift check (per §7 #4 of prompt):
- forge-moda source vs bundle: clean
- forge-music source vs bundle: clean

No additional drains needed for sibling vaults.

## §2 — What shipped (v0.2.141)

### §2.1 — Version bumps

Both forge-tutorial/forge.toml files bumped 0.1.5 → 0.1.6:
- `~/projects/forge-tutorial/forge.toml` (source repo)
- `~/projects/forge-client-obsidian/assets/vaults/forge-tutorial/forge.toml` (bundled vault)

Two separate commits — one per repo. Both pushed.

### §2.2 — Plugin release

release.sh bumped manifest 0.2.140 → 0.2.141 cleanly. Inlined-version preflight (v0.2.134 §5) passed: `0.2.141` baked into main.js matches manifest. Tag + GH release + INSTALL.md synced.

### §2.3 — Net effect

The plugin's v0.2.38+ re-extract mechanism gates on forge.toml version drift between bundled and extracted. With bundled bumped 0.1.5 → 0.1.6, every cohort user's next BRAT update will trigger forge-tutorial re-extract, replacing their stale `_meta/_chips.md` with the v0.2.135 fix. No manual intervention required.

## §3 — Per-protocol HARD RULE compliance

- ✓ §78: confirmed both bump points via grep before edit.
- ✓ §76: driver-reported, root-cause confirmed via bundled-vault inspection.
- ✓ §347: plugin manifest bumped via release.sh.
- ✓ §321: feedback before move.
- ✓ **cc-prompt-queue.md HARD RULE (line 356) bundled-vault content + forge.toml bump**: THIS DRAIN restores compliance. v0.2.135 §C had violated this rule; v0.2.141 closes the gap.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: driver smoke caught the gap (the v0.2.135 source-level audit reported `_chips.md` as fixed; runtime smoke proved it wasn't reaching cohort users).
- ✓ v0.2.134 §5 inlined-version preflight: passed for v0.2.141.

## §4 — User-side smoke (deferred to driver)

Per §6 of prompt:
1. BRAT update to v0.2.141.
2. `grep version .../assets/vaults/forge-tutorial/forge.toml` → expect `version = "0.1.6"`.
3. Open Obsidian; wait 2-3 seconds. Plugin detects bundled (0.1.6) vs extracted (0.1.5) drift, re-extracts.
4. `grep -c 'schema_version' .../forge-tutorial/_meta/_chips.md` → expect 2 (frontmatter + body).
5. `grep version .../forge-tutorial/forge.toml` → expect `version = "0.1.6"`.
6. Open forge-tutorial snippet → chip palette → expect 6 synthetic chips (`print`, `Set`, `Give back`, `If`, `Otherwise`, `For each`).
7. Console: NO red error about `_meta/_chips.md` parse.

## §5 — Process notes for §7 of prompt

### §5.1 — HARD RULE enforcement gap

v0.2.135 §C violated the cc-prompt-queue.md line 356 HARD RULE on bundled-vault content + forge.toml bump. CC's drain-time checks didn't catch it. **Worth a meta-prompt** to add an automated drain-time check: any commit touching `assets/vaults/*/` paths must include a `forge.toml` version bump in the same diff, OR a comment in the commit message explaining why not.

Concretely: a `scripts/check-bundled-vault-bump.mjs` that:
- Walks `git diff HEAD~..HEAD` looking at `assets/vaults/{name}/` paths
- For each affected `{name}`, asserts that `assets/vaults/{name}/forge.toml` is in the diff with a version line change.
- Run as a release.sh preflight.

Not in scope here; flagged as carry-forward.

### §5.2 — Retrospective on v0.2.135 §C prompt template

The original v0.2.135 §3.2 said "If A: fix the chips file content" but didn't surface the forge.toml dependency. Future bundled-vault-content prompts should default-include the forge.toml bump step in the template.

### §5.3 — Existing cohort user workaround paths

For anyone on v0.2.135 BEFORE installing v0.2.141:
- Manual workaround: copy `assets/vaults/forge-tutorial/_meta/_chips.md` (the bundled fix) over `~/forge-vaults/<vault>/forge-tutorial/_meta/_chips.md`.
- Force re-extract: `rm -rf ~/forge-vaults/<vault>/forge-tutorial` then restart Obsidian.
- Wait for v0.2.141 BRAT update — preferred path.

## §6 — Architectural framing

V1 cohort install-path defense. Closes a real onboarding gap. Restores HARD RULE compliance. Same shape as the v0.2.131 stale-main.js detection: the plugin's invariants (re-extract on toml drift) work correctly when feeding the right inputs; this drain repairs the input flow.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Hand-off

v0.2.141 shipped. Two-commit forge-tutorial source bump + bundled vault bump + plugin release. Queue still has v0341 (chip insertion ignores cursor position) — next.
