---
timestamp: 2026-06-25T20:00:00Z
session_id: drain-2026-06-25-2000
status: pending
priority: HIGH — cohort regression; existing HARD RULE violation
---

# v0.2.137 (renumber to current) — forge-tutorial forge.toml bump to propagate v0.2.135 Section C chips fix

## §0 — Bug report

Driver smoke 2026-06-25 detailed v0.2.135 verification:
- Step 4.1: `grep -c 'schema_version' ~/forge-vaults/bluh/forge-tutorial/_meta/_chips.md` → **1** (expected 2)
- Step 4.2: the only match is at line 5 (frontmatter); body still lacks `schema_version: 3`
- Step 4.5: console: `Forge chips: forge-tutorial/_meta/_chips.md v1 parse error: chips body must be a list or { chips: [...] }, got object — falling through to auto-discovery`
- Step 4.5: NONE of the 6 expected synthetic chips visible (`print`, `Set`, `Give back`, `If`, `Otherwise`, `For each`)

Diagnosis:
- Bundled vault at `forge-client-obsidian/assets/vaults/forge-tutorial/_meta/_chips.md` HAS the v0.2.135 fix (`schema_version: 3` in body at line 18). Confirmed via terminal inspection.
- Bundled `forge-client-obsidian/assets/vaults/forge-tutorial/forge.toml` version: **0.1.5** (UNCHANGED since pre-v0.2.135).
- Canonical `~/projects/forge-tutorial/forge.toml` version: **0.1.5** (also unchanged).
- Driver's extracted `~/forge-vaults/bluh/forge-tutorial/_meta/_chips.md` has the OLD content (no body schema_version).

The plugin's v0.2.38+ re-extract mechanism gates on `forge.toml` version drift between bundled and extracted. Same version → no re-extract → driver's stale `_chips.md` stays. Every cohort user (Tamar) will hit the same bug.

This is a direct violation of the existing HARD RULE at `cc-prompt-queue.md:356`:
> **Bundled-vault content changes MUST bump the vault's `forge.toml` version (HARD RULE).** Any prompt that modifies files under a bundled vault path ... must ALSO bump the bundled vault's own `forge.toml` `version` field.

v0.2.135 Section C shipped `_meta/_chips.md` content change to BOTH source repo AND bundled vault, but did NOT bump `forge.toml` in either. The plugin manifest bumped (0.2.134 → 0.2.135) but that's insufficient — manifest.json is for the plugin, forge.toml is for the vault.

## §1 — Goal

Bump `forge-tutorial/forge.toml` version 0.1.5 → 0.1.6 in BOTH source repo (`~/projects/forge-tutorial/`) AND bundled vault (`~/projects/forge-client-obsidian/assets/vaults/forge-tutorial/`). Re-release plugin so cohort users' next BRAT update triggers re-extract.

Net effect: existing cohort users see the v0.2.135 Section C chips fix on their next plugin update without manual intervention. Tamar's first install hits the post-bump bundle correctly.

## §2 — Investigation phase (per §78)

### §2.1 — Confirm the bump points

```bash
grep -n 'version' /Users/odedfuhrmann/projects/forge-tutorial/forge.toml
grep -n 'version' /Users/odedfuhrmann/projects/forge-client-obsidian/assets/vaults/forge-tutorial/forge.toml
```

Both should currently say `version = "0.1.5"`. Confirm before bumping.

### §2.2 — Confirm `_chips.md` is in sync

```bash
diff /Users/odedfuhrmann/projects/forge-tutorial/_meta/_chips.md \
     /Users/odedfuhrmann/projects/forge-client-obsidian/assets/vaults/forge-tutorial/_meta/_chips.md
```

Should be identical (v0.2.135 Section C synced both). If not, sync first via `npm run sync-bundled-vault.mjs forge-tutorial`.

### §2.3 — Check for any other forge-tutorial drift

```bash
diff -rq /Users/odedfuhrmann/projects/forge-tutorial \
         /Users/odedfuhrmann/projects/forge-client-obsidian/assets/vaults/forge-tutorial \
   2>/dev/null | grep -v '^Only in'
```

Any "differ" lines indicate drift that would need syncing. Likely zero given v0.2.135's sync was clean.

## §3 — Implementation

### §3.1 — Bump forge.toml version (BOTH locations)

In `~/projects/forge-tutorial/forge.toml`:
```toml
version = "0.1.6"
```

In `~/projects/forge-client-obsidian/assets/vaults/forge-tutorial/forge.toml`:
```toml
version = "0.1.6"
```

Both files. Same value.

### §3.2 — Commit forge-tutorial repo

