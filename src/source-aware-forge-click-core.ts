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
// Drain 2026-08-26-1500 — the RE-ROLL gesture.
//
// Driver adjudication: "each Description→Recipe transpiling should be
// re-generatable by the LLM on demand — possibly, not
// deterministically." Before this drain, the hammer on a fully-synced
// note derived nothing: `whichLayerIsSource` returns 'synced' when every
// hash matches, 'synced' falls through to the transpile tail, and a
// fresh roll required faking a Description edit.
//
// Post-F4 the semantics are clean and the driver chose them:
// **Forge means derive; on a synced note it means derive AGAIN.**
//
// CACHE POLICY IS NOT WEAKENED BY THIS. Run still never re-hits the LLM;
// lineage caching stands untouched. ONLY the explicit Forge GESTURE
// re-derives. If you are reading this because a synced note "wastes" an
// LLM call on Forge — that is the feature, deliberately, per drain
// 2026-08-26-1500. Do not re-add a freshness short-circuit here.
// ---------------------------------------------------------------------

/** What the hammer should derive, once the probe and the note's own
 *  stored `source_facet` are both taken into account. */
export type ForgeGesture =
  /** Re-run /generate from the Description. Fires on a stale
   *  Description-canonical note AND on a synced one whose stored source
   *  is `description` — the re-roll. */
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
 * `stored` is consulted ONLY when the probe says `'synced'`. A drifted
 * facet is authoritative about itself — that is I5, and this drain does
 * not touch it.
 */
export function resolveForgeGesture(
  probe: SourceLayer | null,
  stored: SourceLayer | null,
): ForgeGesture {
  if (probe === 'python') return 'nothing_to_derive';
  if (probe === 'description') return 'generate';
  if (probe === 'synced') {
    // The re-roll. A synced note derives AGAIN, along whichever edge
    // produced it.
    if (stored === 'description') return 'generate';
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
