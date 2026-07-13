// Drain 2570 — decide whether a successful compute's result should
// dispatch to the moda simulator sidebar or render in the Forge
// Output panel.
//
// Before drain 2570, Cmd-P `Run only` on a moda snippet produced
// `{type: "moda_sim_state", content: {tick: 300, particles: [...]}}`
// and dumped the whole JSON to Forge Output — the moda sidebar never
// opened, cohort saw an inscrutable object dump instead of animated
// particles. The Forge-button flow already dispatches correctly via
// `dispatchModaBranch`, but that only fires from `forgeSnippet`'s
// routing branch — the manual `Run only` path never reached it.
//
// This pure-core encodes the routing decision so unit tests can
// exercise every shape variant without an Obsidian fixture.

export type ModaDispatchKind = 'sidebar' | 'output';

/** Inspect a compute result payload and decide whether the moda
 *  sidebar should handle rendering (vs. the default Forge Output
 *  panel).
 *
 *  Contract:
 *  - `{type: 'moda_sim_state', content: any}` → 'sidebar'
 *  - Anything else (null, string, number, array, plain object without
 *    the type marker, object with a different type marker) → 'output'
 *
 *  The `type` marker is set by the engine's moda-domain serializer
 *  (`forge/moda/lib.py::show_simulation`) — plugin doesn't invent it.
 *
 *  Extra defensive: also accept `content` shape as required. A stub
 *  payload with `{type: 'moda_sim_state'}` but no `content` still
 *  routes to sidebar (the sidebar can render empty state); a fully
 *  missing `type` field falls through to 'output' so accidental object
 *  results (e.g., a music-domain chord dict) don't misroute.
 */
export function decideModaDispatch(result: unknown): ModaDispatchKind {
  if (result === null || result === undefined) return 'output';
  if (typeof result !== 'object') return 'output';
  if (Array.isArray(result)) return 'output';
  const type = (result as Record<string, unknown>).type;
  if (type === 'moda_sim_state') return 'sidebar';
  return 'output';
}
