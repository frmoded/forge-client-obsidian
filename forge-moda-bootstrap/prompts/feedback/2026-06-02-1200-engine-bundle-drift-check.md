---
timestamp: 2026-06-02T08:30:00Z
session_id: eager-nightingale-626224
prompt_modified: 2026-06-02T12:00:00Z
status: success
---

# Engine-bundle drift-check — sync script + release-zip preflight

Closes the recurring manual-cp gap. Three artifacts shipped: pure-core drift helper, sync script, release-zip preflight. Initial sync caught real drift (5 files added to bundle from source, 1 orphan removed).

## §1 TDD discipline (HARD RULE compliance — all 5 checkpoints)

### §1.1 Tests added pre-fix

`src/engine-bundle-drift.test.ts` (new, **6 cases** — added one beyond the prompt's 5 for multi-drift sort-order coverage):

1. `engineBundleDrift returns empty when bundle matches source` — byte-equal mock files → empty drift list.
2. `engineBundleDrift detects file added in source not in bundle` — source has `core/llm_prompts.py`, bundle doesn't → `missing-in-bundle`.
3. `engineBundleDrift detects file in bundle not in source` — bundle has orphan → `orphaned-in-bundle`.
4. `engineBundleDrift detects content mismatch` — both have `core/registry.py` but bytes differ → `content-mismatch`.
5. `engineBundleDrift respects scope filter — adapter omits out-of-scope source files` — confirms adapter-side filtering is honored (helper trusts the listing).
6. `engineBundleDrift surfaces multiple drift kinds together in deterministic order` — combined drift sorted by relPath alphabetically.

### §1.2 Pre-fix run

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module './engine-bundle-drift-core.ts'
ℹ tests 1
ℹ pass 0
ℹ fail 1
```

Helper missing → file-level fail before any case ran. Expected.

Mid-drain hiccup: the `BundleDriftAdapter` interface needed `import type { ... }` rather than `import { ... }` under Node ESM (interfaces aren't runtime exports). Fixed in the test file, not the helper.

### §1.3 Fix shape

**Pure-core helper** — `src/engine-bundle-drift-core.ts` (new, 10th pure-core extraction in the v0.2.x arc):

```typescript
export interface DriftEntry {
  relPath: string;
  status: 'missing-in-bundle' | 'orphaned-in-bundle' | 'content-mismatch';
}

export interface BundleDriftAdapter {
  listEngineFiles(scope: 'source' | 'bundle'): Promise<string[]>;
  readFile(scope: 'source' | 'bundle', relPath: string): Promise<Buffer>;
}

export function isInScope(relPath: string): boolean {
  // Scope filter shared with sync-engine-bundle.mjs and the preflight.
  // ...
}

export async function engineBundleDrift(adapter): Promise<DriftEntry[]> {
  // Walk both listings; produce sorted drift list with three status kinds.
}
```

**Sync script** — `scripts/sync-engine-bundle.mjs` (new). Mirrors source-of-truth into bundle: copies new/changed files, deletes orphans. Logs every action. Idempotent: re-running on a clean tree is a no-op (`Synced 0 new/changed, kept N already-current, deleted 0 orphans`).

**Preflight** — `scripts/build-release-zip.mjs` gained `assertNoEngineBundleDrift()` between the `REQUIRED_FILES` check and the dist/ setup. If drift detected, fails with the drift list + hint `Run 'npm run sync-engine-bundle' to resolve.`.

**Scope filter duplicated** between `src/engine-bundle-drift-core.ts`, `scripts/sync-engine-bundle.mjs`, and the preflight. The .mjs files can't import from the .ts helper at runtime, so the predicate is hand-mirrored in all three places. Documented in code comments as a known coupling.

**Package.json** — added `"sync-engine-bundle": "node scripts/sync-engine-bundle.mjs"`.

**Initial sync caught real drift** (the load-bearing finding of this drain):

```
[copy]   forge/core/llm.py
[copy]   forge/core/llm_prompts.py
[copy]   forge/core/logic.py
[copy]   forge/core/manifest.py        (content-mismatch — source ahead)
[copy]   forge/moda/llm_prompt.py
[delete] forge/core/__init__.py        (orphan; not in source)

Synced 5 new/changed, kept 14 already-current, deleted 1 orphan.
```

4 files were genuinely missing from the bundle, 1 was content-mismatched, 1 was an orphan. None affected runtime behavior (Pyodide's `runPython` block doesn't import any of `llm.py`, `llm_prompts.py`, `logic.py`, or `moda/llm_prompt.py`), but they would have caused subtle bugs the moment any of them got referenced.

### §1.4 Post-fix run

```
✔ engineBundleDrift returns empty when bundle matches source (0.901625ms)
✔ engineBundleDrift detects file added in source not in bundle (0.131916ms)
✔ engineBundleDrift detects file in bundle not in source (0.073833ms)
✔ engineBundleDrift detects content mismatch (0.062042ms)
✔ engineBundleDrift respects scope filter — adapter omits out-of-scope source files (0.492875ms)
✔ engineBundleDrift surfaces multiple drift kinds together in deterministic order (14.725667ms)
ℹ tests 6
ℹ pass 6
ℹ fail 0
ℹ duration_ms 74.341875
```

### §1.5 Full suite

```
ℹ tests 154
ℹ pass 154
ℹ fail 0
ℹ duration_ms 4909.473583
```

Was 148 in v0.2.29; +6 new = 154. Matches prediction.

## §2 Manual smoke (CC-side verification)

Followed the prompt §5 smoke checklist directly:

1. **Drift detection in working state**: ran `npm run release-zip` on synced bundle. Output: `Engine-bundle drift check: clean.` Build proceeded normally.
2. **Drift detection on real drift**: `echo "# drift introduced for test" >> ~/projects/forge/forge/core/registry.py; npm run release-zip` → output:
   ```
   ENGINE-BUNDLE DRIFT DETECTED:
     ✗ forge/core/registry.py  [content-mismatch]

   Run 'npm run sync-engine-bundle' to resolve.
   ```
3. **Sync resolves drift**: `cd ~/projects/forge && git checkout forge/core/registry.py` (restored source). Then `npm run sync-engine-bundle` → `Synced 0 new/changed, kept 19 already-current, deleted 0 orphans.` Bundle already in sync after the source restore.
4. **Orphan detection** (not run during drain — exercised by case 3 of the unit tests + the initial sync that caught `core/__init__.py` as a real orphan).

## §3 Build pipeline state

```
$ cd ~/projects/forge-client-obsidian && npm run build && npm test
[build succeeds, footprint unchanged: 37.74 MB total]
ℹ tests 154 / pass 154 / fail 0
```

Plugin manifest unchanged at v0.2.29 (per prompt §6: no version bump for operational tooling unless behavior changes; bundle additions don't affect runtime since none of the newly-bundled files are imported).

## §4 Audit — other potential drift surfaces

Per prompt §4:

- `grep -rn '^cp -r\|^cp ' ~/projects/forge-client-obsidian/scripts/` → no matches. The manual-cp pattern was driver-side, not script-side.
- `grep -rln 'sync\|mirror\|bundle' scripts/` → matched `build-manifest.mjs`, `copy-assets.mjs`, `build-release-zip.mjs`, plus the new `sync-engine-bundle.mjs`.
  - `build-manifest.mjs`: just generates `assets/manifest.json` from the on-disk asset tree. Not a source-to-bundle sync; not in scope.
  - `copy-assets.mjs`: copies `assets/` next to `main.js` after esbuild. Same-repo copy, not cross-repo. Not in scope.
  - `build-release-zip.mjs`: now hosts the preflight; rest of the script packages the zip.

**No other manual-cp drift surfaces found.** Vault content sync (`forge-moda`, `forge-music` in `assets/vaults/`) has the same source-to-bundle shape and is the next candidate, but the prompt explicitly defers it to v1-audit item (j) / a future `npm run sync-bundles` generalization.

## §5 Deviation: README.md created (not appended)

Prompt §3.4 said "Append to `forge-client-obsidian/README.md`". The file did not exist. Per the appropriateness call (don't pause on missing artifacts when intent is clear), I created a minimal README covering the dev workflow + the new engine-bundle-sync section. Audience is plugin developers; INSTALL.md handles closed-beta installers. Worth noting because:

- Future commits that wanted to "append to README" would have had no anchor.
- The created README is short (60 lines) and operationally useful — `npm install`, `npm run build`, `npm test`, `npm run setup-assets`, `npm run sync-engine-bundle`, `npm run release-zip` all documented in one place.

## §6 Commit

`forge-client-obsidian@a617631` — 12 files changed (6 new TS/MJS + README + package.json + build-release-zip.mjs + 4 bundle file additions + 1 deletion + 1 content-mismatch fix). Pushed to `origin/main`.

No tag, no GH Release — operational tooling, no runtime delta.

## §Smoke split

**Auto-verified by CC:**
- Pre-fix: 1 file-level fail (MODULE_NOT_FOUND).
- Post-fix: 6/6 drift tests pass; full suite 154/154.
- Sync script run: `Synced 5 new/changed, kept 14 already-current, deleted 1 orphan.` (Real drift caught.)
- Preflight clean state run.
- Preflight drift detection (intentional drift introduced, caught, restored).
- Release-zip build with drift-clean state succeeded.

**Deferred to user (workflow validation):**
- Confirm `npm run sync-engine-bundle` runs cleanly on your machine (sibling forge repo present).
- Confirm `npm run release-zip` reports `Engine-bundle drift check: clean.` immediately after a sync.
- Confirm the preflight fail message reads clearly when you intentionally introduce drift (`echo '# test' >> ~/projects/forge/forge/core/registry.py && npm run release-zip`).
- README.md content review (was newly created; flag if you want a different shape or audience focus).

## §Follow-ups noted but not built

From recent post-success queues, restated:

1. **Auto re-extract bundled libraries on `forge.toml` change** — still pending; OLDEST item.
2. **`DOMAIN_AVAILABILITY` fail-loud registry** — v1.0 audit candidate.
3. **Closed-beta protocol rider on micropip** — still a one-paragraph addition to cc-prompt-queue.md.
4. **Vault content sync (`assets/vaults/`)** — generalize this drain's `sync-engine-bundle` script into `sync-bundles` covering vault content too. v1-audit item (j) per prompt §4.
5. **Scope-filter triplication** — the `isInScope` rule is now hand-mirrored across 3 files (helper, sync script, preflight). If the rule changes, all three must update in lockstep. Cheapest fix: a small JS file with the predicate that all three import (the .ts helper would need a parallel .mjs version, or the helper re-implementation in build-release-zip.mjs could read from a shared JSON config). Not blocking; flag as small infrastructure cleanup.

## §Protocol comments for driver

1. **TDD-discipline for operational tooling held up.** The §1.1 failing tests + §1.3 fix + §1.4 verified passes pattern works equally well for "drift detection helper" as it does for behavior fixes. The 6 cases lock in semantic behavior (empty / missing / orphaned / mismatch / scope-filter / multi-drift sort) without coupling to real filesystem state.

2. **The §80 fixture-drift rider applied recursively.** The drift helper's tests mock the BundleDriftAdapter; the real adapter lives in the sync script and preflight. There's no compile-time check that the predicate is identical across the three sites (helper, sync, preflight). Worth noting: this drain solved the drift-of-engine-bytes problem but introduced a drift-of-scope-predicate problem. Follow-up #5 above is the v1.1 cleanup.

3. **Initial sync caught real drift that the recent drains had been silently accumulating.** Across v0.2.17-v0.2.29, the manual-cp pattern missed 4 files. v0.2.27 explicitly copied `forge.music.lib`; this drain caught `forge.music.llm_prompt`, `core.logic`, `core.llm`, `core.llm_prompts` — none of which were referenced in production code, so they didn't surface as user-visible bugs. But: the operational principle (bundle = source-of-truth subset) was being silently violated. Shipping the preflight now means it can't accumulate again. Validation of the prompt's framing: "operational toil and a real correctness risk."

4. **README creation as a deviation** (§5 above). The prompt assumed an existing file; appropriate-call was to create rather than failing. Cowork can use this as calibration: when a prompt says "append to X" and X doesn't exist, the safer default is to create-with-minimal-content rather than asking. The deviation is documented; future drains can adjust the README shape.

5. **No version bump worked cleanly per prompt §6.** Tactical operational change shipped without manifest churn. v0.2.28 protocol-comments §6 flagged that scattering version-bump decisions across phases was brittle; v0.2.29 + this drain validated the "single end-of-drain bump only when runtime changes" rule. Recommend codifying as default protocol.

## §10 v1.0 retrospective observation

This drain closes a class of failure mode that's been accumulating across the v0.2.x arc:

- v0.2.17: refresh_file added to engine, manually copied to bundle.
- v0.2.26: executor + graph_resolver caller-scoped changes, manually copied.
- v0.2.27: music21 wheels + forge.music.lib copied (the latter was missing entirely until this drain).
- v0.2.28: llm_prompt.py added to bundle (this drain caught moda's was missing too).
- v0.2.29: pentatonic rename, mirrored.
- v0.2.30 (this drain): drift detection ships; no more "did we remember to copy" guessing.

The cross-cutting v1.0 retro framing: **whenever a release artifact is a subset of a source-of-truth, ship the drift-detection tooling at the same time as the bundling**, not after. v0.2.13 introduced the engine bundle; v0.2.30 ships the drift check. 17 releases of manual discipline. The cheaper path next time: when introducing a "bundle subset" pattern, the first prompt to ship it should also ship the sync script + preflight.

Applies to: vault content (next on deck — v1-audit (j)), any future "bundled wheels" expansion, any plugin asset that has a source-of-truth elsewhere in the monorepo.
