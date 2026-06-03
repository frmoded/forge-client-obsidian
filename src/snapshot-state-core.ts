// Pure-core helper: parse the `state:` field out of a snapshot file's
// YAML frontmatter. The right-click freeze menu uses this to gray out
// the inapplicable action (Freeze for already-frozen edges, Unfreeze
// for live or absent ones).
//
// Pure-core extraction No. 14. Same `node --test` convention as the
// prior thirteen.

export type SnapshotState = 'frozen' | 'live' | 'no-snapshot';

/** Read the `state:` field from a snapshot file's frontmatter.
 *
 *  Returns:
 *  - 'frozen' or 'live' when the frontmatter block contains a
 *    well-formed `state: <value>` line.
 *  - 'no-snapshot' when the body is null/empty, has no frontmatter
 *    block, has no `state:` line in the frontmatter, or has an
 *    unrecognized state value (defensive — future state values
 *    shouldn't be misinterpreted as live).
 *
 *  Only inspects the leading frontmatter block (between the first
 *  `---` and the next `---`). A `state: frozen` mention in the snapshot
 *  body (e.g. inside a code example) doesn't influence the result.
 *
 *  Why pure-core: the production wiring lives in main.ts (the
 *  editor-menu handler) and pyodide-host.ts (the sync MEMFS reader),
 *  both obsidian-coupled. Pulling the parser out lets `node --test`
 *  exercise it without a shim.
 */
export function parseSnapshotState(body: string | null): SnapshotState {
  if (!body) return 'no-snapshot';

  // Locate the frontmatter block: starts on line 1 with `---`, ends
  // on the next `---`. Defensive — if no opening `---` on line 1,
  // there's no parseable frontmatter.
  const lines = body.split('\n');
  if (lines[0] !== '---') return 'no-snapshot';

  let endIdx = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') { endIdx = i; break; }
  }
  if (endIdx === -1) return 'no-snapshot';

  for (let i = 1; i < endIdx; i++) {
    const m = lines[i].match(/^state\s*:\s*(?:"([^"]*)"|'([^']*)'|(\S+))\s*$/);
    if (m) {
      const value = m[1] ?? m[2] ?? m[3];
      if (value === 'frozen' || value === 'live') return value;
      // Unknown state value — defensive 'no-snapshot' so the menu
      // shows the capture-prompt fallback rather than misleading
      // enabled actions.
      return 'no-snapshot';
    }
  }
  return 'no-snapshot';
}
