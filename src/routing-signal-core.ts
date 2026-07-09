// v0.2.252 drain 2026-07-03-1000 §3.3 (L45 impl) — plugin computes a
// routing signal from `whichLayerIsSource` and passes it into
// `resolve_action_code` so the engine short-circuits work the plugin
// has already declared irrelevant.
//
// Motivation: driver's 2026-07-03 slow_burn smoke saw the plugin
// announce "Python is source, running as-is; no /generate, no
// transpile" but the engine then still parsed the Recipe (which had
// a pre-existing kwarg bug), threw ParseError, and blocked execution.
// The plugin's message misled cohort about what would run. Under L45
// the two agree: the plugin decides the source layer once, and
// engine's execution graph excludes the paths the plugin skipped.
//
// The signal crosses the JS ↔ pyodide boundary as a plain object:
//   { source_layer, skip_transpile, skip_generate }
// Field names snake_case for direct consumption inside Python.
// source_layer values match `SourceLayer` from facet-hash-core.
//
// v0.2.286 (drain 2026-07-09-1600) — renamed `canonical_layer` →
// `source_layer` alongside the S9 field rename. The engine accepts
// both kwargs during the transition. To keep the JS↔pyodide bridge
// simple we send only the new name; engine handles both.

import type { SourceLayer } from './facet-hash-core.ts';

/** The wire shape passed from plugin → engine. */
export interface RoutingSignal {
  source_layer: SourceLayer;
  /** true when the engine should skip the Recipe → Python transpile
   *  step. Applies to python-source (Python is the source; Recipe
   *  is documentation). */
  skip_transpile: boolean;
  /** true when the engine (or plugin) should skip the /generate LLM
   *  call. Applies to python-source AND recipe-source (Recipe
   *  is already available; no Description → Recipe synthesis needed). */
  skip_generate: boolean;
}

/** Derive a RoutingSignal from a source-layer label.
 *
 *  Truth table:
 *
 *  | source       | skip_transpile | skip_generate |
 *  |--------------|----------------|---------------|
 *  | description  | false          | false         |
 *  | recipe       | false          | true          |
 *  | python       | true           | true          |
 *  | synced       | false          | true          |
 *
 *  `synced` follows the v11.4.1 constitution amendment: the note is
 *  in steady-state, so any source branch works; default to the
 *  Description-source execution graph (Recipe/Python can be
 *  regenerated from Description) but skip the /generate LLM call
 *  because Recipe already matches. */
export function routingSignalFor(source: SourceLayer): RoutingSignal {
  switch (source) {
    case 'description':
      return { source_layer: 'description', skip_transpile: false, skip_generate: false };
    case 'recipe':
      return { source_layer: 'recipe', skip_transpile: false, skip_generate: true };
    case 'python':
      return { source_layer: 'python', skip_transpile: true, skip_generate: true };
    case 'synced':
      return { source_layer: 'synced', skip_transpile: false, skip_generate: true };
  }
}
