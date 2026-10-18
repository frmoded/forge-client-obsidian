// Drain 2026-10-18-1200 §2 — restamp a shipped library note to exactly what the plugin would write, by asking the plugin.
//
// A bundled library note must ship "fully derived": the `# Python` the engine would produce plus every hash and lineage stamp the plugin
// would add the first time anyone opens it or presses Run (scripts/check-open-time-writes.mjs is the gate that holds the line). When the
// plugin's writers change what they stamp (drain 2026-10-15-2100 re-rooted the lineage of recipe-source notes), every shipped note that
// carries the old stamps goes red at once. The fix is at the SOURCE vault, and the honest way to produce it is the plugin's own decision
// functions, run in the order the plugin runs them, until the note stops changing:
//
//   1. the file-open backfill        src/v11-3-backfill-core.ts  backfillV113Shape   (an AUTHORING vault is not library-gated)
//   2. the layout-ready sweep        src/open-seed-core.ts       planOpenSeed        (applied the way main.ts applies it)
//   3. the write that follows Run    src/python-write-back-core.ts applyPythonWriteBack  (given the note's OWN Python)
//
// What it does NOT do: it never transpiles. It cannot tell whether the shipped `# Python` equals the engine's output for the Recipe; that
// is shipped-note-read-only.test.ts's job (it runs the real engine). It touches stamps only — Description, Recipe and Python text stay
// byte-for-byte — and refuses (throws) a note that does not settle, rather than leaving it half-stamped.
import { backfillV113Shape } from "../src/v11-3-backfill-core.ts";
import { planOpenSeed } from "../src/open-seed-core.ts";
import { applyPythonWriteBack } from "../src/python-write-back-core.ts";
import { computeFacetHash, whichLayerIsSource } from "../src/facet-hash-core.ts";
import {
  extractDescription, extractPythonSection, extractRecipeSection, getFrontmatterField, isV2Shape,
  removeFrontmatterField, replacePythonSection, setFrontmatterField,
} from "../src/v2-note-core.ts";

const asString = (b, k) => { const v = getFrontmatterField(b, k); return typeof v === "string" ? v : null; };
const helpers = {
  extractDescription, extractRecipeSection, extractPythonSection,
  getFrontmatterField: asString,
  setFrontmatterField, removeFrontmatterField, replacePythonSection, computeFacetHash,
};

async function onePass(body, backfill) {
  let next = body;
  // 1. open: the backfill
  const bf = await backfill(next);
  if (bf.changed) next = bf.newBody;
  // 2. open: the sweep, applied as main.ts applies it (source_facet, the legacy-name drop, the two v11.6 parent hashes)
  const seed = await planOpenSeed(next, { ...helpers, getFrontmatterField });
  if (seed.write) {
    if (seed.setSourceFacet !== null) next = setFrontmatterField(next, "source_facet", seed.setSourceFacet);
    next = removeFrontmatterField(next, "canonical_facet");
    if (seed.seedRecipeParent !== null) next = setFrontmatterField(next, "recipe_derived_from_description_hash", seed.seedRecipeParent);
    if (seed.seedPythonParent !== null) next = setFrontmatterField(next, "python_derived_from_recipe_hash", seed.seedPythonParent);
  }
  // 3. Run: the writer, given the note's own Python
  const python = extractPythonSection(next);
  if (python !== null) {
    next = applyPythonWriteBack(next, {
      python,
      pythonHash: await computeFacetHash(python),
      englishHash: null, // V2 notes carry no `# English` facet: the writer writes none (and heals the empty-SHA remnant)
      sourceLayer: await whichLayerIsSource(next, {
        extractDescription, extractRecipeSection, extractPythonSection, getFrontmatterField: asString,
      }),
      resolvedSlots: null,
    });
  }
  return next;
}

/** `{ changed, next }`. A note the plugin's writers skip (not `type: action`, or not V2 shape) comes back untouched. */
/** `backfill` is injectable ONLY so a test can isolate step 2: today the backfill's decisions are a superset of the sweep's (the same
 *  note the gate's own core documents), so the sweep is otherwise unreachable from the outside. */
export async function restampNote(body, { maxPasses = 6, backfill = (b) => backfillV113Shape(b, helpers) } = {}) {
  if (asString(body, "type") !== "action" || !isV2Shape(body)) return { changed: false, next: body };
  let current = body;
  for (let pass = 0; pass < maxPasses; pass++) {
    const next = await onePass(current, backfill);
    if (next === current) return { changed: current !== body, next: current };
    current = next;
  }
  throw new Error(`restampNote: the note did not reach a fixed point in ${maxPasses} pass(es) — the plugin's writers keep changing it`);
}
