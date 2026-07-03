// v0.2.252 (drain 2026-07-03-1000) — english_hash is NOT stripped
// from V2 notes. v0.2.72 slot-cache-key wire contract uses
// english_hash as the hosted-endpoint cache key; stripping it
// (introduced v0.2.249 drain 0800) caused strip → write → strip churn
// on every slot-resolution path (v0.2.251 drain 0900 confirmed
// writePythonAndEnglishHash is still the live writer). Rename to
// description_hash_cache_key (or dedupe with description_hash) is a
// separate future slot-cache-key refactor drain.
//
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
   *  `hashes` lists the frontmatter keys we stamped.
   *  `derivedFromFields` (v0.2.243 V2a v11.4) lists the
   *  derived_from_source_hash keys we stamped on downstream facets
   *  during migration. */
  actions: {
    pythonSection: boolean;
    hashes: Array<'description_hash' | 'recipe_hash' | 'python_hash'>;
    derivedFromFields: Array<
      | 'recipe_derived_from_source_hash'
      | 'python_derived_from_source_hash'
    >;
    /** v0.2.248 drain 2026-07-03-0600 §3.4b — repair action for the
     *  v0.2.243 bug residue: `python_derived_from_source_hash` was
     *  stamped with recipe_hash instead of description_hash on
     *  Description-canonical forge. Detect the pattern
     *  (python_derived_from = recipe_hash && recipe_derived_from =
     *  description_hash) and rewrite python's field to description_hash.
     *  Empty when no repair fired.
     *  Distinct from `derivedFromFields` (which stamps ABSENT fields);
     *  this rewrites already-populated ones. */
    canonicalHashRepairs: Array<'python_derived_from_source_hash'>;
    /** v0.2.256 drain 2026-07-03-1200 — canonical_facet seed. When
     *  present, this drain's backfill inferred the canonical layer
     *  via upstream-wins hash comparison and wrote it to the frontmatter
     *  `canonical_facet` field so the plugin no longer has to re-infer
     *  on every read. Empty when the field was already present (idempotent)
     *  or when the note doesn't yet have hashes (fresh V2). */
    canonicalFacetSeeded: 'description' | 'recipe' | 'python' | 'synced' | null;
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
    derivedFromFields: [],
    canonicalHashRepairs: [],
    canonicalFacetSeeded: null,
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

  // v0.2.243 (V2a v11.4) — stamp derived_from_source_hash on
  // downstream facets so cohort sees "— derived" instead of
  // "— stale" post-migration. Assumes freshly-forged (option a per
  // drain 2026-07-03-0200 §4.3): downstream facets are treated as
  // if their content was auto-produced from the CURRENT description.
  // Rare stale-in-reality notes present as "— derived" incorrectly
  // until next real edit — acceptable UX cost.
  //
  // Skip when the field is already present (idempotent + respects
  // prior forge state that may have stamped a different lineage).
  const currentDescStamp = helpers.getFrontmatterField(workingBody, 'description_hash');
  if (currentDescStamp !== null) {
    const recipeStamp = helpers.getFrontmatterField(workingBody, 'recipe_derived_from_source_hash');
    if (recipeStamp === null) {
      workingBody = helpers.setFrontmatterField(
        workingBody, 'recipe_derived_from_source_hash', currentDescStamp,
      );
      actions.derivedFromFields.push('recipe_derived_from_source_hash');
    }
    const pythonStamp = helpers.getFrontmatterField(workingBody, 'python_derived_from_source_hash');
    if (pythonStamp === null) {
      workingBody = helpers.setFrontmatterField(
        workingBody, 'python_derived_from_source_hash', currentDescStamp,
      );
      actions.derivedFromFields.push('python_derived_from_source_hash');
    } else {
      // v0.2.248 drain 2026-07-03-0600 §3.4b — canonical-hash repair.
      // v0.2.243 shipped a shortcut that stamped
      // python_derived_from_source_hash with recipe_hash on
      // Description-canonical forge. Detect that bug residue and
      // rewrite to description_hash so cohort doesn't see Python
      // render "— stale" on notes they just forged. Signature:
      //   python_derived_from_source_hash === recipe_hash
      //   AND recipe_derived_from_source_hash === description_hash
      // Under these conditions, the two-hop derivation trace
      // indicates the forge went Description → Recipe → Python and
      // Python's derived-from should point at Description's hash.
      const recipeHash = helpers.getFrontmatterField(workingBody, 'recipe_hash');
      const recipeDerivedFrom = helpers.getFrontmatterField(
        workingBody, 'recipe_derived_from_source_hash');
      const looksLikeBugResidue =
        recipeHash !== null &&
        pythonStamp === recipeHash &&
        recipeDerivedFrom === currentDescStamp;
      if (looksLikeBugResidue) {
        workingBody = helpers.setFrontmatterField(
          workingBody, 'python_derived_from_source_hash', currentDescStamp,
        );
        actions.canonicalHashRepairs.push('python_derived_from_source_hash');
      }
    }
  }

  // v0.2.256 drain 2026-07-03-1200 — seed canonical_facet if absent.
  // Uses upstream-wins hash-mismatch inference against the WORKING
  // body (post any prior stamping this pipeline did). For freshly-
  // stamped notes, this settles on 'synced' since all hashes match.
  // Pre-1200 V2 notes with drift get their canonical hint recorded
  // once; the plugin's write path takes over on subsequent hand-edits.
  const storedCanonical = helpers.getFrontmatterField(workingBody, 'canonical_facet');
  if (storedCanonical === null) {
    const finalDescText = helpers.extractDescription(workingBody);
    const finalRecipeText = helpers.extractRecipeSection(workingBody) ?? '';
    const finalPythonText = helpers.extractPythonSection(workingBody) ?? '';
    const finalDescHash = await helpers.computeFacetHash(finalDescText);
    const finalRecipeHash = await helpers.computeFacetHash(finalRecipeText);
    const finalPythonHash = await helpers.computeFacetHash(finalPythonText);
    const finalStoredDesc = helpers.getFrontmatterField(workingBody, 'description_hash');
    const finalStoredRecipe = helpers.getFrontmatterField(workingBody, 'recipe_hash');
    const finalStoredPython = helpers.getFrontmatterField(workingBody, 'python_hash');
    const dMismatch = finalStoredDesc !== null && finalStoredDesc !== finalDescHash;
    const rMismatch = finalStoredRecipe !== null && finalStoredRecipe !== finalRecipeHash;
    const pMismatch = finalStoredPython !== null && finalStoredPython !== finalPythonHash;
    let seed: 'description' | 'recipe' | 'python' | 'synced';
    // Upstream-wins tiebreak per driver Choice 3.
    if (dMismatch) seed = 'description';
    else if (rMismatch) seed = 'recipe';
    else if (pMismatch) seed = 'python';
    else seed = 'synced';
    workingBody = helpers.setFrontmatterField(workingBody, 'canonical_facet', seed);
    actions.canonicalFacetSeeded = seed;
  }

  const changed = actions.pythonSection
    || actions.hashes.length > 0
    || actions.derivedFromFields.length > 0
    || actions.canonicalHashRepairs.length > 0
    || actions.canonicalFacetSeeded !== null;
  return {
    changed,
    newBody: changed ? workingBody : body,
    actions,
  };
}
