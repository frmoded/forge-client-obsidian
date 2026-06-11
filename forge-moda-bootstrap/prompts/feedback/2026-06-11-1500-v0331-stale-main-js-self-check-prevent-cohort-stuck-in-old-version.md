---
prompt: 2026-06-11-1500-v0331-stale-main-js-self-check-prevent-cohort-stuck-in-old-version.md
shipped_version: v0.2.131
session: drain-2026-06-11-1500
date: 2026-06-11
status: shipped — awaiting cohort smoke
---

# v0331 feedback — stale-main.js detection on onload

## §1 — What shipped (v0.2.131)

### §1.1 — Build-time version inlining (`scripts/inline-plugin-version.mjs`)

Reads `manifest.json`, writes `src/version-constant.generated.ts` exporting `PLUGIN_VERSION_AT_BUILD`. Runs in the `npm run build` chain BEFORE esbuild so the constant is part of compiled main.js. Mirrors v0.2.98 inlined-asset version stamping (constitution B10) — every release's main.js carries its own self-claimed version.

### §1.2 — Pure-core `src/stale-main-js-check-core.ts`

`decideStaleMainJsCheck(manifestVersion, buildVersion) → { stale: false } | { stale: true, manifestVersion, buildVersion, noticeMessage }`. Defensive against null/undefined/whitespace inputs (treated as mismatches). Notice text includes both versions + specific reinstall steps ("Settings → BRAT → Re-install" OR "toggle the plugin off + on").

### §1.3 — 10 failing-first pure-core tests

Truth table:
1. Matching versions → stale:false
2. Cohort regression reproducer (manifest 0.2.127, build 0.2.107) → stale:true with both versions in notice
3. Build ahead of manifest (dev state) → stale:true
4. Null manifest → stale:true with `<missing>`
5. Undefined build → stale:true with `<missing>`
6. Both null → stale:true
7. Empty strings → stale:true
8. Whitespace-only manifest → stale:true
9. Whitespace-tolerant match → stale:false
10. Notice text mentions specific reinstall steps

### §1.4 — `main.ts:onload` glue

Early in onload (right after `loadSettings`):
- `app.vault.adapter.read(${this.manifest.dir}/manifest.json)` → JSON.parse
- `decideStaleMainJsCheck(manifestJson.version, PLUGIN_VERSION_AT_BUILD)`
- On stale: `new Notice(check.noticeMessage, 30000)` (30 seconds for readability) + `console.error('Forge onload: stale main.js. ...')`
- Wrapped in try/catch with `console.error('onload: stale-main-js self-check failed', e)` per v0.2.120 HARD RULE #1
- **Plugin still loads** — partial functionality > nothing per v0331 §2.2

### §1.5 — Build verification

Confirmed:
- `npm run build` → version-constant.generated.ts updated to manifest's value
- `grep -c "PLUGIN_VERSION_AT_BUILD" main.js` → 2 occurrences (definition + check)
- `grep -o "0\.2\.131" main.js` → version string present in compiled output

### §1.6 — Integration test deferred per established pattern

Prompt §3.3 asked for integration tests via `createIntegrationHarness()`. The harness still has no `app.vault.adapter` shimming (the harness Obsidian-shim build remains indefinitely deferred). Per the v0.2.125 + v0.2.126 + v0.2.128 precedent, landed the structural decision at the pure-core boundary instead. Notice firing + the I/O glue rely on cohort smoke.

## §2 — Tests + release

- 697 unit tests passing (687 baseline + 10 new).
- Build clean.
- Tag `v0.2.131` + GH release with `dist/forge-client-obsidian-v0.2.131.zip` + main.js + manifest.json + styles.css.
- INSTALL.md synced.

