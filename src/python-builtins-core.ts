// Pure-core helper for B7.2 (V2a v9): recognize Python builtin names
// that Forge's plugin-side wikilink interceptor should treat as
// non-snippet references. Canonical E-- snippets use `[[name]](args)`
// for every call including builtins; without interception, Obsidian's
// default wikilink-click behavior would create stray `print.md`,
// `len.md`, etc. files in the user's vault on first click.
//
// The Set is the constitution's exact B7.2 list. When the constitution
// amends B7.2, sync this Set by hand; small enough to maintain without
// automation. Authors who want a less-common builtin can wrap it in a
// sibling snippet — explicit and discoverable.
//
// Pure-core extraction No. 22. No `obsidian` import; `node --test`
// exercises this without a shim.

/** Vetted Python builtins per constitution B7.2 (V2a v9). Listed in
 *  the same order the constitution presents them so future
 *  reconciliations can diff cleanly. */
export const PYTHON_BUILTINS: ReadonlySet<string> = new Set([
  // I/O
  'print', 'input', 'open',
  // Sequences + comprehensions
  'len', 'range', 'enumerate', 'zip', 'map', 'filter',
  'sorted', 'reversed', 'min', 'max', 'sum',
  // Type construction
  'str', 'int', 'float', 'bool', 'list', 'dict', 'set', 'tuple',
  // Type introspection
  'type', 'isinstance', 'hasattr', 'getattr', 'setattr',
  // Math
  'abs', 'round',
]);

/** Case-sensitive membership check. Python is case-sensitive:
 *  `Print` is NOT `print`. Caller is responsible for stripping any
 *  wikilink subpath / heading anchor (e.g. `print#section` → `print`)
 *  before calling. */
export function isPythonBuiltin(name: string): boolean {
  return PYTHON_BUILTINS.has(name);
}

/** Strip `[[target#heading|alias]]` shape down to bare `target` for
 *  builtin lookup. Mirrors the convention in chips-core.ts's
 *  humanizeSnippetId path. Returns the trimmed target; empty string
 *  on empty input. */
export function bareWikilinkTarget(raw: string): string {
  if (!raw) return '';
  // Stop at first `#` (heading) or `|` (display alias).
  const stopIdx = raw.search(/[#|]/);
  const target = stopIdx === -1 ? raw : raw.slice(0, stopIdx);
  return target.trim();
}
