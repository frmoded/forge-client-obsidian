// v0.2.285 drain 1700 — defensive empty-Recipe detection for
// writeSourcePythonBack (called writeCanonicalPythonBack pre-v0.2.286;
// drain 2026-07-09-1600 renamed it alongside the S9 field rename).
//
// Rehearsal drain 1520 surfaced a gap: on fresh notes where CW-2200's
// Sub-1 fallback fired ("preserve prior Recipe"), the "prior Recipe"
// is empty and downstream `writeCanonicalPythonBack` still calls the
// E-- transpile. Behavior of transpile on empty Recipe was undefined
// (parser may raise; resolve_action_code may return None → cohort sees
// no output; the # Python stub still runs). This pure-core adds an
// explicit empty-Recipe check so the caller can skip transpile + emit
// a helpful Notice.
//
// Load-bearing for the MCP arc: every agent-created sub-note starts
// fresh. Any path producing an empty Recipe (Sub-1 fallback, MCP
// direct-write, external editor rewrite) is a potential trigger.

/** Result: should the caller proceed with transpile, and if not, what
 *  message should surface. */
export interface EmptyRecipeCheckResult {
  shouldTranspile: boolean;
  noticeText: string | null;
}

/** Detect whether a Recipe body is empty for transpile purposes.
 *
 *  "Empty" here means: no non-blank, non-comment tokens.
 *  - Whitespace-only body → empty.
 *  - Body containing ONLY `#` comments + blank lines → empty (same
 *    "no valid content" semantic sanitizeLlmRecipe uses when returning
 *    null).
 *  - Any Let/Return/`[[…]]` statement (or any prose line) → non-empty
 *    from this check's perspective. Malformed non-empty Recipes fall
 *    through to E-- parse errors — that's a separate concern per
 *    prompt §6.
 *
 *  When `shouldTranspile: false`, `noticeText` carries the exact
 *  cohort-facing message specified in drain 1700 §3. */
export function checkEmptyRecipeForTranspile(
  recipeBody: string | null | undefined,
): EmptyRecipeCheckResult {
  const NOTICE_TEXT =
    'Fresh note: no valid Recipe to transpile. Try refining the Description or check the previous notice from Recipe generation.';

  if (recipeBody === null || recipeBody === undefined) {
    return { shouldTranspile: false, noticeText: NOTICE_TEXT };
  }
  if (recipeBody.trim() === '') {
    return { shouldTranspile: false, noticeText: NOTICE_TEXT };
  }
  // Any non-blank, non-comment line → treat as non-empty.
  const lines = recipeBody.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '') continue;
    if (trimmed.startsWith('#')) continue;
    return { shouldTranspile: true, noticeText: null };
  }
  // Fell through — only blank + comment lines.
  return { shouldTranspile: false, noticeText: NOTICE_TEXT };
}
