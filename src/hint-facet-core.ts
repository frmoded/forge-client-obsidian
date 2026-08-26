// Drain 2026-08-24-2370 — one door for the facet a hint points at.
//
// CCQA check-5, three times on v0.2.366: a Description-canonical note
// raising ZeroDivisionError was told "Fix: Open the note's # Python
// section…".
//
// The wording was never the problem, and neither was the error class.
// The engine wraps runtime exceptions, so a ZeroDivisionError arrives
// as `SnippetExecError` and DOES hit the facet-aware rule in
// `classifyForgeError`. That rule only produces the facet-specific
// hint when `sourceFacet` is supplied — and two run entry points never
// supplied one:
//
//   main.ts  "Run only (active snippet)"  — `this.runSnippet()`
//   main.ts  THE INPUTS STRIP's ▶         — `runSnippet(…, undefined, …)`
//
// UPDATED 2026-08-25 (drain 2100 / plan F4): of those two, only the
// strip still exists — "Run only" is retired and the toolbar button no
// longer runs at all. The strip is now the SOLE run path, and it still
// passes no facet, so this derivation is the only thing standing
// between the cohort and the generic hint. It went from a belt to the
// whole trouser.
//
// The strip is the one that bit. CCQA's note declares a `scale` input,
// so the strip is precisely how such a note gets run: drain 0920 and
// 1700's approved wording was unreachable from the button the cohort
// actually presses.
//
// THE SHAPE OF THE REPAIR — the same one drain 2330 arrived at from
// the other direction. Threading a value through every call site works
// until someone adds a call site, and the failure is silent. So derive
// it once, at the door every run already passes through, and let the
// call sites that genuinely know keep overriding.
//
// DISPLAY ONLY. The derived value words the error; it does NOT become
// the engine's routing directive. `engineRoutingLayer(canonicalLayer)`
// keeps reading the caller's explicit value, so this drain changes
// what the cohort READS and nothing about what runs.

export type SourceFacet = 'description' | 'recipe' | 'python' | 'synced';

export interface HintFacetDeps {
  /** True when the body has enough V2 structure for the source-facet
   *  probe to mean anything. */
  isV2RoutableShape: (body: string) => boolean;
  /** The existing canonical-layer probe. */
  whichLayerIsSource: (body: string) => Promise<SourceFacet>;
}

/**
 * Which facet an error hint should point at.
 *
 * `explicit` always wins — a caller that knows (the python-canonical
 * branch passes `'python'`, the Description-canonical branch passes
 * its own verdict) is never second-guessed.
 *
 * Otherwise the facet is derived from the note. A V1 or free-English
 * note yields `undefined`, deliberately: drain 1600 declined to widen
 * a variable's scope to satisfy a hint on that tail, calling
 * `undefined` "the honest value for facet unknown", and it still is —
 * a note with no facets has no source facet, and the hint table's
 * fallback exists for exactly that. What was never honest is saying
 * "unknown" about a V2 note, where the answer is one probe away.
 *
 * NOTHING HERE THROWS. A hint is a nicety and a run is not, so a
 * failing probe degrades to `undefined` — the generic wording — rather
 * than taking the run down or guessing a facet.
 */
export async function resolveHintFacet(
  explicit: SourceFacet | undefined,
  body: string,
  deps: HintFacetDeps,
): Promise<SourceFacet | undefined> {
  if (explicit !== undefined) return explicit;
  try {
    if (!deps.isV2RoutableShape(body)) return undefined;
    const derived = await deps.whichLayerIsSource(body);
    return derived ?? undefined;
  } catch (e) {
    console.error('resolveHintFacet: source-facet probe failed', e);
    return undefined;
  }
}
