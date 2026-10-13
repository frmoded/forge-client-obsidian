// Drain 2026-10-13-2100 §2/§5 — the decision `seedSourceFacetForOpenFiles` makes for one open note, extracted from main.ts so "does
// merely OPENING this note rewrite it?" is answerable headless by the function the plugin calls (it was inline, reachable only in
// Obsidian). The logic is moved, not changed: the same inputs produce the same frontmatter writes.
//
// What it decides (all from the note's own body — no metadataCache, which is eventually consistent at file-open):
//   - `source_facet` — absent → seeded by upstream-wins hash inference (or, for a note with no stored hashes at all, by which facet
//     is populated); present → left alone; only the legacy `canonical_facet` name present → migrated across;
//   - the v11.6 parent hashes (`recipe_derived_from_description_hash`, `python_derived_from_recipe_hash`) — seeded from the legacy
//     `*_derived_from_source_hash` only when the legacy value is unambiguous (the two-hop Description case is left absent, CW-1500-B);
//   - `write` — whether ANY of the above needs a write. A fully-stamped note reads `write: false`: opening it touches nothing.
//
// PURE: no Obsidian, no I/O. Hashing is injected (SubtleCrypto is async).
import type { SourceLayer } from './facet-hash-core.ts';

export interface OpenSeedHelpers {
  extractDescription: (body: string) => string;
  extractRecipeSection: (body: string) => string | null;
  extractPythonSection: (body: string) => string | null;
  getFrontmatterField: (body: string, key: string) => unknown;
  computeFacetHash: (content: string) => Promise<string>;
}

export interface OpenSeedPlan {
  /** The three facets' current content hashes (the caller seeds its facet-hash cache from these). */
  current: { desc: string; recipe: string; python: string };
  /** `python_derived_from_recipe_hash` as stored (the lineage-stamp snapshot the modify handler compares against). */
  pyDerivedFrom: unknown;
  /** Whether opening this note needs ANY frontmatter write. */
  write: boolean;
  /** What to set `source_facet` to; null = leave it. */
  setSourceFacet: string | null;
  /** The value to write at `recipe_derived_from_description_hash`; null = leave it. */
  seedRecipeParent: string | null;
  /** The value to write at `python_derived_from_recipe_hash`; null = leave it. */
  seedPythonParent: string | null;
}

export async function planOpenSeed(body: string, h: OpenSeedHelpers): Promise<OpenSeedPlan> {
  const descText = h.extractDescription(body);
  const recipeText = h.extractRecipeSection(body) ?? '';
  const pythonText = h.extractPythonSection(body) ?? '';
  const currentDesc = await h.computeFacetHash(descText);
  const currentRecipe = await h.computeFacetHash(recipeText);
  const currentPython = await h.computeFacetHash(pythonText);

  const storedDesc = h.getFrontmatterField(body, 'description_hash');
  const storedRecipe = h.getFrontmatterField(body, 'recipe_hash');
  const storedPython = h.getFrontmatterField(body, 'python_hash');

  // v11.6 parent-hash seed — fires independently of source_facet presence. Rules (drain 2026-07-03-1500 §2.3):
  //  - recipe_derived_from_description_hash seeded when legacy recipe_derived_from_source_hash === description_hash;
  //  - python_derived_from_recipe_hash seeded when legacy python_derived_from_source_hash === recipe_hash (direct match);
  //  - the two-hop Description-canonical case (legacy === description_hash) is LEFT ABSENT (CW-1500-B safe default).
  const legacyRecipeParent = h.getFrontmatterField(body, 'recipe_derived_from_source_hash');
  const legacyPythonParent = h.getFrontmatterField(body, 'python_derived_from_source_hash');
  const existingRecipeV116 = h.getFrontmatterField(body, 'recipe_derived_from_description_hash');
  const existingPythonV116 = h.getFrontmatterField(body, 'python_derived_from_recipe_hash');
  const seedRecipeParent =
    typeof existingRecipeV116 !== 'string'
    && typeof legacyRecipeParent === 'string'
    && typeof storedDesc === 'string'
    && legacyRecipeParent === storedDesc;
  const seedPythonParent =
    typeof existingPythonV116 !== 'string'
    && typeof legacyPythonParent === 'string'
    && typeof storedRecipe === 'string'
    && legacyPythonParent === storedRecipe;

  // v0.2.286 — prefer `source_facet`; the legacy `canonical_facet` name present means "an older plugin seeded this": don't seed.
  const existingSource = h.getFrontmatterField(body, 'source_facet');
  const existingCanonical = h.getFrontmatterField(body, 'canonical_facet');
  const sourceAlreadyPresent =
    (typeof existingSource === 'string' && existingSource.length > 0)
    || (typeof existingCanonical === 'string' && existingCanonical.length > 0);
  const needsLegacyMigration =
    (typeof existingSource !== 'string' || existingSource.length === 0)
    && typeof existingCanonical === 'string'
    && existingCanonical.length > 0;

  // upstream-wins inference — only used when source_facet is absent.
  const dMismatch = typeof storedDesc === 'string' && storedDesc !== currentDesc;
  const rMismatch = typeof storedRecipe === 'string' && storedRecipe !== currentRecipe;
  const pMismatch = typeof storedPython === 'string' && storedPython !== currentPython;
  let seed: SourceLayer;
  if (dMismatch) seed = 'description';
  else if (rMismatch) seed = 'recipe';
  else if (pMismatch) seed = 'python';
  else {
    // drain 2026-07-28-1305 — fresh notes with NO stored hashes pick the populated facet as source (mirrors
    // whichLayerIsSource's content-based fallback); seeding 'synced' there bypassed Description-canonical routing.
    const noStoredHashes =
      typeof storedDesc !== 'string' && typeof storedRecipe !== 'string' && typeof storedPython !== 'string';
    if (noStoredHashes) {
      if (descText.trim().length > 0) seed = 'description';
      else if (recipeText.trim().length > 0) seed = 'recipe';
      else if (pythonText.trim().length > 0) seed = 'python';
      else seed = 'synced';
    } else {
      seed = 'synced';
    }
  }

  const write = !(sourceAlreadyPresent && !needsLegacyMigration && !seedRecipeParent && !seedPythonParent);
  return {
    current: { desc: currentDesc, recipe: currentRecipe, python: currentPython },
    pyDerivedFrom: h.getFrontmatterField(body, 'python_derived_from_recipe_hash'),
    write,
    setSourceFacet: !sourceAlreadyPresent ? seed : (needsLegacyMigration ? (existingCanonical as string) : null),
    seedRecipeParent: seedRecipeParent ? (legacyRecipeParent as string) : null,
    seedPythonParent: seedPythonParent ? (legacyPythonParent as string) : null,
  };
}
