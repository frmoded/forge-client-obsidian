// v0.2.201 — Phase 2 implicit locking §3.1: pure-core for the Forge-click
// canonical-aware routing decision. Mirrors the inline logic in
// `forgeSnippet` (main.ts) so the decision tree can be exercised by
// `node --test` without an Obsidian shim.
//
// The decision answers: given a V2 note's canonical layer (per the
// 3-layer hash state machine in facet-hash-core), what should
// Forge-click do?
//
//   - 'python'      → RUN_PYTHON_DIRECTLY (no transpile; preserves
//                     cohort hand-edits — Path Y closure)
//   - 'description' → ABORT_RECIPE_STALE (re-transpile would emit
//                     stale Python; fail fast pointing at /generate)
//   - 'recipe'      → STANDARD_TRANSPILE (the "normal" V2 flow)
//   - 'synced'      → STANDARD_TRANSPILE (no hand-edits anywhere; safe
//                     to re-transpile)
//   - null          → STANDARD_TRANSPILE (probe failed; preserve
//                     pre-Phase-2 behavior — Forge-click stays usable
//                     even if the hash state machine has a bug)
//
// Why a pure-core rather than inlining: the previous Phase 1 dropped
// `lock: recipe-canonical` frontmatter in favor of an implicit machine.
// The DECISION branches off canonical state in two places now
// (forgeSnippet + dispatchModaBranch), and Phase 2.5 will likely add
// a third (visual indicator + status bar entry). Pulling the branch
// table into a pure-core keeps all consumers reading from the same
// source of truth.

/** The set of possible canonical-layer values returned by
 *  facet-hash-core.whichLayerIsCanonical. Pinned here so this module
 *  doesn't import from facet-hash-core (which transitively wants
 *  crypto in some build configs). */
export type CanonicalLayer =
  | 'description'
  | 'recipe'
  | 'python'
  | 'synced';

/** What forgeSnippet should do, given the canonical layer. The string
 *  values are stable across Phase 2.5 + later drains so callers can
 *  switch on them in a future status-bar / decoration extension. */
export type ForgeClickAction =
  /** Run the # Python facet AS-IS. No transpile, no overwrite. The
   *  Path Y delivery: V2 cohort hand-edits to Python are preserved.
   *  Caller emits a notice indicating Python-canonical mode. */
  | 'run_python_directly'
  /** Recipe is stale (Description was hand-edited). Re-transpiling
   *  would emit stale Python. Caller surfaces an error notice pointing
   *  at "Forge: Generate Recipe from Description". */
  | 'abort_recipe_stale'
  /** Standard V2 transpile path: Recipe → Python via the engine. The
   *  default for synced / recipe-canonical / probe-failed states. */
  | 'standard_transpile';

/** Decide what Forge-click should do for a V2 note given its canonical
 *  layer.
 *
 *  Pass `null` when the probe failed (e.g. hash helpers threw). The
 *  function defaults to `standard_transpile` in that case — Phase 1
 *  behavior preserved so a hash-machine bug can't take Forge-click
 *  offline.
 */
export function decideForgeClickAction(
  canonicalLayer: CanonicalLayer | null,
): ForgeClickAction {
  if (canonicalLayer === 'python') return 'run_python_directly';
  if (canonicalLayer === 'description') return 'abort_recipe_stale';
  // 'recipe', 'synced', null → standard transpile.
  return 'standard_transpile';
}