## §3 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): build pipeline + onload init order verified before code.
- ✓ §57–74 (TDD): 10 failing-first pure-core tests.
- ✓ §86–118 (pure-core convention): structural decision extracted; I/O is the only un-pure-core piece.
- ✓ §76 (don't ship speculative fix): driver-confirmed cohort regression.
- ✓ §347 (version-bump sanity check): release.sh bumped 0.2.130 → 0.2.131.
- ✓ §321 (feedback before move): this file written before the prompt move.
- ✓ v0.2.120 console.error HARD RULE: applied (onload mismatch log + catch block both use console.error with method name prefix).
- ✓ NEW v0.2.124 pure-core dispatch extraction: applied — new `decideStaleMainJsCheck` joins the established discipline.

## §4 — Open follow-ups (per prompt §6 + observed)

1. **Release.sh preflight check** for inlined-version sync (§6 #1 of prompt) — release.sh should `grep -c "PLUGIN_VERSION_AT_BUILD.*${NEW_VERSION}" main.js` and fail if the build version doesn't match the manifest. Belt-and-suspenders against a future build script drift.
2. **Status-bar persistent indicator** (§6 #2) — defer until cohort feedback shows the 30s Notice is missed.
3. **BRAT upstream report** (§6 #3) — flag for future advocacy.
4. **Method-name prefix work** (originally queued as v0.2.131 per v0.2.130 §6 #1) — moves to v0.2.132 per prompt §9 NOTE.
5. **Carry-forward** (unchanged):
   - v0.2.99 follow-up #14 (migrate inert facet_form fields)
   - Plugin-side path-lookup audit (v0.2.104)
   - moda bridge pytest (v0.2.95)
   - `facet-form-core.ts` deletion (v0.2.121 §8 #3)
   - Granular toggle commands (v0.2.122 §6 #4)
   - Harness Obsidian-shim build (deferred indefinitely)
   - forge-tutorial `_meta/_chips.md` v3 parse error
   - English-mode `console.warn` at writeCanonicalPythonBack catch (v0.2.126 follow-up — was bundled into v0.2.130's Bundle B sweep per parallel agent's work; verify status)

## §5 — User-side smoke (deferred to driver)

Per §5 of prompt:
1. Install v0.2.131 normally via BRAT.
2. Verify clean install: open Obsidian → NO Notice (versions match).
3. Simulate stale install: `sed -i.bak 's/"version": "0.2.131"/"version": "0.2.999"/' .../manifest.json` → reload Obsidian → Notice fires with both versions visible.
4. Restore + reload: Notice no longer fires.
5. If you have a vault with a pre-v0.2.131 stale install, opening it should fire the Notice automatically.

Also Tamar's vault: after she upgrades to v0.2.131, any future BRAT-mismatch hits the Notice instead of silent regression.

## §6 — Architectural framing

V1 cohort install-path defense. Layers on top of v0.2.98's inlined-asset version stamping (B10):
- v0.2.98: assets/ directory carries its claimed version → catch asset/main-js drift.
- v0.2.131: main.js carries its claimed version → catch BRAT update-without-main.js failure.

Combined: cohort users always see correct UI behavior OR a clear, actionable Notice. No silent regressions like the driver hit on v0.2.127.

The mechanism doesn't fix BRAT itself; it makes the BRAT bug visible + actionable. Future: a "Forge: Verify install" command-palette entry could trigger the same check on demand.

Per cc-prompt-queue.md §43, the feedback file IS the chat summary.

## §7 — Session protocol notes (NEW)

This drain corrected a "drain prompts" protocol bug discovered earlier this session:

**Old (buggy) sequence**:
```bash
git stash push -u -m "drain-pull"  # ← -u swept up UNTRACKED prompt files
git pull --rebase origin main
ls -la prompts/                     # ← saw empty when prompts were stashed away
git stash pop
```

**New (correct) sequence**:
```bash
ls prompts/*.md 2>/dev/null         # ← direct local-FS read; authoritative
# only pull/rebase when committing, not when checking the queue
```

Also applied during this drain's release.sh push-rejection recovery (used `git stash push` without `-u`, scoping to tracked-only changes).

## §8 — Hand-off

v0.2.131 ships the cohort-install-path defense. Driver smoke per §5 + Tamar's next upgrade will validate. v0.2.132 picks up the method-name-prefix work originally queued at this slot. Queue otherwise empty after this drain.
