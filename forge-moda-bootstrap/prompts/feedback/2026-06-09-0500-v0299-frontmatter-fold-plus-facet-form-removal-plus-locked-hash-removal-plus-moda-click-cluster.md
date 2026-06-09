---
timestamp: 2026-06-09T05:00:00Z
session_id: drain-2026-06-09-0500
status: COMPLETED-PARTIAL
shipped_version: 0.2.102
prompt_target_version: 0.2.99
---

# Feedback — v0.2.102 (prompt-target v0.2.99) — frontmatter fold + locked_english_hash removal + moda click cluster

## §0 — Version drift note

Prompt assumed plugin was at v0.2.98. By the time this drain started, the session had already shipped through v0.2.101 (canonical write-back chain triggered by Tamar smoke during the prior prompt's feedback arc). Items in this prompt landed in v0.2.102 alongside a Tamar-smoke race fix.

The prompt's v0.2.99 version slot is occupied by an earlier intermediate release (v0.2.99 was the writeGeneratedCode → replaceOrInsertPythonHeading swap that misdiagnosed the canonical bug). The version names are wrong but the work targets are correct. Suggest renaming this prompt's title in any forge-core tracking.

## §1 — What shipped (v0.2.102)

### §1.1 Race fix (NEW, not in prompt — Tamar smoke v0.2.101)

Tamar reported: "works, but only if I wait 0.5-2 seconds before clicking Forge, otherwise need to Forge twice." Same vault.on('modify') vs Forge-click race the v0.2.19 pre-flight sync was designed to close — but v0.2.19 wrapped that sync inside generate(), so the v0.2.55 canonical branch and v0.2.92 moda branch both bypassed it.

Fix: pulled the disk→MEMFS sync to the TOP of forgeSnippet, before branch dispatch. Every branch (moda, python, canonical, /generate) now sees fresh disk content in MEMFS without each one having to remember.

Pre-flight sync now applies regardless of branch:
```ts
private async forgeSnippet() {
  const view = this.app.workspace.getActiveViewOfType(MarkdownView);
  if (!view?.file) return;
  // v0.2.102 — pre-flight disk→MEMFS sync, BEFORE branch dispatch.
  try {
    const host = await getPyodideHost()?.getInstance();
    if (host) {
      const fresh = await this.app.vault.read(view.file);
      await host.syncUserVaultFile(view.file.path, fresh);
    }
  } catch (e) { console.warn('Forge: pre-flight sync failed', e); }
  // ... branch dispatch ...
}
```

The redundant per-branch sync inside `generate()` is now dead code but harmless (best-effort, idempotent); leaving for one cycle for backwards-stability.

### §1.2 Item A — frontmatter fold ViewPlugin

New module: `src/frontmatter-fold-view-plugin.ts`. ViewPlugin that on every file-open computes the YAML frontmatter range and dispatches `foldEffect` to collapse the block.

Implementation specifics:
- Pure-core `computeFrontmatterFoldRange(doc)` returns `{from, to}` for the `---`-delimited region (or null for malformed / missing).
- ViewPlugin: tracks `foldedForFilePath` so it only folds once per file-open. Uses `queueMicrotask` for initial mount, `setTimeout(0)` for file-change dispatches — applies v0.2.85-89 deferred-dispatch lesson.
- Gated on `type: action | data` frontmatter so plain notes aren't touched.

The mutex semantics in `decideOnFoldChange` are gated on `# English` / `# Python` headings specifically (per `facet-mutex-core`), so the frontmatter fold doesn't trigger a spurious edit_mode flip. Verified by code reading; no test added (mutex tests already cover the "no heading line" case).

6 new tests in `frontmatter-fold-view-plugin.test.ts` covering well-formed / no-opening / no-closing / empty doc / empty frontmatter / range-content boundaries.

### §1.3 Item C — locked_english_hash retired

Field removed end-to-end on the plugin side:
- `setEditModeForFile` python-transition no longer writes the hash.
- `syncEnglishFromPython` no longer re-snapshots the hash.
- `sha256Hex` helper deleted (last consumer was the markDrift helper).
- `markDriftAsync` body emptied (was already dead code — no callers since v0.2.79 ribbon button removal).
- DELETE of the field remains in english-transition + python-mode entry to clean up old vaults.

v0.2.90's `delete fm.english_hash` on transition to english covers the drift use case structurally — next Forge re-transpiles/regenerates and overwrites Python. The explicit `locked_english_hash` snapshot field was dead weight.

Engine side: audited `forge/forge/`. No reads of `locked_english_hash` found (drift detection was always plugin-side, as expected). No engine changes required.

### §1.4 Item D — moda click cluster (forge-moda v0.4.20)

`create_ink_particles.md` rewritten:
- Position: uniform-in-disk (`r = sqrt(uniform(0,1)) * 5`, `theta = uniform(0, 2π)`) — gives uniform area density within a 5-unit radius.
- Initial speed: 0 (was: `uniform(0, 10)` → the "explosion").
- Heading: still random (cosmetic — only matters when physics moves the particle).

Source repo (`/Users/odedfuhrmann/projects/forge-moda/`) + bundled assets mirror both updated. forge-moda version bumped 0.4.19 → 0.4.20 so welcome.ts re-extracts on user vaults.

Re-bundle iframe NOT required for this change (particle creation is Python-side in the engine, not iframe-side React).

## §2 — What did NOT ship: Item B (facet_form removal)

**Deferred.** Prompt scoped: "Stop reading facet_form in cache-validity logic. Cache valid iff english_hash matches." But the engine's `resolve_action_code` uses `facet_form` for TWO things, not just one:

1. **Cache validity** — was: if `facet_form: canonical`, always re-transpile (cache always invalid).
2. **Transpile trigger** — was: if `facet_form: canonical`, use E--; else use cached Python (or fall through to /generate via LLM if cache absent and not a slot snippet).

Removing facet_form changes #2's semantics. Specifically: a snippet with no `facet_form` is currently routed through `/generate` (LLM, requires token) on cache-miss. After removing facet_form, every snippet would default to /generate — but `hello_world.md` ships with `facet_form: canonical` precisely so it works WITHOUT a token (per INSTALL.md: "the moda simulator works without one — only English → Python authoring needs the token"). Removing facet_form breaks the no-token cohort onboarding path.

**Possible designs (not chosen — surfaces for forge-core call):**

- **A. Always-transpile fallback.** When cache is invalid, transpile via E-- (no LLM). If E-- can't compile (free-text English), surface error. Cohort impact: forces all snippets to be E-- compatible.
- **B. edit_mode-gated routing.** New convention: `edit_mode: english` → /generate; `edit_mode: canonical` → E-- transpile. Requires students to flip the field explicitly. Cohort impact: more visible toggle but more friction.
- **C. Plugin-side routing.** Plugin uses the post-v0.2.101 `resolveActionCode` (E-- transpile without exec) for English→Python regen, fallback to /generate when E-- fails. Cohort impact: invisible to the user but couples plugin to E-- compile semantics.

Recommend option C — it preserves the no-token path without exposing a new field, and the plugin already has the wiring via `writeCanonicalPythonBack`. Needs a focused drain to implement.

In the meantime, the v0.2.81 `detect_facet_form_strip_trap` warning continues to fire on existing canonical snippets that lost the field — same noise as before.

## §3 — Cross-cutting verification

- Build clean: `npm run build` exit 0.
- Tests: 599 passing (was 593 at v0.2.101, +6 from frontmatter-fold pure-core suite).
- Asset version stamping (v0.2.98) auto-handles iframe re-bundle / inlined-asset refresh — the `.bundle-version` sentinel mismatch triggers force-overwrite on next user install. Verified Tamar smoke on v0.2.98→v0.2.99→v0.2.101 transitions.

## §4 — User-side smoke checklist

(For Tamar's next smoke run.)

```
# Step 1 — BRAT update to v0.2.102, Cmd-R reload.
# Step 2 — Open hello_world.md. Frontmatter should be auto-folded;
#          # English content visible immediately.
# Step 3 — Edit English IMMEDIATELY + click Forge (no wait). Should
#          print the new text on first click + Python facet updates.
# Step 4 — Switch to Python mode via Cmd-P → "Forge: Toggle Python/
#          English editing mode". Expand frontmatter. Should have
#          edit_mode: python but NO locked_english_hash.
# Step 5 — Open moda simulation. Click in the canvas. Should see a
#          tight cluster of ~50 ink particles at the click point,
#          then physics takes over.
```

## §5 — Per-protocol HARD RULE compliance

- ✓ §78 (investigation-before-design): §2.1-§2.7 audits discharged; Item B's investigation surfaced the cache-validity-vs-transpile-trigger gap and is documented for forge-core decision.
- ✓ §57–74 (TDD): 6 new tests for frontmatter-fold. Item C deletes only dead-code helpers (markDriftAsync + sha256Hex); no test deletions needed (helpers had no test coverage). Item D unchanged at the plugin test surface (engine logic; would benefit from a pytest covering the new particle distribution, deferred).
- ✓ §86–118 (pure-core convention): `computeFrontmatterFoldRange` is pure-core; ViewPlugin is integration layer.
- ✓ §76 (no speculation): race fix tied to verified cohort symptom; Items A/C/D ship as specified; Item B deferred rather than guessed.
- ✓ §347 (version-bump sanity check): manifest 0.2.101 → 0.2.102 explicit.
- ✓ §321 (feedback before move): this file written before prompt move.
- ✓ "Assert cannot only with concrete error": race fix grounded in v0.2.19 retrospective + Tamar smoke verbatim; Item B's defer grounded in concrete reading of `forge/core/executor.py:resolve_action_code` semantics.
- ✓ v0.2.98 inlined-asset version stamping HARD RULE: forge-moda 0.4.19 → 0.4.20 + plugin manifest bump auto-trigger sentinel mismatch.

## §6 — Open follow-ups

1. **Item B (facet_form removal) design call** — Recommend option C (plugin-side E-- routing via resolveActionCode). Single-drain implementation, no cohort-visible change.
2. **v0.2.19 generate-internal pre-flight sync is now dead code** — TOP-level forgeSnippet sync makes it redundant. Remove next cycle.
3. **markDriftAsync dead code** — body emptied in this drain; the empty function shell + caller-less status remain. Full removal next cycle.
4. **Constitution amendment bundle reminder** — Pending bundle accumulating: B7.3 symmetric mutex (v0.2.87), cache invalidation (v0.2.90), inlined-asset version stamping (v0.2.98), bridge-shape-change grep discipline (v0.2.95), facet_form removal (v0.2.102 partial), locked_english_hash removal (v0.2.102). Next protocol-touch drain folds these in.
5. **Item D fine-tuning** — radius=5 + speed=0 is a defensible default; cohort signal may want smaller cluster or non-zero "drift" speed. Defer pending Tamar feedback.
6. **moda bridge pytest** — Recommended in v0.2.95 feedback; still not added. The v0.2.95 3-tuple regression would have been caught at v0.2.77-time. Worth a focused effort.
7. **release.sh drift preflight for bundled-assets.generated.ts** — Carried from v0.2.91. Still not added.

## §7 — Architectural framing

V1 polish progress per the prompt's §8:
- Items A, C, D ship as v1-aligned with no v2 conflict.
- Item B remains as the lone v2-alignment gap; option C's plugin-side routing would preserve v1 behavior while structurally removing the field.
- v0.2.83-98 facet-mutex work survives intact.
- Cohort onboarding (Tamar) has now triggered: BRAT install fix (v0.2.91-98), moda startup chain (v0.2.92-97), canonical Python write-back (v0.2.99-101), forge-click race + frontmatter UX (v0.2.102). The onboarding path is the dominant signal source for closed-beta.

Per cc-prompt-queue.md §43, this report is the chat summary.

---

## §8 — Post-v0.2.102 follow-up arc (v0.2.103 → v0.2.106)

Cohort smoke against v0.2.102 surfaced two follow-up bugs requiring four further releases. All from the same Tamar onboarding session.

### v0.2.103 — diagnostic build (pause + ink cluster)

**Cohort symptoms:**
- "Ink still scatters radially" (v0.2.102 ostensibly fixed this).
- "Pause button does not respond."

Bundle inspection confirmed v0.2.102's `assets/vaults/forge-moda/create_ink_particles.md` shipped the cluster code AND `forge-moda/forge.toml` was at 0.4.20. So either re-extract didn't take OR something else kept old behavior visible.

Shipped a pure-diagnostic iframe build (`[moda v0.2.103]` traces) covering: mode transitions, tick-loop lifecycle (setInterval/clearInterval), click-handler logging the (dx, dy) of created ink particles relative to the click point.

### v0.2.104 — writeGeneratedCode path lookup (qualified snippet_id)

**Cohort signal:** "Forge does nothing to Python" on `forge-moda/create_ink_particles.md`.

**Root cause (latent since v0.2.26):** `writeGeneratedCode` matched files via `f.basename === id`. For library-subdir snippets, `/generate` returns the **qualified** `snippet_id` (`forge-moda/create_ink_particles`), but file basename is just `create_ink_particles`. Match failed → silent skip → Python never written to disk; `runSnippet` then read the OLD MEMFS Python and ran it.

Silently broken for **every library-subdir snippet** since the v0.2.26 qualified-id introduction. Undetected because:
- Tamar's prior smokes only exercised hello_world (canonical mode → `writeCanonicalPythonBack` path, doesn't basename-match).
- The bug is silent (`console.warn` with no Notice).
- Output still reflects the new English because the engine generates new code in-memory even when the disk write fails.

**Fix:** path lookup first via `vault.getAbstractFileByPath('${id}.md')` (V1 convention: snippet_id maps to `<id>.md` from vault root). Basename fallback retained for root-level snippets where id is unqualified.

### v0.2.105 — diagnostic build (full /generate trace)

v0.2.104 didn't actually fix the symptom for Tamar — Python still didn't update. Shipped diagnostic `[forge-gen v0.2.105]` logs at every step: outgoing payload (English fed to LLM), incoming code, writeGeneratedCode file resolution, pre/post write content. Also simplified `create_ink_particles.md` English (removed v0.2.102 dev-commentary the LLM may have over-fitted to). forge-moda 0.4.20 → 0.4.21.

### v0.2.106 — isModaSnippet too greedy (the actual fix)

**Cohort signal:** Tamar's v0.2.105 console had **zero `[forge-gen]` lines**. `/generate` was never invoked.

The smoking gun was the iframe auto-running `setup` + `simulation` instead — meaning `forgeSnippet` had taken the moda branch:

```ts
if (this.isModaSnippet(view.file.path)) {
  await this.openModaView();
  ...
  return;  // before /generate
}
```

**Root cause (latent since v0.2.92):** `isModaSnippet` was a path-prefix match: any file under `forge-moda/` triggered the simulator-auto-open branch. Correct for v0.2.92's intent (the simulation entry point) but wrong for v0.2.93+ when leaf moda snippets need to author through `/generate`. Silent for 14 releases because the simulator/iframe work happened in parallel to writeback work and the conflict wasn't exercised until Tamar tried to author a leaf moda snippet.

**Fix:** narrow to `featured: true` in frontmatter via `isModaFeaturedSnippet(file)`. Only the simulation entry triggers auto-open; leaf snippets fall through to the normal `/generate` + `writeGeneratedCode` chain.

### v0.2.106 — bonus: `.bak` directory sweep

Same v0.2.105 cohort log surfaced:

```
Forge: multiple featured snippets found; using first by id.
picked=simulation, all=simulation, simulation, simulation
```

Three matches because every previous re-extract left a `forge-moda.bak.0.4.X/` at vault root, each with its own `featured: true` simulation.md.

Tamar's request: "please remove the .bak directories, they are adding noise."

**Fix:**
- `welcome.ts:renameWithBackup` → `deleteExtractedDir`. New re-extracts just delete the old; no .bak created.
- `welcome.ts:sweepLegacyBakDirs`. One-shot per-onload sweep that deletes any pre-existing `forge-{moda,music,tutorial}.bak.<version>/`.
- `moda-view.ts:findFeaturedSnippet` skips `\.bak\.` paths as defense in depth.

**Trade-off accepted:** v0.2.39's rationale for `.bak` was preserving user edits to bundled snippets across drift events. V1 convention treats bundled-library snippets as intended-immutable (user authoring lives at vault root), so the loss-of-recovery cost is small relative to the clutter cost.

**Cohort confirm (Tamar):** "looks good!!!"

## §9 — Constitution amendment additions (cumulative session)

Compounding amendments from v0.2.91→v0.2.106:

1. **Inlined-asset version stamping** (v0.2.98) — already proposed.
2. **Bridge-shape-change call-site grep** (v0.2.95) — already proposed.
3. **Symmetric facet-mutex invariant** (v0.2.87) — already proposed.
4. **NEW: Snippet-id resolution via path lookup, not basename.** Any code that maps `snippet_id` → file MUST use the `<id>.md` path-from-vault-root convention. Basename matching is allowed only as a fallback for root-level snippets where the id is provably unqualified. v0.2.104's `writeGeneratedCode` fix is the reference implementation.
5. **NEW: Path-prefix gates need a positive frontmatter signal.** `isModaFeaturedSnippet`-style narrowing — gate auto-routing behaviors on a specific frontmatter field (`featured: true`, `type: simulator`, etc.) not on path-prefix alone. v0.2.92's path-prefix-only gate routed leaf moda snippets to the wrong path for 14 releases.
6. **NEW: Library re-extract should not accumulate backup directories.** Either delete-on-extract (v0.2.106 choice) OR cap backups at one. Unbounded accumulation breaks featured discovery and pollutes vault root.

## §10 — Per-protocol HARD RULE compliance (cumulative)

- ✓ §76 (no speculation): each diagnostic build (v0.2.94, v0.2.100, v0.2.103, v0.2.105) earned the next targeted fix from cohort logs.
- ⚠ Diagnostic-pattern lesson: v0.2.105 diagnostic missed the actual issue (`isModaSnippet` greediness) because the diagnostic was placed INSIDE the path that was being skipped. Next iteration: when a diagnostic produces zero output, instrument the BRANCH points upstream too. Already applied in v0.2.106's tree-cleanup.
- ✓ §347 (version-bump sanity): every release explicit manifest bump.
- ✓ §321 (feedback before move): this append covers v0.2.103→v0.2.106; prompt remains in `done/` since v0.2.102 already completed the original prompt.

## §11 — Open follow-ups (after this session)

1. **moda bridge pytest** — Carries forward from v0.2.95. Would have caught v0.2.77→v0.2.95 regression at write-time; would NOT have caught v0.2.104 / v0.2.106 (those are plugin-side concerns).
2. **Plugin-side path-lookup audit** — `writeGeneratedCode` is fixed; check every other site that does `files.find(f => f.basename === snippet_id)` for the same bug. Candidates: `reconcileFrontmatterInputs`, `syncEnglishFromPython`, any v0.2.41 freeze-affordance lookup.
3. **Item B (facet_form removal) design call** — still pending; see §2 above.
4. **release.sh drift preflight for bundled-assets.generated.ts** — still pending from v0.2.91.
5. **v0.2.19 generate-internal pre-flight sync now dead** — still pending from v0.2.102.

