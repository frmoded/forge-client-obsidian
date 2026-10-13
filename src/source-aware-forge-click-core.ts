// v0.2.201 — Phase 2 implicit locking §3.1: pure-core for the Forge-click
// source-aware routing decision. Mirrors the inline logic in
// `forgeSnippet` (main.ts) so the decision tree can be exercised by
// `node --test` without an Obsidian shim.
//
// v0.2.286 (drain 2026-07-09-1600) — renamed from
// canonical-aware-forge-click-core alongside the S9 field rename
// (`canonical_facet` → `source_facet`).
//
// The decision answers: given a V2 note's source layer (per the
// 3-layer hash state machine in facet-hash-core), what should
// Forge-click do?
//
//   - 'python'      → RUN_PYTHON_DIRECTLY (no transpile; preserves
//                     cohort hand-edits — Path Y closure)
//   - 'description' → AUTO_GENERATE_THEN_RUN (re-transpile would emit
//                     stale Python; run pipeline from Description)
//   - 'recipe'      → STANDARD_TRANSPILE (the "normal" V2 flow)
//   - 'synced'      → STANDARD_TRANSPILE (no hand-edits anywhere; safe
//                     to re-transpile)
//   - null          → STANDARD_TRANSPILE (probe failed; preserve
//                     pre-Phase-2 behavior — Forge-click stays usable
//                     even if the hash state machine has a bug)
//
// Why a pure-core rather than inlining: the previous Phase 1 dropped
// `lock: recipe-source` frontmatter in favor of an implicit machine.
// The DECISION branches off source state in two places now
// (forgeSnippet + dispatchModaBranch), and Phase 2.5 will likely add
// a third (visual indicator + status bar entry). Pulling the branch
// table into a pure-core keeps all consumers reading from the same
// source of truth.

/** The set of possible source-layer values returned by
 *  facet-hash-core.whichLayerIsSource. Pinned here so this module
 *  doesn't import from facet-hash-core (which transitively wants
 *  crypto in some build configs). */
export type SourceLayer =
  | 'description'
  | 'recipe'
  | 'python'
  | 'synced';

/** v0.2.286 back-compat alias — `SourceLayer` was named
 *  `CanonicalLayer` before the S9 field rename. External callers can
 *  continue to import the old name for one release cycle.
 *  TODO: delete in v0.2.290. */
export type CanonicalLayer = SourceLayer;

// ---------------------------------------------------------------------
// Drain 2026-08-26-1600 §2 — `ForgeClickAction` and
// `decideForgeClickAction` lived here and are RETIRED.
//
// They had ZERO production consumers. The branching in `forgeSnippet`
// has always been inline, so this function decided nothing; its enum
// went stale at F4 besides (`run_python_directly` and
// `auto_generate_then_run` both named RUNNING, which the hammer stopped
// doing in v0.2.372). Its only callers were its own unit test and
// `description-canonical-fixture-integration.test.ts` — which is I1's
// test hook, so an intuition was being guarded by a probe of dead code.
//
// `resolveForgeGesture` below is the live decision, and it ships with a
// wiring guard so this cannot recur. I1's hook now points at it plus
// the `forgeSnippet` branch that consumes it.
//
// Surfaced by drain 2026-08-26-1500; retired on forge-core's
// adjudication in 1600.
// ---------------------------------------------------------------------

// ---------------------------------------------------------------------
// Drain 2026-08-26-1500 introduced a RE-ROLL: Forge on a fully-synced `source_facet: description` note went to /generate again.
// SUPERSEDED by drain 2026-10-14-0900 §1 (driver/forge-core, on CCQA's report): the hammer never regenerates on a `synced`
// verdict. The class bug it produced: `scale_quality_quiz` logged `verdict = synced`, then `gesture = generate { probe: synced,
// stored: description }`, and an LLM rewrote a library note that was already derived. A fresh note is derived; forging it again
// transpiles (Recipe → Python via the engine, no LLM unless a slot misses). To re-derive from the Description, edit the
// Description — the probe then names it and the gesture is 'generate'.
//
// What is NOT changed: Run never re-hits the LLM; lineage caching stands.
// ---------------------------------------------------------------------

/** What the hammer should derive, once the probe and the note's own
 *  stored `source_facet` are both taken into account. */
export type ForgeGesture =
  /** Re-run /generate from the Description. Fires ONLY when the probe names the Description as the drifted facet — never on a
   *  synced note (drain 2026-10-14-0900 §1 retired the 2026-08-26-1500 re-roll). */
  | 'generate'
  /** Recipe → Python via the engine. Deterministic and cheap; zero LLM
   *  unless slots miss. */
  | 'transpile'
  /** Python is the source. There is nothing upstream to derive, so the
   *  gesture answers with a notice rather than a silent no-op. */
  | 'nothing_to_derive';

/**
 * Resolve the hammer's meaning for a V2 note.
 *
 * `probe` is `whichLayerIsSource`'s verdict — which facet drifted. When
 * nothing has drifted it returns `'synced'`, which says what is FRESH
 * but not what the note IS. That is the gap this function closes:
 * `stored` is the note's own `source_facet` frontmatter (drain 1200
 * made it a stored fact rather than an inference), so a synced note
 * still knows which derivation it is the product of.
 *
 * `stored` is consulted ONLY when the probe says `'synced'`, and only to
 * tell a Python-source note (nothing upstream to derive) from the rest.
 * A drifted facet is authoritative about itself — that is I5.
 */
export function resolveForgeGesture(
  probe: SourceLayer | null,
  stored: SourceLayer | null,
): ForgeGesture {
  if (probe === 'python') return 'nothing_to_derive';
  if (probe === 'description') return 'generate';
  if (probe === 'synced') {
    // Drain 2026-10-14-0900 §1 — a note the probe calls FRESH is never regenerated: the hammer never regenerates on `synced`,
    // whatever the stored source_facet. This supersedes the 2026-08-26-1500 re-roll (a synced `source_facet: description` note
    // went to /generate). Observed: scale_quality_quiz logged `verdict = synced`, then `gesture = generate { probe: synced,
    // stored: description }`, and an LLM rewrote a library note that was already derived. To re-derive from the Description, edit
    // it — the probe then says 'description'. Do not re-add a freshness-blind re-roll here.
    if (stored === 'python') return 'nothing_to_derive';
    return 'transpile';
  }
  // 'recipe', or a failed probe (null): transpile. Phase 1 behaviour,
  // preserved so a hash-machine bug cannot take the hammer offline.
  return 'transpile';
}

/** The notice for a note whose source is Python. §1: the gesture always
 *  answers — never a silent no-op. */
export const NOTHING_TO_DERIVE_NOTICE =
  'Python is this note’s source — edit it directly; there is '
  + 'nothing to re-derive.';
