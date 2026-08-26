// Drain 2026-08-24-2330 — one door for the engine's routing signal.
//
// THE BUG THIS ENDS. `runSnippet(errorPrefix, canonicalLayer, file)`
// takes the note's source facet and uses it for two unrelated things:
//
//   1. a DISPLAY HINT — `classifyForgeError({ sourceFacet })` words the
//      error for the facet the cohort actually authored (drain 0920);
//   2. a ROUTING DIRECTIVE — it goes on the wire to the engine as
//      `canonical_layer`, where `resolve_action_code` branches on it.
//
// Drain 1600 threaded the argument into the Description-canonical
// branch's run call for reason (1) — that call site had always passed
// `undefined`, so `classifyForgeError` saw nothing and fell back to
// generic wording on the one branch that is Description-canonical BY
// CONSTRUCTION. A correct fix for the message. But it also handed the
// engine a routing directive it had never received from there, and the
// engine's answer to `'description'` is:
//
//   if layer == "description":
//     return None            # executor.py:1006
//
// No code, on the run path. `exec_python`'s empty-code guard then
// raised `Empty or missing Python code for 'authoring/random_note'` —
// the driver's incident, every run, on v0.2.366.
//
// WHY DROPPING 'description' IS THE RIGHT FIX AND NOT A PAPER-OVER.
// The engine branch documents its own purpose as serving TRANSITIVE
// `context.compute("X")` calls, where a Description-source callee's
// Recipe is stale by definition so the caller should route to
// /generate. But the transitive path (executor.py:610) passes no
// `canonical_layer` at all, so it never reaches that branch. On the
// top-level run path the premise is inverted: the two-hop auto-forge
// has just derived the Recipe FROM that Description, so the Recipe is
// the freshest thing on the note. `'description'` is therefore never a
// meaningful routing directive from a run call — it can only ever
// produce the empty-code error.
//
// `'python'` is a different matter and stays: it tells the engine to
// run the `# Python` facet without parsing a Recipe that may be a
// stub or documentation (executor.py:994, v0.2.252). That branch is
// live, correct, and load-bearing.
//
// THE SHAPE OF THE LESSON. Two facts with different meanings rode in
// one argument, so a change made for one silently changed the other.
// The repair is not vigilance at the call sites — the next person
// threading a facet would reintroduce it. It is that the value going
// ON THE WIRE passes through here, once, and the display keeps the
// unmodified facet.

/** A note's source facet, as `whichLayerIsSource` reports it. */
export type SourceFacet = 'description' | 'recipe' | 'python' | 'synced';

/**
 * The value safe to send to the engine as `canonical_layer`.
 *
 * Pass the note's source facet; get back what the ENGINE should be
 * told. `'description'` becomes `undefined` (see the header — it can
 * only make the engine return no code); everything else is passed
 * through untouched.
 *
 * Callers keep using the raw facet for anything cohort-facing. This is
 * only about the wire.
 */
export function engineRoutingLayer(
  sourceFacet: SourceFacet | undefined | null,
): SourceFacet | undefined {
  if (sourceFacet === null || sourceFacet === undefined) return undefined;
  if (sourceFacet === 'description') return undefined;
  return sourceFacet;
}

/**
 * Drain 2026-08-24-2390 — which facet the ENGINE should be told, given
 * what the caller passed and what the note actually is.
 *
 * THE GAP THIS CLOSES, measured rather than reasoned about. Drain 2370
 * derived a facet at `runSnippet`'s shared door and used it for the
 * error hint only, leaving routing to the caller's explicit value. Two
 * launch paths pass none — the Inputs strip's ▶ and Cmd-P "Run only" —
 * so on a note whose Python returns 42 and whose Recipe returns 7
 * (drain 2100 / plan F4 has since retired "Run only" AND stopped the
 * toolbar button running, leaving the strip as the only launch path;
 * the table below is the historical measurement that motivated this
 * module, not a description of today's surfaces):
 *
 *   toolbar ▶ (passes 'python')  ->  42   the hand-edited Python
 *   strip ▶   (passes nothing)   ->   7   the Recipe
 *   Cmd-P     (passes nothing)   ->   7   the Recipe
 *
 * Same note, different button, different answer — a cohort member's
 * edits silently ignored depending on where they clicked. Across the
 * shipped vaults, 3 of the 4 notes declaring `source_facet: python`
 * behave this way, and for all three the no-layer path raises
 * SlotCacheMissError, so the strip fires an LLM call and then runs
 * resolved Recipe code in place of the hand-edited Python.
 *
 * There is no engine-side backstop: `resolve_action_code` reads
 * `source_facet` from frontmatter ZERO times. Its only frontmatter
 * signal is `edit_mode: python`, and nothing in the plugin writes that
 * — none of the four shipped notes carries it.
 *
 * ONLY `'python'` IS PROMOTED. That is the facet whose short-circuit
 * exists to protect hand-authored code from a Recipe that may be stale
 * or unparseable. `'recipe'` and `'synced'` are ignored by the engine
 * today, so promoting them would be a behaviour change with no stated
 * purpose. `'description'` is never promoted — see `engineRoutingLayer`
 * above; drain 2350 deleted the engine branch, but the client belt
 * stays, because a plugin that stopped filtering would be relying on an
 * engine version it does not itself guarantee.
 *
 * An explicit caller value always wins: the branches that know their
 * own facet decided it deliberately.
 */
export function routingFacetFor(
  explicit: SourceFacet | undefined,
  derived: SourceFacet | undefined,
): SourceFacet | undefined {
  if (explicit !== undefined) return explicit;
  return derived === 'python' ? 'python' : undefined;
}
