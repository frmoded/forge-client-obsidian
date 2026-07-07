// v0.2.280 CW-2200 — sanitizer for LLM /generate recipe-dialect output.
//
// The LLM sometimes emits reasoning prose + `# missing chip:` comments
// intermixed with valid E-- statements. Writing that mixed content to
// the Recipe body causes E-- transpile to fail with parse errors on
// prose characters (em-dashes, commas in wrong positions, etc.).
//
// This sanitizer strips prose + comments, keeping only lines that
// LOOK like valid V2 E-- Recipe syntax:
//
//   - `Let <ident> = <expr>.`      — assignment
//   - `Return <expr>.`             — return
//   - `[[<id>]] <args>.`           — shorthand-call statement
//   - blank lines
//
// Comments (`# ...`) are stripped because their content is meta-
// commentary, not runtime instructions, and often contains characters
// the parser rejects.
//
// If nothing valid remains, returns null so the caller can treat as
// Sub-1 fallback (preserve prior Recipe + surface notice).

/** Line-shape gate: does this line look like valid V2 E-- Recipe syntax? */
function _isValidRecipeLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  // Let <identifier> = ... — require `=` after identifier so "Let me think"
  // prose doesn't slip through.
  if (/^Let\s+[a-zA-Z_][\w]*\s*=/.test(trimmed)) return true;
  // Return <expr> — require non-word char right after "Return " so
  // "Returning the score" doesn't match.
  if (/^Return\s+\S/.test(trimmed)) return true;
  // [[wikilink]] <args>. — shorthand-call statement
  if (/^\[\[[^\]]+\]\]/.test(trimmed)) return true;
  return false;
}

/** Filter LLM Recipe output down to lines that parse as V2 E-- syntax.
 *  Returns null when NO valid statements remain (LLM produced pure
 *  prose / just comments), so caller falls back to Sub-1. */
export function sanitizeLlmRecipe(llmRecipe: string): string | null {
  const lines = llmRecipe.split('\n');
  const kept: string[] = [];
  let anyStatement = false;
  for (const line of lines) {
    if (!_isValidRecipeLine(line)) continue;
    kept.push(line);
    if (line.trim() !== '') anyStatement = true;
  }
  if (!anyStatement) return null;
  // Collapse leading + trailing blank lines from the sanitized output
  // so replaceRecipeSection lands a clean block.
  while (kept.length > 0 && kept[0].trim() === '') kept.shift();
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') kept.pop();
  return kept.join('\n');
}
