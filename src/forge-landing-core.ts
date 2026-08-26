// Drain 2026-08-25-2100 (plan F4) — where a Forge-click LANDS.
//
// Before this drain the toolbar ▶ did both jobs at once: derive the
// facets AND execute the result. F4 splits them, because building and
// playing are two different gestures and the UI already wanted the
// line drawn there. Forge derives and hands you a primed panel; Run is
// the panel's button and nothing else.
//
// WHY A PURE CORE FOR THREE BOOLEANS. `run` is the whole point. It is
// the invariant this drain exists to establish — "forging never
// executes" — and an invariant that lives only as the absence of a call
// site is one refactor away from coming back. Here it is a value a test
// can assert over every outcome, including outcomes added later.
//
// NOTE ON I1. `intuitions.md`'s I1 says a Forge-click on a
// Description-canonical note runs /generate, then transpile, "then
// execute Python." This module deliberately makes that last clause
// false. The driver approved the split (2026-08-25, option (a)); I1
// needs amending rather than silently violating, and the FEEDBACK's
// retroactive-intuition section carries the proposed wording.

/** What the derive half of a Forge-click concluded. */
export type ForgeOutcome =
  /** Facets derived and agree — the note is ready to run. */
  | 'synced'
  /** The pipeline refused (LLM rejection, parse failure, closure/free
   *  -variable belt). Nothing new was written. */
  | 'rejected'
  /** Nothing to derive — already current, or the note is
   *  Python-canonical and runs as-is. */
  | 'no-op';

export interface ForgeLanding {
  /** Open the Forge panel if it is closed (F1's "Open Forge panel"). */
  openPanel: boolean;
  /** Bind the Inputs strip to the forged note so its inputs are ready. */
  primeStrip: boolean;
  /** Execute the snippet. ALWAYS false after F4 — see the module note. */
  run: boolean;
}

/**
 * Where a completed Forge-click leaves the user.
 *
 * A rejection still opens and primes the panel. That is deliberate: the
 * rejection card renders IN the panel (`appendForgeError` →
 * `getOutputView`), so a closed panel would swallow the only
 * explanation the cohort gets. The strip binds to a note whose Recipe
 * did not change, which is honest — the previous Recipe is preserved
 * and is what a Run would execute.
 */
export function decideForgeLanding(outcome: ForgeOutcome): ForgeLanding {
  switch (outcome) {
    case 'synced':
    case 'no-op':
    case 'rejected':
      return { openPanel: true, primeStrip: true, run: false };
  }
}

/** Every outcome the switch above must stay total over. Exported so the
 *  test can iterate the real list rather than a copy of it — a new
 *  outcome that forgets `run: false` fails without anyone remembering
 *  to add a case. */
export const FORGE_OUTCOMES: readonly ForgeOutcome[] = [
  'synced', 'rejected', 'no-op',
];
