# Forge — Release Notes (v0.2.205 → v0.2.291)

This document summarizes the plugin arc from v0.2.205 (early V2 implicit-locking) through v0.2.291 (drain 2030 auto-connect on onload), grouped by theme rather than version.

Audience: Forge cohort authors + engineers keeping their vaults current with the paradigm.

Terminology in these notes uses the V2a v12 vocabulary: **note** (any `.md` file with facets), **action note** (returns a computed result), **data note** (returns literal data), **library note** (engine-shipped, virtual), **vault note** (cohort-authored), **chip** (palette UX only).

## Current state — what to know if you're just picking this up

If you're on v0.2.273 with a fresh vault, here's how Forge behaves today:

Every V2 action note has three facets — **Description** (prose intent), **Recipe** (structured grammar that compiles to Python), **Python** (the compiled or hand-authored code). All three are always visible in the editor. All three are always editable. You cannot lose one by accident.

Whichever facet you last hand-edit becomes the **source** (labeled `— source` in the heading, full color body). The other two facets render one of five non-source states in a hexa-state suffix: `— derived from Description`, `— derived from Recipe`, `— derived from Description, out of date`, `— derived from Recipe, out of date`, or `— ignored`. The suffix names the parent (immediate upstream) AND the freshness. Forging normalizes downstream facets from out-of-date back to derived. Direct edits promote any facet to source; upstream facets become `— ignored`.

