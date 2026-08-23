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
//   - every statement form the engine's parser accepts (Let, Input,
//     Return, Call, If / Otherwise, For each, Repeat, and the
//     `[[<id>]] <args>.` shorthand), plus indented block bodies
//   - blank lines
//
// The accepted set is pinned against `parser.py` by
// sanitize-llm-recipe-grammar.test.ts — drain 2026-08-24-1600, after
// this filter silently deleted `Input` lines for two weeks.
//
// Comments (`# ...`) are stripped because their content is meta-
// commentary, not runtime instructions, and often contains characters
// the parser rejects.
//
// If nothing valid remains, returns null so the caller can treat as
// Sub-1 fallback (preserve prior Recipe + surface notice).

/** Line-shape gate: does this line look like valid V2 E-- Recipe syntax?
 *
 *  Drain 2026-08-24-1600 — this was a THREE-ENTRY whitelist (`Let`,
 *  `Return`, `[[shorthand]]`) written at v0.2.280 against the grammar
 *  of the day. The grammar grew and the whitelist did not: `Input`
 *  landed in drain 2026-08-10-2000, and every
 *  `Input divisor: float = 2.0.` line was silently DELETED here before
 *  transpile. The signature was then built from a module with no
 *  InputStmt while the body statements survived, producing
 *  `def compute(context):` around `result = (100 / divisor)` — a
 *  guaranteed NameError, on 4 of 4 fresh notes in CCQA's v0.2.365
 *  bundle. `Call`, `If`, `For each` and `Repeat` were being deleted the
 *  same way; the reported symptom was the one that happened to be
 *  exercised.
 *
 *  A whitelist fails CLOSED on unknown grammar, which is the wrong
 *  direction for a filter whose job is stripping PROSE: it deletes
 *  valid statements in silence and the note runs wrong instead of
 *  failing loudly. The heads below now cover every statement form the
 *  engine's parser accepts, and
 *  `sanitize-llm-recipe-grammar.test.ts` derives that set FROM
 *  `parser.py` and fails if the two ever diverge again — the grammar
 *  cannot outrun this filter a second time without the suite saying so.
 */
function _isValidRecipeLine(line: string): boolean {
  const trimmed = line.trim();
  if (trimmed === '') return true;
  // An indented line continues the block above it (If / For each /
  // Repeat bodies). Its own shape is checked by the same rules once
  // trimmed, so nesting needs no special case beyond this one.
  // Let <identifier> = ... — require `=` after identifier so "Let me think"
  // prose doesn't slip through.
  if (/^Let\s+[a-zA-Z_][\w]*\s*=/.test(trimmed)) return true;
  // Input <identifier>: <type> — the declaration this filter used to eat.
  if (/^Input\s+[a-zA-Z_][\w]*\s*:/.test(trimmed)) return true;
  // Return <expr> — require non-word char right after "Return " so
  // "Returning the score" doesn't match. `Return.` (bare) is legal too.
  if (/^Return\s+\S/.test(trimmed)) return true;
  if (/^Return\.$/.test(trimmed)) return true;
  // Call [[chip]] with k=v. — the canonical statement-position call.
  // Requires the wikilink so "Call me later" stays prose.
  if (/^Call\s+\[\[/.test(trimmed)) return true;
  // Block heads. Each ends in `:` and its body arrives as indented
  // lines, which recurse through these same rules.
  if (/^If\s+\S.*:$/.test(trimmed)) return true;
  if (/^Otherwise\s*:$/.test(trimmed)) return true;
  if (/^For\s+each\s+[a-zA-Z_][\w]*\s+in\s+\S.*:$/.test(trimmed)) return true;
  if (/^Repeat\s+\S.*:$/.test(trimmed)) return true;
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