```bash
cd ~/projects/forge-tutorial
git add forge.toml
git commit -m "Bump version 0.1.5 → 0.1.6 to propagate v0.2.135 chips fix to cohort"
git push
```

### §3.3 — Verify the bundle preflight catches this if anything else is off

`release.sh` has a bundled-vault drift preflight (the same one that fired on percussion_lab drift during v0.2.134's release). Run it now (or wait for release.sh to run it):

```bash
node scripts/check-bundled-vault-drift.mjs forge-tutorial
```

(Or whatever the exact script name is; check `scripts/` directory.) Should pass clean.

### §3.4 — Release plugin

Standard release flow. v0.2.137 (or whatever the next available is).

Plugin manifest bumps. release.sh's v0.2.131 inlined-version preflight + v0.2.134 bundled-vault drift preflight should both pass.

## §4 — Tests required

- No new tests in this drain; the fix is data (forge.toml version bump) not code.
- Existing test suite stays at 710 passing (or wherever it is post-v0.2.136).

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): confirmed bug via driver smoke + bundled vault inspection.
- ✓ §76 (don't ship speculative fix): driver-reported, root-cause confirmed.
- ✓ §347 (version-bump sanity check): bumps both plugin manifest AND vault forge.toml.
- ✓ §321 (feedback before move): standard.
- ✓ v0.2.91 bundled-vault HARD RULE (cc-prompt-queue.md:356): THIS DRAIN restores compliance after v0.2.135 §C violation.
- ✓ v0.2.132 runtime-evidence-beats-source-audit HARD RULE: driver smoke caught the gap; this drain closes it.

## §6 — User-side smoke

After ship:

```bash
# 1. BRAT update.
# 2. Verify new plugin version:
grep -o '"version":"[^"]*"' ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/manifest.json
# Expected: 0.2.137 (or higher)

# 3. Verify forge-tutorial bundled forge.toml version bumped:
grep version ~/forge-vaults/bluh/.obsidian/plugins/forge-client-obsidian/assets/vaults/forge-tutorial/forge.toml
# Expected: version = "0.1.6"

# 4. Open Obsidian. Wait 2-3 seconds. The plugin should detect version drift
#    between bundled (0.1.6) and extracted (0.1.5) forge-tutorial and re-extract.

# 5. Verify extracted forge-tutorial now has the fix:
grep -c 'schema_version' ~/forge-vaults/bluh/forge-tutorial/_meta/_chips.md
# Expected: 2 (frontmatter + body)

grep version ~/forge-vaults/bluh/forge-tutorial/forge.toml
# Expected: version = "0.1.6"

# 6. Open forge-tutorial snippet, open chip palette.
# Expected: 6 synthetic chips visible (print, Set, Give back, If, Otherwise, For each).

# 7. Console: NO red error about _meta/_chips.md parse.
```

## §7 — Open follow-ups

1. **Audit cc-prompt-queue.md HARD RULE enforcement** — the v0.2.135 §C drain violated an existing HARD RULE. CC's drain-time checks didn't catch it. Worth a meta-prompt to add an automated check: any prompt touching `assets/vaults/*/` must include a `forge.toml` version bump in its diff, OR explain why not.

2. **Retrospective on v0.2.135 §C** — the original prompt's §3.2 said "If A [fix the chips file content]" but didn't mention the forge.toml bump dependency. The prompt template for bundled-vault content fixes should default-include the forge.toml bump step.

3. **Existing cohort users** — anyone on v0.2.135 who hit this same bug needs to either:
   - Manually copy `assets/vaults/forge-tutorial/_meta/_chips.md` to `forge-tutorial/_meta/_chips.md` (driver's workaround)
   - Wait for v0.2.137 BRAT update (this fix)
   - `rm -rf ~/forge-vaults/<vault>/forge-tutorial` + restart Obsidian (forces re-extract from bundle)

4. **Audit other bundled vaults for hidden drift** — forge-moda, forge-music: have any content changes shipped since their last forge.toml bump? If yes, same fix pattern applies. CC investigation step in §2.3 catches forge-tutorial; same check should run for siblings.

## §8 — Architectural framing

V1 cohort install-path defense. Closes a real cohort-onboarding gap surfaced by driver smoke. Restores HARD RULE compliance.

No V2 commitments.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §9 — Hand-off

Single small drain. Pure data change (two forge.toml version bumps + commits) plus release. Estimated CC time: 15-20 minutes including release pipeline.

If §7.4 audit surfaces additional bundled-vault drift in forge-moda or forge-music, surface and split — those would be separate drains since each has its own version-bump + release impact.
