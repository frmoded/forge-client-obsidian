// v0.2.252 drain 2026-07-03-1000 §3.3 (L45 impl) — plugin computes a
// routing signal from `whichLayerIsCanonical` and passes it into
// `resolve_action_code` so the engine short-circuits work the plugin
// has already declared irrelevant.
//
// Motivation: driver's 2026-07-03 slow_burn smoke saw the plugin
// announce "Python-canonical, running as-is; no /generate, no
// transpile" but the engine then still parsed the Recipe (which had
// a pre-existing kwarg bug), threw ParseError, and blocked execution.
// The plugin's message misled cohort about what would run. Under L45
// the two agree: the plugin decides the canonical layer once, and
// engine's execution graph excludes the paths the plugin skipped.
//
// The signal crosses the JS ↔ pyodide boundary as a plain object:
//   { canonical_layer, skip_transpile, skip_generate }
// Field names snake_case for direct consumption inside Python.
// canonical_layer values match `CanonicalLayer` from facet-hash-core.

import type { CanonicalLayer } from './facet-hash-core.ts';

/** The wire shape passed from plugin → engine. */
export interface RoutingSignal {
  canonical_layer: CanonicalLayer;
  /** true when the engine should skip the Recipe → Python transpile
   *  step. Applies to python-canonical (Python is the source; Recipe
   *  is documentation). */
  skip_transpile: boolean;
  /** true when the engine (or plugin) should skip the /generate LLM
   *  call. Applies to python-canonical AND recipe-canonical (Recipe
   *  is already available; no Description → Recipe synthesis needed). */
  skip_generate: boolean;
}

/** Derive a RoutingSignal from a canonical-layer label.
 *
 *  Truth table:
 *
 *  | canonical    | skip_transpile | skip_generate |
 *  |--------------|----------------|---------------|
 *  | description  | false          | false         |
 *  | recipe       | false          | true          |
 *  | python       | true           | true          |
 *  | synced       | false          | true          |
 *
 *  `synced` follows the v11.4.1 constitution amendment: the note is
 *  in steady-state, so any canonical branch works; default to the
 *  Description-canonical execution graph (Recipe/Python can be
 *  regenerated from Description) but skip the /generate LLM call
 *  because Recipe already matches. */
export function routingSignalFor(canonical: CanonicalLayer): RoutingSignal {
  switch (canonical) {
    case 'description':
      return { canonical_layer: 'description', skip_transpile: false, skip_generate: false };
    case 'recipe':
      return { canonical_layer: 'recipe', skip_transpile: false, skip_generate: true };
    case 'python':
      return { canonical_layer: 'python', skip_transpile: true, skip_generate: true };
    case 'synced':
      return { canonical_layer: 'synced', skip_transpile: false, skip_generate: true };
  }
}
