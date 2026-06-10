// v0.2.122 — pure-core: locate the `# Dependencies` section's line
// bounds in a snippet doc. Used by both the CM6 line-class extension
// (source-mode hide) and the markdown post-processor (Live Preview /
// Reading mode hide). Pulled out as a pure helper so the contract is
// testable without a live editor.
//
// Indices are 0-based to match Obsidian's `editor.getCursor().line`.
// Range is inclusive on both ends: depsStart is the line of the
// `# Dependencies` heading; depsEnd is the LAST line of the section
// (the line right BEFORE the next `# *` heading, or the last line of
// the document when there's no following heading).
//
// Boundary handling:
//   - No `# Dependencies` heading → returns null.
//   - Multiple `# Dependencies` headings (shouldn't happen, but defensive
//     against authoring mistakes) → uses the FIRST occurrence.
//   - Heading at end of doc with no body → depsStart == depsEnd (single-
//     line range — just the heading itself).

export interface DependenciesRange {
  depsStart: number;
  depsEnd: number;
}

export function findDependenciesRange(doc: string): DependenciesRange | null {
  const lines = doc.split('\n');
  const depsStart = lines.findIndex(
    (l) => /^#{1,6}\s+dependencies\s*$/i.test(l.trim()),
  );
  if (depsStart === -1) return null;

  // depsEnd: scan forward from depsStart+1 for the next top-level
  // heading (any `# *`). The previous line is the last of our section.
  // If no following heading, the section extends to EOF.
  for (let i = depsStart + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (/^#{1,6}\s+\S/.test(t)) {
      // Next heading — the section ends at the previous line.
      return { depsStart, depsEnd: i - 1 };
    }
  }
  // No following heading — section extends to EOF.
  return { depsStart, depsEnd: lines.length - 1 };
}

/** Does the given 0-based line index sit inside (or at the boundary
 *  of) the Dependencies section? Used by the CM6 line decoration to
 *  decide which `.cm-line` elements get the `forge-deps-line` class. */
export function isLineInsideDependencies(
  doc: string,
  line: number,
): boolean {
  const r = findDependenciesRange(doc);
  if (!r) return false;
  return line >= r.depsStart && line <= r.depsEnd;
}
