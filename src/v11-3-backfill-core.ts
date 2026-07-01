// v0.2.240 — Constitution V2a v11.3 backfill helper. Drain
// 2026-07-02-2300: pre-v0.2.239 V2 notes lack the frontmatter hashes
// (description_hash / recipe_hash / python_hash) that S9's state
// machine depends on. Some also lack the `# Python` section entirely
// (S8 v11.3 clause 3 mandates it). Result: cohort opening an existing
// V2 note sees Python "not editable" (no section on disk) and Recipe
// edits don't trigger the "— reference" suffix (no stored hash to
// compare against; whichLayerIsCanonical returns 'synced' by
// default when hashes are absent).
//
// This pure-core backfills BOTH:
//   1. Inserts `# Python` section with `def compute(context): return None`
//      when missing.
//   2. Stamps every missing hash at its current content value so
//      subsequent edits drive the state machine normally.
//
// Idempotent: subsequent calls with a fully-populated note return
// `{ changed: false }`. Testable in isolation via injected helpers
// (extract*, setFrontmatterField, replacePythonSection, computeFacetHash).

export interface V113BackfillHelpers {
  extractDescription: (body: string) => string;
  extractRecipeSection: (body: string) => string | null;
  extractPythonSection: (body: string) => string | null;
  getFrontmatterField: (body: string, key: string) => string | null;
  setFrontmatterField: (body: string, key: string, value: string) => string;
  replacePythonSection: (body: string, pythonSrc: string | null) => string;
  computeFacetHash: (content: string) => Promise<string>;
}

export interface V113BackfillResult {
  changed: boolean;
  /** New body when `changed === true`; unchanged input otherwise. */
  newBody: string;
  /** What was backfilled — surfaced so callers can log/notify.
   *  `pythonSection` true → we inserted the missing `# Python` block.
   *  `hashes` lists the frontmatter keys we stamped. */
  actions: {
    pythonSection: boolean;
    hashes: Array<'description_hash' | 'recipe_hash' | 'python_hash'>;
  };
}

/** The stub Python body inserted when `# Python` is missing per S8
 *  v11.3 clause 3. Cohort can edit it freely once visible. */
export const DEFAULT_PYTHON_STUB = 'def compute(context):\n    return None';

/** Backfill a V2 note to the v11.3 uniform-visibility contract shape.
 *
 *  Pipeline:
 *   1. If `# Python` section absent → insert stub via replacePythonSection.
 *   2. Compute current content hashes for all three facets against the
 *      (possibly Python-augmented) body.
 *   3. For each frontmatter hash key that's absent → stamp at current
 *      content hash via setFrontmatterField.
 *
 *  When nothing was missing, returns `{ changed: false, newBody: body }`
 *  and empty actions.
 *
 *  Caller is responsible for:
 *    - Deciding whether this note qualifies (isV2Shape + `type: action`).
 *    - Persisting `newBody` back to disk when `changed`.
 *    - Surfacing the actions via forgeNotice / equivalent. */
export async function backfillV113Shape(
  body: string,
  helpers: V113BackfillHelpers,
): Promise<V113BackfillResult> {
  const actions: V113BackfillResult['actions'] = {
    pythonSection: false,
    hashes: [],
  };

  // Step 1: ensure # Python section exists on disk.
  let workingBody = body;
  const existingPython = helpers.extractPythonSection(body);
  if (existingPython === null) {
    workingBody = helpers.replacePythonSection(body, DEFAULT_PYTHON_STUB);
    actions.pythonSection = true;
  }

  // Step 2: compute current facet hashes against the working body.
  const descText = helpers.extractDescription(workingBody);
  const recipeText = helpers.extractRecipeSection(workingBody) ?? '';
  const pythonText = helpers.extractPythonSection(workingBody) ?? '';
  const currentDescHash = await helpers.computeFacetHash(descText);
  const currentRecipeHash = await helpers.computeFacetHash(recipeText);
  const currentPythonHash = await helpers.computeFacetHash(pythonText);

  // Step 3: stamp any missing hashes at current values.
  const hashPairs: Array<{
    key: 'description_hash' | 'recipe_hash' | 'python_hash';
    value: string;
  }> = [
    { key: 'description_hash', value: currentDescHash },
    { key: 'recipe_hash', value: currentRecipeHash },
    { key: 'python_hash', value: currentPythonHash },
  ];

  for (const { key, value } of hashPairs) {
    const stored = helpers.getFrontmatterField(workingBody, key);
    if (stored === null) {
      workingBody = helpers.setFrontmatterField(workingBody, key, value);
      actions.hashes.push(key);
    }
  }

  const changed = actions.pythonSection || actions.hashes.length > 0;
  return {
    changed,
    newBody: changed ? workingBody : body,
    actions,
  };
}
