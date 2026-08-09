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
// compare against; whichLayerIsSource returns 'synced' by
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
  /** v0.2.286 — remove a frontmatter field. Used to migrate legacy
   *  `canonical_facet` → `source_facet`: after copying the value into
   *  `source_facet`, the caller deletes `canonical_facet`. Optional so
   *  callers on older helper harnesses still typecheck; when absent the
   *  legacy field survives until the runtime plugin flushes it. */
  removeFrontmatterField?: (body: string, key: string) => string;
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
    /** v0.2.264 drain 2026-07-03-1500 — v11.6 parent-hash seed. When
     *  present, this drain's backfill migrated from v11.5's ambiguous
     *  `_source_hash` fields to v11.6's explicit immediate-parent-hash
     *  fields. Rules per §2.3 of drain 1500:
     *  - recipe_derived_from_description_hash seeded when
     *    recipe_derived_from_source_hash === description_hash.
     *  - python_derived_from_recipe_hash seeded when
     *    python_derived_from_source_hash === recipe_hash (direct match).
     *  - Two-hop Description-canonical case (python_derived_from_source_hash
     *    === description_hash): LEAVE ABSENT per CW-1500-B safe default;
     *    Python renders `— derived from Recipe, out of date` until cohort
     *    re-forges. */
    derivedFromParentSeeded: Array<
      | 'recipe_derived_from_description_hash'
      | 'python_derived_from_recipe_hash'
    >;
    /** Drain 2026-08-09-0400 — stub-sync repair. Detects the residue
     *  the pre-fix backfill left on notes born without a `# Python`
     *  section: body still EXACTLY DEFAULT_PYTHON_STUB, source_facet
     *  'synced', and no v11.6 python parent-hash (a real forge would
     *  have stamped it). Rewrites source_facet to the honest seed
     *  ('recipe' when a Recipe body exists, else 'description') and
     *  removes the fabricated python_derived_from_source_hash.
     *  Empty when no repair fired. */
    stubSyncRepairs: Array<'source_facet'>;
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
    derivedFromParentSeeded: [],
    stubSyncRepairs: [],
  };

  // Step 1: ensure # Python section exists on disk.
  let workingBody = body;
  const existingPython = helpers.extractPythonSection(body);
  if (existingPython === null) {
    workingBody = helpers.replacePythonSection(body, DEFAULT_PYTHON_STUB);
    actions.pythonSection = true;
  }

  // Step 2: compute current facet hashes against the working body.
  //
  // CW-generate-persist-path-fix-backfill-and-write (drain
  // 2026-07-29-2230) Option 1 — `rawRecipe` keeps the null-vs-empty
  // distinction that the `?? ''` coalesce used to throw away. A note
  // with NO `# Recipe` heading (null) is categorically different from
  // one with an empty Recipe body (''): the first has no Recipe facet
  // at all, so there is no lineage to stamp.
  const rawRecipe = helpers.extractRecipeSection(workingBody);
  const hasRecipeFacet = rawRecipe !== null;
  const descText = helpers.extractDescription(workingBody);
  const recipeText = rawRecipe ?? '';
  const pythonText = helpers.extractPythonSection(workingBody) ?? '';
  const currentDescHash = await helpers.computeFacetHash(descText);
  const currentRecipeHash = await helpers.computeFacetHash(recipeText);
  const currentPythonHash = await helpers.computeFacetHash(pythonText);

  // Step 3: stamp any missing hashes at current values.
  //
  // CW-2230 Option 1 — `recipe_hash` is omitted entirely when the note
  // has no `# Recipe` heading. Pre-fix the backfill stamped it at
  // `computeFacetHash('')` (the empty-string SHA e3b0c442…), which
  // asserted "the Recipe facet is in sync with its stored hash" for a
  // facet that does not exist. That lie is what made drain 1305's
  // `noStoredHashes` routing gate unreachable and wedged fresh
  // wizard-authored notes into the dialect='python' /generate path
  // (drain 2100 investigation, hop 2). Absent is the honest state; the
  // hash gets stamped for real the first time a Recipe is written.
  const hashPairs: Array<{
    key: 'description_hash' | 'recipe_hash' | 'python_hash';
    value: string;
  }> = [
    { key: 'description_hash', value: currentDescHash },
    ...(hasRecipeFacet
      ? [{ key: 'recipe_hash' as const, value: currentRecipeHash }]
      : []),
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
      // Drain 2026-08-09-0400 — never record a derivation for the
      // backfill's own stub: stamping "derived from description" for a
      // body the backfill manufactured is the lie that produced the
      // stub+synced pattern (wizard sweep 2026-08-09-0348). Guard on
      // the BODY (not on actions.pythonSection) so the skip is stable
      // across runs — an insertion-flag guard would let the SECOND
      // file-open stamp the lie and churn the file. Same honesty
      // principle as CW-2230's absent-recipe_hash: absent is the
      // honest state; the field gets stamped for real on first actual
      // forge. Migration-cohort notes whose Python EXISTED (real
      // content) keep the v0.2.243 assume-freshly-forged stamp.
      if (pythonText !== DEFAULT_PYTHON_STUB) {
        workingBody = helpers.setFrontmatterField(
          workingBody, 'python_derived_from_source_hash', currentDescStamp,
        );
        actions.derivedFromFields.push('python_derived_from_source_hash');
      }
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

  // v0.2.256 drain 2026-07-03-1200 — seed source_facet if absent.
  // Uses upstream-wins hash-mismatch inference against the WORKING
  // body (post any prior stamping this pipeline did). For freshly-
  // stamped notes, this settles on 'synced' since all hashes match.
  // Pre-1200 V2 notes with drift get their source hint recorded
  // once; the plugin's write path takes over on subsequent hand-edits.
  //
  // v0.2.286 drain 2026-07-09-1600 — field renamed from
  // `canonical_facet` → `source_facet`. Legacy notes carrying only the
  // old name migrate here: we detect it, keep its value, and write the
  // new field name (deleting the old one via processFrontMatter's set).
  const existingSource = helpers.getFrontmatterField(workingBody, 'source_facet');
  const existingCanonical = helpers.getFrontmatterField(workingBody, 'canonical_facet');
  // If ONLY the legacy name is present, migrate it: write source_facet
  // with the same value + delete canonical_facet. Counts as a seed
  // action so the caller sees the note as "changed."
  if (existingSource === null && existingCanonical !== null) {
    workingBody = helpers.setFrontmatterField(workingBody, 'source_facet', existingCanonical);
    if (helpers.removeFrontmatterField) {
      workingBody = helpers.removeFrontmatterField(workingBody, 'canonical_facet');
    }
    actions.canonicalFacetSeeded = existingCanonical as
      'description' | 'recipe' | 'python' | 'synced';
  } else if (existingSource === null && existingCanonical === null) {
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
    // CW-generate-persist-path-fix-backfill-and-write (drain
    // 2026-07-29-2230) Option 1 — content-based seed for the
    // no-Recipe case, BEFORE the drift tiebreak. A note with a
    // Description body and no Recipe body cannot honestly be
    // 'synced': there is no Recipe facet for the other facets to be
    // in sync with, and Python cannot have been derived from it.
    // Description is the only facet with content, so Description is
    // the source. Pre-fix this fell through to `seed = 'synced'`
    // (all three mismatch checks false, because step 3 had just
    // stamped every hash at its current value) — the seed that
    // wedged fresh wizard notes out of the Description-canonical
    // branch (drain 2100 investigation, hop 2).
    const noRecipeBody = finalRecipeText.trim().length === 0;
    const hasDescBody = finalDescText.trim().length > 0;
    // Upstream-wins tiebreak per driver Choice 3.
    //
    // Drain 2026-08-09-0400 — second honesty branch, sibling to the
    // CW-2230 no-Recipe seed above: a note whose Python is (still)
    // the backfill's own stub cannot honestly be 'synced'. The Recipe
    // (real, authored content) is the source; forge-click then
    // transpiles it into real Python WITHOUT LLM-regenerating the
    // authored Recipe (which is what a 'synced'→Description-canonical
    // route would do per drain 0600 §3.1). Guarded on the BODY (not
    // an insertion flag) so it is stable across runs, and ordered
    // AFTER the drift branches so real hand-edits keep winning (I5)
    // — it replaces only the 'synced' fallback.
    if (noRecipeBody && hasDescBody) seed = 'description';
    else if (dMismatch) seed = 'description';
    else if (rMismatch) seed = 'recipe';
    else if (pMismatch) seed = 'python';
    else if (finalPythonText === DEFAULT_PYTHON_STUB && !noRecipeBody) seed = 'recipe';
    else seed = 'synced';
    workingBody = helpers.setFrontmatterField(workingBody, 'source_facet', seed);
    actions.canonicalFacetSeeded = seed;
  } else {
    // Both present, or only new field present. Idempotent branch —
    // still flush the legacy `canonical_facet` field so notes don't
    // carry both across drains.
    if (existingCanonical !== null && helpers.removeFrontmatterField) {
      workingBody = helpers.removeFrontmatterField(workingBody, 'canonical_facet');
    }

    // Drain 2026-08-09-0400 — stub-sync repair for residue the
    // pre-fix backfill already stamped (census 2026-08-09: 8 live
    // notes). Signature is deliberately tight: Python body is STILL
    // byte-identical to DEFAULT_PYTHON_STUB (any cohort edit defeats
    // the match), source_facet claims 'synced', and there is NO
    // v11.6 python parent-hash (a real forge stamps
    // python_derived_from_recipe_hash, so a genuinely-forged
    // return-None never matches). Heal: seed the honest source
    // ('recipe' when a Recipe body exists — forge-click transpiles
    // it into real Python without touching the authored Recipe;
    // else 'description') and drop the fabricated legacy lineage.
    // Precedent: v0.2.248 §3.4b canonicalHashRepairs (rewrite
    // already-populated fields on a detected bug-residue signature).
    if (existingSource === 'synced') {
      const pythonBodyNow = helpers.extractPythonSection(workingBody) ?? '';
      const pythonParentNow = helpers.getFrontmatterField(
        workingBody, 'python_derived_from_recipe_hash');
      // TEMPORARY drain 2026-08-09-2130 — remove after the live-repair
      // invocation-path root cause is fixed + verified. Logs the exact
      // precondition verdicts the repair sees on the LIVE path, so a
      // live no-op distinguishes extractor/byte disagreement from the
      // repair simply not being reached.
      console.log(
        `[REPAIR_TRACE] source=${existingSource}, `
        + `body_matches_stub=${pythonBodyNow === DEFAULT_PYTHON_STUB}, `
        + `parent_null=${pythonParentNow === null}, `
        + `body_first_50=${JSON.stringify(pythonBodyNow.substring(0, 50))}`,
      );
      if (pythonBodyNow === DEFAULT_PYTHON_STUB && pythonParentNow === null) {
        const recipeBodyNow = (helpers.extractRecipeSection(workingBody) ?? '').trim();
        const descBodyNow = helpers.extractDescription(workingBody).trim();
        const healedSeed = recipeBodyNow.length > 0
          ? 'recipe'
          : descBodyNow.length > 0 ? 'description' : null;
        if (healedSeed !== null) {
          workingBody = helpers.setFrontmatterField(workingBody, 'source_facet', healedSeed);
          if (helpers.removeFrontmatterField) {
            workingBody = helpers.removeFrontmatterField(
              workingBody, 'python_derived_from_source_hash');
          }
          actions.stubSyncRepairs.push('source_facet');
        }
      }
    }
  }

  // v0.2.264 drain 2026-07-03-1500 — v11.6 parent-hash migration.
  // §2.3: seed the new immediate-parent-hash fields from v11.5's
  // legacy `_source_hash` fields where the semantic is unambiguous.
  //
  // CW-1500-B: for the two-hop Description-canonical case
  // (python_derived_from_source_hash === description_hash), LEAVE
  // python_derived_from_recipe_hash ABSENT. Best-effort seed would
  // create false positives where Python renders `— derived from Recipe`
  // (in sync) when Recipe body has drifted since Python's actual forge.
  // Safe default: Python renders `— derived from Recipe, out of date`
  // until real re-derivation stamps the field.
  const descHashField = helpers.getFrontmatterField(workingBody, 'description_hash');
  const recipeHashField = helpers.getFrontmatterField(workingBody, 'recipe_hash');

  // Recipe parent-hash seed: unambiguous — Recipe's only parent is Description.
  const existingRecipeParent = helpers.getFrontmatterField(
    workingBody, 'recipe_derived_from_description_hash');
  if (existingRecipeParent === null) {
    const legacyRecipeSource = helpers.getFrontmatterField(
      workingBody, 'recipe_derived_from_source_hash');
    if (legacyRecipeSource !== null && descHashField !== null
        && legacyRecipeSource === descHashField) {
      workingBody = helpers.setFrontmatterField(
        workingBody, 'recipe_derived_from_description_hash', legacyRecipeSource,
      );
      actions.derivedFromParentSeeded.push('recipe_derived_from_description_hash');
    }
  }

  // Python parent-hash seed: only direct-match case (legacy field
  // points at current recipe_hash). Two-hop case (legacy points at
  // description_hash) LEFT ABSENT per CW-1500-B.
  const existingPythonParent = helpers.getFrontmatterField(
    workingBody, 'python_derived_from_recipe_hash');
  if (existingPythonParent === null) {
    const legacyPythonSource = helpers.getFrontmatterField(
      workingBody, 'python_derived_from_source_hash');
    if (legacyPythonSource !== null && recipeHashField !== null
        && legacyPythonSource === recipeHashField) {
      workingBody = helpers.setFrontmatterField(
        workingBody, 'python_derived_from_recipe_hash', legacyPythonSource,
      );
      actions.derivedFromParentSeeded.push('python_derived_from_recipe_hash');
    }
    // CW-1500-B: else if legacyPythonSource === descHashField → LEAVE ABSENT.
  }

  const changed = actions.pythonSection
    || actions.hashes.length > 0
    || actions.derivedFromFields.length > 0
    || actions.canonicalHashRepairs.length > 0
    || actions.canonicalFacetSeeded !== null
    || actions.derivedFromParentSeeded.length > 0
    || actions.stubSyncRepairs.length > 0;
  return {
    changed,
    newBody: changed ? workingBody : body,
    actions,
  };
}
