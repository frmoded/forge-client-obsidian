// v0.2.126 — pure-core: given a RoutingResult from
// routeActionCodeRegen, decide the moda branch's next step.
//
// Driver smoke against v0.2.124 surfaced the bug: Forge-click on
// forge-moda/simulation.md opens the simulator tab but compute
// uses STALE Python (the engine's resolve_action_code returns the
// cached Python because the snippet has no english_hash). Edits
// to # English don't propagate.
//
// Fix: re-transpile English → Python BEFORE opening the iframe.
// This pure-core handles the decision shape; main.ts handles the
// I/O (writeSourcePythonBack, Notice, openModaView).
//
// Three outcomes:
//
// - 'write-and-open':  E-- succeeded. # Python facet must be
//                      written back from the regen result, THEN
//                      iframe opens. The transpiled code is in
//                      `regenResult.code`.
//
// - 'open':            /generate succeeded. generate() ALREADY
//                      wrote the new Python to disk + MEMFS (per
//                      v0.2.121 generate() semantics). No
//                      additional write needed; just open iframe.
//
// - 'notice-and-open': Regen failed. Surface the notice text so
//                      the user knows English-to-Python didn't
//                      propagate, but still open the iframe so
//                      the user can interact with the simulation
//                      (debugging stale state). Per v0326 §2.4.
//
// All three outcomes open the iframe at the end. The split is
// purely about what happens BEFORE the iframe opens.

import type { RoutingResult } from './route-action-code-regen-core.ts';

export type ModaDispatchOutcome =
  | { kind: 'write-and-open'; code: string }
  | { kind: 'open' }
  | { kind: 'notice-and-open'; notice: string };

/** Pure decision for the moda branch's next step. No side
 *  effects; no Obsidian API access. Caller supplies the
 *  RoutingResult from routeActionCodeRegen. */
export function decideModaDispatchOutcome(
  regenResult: RoutingResult,
): ModaDispatchOutcome {
  if (regenResult.ok === true) {
    if (regenResult.via === 'e--') {
      return { kind: 'write-and-open', code: regenResult.code };
    }
    // 'generate' path: generate() already wrote python to disk;
    // nothing for the moda branch to write.
    return { kind: 'open' };
  }
  // v0.2.230 — explicit `=== true` (vs truthy `regenResult.ok`) helps
  // TS narrow `regenResult` to the RoutingFailure union here, exposing
  // `.reason` and `.message` (both present on every failure variant).
  //
  // All failure shapes (no-token / http-error / engine-error) map
  // to notice-and-open. The notice text comes from the routing
  // failure's `message` (already user-formatted by the router) so
  // the user sees the specific reason: e.g. "Set a Transpile
  // Service Token in Forge settings to generate Python from
  // English." for no-token, the HTTP status for http-error, etc.
  return {
    kind: 'notice-and-open',
    notice: `Forge: English-to-Python re-transpile failed (${regenResult.reason}); simulation will run with current Python. ${regenResult.message}`,
  };
}
