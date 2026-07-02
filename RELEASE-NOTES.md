# Forge — Release Notes (v0.2.205 → v0.2.243)

This document summarizes the plugin arc from v0.2.205 (early V2 implicit-locking) through v0.2.243 (V2a v11.4 tri-state visibility), grouped by theme rather than version.

Audience: Forge cohort authors + engineers keeping their vaults current with the paradigm.

Terminology in these notes uses the V2a v12 vocabulary: **note** (any `.md` file with facets), **action note** (returns a computed result), **data note** (returns literal data), **library note** (engine-shipped, virtual), **vault note** (cohort-authored), **chip** (palette UX only).

## Current state — what to know if you're just picking this up

If you're on v0.2.243 with a fresh vault, here's how Forge behaves today:

Every V2 action note has three facets — **Description** (prose intent), **Recipe** (structured grammar that compiles to Python), **Python** (the compiled or hand-authored code). All three are always visible in the editor. All three are always editable. You cannot lose one by accident.

Whichever facet you last hand-edit becomes the **source** (labeled `— source` in the heading, full color body). The other two facets show one of two states: `— derived` (they were auto-produced from the current source, in the 60%-gray body) or `— stale` (they don't reflect current source, in the 40%-gray body). Forging normalizes downstream facets from stale back to derived. Direct edits promote any facet to source.

The chip palette displays clickable entries; each references a note (library or vault). Chips are not model objects — the note they reference is. Library notes ship inside the engine (their Recipe, Description, and Python are served read-only from the Python source's docstring, signature, and body). Vault notes are cohort-authored `.md` files with all three facets fully editable.

V1 action notes (`# English` + `# Python` shape) still work; the engine accepts both shapes during the ongoing V1 → V2 migration.

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

## Migration cheat sheet

If you're upgrading a vault from before v0.2.205 to v0.2.243:

1. Update plugin via BRAT to v0.2.243. Cmd-Q + relaunch.
2. Open any pre-v11.3 V2 note — backfill fires silently. Check the console for `[v113-backfill]` and `[v114-backfill]` entries.
3. Verify facet suffixes render on your V2 notes: `— source`, `— derived`, or `— stale`. Colors: full / 60%-gray / 40%-gray.
4. V1 notes (`# English` + `# Python`) continue to work unmodified.
5. Any note that says `# E--` or `# English` on a heading you thought was V2 needs migration via `/generate` from a Description body.

If your vault still has "snippet" language in prose or comments, that's fine — the engine accepts both vocabularies. The V2a v12 vocabulary sweep is a doc-side change; there's no engine-code migration attached.

## What's next (planned but not yet shipped)

- `[v113-backfill]` and `[v114-backfill]` diagnostic logs removal once v11.4 backfill is confirmed on cohort vaults.
- Cohort-facing "which command should I use?" palette cleanup (Zap line, Generate Only, Toggle Python/English, Show canonical layer — slated for removal in the drain following v0.2.243).
- Publishing-arc polish (release-notes automation, INSTALL.md refresh, cohort onboarding path).

For paradigm changes, see `~/projects/forge/docs/specs/constitution.md` (currently V2a v12).
