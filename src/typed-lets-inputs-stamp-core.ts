// Drain 2026-08-10-1900 — reactive frontmatter `inputs:` stamper for
// typed Lets (Approach C, drain 1610). Pure-core piece: whether a
// Recipe body has any typed-Let input declarations worth deriving
// from, and whether a note's path should be skipped as a bundled-
// library note (read-only from the cohort's perspective — the
// upstream authoring vault is source of truth, per drain 2130's same
// convention for the v11.3 backfill).
//
// Reconciliation itself reuses the EXISTING `reconcileInputs`
// (frontmatter-inputs-reconcile.ts, drain 0.2.24) — this stamper's
// only new contribution is the ADAPTER (derive from Recipe typed
// Lets instead of the Python signature) and the pre-filter below,
// which avoids a Pyodide round-trip for the vastly-more-common
// untyped-note case and gives an unambiguous skip signal distinct
// from "typed Lets present but legitimately zero inputs".

/** Cheap regex pre-filter: does this Recipe body contain at least one
 *  input declaration worth deriving from — either the drain-2000
 *  `Input NAME: TYPE` keyword (canonical going forward) or a
 *  drain-1610 typed Let (`Let name: Type = ...`, legacy-fallback
 *  path, still recognized so old notes keep reconciling). Mirrors
 *  the grammar loosely enough to never false-negative on a real
 *  declaration, without needing the full parser. False positives
 *  (matching inside a string/slot) are harmless — the actual
 *  derivation call then legitimately returns zero declarations and
 *  reconcileInputs no-ops.
 *
 *  Drain 2026-08-10-2000 note: missing the `Input` half of this
 *  check was a real gap found in this same session — a note migrated
 *  to the new keyword (e.g. music-core/pitched_line) would silently
 *  stop reconciling, since the pre-filter never even reached the
 *  Pyodide call that derive_inputs_from_recipe was ALSO separately
 *  fixed to recognize. */
export function hasTypedLetsInRecipe(recipeBody: string): boolean {
  return /^\s*(Input|Let)\s+[A-Za-z_]\w*\s*:/m.test(recipeBody);
}

/** True iff `filePath`'s top-level directory is a bundled-library
 *  subdir (has its own forge.toml) — those are read-only from the
 *  cohort's perspective; the stamper must not write to them. */
export function isInBundledLibraryDir(
  filePath: string,
  libraryDirNames: ReadonlySet<string>,
): boolean {
  const slash = filePath.indexOf('/');
  if (slash === -1) return false;
  return libraryDirNames.has(filePath.slice(0, slash));
}
