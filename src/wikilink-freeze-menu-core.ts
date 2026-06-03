// Pure-core decision: should the editor-menu handler surface
// "Freeze edge" / "Unfreeze edge" items when the user right-clicks
// a wikilink inside a Forge snippet?
//
// Inputs: the current file's basename (the would-be caller), the
// wikilink target string (the would-be callee), and a structural
// registry adapter that maps bare → qualified IDs.
//
// Output: a decision describing whether to show the menu and, if
// so, what qualified caller/callee to pass to freezeEdge().
//
// Why this lives in its own pure-core file: editor-menu handler glue
// imports `obsidian`, but the decision logic doesn't need any
// Obsidian API. `node --test` exercises this without a shim — same
// pattern as forge-music-gate.ts, copy-dir-core.ts, bundled-vault-
// version-core.ts, etc. Pure-core extraction No. 12.

/** Minimal registry shape the decision helper depends on. The real
 *  SnippetRegistry (engine-side Python) speaks via the Pyodide-host
 *  bridge; this interface captures just the bare→qualified mapping
 *  step the decision needs. */
export interface SnippetRegistryLike {
  /** Returns the qualified snippet_id ('{vault}/{bare}') for a bare
   *  ID, or null if no snippet with that bare ID is indexed. Match
   *  semantics follow the registry's resolution-order — when multiple
   *  vaults declare the same bare name, the first match wins (same
   *  semantics as `context.compute('bare_id')` from a top-level call
   *  site). */
  qualifyBareId(bareId: string): string | null;
}

/** Outcome of the menu decision. When `showMenu` is true, `caller`
 *  and `callee` are both qualified IDs ready to pass to freezeEdge.
 *  When false, the editor-menu handler should NOT add any freeze
 *  items. */
export interface WikilinkFreezeMenuDecision {
  showMenu: boolean;
  caller?: string;
  callee?: string;
}

/** Decide whether to surface the freeze menu for a (currentFile,
 *  wikilinkTarget) pair.
 *
 *  Suppression cases:
 *  - Current file basename doesn't resolve in the registry (caller
 *    isn't a snippet — user opened a plain markdown note).
 *  - Wikilink target doesn't resolve in the registry (callee isn't
 *    a snippet — wikilink points to a plain markdown note).
 *  - Both resolve to the same qualified ID (self-reference; freezing
 *    self-edges is undefined).
 *
 *  Ambiguity (a bare name that matches multiple library vaults) is
 *  delegated to the registry's resolution-order semantics. Explicit
 *  ambiguity UI (a sub-menu listing all candidates) is deferred to
 *  a future drain — see feedback/2026-06-03-0100-…md §2 for the
 *  design call. */
export function decideWikilinkFreezeMenu(
  currentFileBasename: string,
  wikilinkTarget: string,
  registry: SnippetRegistryLike,
): WikilinkFreezeMenuDecision {
  const caller = registry.qualifyBareId(currentFileBasename);
  if (caller === null) return { showMenu: false };
  const callee = registry.qualifyBareId(wikilinkTarget);
  if (callee === null) return { showMenu: false };
  if (caller === callee) return { showMenu: false };
  return { showMenu: true, caller, callee };
}

/** Locate the wikilink that brackets `cursorCh` on `lineText`, if any.
 *  Returns the inner target string (the `target` in `[[target]]` or
 *  `[[target|alias]]`), or null if the cursor isn't inside a wikilink.
 *
 *  The line-scan + bracket-pair test keeps this pure-text and
 *  testable without needing Obsidian's editor APIs. Glue layer
 *  (main.ts) supplies `lineText` from `editor.getLine(cursor.line)`
 *  and `cursorCh` from `cursor.ch`. */
export function findWikilinkAtCursor(
  lineText: string,
  cursorCh: number,
): string | null {
  // Find every `[[…]]` pair on the line; pick the one whose bracket
  // span includes `cursorCh`. The regex tolerates piped targets
  // (`[[target|alias]]`) — the alias part is dropped via split('|').
  const re = /\[\[([^\[\]]+?)\]\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(lineText)) !== null) {
    const start = m.index;
    const end = m.index + m[0].length;
    if (cursorCh >= start && cursorCh <= end) {
      const inner = m[1];
      // Drop the alias (piped form: `target|alias`). Trim leftover
      // whitespace.
      const target = inner.split('|')[0].trim();
      // Drop any subpath (`target#heading` or `target^block`) — only
      // the file part matters for the freeze edge.
      const fileOnly = target.split(/[#^]/)[0].trim();
      return fileOnly === '' ? null : fileOnly;
    }
  }
  return null;
}