The chip palette displays clickable entries; each references a note (library or vault). Chips are not model objects — the note they reference is. Library notes ship inside the engine (their Recipe, Description, and Python are served read-only from the Python source's docstring, signature, and body). Vault notes are cohort-authored `.md` files with all three facets fully editable.

V1 action notes (`# English` + `# Python` shape) still work; the engine accepts both shapes during the ongoing V1 → V2 migration.

## v0.2.291 — auto-`/connect` on plugin onload (drain 2030)

Fixes a longstanding regression flagged by forge-tester's 2026-07-12 run: after `Cmd-P → Reload app without saving` (or any plugin reload), the plugin held no vault-engine binding. Sync edges + every downstream flow HTTP-400'd with `vault not connected — call /connect first`, and there was no user-facing connect affordance to call it manually.

**Fix (Option A per driver adjudication).** Plugin `onload()` now spawns a fire-and-forget call into the new `auto-connect-retry-core.ts` helper. The helper retries `POST /connect` up to 3× with a 1s gap (so a uvicorn that's a touch slow to come up still succeeds) and never blocks Obsidian's plugin lifecycle. On success: one `Forge: vault auto-connected to <engineUrl>` line in the Forge Output panel. On terminal failure: a red notice + full error dump routed to the panel so the user can diagnose without hunting through console.

**Extracted pure-core**: `connectWithRetry(connectFn, {maxAttempts, backoffMs, sleep?})` — injected `sleep` keeps unit tests wall-clock-free; the fire-and-forget site in main.ts is a thin adapter (no logic to test past what the pure-core covers).

New tests (3): first-attempt success, retry-then-success, terminal-failure. Uses a sleep recorder to assert the exact backoff schedule without wall-clock latency.

## The v0.2.287 → v0.2.290 arc — CW-2300/2400 async-getter class-of-bug

Four fixes closing an Obsidian API gotcha that cost driver two live-smoke rounds. `MarkdownView.file` (and similar API properties) are **live getters**, not stable snapshots. Across an `await` — especially a multi-second /generate LLM roundtrip — Obsidian can detach the leaf's file binding, so re-reading `view.file` after the await returns `null` even though the `view` reference stays live. Reading it in a notice-text interpolation or passing it into `writeSourcePythonBack` at that moment silently ships null downstream.

- **CW-2300-B (v0.2.286 forge-transpile)** — rhythmic-subdivisions + chip-composition sections added to the music-domain LLM prompt. Bug found alongside: the music fragment was registered on V1 only; V2 forges saw the base 6756-char prompt with zero music guidance. Fixed by adding `register_fragment_v2` call. **This shipped Recipe correctness** (16th-note grooves now produce `quarterLength=0.25` with 16 offsets per bar) — but the run stage dropped the score.
- **CW-2300-C (v0.2.288)** — first attempt at the run-stage fix. Extracted `resolveRunTarget` pure-core with 6 tests, threaded `view.file` as a fallback into `runSnippet`. **The pure-core was right; the caller was wrong** — the caller expression `view.file` was evaluated post-await, shipping null. Diagnosed as "focus loss" (missed by one arrow).
- **CW-2300-D (v0.2.289)** — actual root cause identified: getter staleness. Captured `const file = view.file` at `forgeSnippet`'s top; swept all 43 downstream `view.file` references to `file`. **Driver smoke verified: 16th-note hihat groove Description forges end-to-end, score renders.**
- **CW-2400-A (v0.2.290)** — audit + L59 rule scribed. Swept the rest of main.ts for the same class-of-bug pattern. Two more violations fixed:
  - `showSourceLayer` — notice text interpolation `view.file.basename` read after `whichLayerIsSource` (multi-facet hash compute). Fixed with `const file = view.file` before the await.
  - `dispatchModaBranch` — `writeSourcePythonBack(view.file)` called after `routeActionCodeRegen` (Pyodide + potential /generate LLM for featured moda snippets). Fixed same shape.
  
  Also introduced **L60 caller-integration tests** — new pattern that simulates the async gap and asserts the caller's captured local (not the live getter re-read) flows into the callee. Four new tests in `l59-caller-capture-timing-core.test.ts`. Downgraded the CW-2300-C `runSnippet` diagnostic from `console.error` to `console.warn` (fallback firing is signal-worthy but not error-worthy).

Test suite: 1120 → 1154 across the arc. New categories: pure-core target resolution across lost-view fallback, captured-TFile survives view.file getter going null, caller capture-timing under simulated multi-second awaits.

Meta: L59 + L60 scribed as HARD RULES in `cc-prompt-queue.md` this arc. L59 — any main.ts method that reads an Obsidian API getter after an `await` must capture the concrete field into a local const before the first await, thread the local through. L60 — for each L59 fix, add a caller-integration test that simulates the async gap and asserts the captured value flows through. Motivating case for both: v0.2.288 shipped a pure-core with 6 green tests but the caller passed the wrong (post-await, re-read) value into it; the caller-integration test class catches that gap.

## The v0.2.286 arc — `canonical_facet` → `source_facet` rename

The S9 state-machine frontmatter field renamed from `canonical_facet` to `source_facet`. The value grammar (`description | recipe | python | synced`) is unchanged; only the field name changes. Other uses of "canonical" in Forge — canonical URL, canonical form of a note's compute, E-- canonical grammar — name different concepts and are untouched.

**Migration is transparent to cohort.** Existing notes carrying `canonical_facet:` keep working: the plugin's read path accepts either name (preferring `source_facet`), and the next facet-write on any note flushes `canonical_facet` in favor of `source_facet`. First-open backfill also migrates the field in place. Cohort should never see a note that fails to open because of the rename — but a Description-canonical note becomes a Description-source note in the status bar; a Recipe-canonical note becomes a Recipe-source note; etc.

Related identifiers renamed alongside the field:

- `whichLayerIsCanonical` → `whichLayerIsSource`
- `decideCanonicalWrite` → `decideSourceWrite`
- `computeCanonicalFacetAfterEdit` → `computeSourceFacetAfterEdit`
- `canonicalLayer` (routing signal) → `sourceLayer`
- `canonicalLayerStatusLabel/Tooltip` → `sourceLayerStatusLabel/Tooltip`
- `maybeUpdateCanonicalFacet` → `maybeUpdateSourceFacet`
- `seedCanonicalFacetForOpenFiles` → `seedSourceFacetForOpenFiles`
- `writeCanonicalPythonBack` → `writeSourcePythonBack`
- File renames: `canonical-aware-forge-click-core.ts` → `source-aware-forge-click-core.ts`; `canonical-layer-status-bar-core.ts` → `source-layer-status-bar-core.ts`; `facet-edit-canonical-flip-core.ts` → `facet-edit-source-flip-core.ts`; `write-canonical-python-back-empty-recipe-core.ts` → `write-source-python-back-empty-recipe-core.ts`

Every renamed export re-exports its old name as a deprecated alias for one release cycle (marked `TODO: delete in v0.2.290`). The engine-side kwarg `canonical_layer` on `resolve_action_code` remains an accepted alias mapped into `source_layer`. Plugin ↔ engine bridge sends only the new name.

Constitution bumped V2a v20 → V2a v21 with S9 rewritten around `source_facet`.

Status bar labels changed: "Forge: Recipe canonical" → "Forge: Recipe source". Cohort will see the new label on any open V2 note that isn't synced.

## The v0.2.274 → v0.2.285 arc — CW arc: auto-forge Description-canonical restored end-to-end

Twelve releases restore what CW-2000 architecturally built and CW-2200 finally delivered end-to-end: editing a Description and clicking Forge now produces a *distinct* Recipe (via LLM) that transpiles to distinct Python. This closes a semantic gap that had been silently violated since drain 1100.

Highlights across the arc:

- **CW-1800 (v0.2.274)** — Upstream-wins tiebreak in `identifyEditedFacet`. When external file rewrites cause multi-facet body-hash drift, canonical goes to the upstream facet (Description > Recipe > Python), matching cohort intuition.
- **CW-1900 (v0.2.276)** — `writeGeneratedCode` re-baselines stored `<facet>_hash` from current body SHAs. Fixes auto-forge silent-skip.
- **CW-2000 (v0.2.277)** — Description → Recipe two-hop LLM via new `write-generated-recipe-core.ts`. Sub-1 fallback preserves prior Recipe on LLM failure.
- **CW-2100 (v0.2.278 + v0.2.281)** — Closure check merges engine library chip names from `libraryNoteIndex`; `_libraryCatalogLoaded: boolean` field replaces `.size === 0` heuristic.
- **CW-2200 (v0.2.279 + v0.2.280)** — Pyodide `_forge_get_generate_inventory` falls back to `# Description` body when YAML meta.description is empty (the **root fix** — LLM was seeing empty description on every V2 forge for weeks). Hard-terminator at `# Python` prevents LLM `# missing chip:` annotations from breaking Recipe section boundaries. New `sanitizeLlmRecipe` pure-core strips prose + `#` comments from LLM output.
- **Rhythm precision (v0.2.283)** — forge-music v0.8.2. Common subdivisions reference table added to `play_at_offsets` docstring (quarters, 8ths, 16ths, dotted 8ths, triplets, downbeats, backbeats). Improves LLM output for rhythm-terminology-heavy Descriptions.
- **Fresh-note rehearsal (v0.2.284)** — Headless integration test harness for fresh-note first-forge lifecycle. Surfaced a real gap: Sub-1 fallback on fresh notes leaves Recipe body empty; `writeCanonicalPythonBack` then transpiles empty Recipe with undefined behavior.
- **Fresh-note gap fix (v0.2.285)** — `writeCanonicalPythonBack` now detects empty Recipe body, skips transpile, surfaces cohort-facing notice: `"Fresh note: no valid Recipe to transpile. Try refining the Description or check the previous notice from Recipe generation."` Defensive backstop for any path producing empty Recipe.

Test suite grew from 1085 → ~1120 across the arc. New test categories accumulated per L44: fresh-note first-forge lifecycle, empty-Recipe transpile-boundary protection, rhythm subdivisions doc-driven precision, catalog readiness signal, cross-cycle Recipe body replacement, Recipe section boundary tolerates `#` comments, sanitizer strips prose without dropping valid statements, Description reaches LLM payload, engine-chip-inclusive closure check, empty-catalog guardrail.

Meta: headless test harness pattern (CW-2200's harness) formalized as L56 protocol rule. Substitutes for in-Obsidian L43 rehearsal for state-transition + pipeline-artifact invariants. Unblocks drains from SCContentFilter / computer-use infrastructure issues.

Load-bearing for the MCP arc, where every agent-created sub-note is fresh and the pipeline needs to degrade gracefully with an informative message when the LLM fails to produce valid E--.

Known followups (deferred): CW-2300-B service-side prompt tuning (pitched-instrument catalog gaps: piano/violin/walking_bass/vocals absent; rhythm precision beyond docstring tuning); `canonical_facet` rename; S9 state-machine migration from `forge-client-obsidian` to `forge-service` per Components architecture.

(v0.2.275, v0.2.282 consumed by release.sh drift-detect; no shipping changes.)

## The v0.2.273 arc — chip subsystem close-out

Second round of dead-code deletion in the chip subsystem. `chips-core.ts` shrinks from 924 lines to 340; test file shrinks from 1487 to 1043. Combined removal: **-1028 lines net**. Retired functions: `parseChipsV2Config` (legacy `_chips.md` schema parser), `mergeChipsWithOverrides` (override merger), `autoDeriveChips` (synthetic chip generator), `mergeChipsConfigsWalkUp` (walk-up-vault discovery), `chipSourcesFor`. Retired types: `ChipsV2Config`, `ChipOverride`, `ChipGroup`, `ChipSource`. Constant `CHIPS_RELATIVE_PATHS` retired.

Cohort-invisible cleanup — the auto-discovery palette shipped in v0.2.259 was already the live path; this drain closes the deferred deletion from v0.2.262's followup section. Chip subsystem is now cleanly stripped to its post-v0.2.259 auto-discovery essentials.

## The v0.2.271 arc — hexa-state freshness fix (CW-1700)

Fixed a post-ship semantic bug caught during driver-requested re-rehearsal of v0.2.265's edit-cycle smoke steps. Before: after hand-editing Description on a Description-canonical note, Recipe would render `— derived from Description` (in sync) instead of `— derived from Description, out of date`. Cohort got no "regenerate?" freshness cue between hand-edit and forge — the visual signal was silent at exactly the moment they needed it.

Root cause: `computeFacetStates` compared derived-from-parent hashes against the STORED `<facet>_hash` frontmatter fields. Those fields only update at forge/backfill time, not on hand-edit (drain 1200 preserved this "stored = last-forged snapshot" invariant to keep the hash cache clean). After hand-edit, stored equals derived-from-parent, so equality passes, so Recipe renders in-sync — but the actual body content has drifted.

Fix: `computeFacetStates` signature changed to accept computed current-body hashes. The view plugin now computes SHA-256 of current body content at render time (~1ms overhead on typical notes) and passes those hashes for freshness comparison. Stored `<facet>_hash` write semantics preserved — only the view plugin's read path changed.

Cohort-visible effect: freshness signal fires immediately on hand-edit. Recipe transitions to `— derived from Description, out of date` (50% opacity) the moment cohort edits Description. Same for Python's `— derived from Recipe, out of date` when Recipe is edited.

## The v0.2.269 arc — full V1 → V2 tutorial vocabulary sweep

Full sweep across all 22 tutorial files. **87 instances of "snippet"** as a noun replaced with "note." V1 Recipe grammar shorthand rewritten to current V2 form: "Set … to …" → "Let … = …" (8 occurrences), "Give back" → "Return" (6), "Do [[…]]" → "Call [[…]] with …" (3). All 8 leaf action-note Recipe examples updated to V2 kwargs-only form (`Call [[name]] with kwarg=value.`).

Chapter 9's "override Forge" section (which described the retired `edit_mode: python` mechanism) rewritten to describe the current hexa-state edit-flips-canonical (I5) semantic. Chapter 8's recursion example rewrote from V1 nested-Do syntax (`Do [[print]]([[factorial]](n=5))`) to V2 two-line form (`Let result = Call [[factorial]] with n=5. Call [[print]] with text=result.`) — necessary because V2 grammar can't nest Call as an argument.

forge-tutorial version bumped 0.3.4 → 0.3.5. Bundled installer mirror re-synced. Post-sweep grep verification: all 4 retired-vocab patterns return 0 matches across tutorial files.

## The v0.2.267 arc — cohort-ready polish (INSTALL.md + hexa-state legend + tutorial pacing + backfill log strip)

Four cohort-facing polish items landed in one bundle.

**INSTALL.md refresh**. All references to retired Cmd-P commands (Zap line, Generate Only, Generate recipe from description, Show canonical layer, Sync English from Python, Toggle Python/English editing mode) removed. Pre-v11.4 tri-state prose rewritten to describe the current hexa-state model. Pinned version references (`v0.2.199`) replaced with "current release." "V1 closed beta" framing removed. "MoDa simulation" command name (retired) replaced with "Open 3D View." Palette command inventory verified against `grep addCommand` — 11 commands remain.

**Hexa-state legend section added to INSTALL.md**. Cohort-facing prose explaining all six suffix variants (source, derived from X, derived from X out of date, ignored) with a worked example showing Description edit propagating through the D → R → P chain. Suffix strings match `suffixTextForState()` output verbatim.

**Tutorial `## Palette focus` per chapter**. All 9 tutorial chapters got an explicit "focus on X; ignore Y for now" prose block. Chapter 1 focuses on `Call [[print]]`, chapter 2 adds Let, chapter 3 adds Return, chapter 4 focuses on chained calls, chapter 5 adds If/Otherwise, chapter 6 adds For each. Chapters 7-9 handled specially (data notes, recursion, slot syntax). Replaces the pre-v0.2.259 `_chips.md` pacing mechanism with prose-based guidance.

**Backfill diagnostic log strip**. `[v113-backfill]`, `[v114-backfill]`, and `[v114-canonical-hash-repair]` `console.log` sites removed from cohort-visible paths. Backfill still fires; console noise drops.

## The v0.2.264 arc — hexa-state visibility (V2a v11.6)

The tri-state visibility from v0.2.243 (source / derived / stale) is superseded by hexa-state visibility. The six suffix variants are `— source`, `— derived from Description`, `— derived from Recipe`, `— derived from Description, out of date`, `— derived from Recipe, out of date`, and `— ignored`. Two things get surfaced that were hidden before: (1) which facet is the immediate parent in the D → R → P chain (Recipe's parent is Description; Python's parent is Recipe), and (2) the difference between "no lineage relationship" (`— ignored`, upstream of canonical) and "was derived, source moved" (`— out of date`, downstream with stale parent hash).

Transitive out-of-date: when Recipe is out of date, Python renders `— derived from Recipe, out of date` regardless of local Python-vs-Recipe hash match. Cohort will regenerate the whole chain from source; reporting Python as fresh when Recipe is upstream-broken would mislead about the pipeline's actual freshness.

New frontmatter fields carry the immediate-parent lineage: `recipe_derived_from_description_hash` (stamped at `/generate`) and `python_derived_from_recipe_hash` (stamped at transpile). Legacy `_source_hash` fields retained for the transition period; a followup drain retires them after cohort validation.

**Cohort CSS breakage note**: `.forge-facet-stale` is renamed to `.forge-facet-ignored`. Custom themes referencing `.forge-facet-stale` should update to `.forge-facet-ignored`. A new `.forge-facet-out-of-date` class covers the `— derived from X, out of date` variants (50% opacity, between derived at 60% and ignored at 40%).

Backfill on this update seeds the new parent-hash fields idempotently from the legacy `_source_hash` fields when the semantic is unambiguous (Recipe's legacy field points at description_hash; Python's legacy field points at recipe_hash directly). Two-hop Description-canonical case leaves `python_derived_from_recipe_hash` absent (safe default: Python renders `— derived from Recipe, out of date` until cohort re-forges); this prevents false-positive "in sync" reads when Recipe body may have drifted since Python's actual forge.

Constitution §S9 now reads V2a v11.6.

## The v0.2.243 arc — tri-state visibility (V2a v11.4)

The current visibility contract distinguishes three states per facet — source, derived, stale — instead of the binary source/reference model from v11.3. Cohort feedback drove this: "which facet is the source?" is one question; "does the non-source content reflect source?" is a different one. Both now have unambiguous vault-visible answers.

Downstream facets carry a new frontmatter field, `<facet>_derived_from_source_hash`, that records which source-hash they were derived from. On render, the plugin compares that against the current source-hash to decide `— derived` vs `— stale`. When you edit source without forging, downstream immediately shows stale. Forging closes the gap: downstream returns to derived.

Backfill on this update is silent. Existing V2 notes get their `derived_from_source_hash` fields stamped on first open (assuming aligned state), so cohort sees no scary "everything is stale" moment.

Constitution §S9 now reads V2a v11.4.

## The v0.2.239 – v0.2.242 arc — uniform visibility (V2a v11.3), backfill, symmetric stale marking

v0.2.239 landed the uniform-visibility contract: all three facets always rendered, always editable. Non-canonical facets carried a `— reference` suffix and grayscale body.

v0.2.240 added file-open backfill for pre-v11.3 vault notes: missing facet hashes and Python stubs get filled in the moment you open the note. Also retired the `forge-step-moda` command (moda simulation stepping is out of scope until further notice).

v0.2.241 fixed two migration bugs. First, the backfill handler couldn't reliably read the note's `type` from Obsidian's metadata cache (cache lags file-open events); the handler now reads directly from the note body. Second, a legacy `readOnlyFacetFilter` from Phase 6.5 was blocking Python edits on V2 notes because it inspected an `edit_mode` frontmatter field that V2 notes don't set; the filter now short-circuits on notes with a Recipe heading.

v0.2.242 fixed asymmetric stale marking. Before, editing Recipe grayed out Python but not Description, even though Description was semantically stale relative to the new Recipe. The stale-set computation is now symmetric by construction: every non-canonical facet is stale, no exceptions.

## The v0.2.231 – v0.2.238 arc — cohort UX polish + forge-music v0.8.0

v0.2.232 shipped a V2-shaped template for new action notes: Description heading + Recipe heading + stub Python heading with a placeholder comment. New notes are V2 from creation.

v0.2.233 made welcome.md refresh when the plugin detects a V1-shaped vault or the Obsidian default — so cohort landing on this update sees the current onboarding text without manually deleting a stale welcome.

v0.2.234 added an immediate spinner in the status bar during Forge-click and `/generate` (200ms grace to avoid flicker on fast operations). Also re-bundled forge-music engine after the v0.8.0 rename (the blues piece went from "Song" to "Slow Burn"; music21 references updated accordingly).

v0.2.235 fixed an empty-Recipe transpile crash and moved Pyodide MEMFS sync ahead of `resolveActionCode` calls so late-mounted files hydrate before compute.

v0.2.238 hardened the sweep-bundle-dropped mechanism (files no longer in the bundle now get trashed reliably), cleaned up dead commands, added an alignment report for `_chips.md` schemas, and added modal validation on the Description-quality pushback path (the plugin surfaces a rewrite-suggestion modal when a Description is too procedural to /generate cleanly).

## The v0.2.221 – v0.2.230 arc — library notes + music playback + engineer-mode

v0.2.221 shipped the `Forge: Re-extract bundled library vault` command for repairing a broken vault install without a full plugin reset.

v0.2.222 fixed a transitive-compute bug in engineer-mode routing: previously the resolver hit V2-shape detection before checking `edit_mode: python`, which caused stub Recipes to transpile to empty Python and overwrite the canonical.

v0.2.223 fixed the re-extract path to discard the editor buffer before detaching the leaf (previously stale buffers won on next open).

v0.2.224 added a Stop button for music playback plus teardown on view-clear or note-switch (playback no longer leaks across notes).

v0.2.225 wrapped `forge-run-only` and `forge-generate-only` in the spinner UX, with bold + pulse animation on the status bar during compute.

v0.2.226 shipped default drum-kit + chamber aspect for percussion notes and a `bar_list` bundle sync.

v0.2.227 renamed "engine chip" to "library note" everywhere in the codebase, palette, and vault. Also promoted eight forge-music engineer-mode notes to library-note status (`drum_chorus`, `drums_shuffle`, `form`, etc.). This was the model concept fix: chips are palette UX; the callable primitives are notes.

v0.2.228 removed a stale Stop button after music-playback API refactor and added spinner diagnostics.

v0.2.229 fixed pebble UX bug 1 (spinner visual regression) and polished library-note view.

v0.2.230 landed TypeScript hygiene pass, another welcome-refresh follow-up, and Description-quality pushback improvements (heuristic checks for procedural language before /generate fires).

## The v0.2.211 – v0.2.220 arc — chips, slots, forensic-shadow cleanup

v0.2.211 accepted `insertionV2` on `_chips.md` schema — chips can now insert Recipe-grammar shapes, not just wikilinks.

v0.2.212 – v0.2.214 closed the "engine-chip vault wins" trap: when a vault-shadow file of a library note existed, click routing sometimes preferred the vault copy incorrectly. Solved by a forensic-shadow heuristic + verify-after-trash on cleanup + capture-phase click interceptor.

v0.2.215 fixed engine-chip click interception on CM6 editor (needed a capture-phase event listener).

v0.2.216 synced engine bundle for percussion display-pitch normalization (multi-staff notation now normalizes octaves consistently).

v0.2.217 – v0.2.219 fixed the "Recipe edit → first Forge-click produces stale output" trap. Previously edits to Recipe weren't flushed to disk before Forge-click read them; now `view.save()` is forced in the pre-flight.

v0.2.220 landed the V1→V2 migration path for forge-music notes and shipped the `voices_list` chip.

## The v0.2.205 – v0.2.210 arc — implicit locking + engine chip Phase 2 + slot resolution

v0.2.205 landed implicit locking Phase 2.5: a modal + status bar + CM6 stale-indicator when the canonical layer is out of sync with the note's compute state. This was the precursor to v11.3 uniform visibility — the state machine that decides "which layer runs on Forge-click" got made explicit and cohort-visible.

v0.2.206 shipped engine chip-as-note Phase 2: the vault view + click interceptor treating engine chips as first-class notes (view routing, catalog display). This was later renamed to library-note in v0.2.227.

v0.2.207 hardened the build step: `tsconfig` + typecheck as a soft gate, plus two engine bug fixes.

v0.2.208 – v0.2.209 synced engine bundles including `.obsidian` prune and forge-moda v0.5.3 (which deleted `canonical_demo*` in favor of the new slot syntax).

v0.2.210 landed slot resolution Phase 3.5: resolved vs unresolved `{{...}}` slots differentiate visually (unresolved slots are yellow-highlighted; resolved ones inline the value).

## The v0.2.244 – v0.2.246 arc — palette trim + hygiene

v0.2.244 retired six V1-era commands from Cmd-P: Zap line, Generate Only, Generate recipe from description, Show canonical layer, Sync English from Python, Toggle Python/English editing mode. The V2 paradigm makes them redundant: canonical-forge handles what Generate/Zap did, tri-state visibility surfaces canonical directly, engineer-mode was retired for vault notes back in v11.2. Palette count 17 → 11.

v0.2.246 shipped two hygiene fixes. Forensic-shadow cleanup summary now surfaces as a transient Notice toast (5-6s) instead of a persistent output-panel entry. Also added Pyodide MEMFS pre-sync to `runSnippet` handler (Cmd-P "Run only"), matching the pattern from v0.2.235's `togglePythonVisibility` fix. Editing a note's Python body and running Cmd-P "Run only" before Obsidian auto-saves now compiles the fresh edit.

## The v0.2.247 – v0.2.251 arc — V11.4 synced-state + Recipe error UX + dead-code sweep

v0.2.247 added a Step button to the moda simulator iframe's transport controls, with correct disabled-state gating when the sim is running. The Cmd-P command retired in v0.2.240; iframe UI now surfaces the functionality.

v0.2.248 landed V11.4.1: synced-state canonical delegation to Description as authorial default (Recipe + Python render as `— derived` from Description). Same drain fixed `writeCanonicalPythonBack`'s canonical-hash routing (was using recipe_hash shortcut). Silent backfill (`[v114-canonical-hash-repair]`) opportunistically fixes existing V2 notes on first-open.

v0.2.249 gave Recipe parser errors a cohort-friendly rewrite via pattern-match table. "Recipe kwarg near 'a' — the grammar is 'Call [[chip]] with name=value'" instead of raw Pyodide traceback. Same version attempted to strip vestigial `english_hash` field from V2 notes — later reverted in v0.2.252 (turned out to be a slot-cache-key wire contract, not vestigial).

v0.2.251 completed the dead-code sweep for retired command handlers from v0.2.244. ~471 lines removed across four handler methods (`runZapLine`, `generateEmmFromDescription`, `syncEnglishFromPython`, `toggleEditMode`) and `src/zap.ts`.

## The v0.2.252 – v0.2.255 arc — canonical routing + auto-forge on Description-canonical

v0.2.252 fixed the canonical-tiebreak semantic that had been shipping: was downstream-wins (Python wins if any drift), flipped to upstream-wins so Description edits register as canonical. Introduced the L45 routing signal — plugin's declared canonical layer is honored by the engine's execution path. When plugin routes Python-canonical, engine short-circuits Recipe parse. Also reverted v0.2.249's `english_hash` strip: it was a slot-cache-key wire contract, not vestigial.

v0.2.254 changed forge-click behavior on Description-canonical notes. Was: abort with an error pointing at a retired command. Now: automatic pipeline — /generate produces Recipe, transpile produces Python, execute Python. No cohort intervention. Matches the "forge = run this note" mental model.

## The v0.2.256 – v0.2.263 arc — V11.5 canonical-as-stored + `_chips.md` retirement + hash-cache

v0.2.256 moved canonical detection from hash-mismatch inference to explicit storage. New `canonical_facet` frontmatter field (values: `description`, `recipe`, `python`, `synced`). Plugin writes it on hand-edit events; programmatic writes (transpile, /generate, backfill) preserve existing values. Hash-inference retained for backfill seed + external-edit fallback.

v0.2.258 retired the `_chips.md` schema entirely. Palette now auto-populates from `type: action` note discovery + hardcoded language primitives + library-note frontmatter (`chip_insertion:` field for custom shapes). Removed 10 tutorial `_chips.md` files + 1 forge-moda file. Cohort's existing `_chips.md` files become unread (harmless); cohort can delete when convenient. Bundled vault re-extract fires normally.

v0.2.260 fixed a subtle bug in canonical detection. When a note had residual hash drift from prior editing (like slow_burn.md in the driver's bluh vault), editing another facet wouldn't flip canonical to the edited facet — both facets showed as drifted, and the tiebreak preserved the prior canonical. Fix: per-file hash cache tracks last-known body hashes; on modify, the facet whose CURRENT hash differs from CACHED hash is the freshly-edited one. Same drain added an `onLayoutReady` seed pass that populates `canonical_facet` on workspace-restored tabs (previously missed because file-open events preceded plugin onload).

v0.2.262 completed the dead-code sweep for the retired `_chips.md` reader stack. ~1852 lines removed across `chips-md-migration-core.ts`, `chips-walk-up-core.ts`, `synthetic-chips-core.ts` (all deleted), `chips.ts` (509 lines shed), `welcome.ts` (102 lines shed). Docs sweep across constitution and forge-doc-briefing to describe the post-retirement auto-discovery model.

## Migration cheat sheet — v0.2.263 and earlier

If you're upgrading a vault from before v0.2.205 to v0.2.243:

1. Update plugin via BRAT to v0.2.243. Cmd-Q + relaunch.
2. Open any pre-v11.3 V2 note — backfill fires silently. Check the console for `[v113-backfill]` and `[v114-backfill]` entries.
3. Verify facet suffixes render on your V2 notes: `— source`, `— derived`, or `— stale`. Colors: full / 60%-gray / 40%-gray.
4. V1 notes (`# English` + `# Python`) continue to work unmodified.
5. Any note that says `# E--` or `# English` on a heading you thought was V2 needs migration via `/generate` from a Description body.

If your vault still has "snippet" language in prose or comments, that's fine — the engine accepts both vocabularies. The V2a v12 vocabulary sweep is a doc-side change; there's no engine-code migration attached.

## What's next (planned but not yet shipped)

- **v0.2.264 (in flight)** — V11.6 hexa-state visibility. Suffixes gain lineage detail (`— derived from Description`, `— derived from Recipe`) and a distinct "out of date" state (`— derived from Description, out of date` when the source was edited after the derivation). Upstream-of-source facets render `— ignored` (renamed from `— stale` — semantically more precise). Two frontmatter renames: `recipe_derived_from_description_hash` (was `recipe_derived_from_source_hash`), `python_derived_from_recipe_hash` (was `python_derived_from_source_hash`). Backfill migrates on file-open. **CSS class rename**: `.forge-facet-stale` → `.forge-facet-ignored`; cohort with custom themes should update.
- **Followup drain 1320** — remaining ~800 lines of dead code in `chips-core.ts` (`parseChipsV2Config`, `mergeChipsWithOverrides`, `autoDeriveChips`, related types). Non-blocking cleanup after v11.6 lands.
- **Followup** — `[v113-backfill]` and `[v114-backfill]` diagnostic logs removal once v11.6 backfill is cohort-confirmed.
- **Publishing-arc polish** — INSTALL.md refresh, cohort onboarding path.

For paradigm changes, see `~/projects/forge/docs/specs/constitution.md` (currently V2a v12; S9 sub-clause at v11.6).
