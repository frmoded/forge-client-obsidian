// v0.2.113 — Pure-core: locate the `# English` facet's line bounds.
//
// Used by chip-insertion to decide whether the cursor sits inside the
// English body (insert at cursor's next line) or outside (fall back to
// end-of-section append).
//
// Indices are 0-based to match Obsidian's `editor.getCursor().line`.
//
// Boundaries:
//   englishStart = line index of the `# English` heading line itself.
//   englishEnd   = line index of the FIRST line AFTER the English body —
//                  i.e. the next heading (`# *`), or a `---` separator,
//                  or `lines.length` if EOF. A cursor on `englishEnd`
//                  itself is OUTSIDE the English body (it's the next
//                  section's heading).
//
// Notes:
//   - Treats only top-level `# *` headings as section breaks. Code-
//     block lines starting with `#` (e.g. Python comments) are NOT
//     detected because they sit inside fenced ```...``` regions; we
//     don't parse fence state here. In practice the English facet
//     doesn't contain fenced code, so this is fine.
//   - If multiple `# English` headings exist (which a snippet
//     shouldn't have), uses the FIRST occurrence.

export interface EnglishFacetBounds {
  englishStart: number;
  englishEnd: number;
}

export function findEnglishFacetBounds(
  doc: string,
): EnglishFacetBounds | null {
  const lines = doc.split('\n');
  const englishStart = lines.findIndex(
    (l) => /^#{1,6}\s+english\s*$/i.test(l.trim()),
  );
  if (englishStart === -1) return null;

  let englishEnd = lines.length;
  for (let i = englishStart + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t.startsWith('#') || t === '---') {
      englishEnd = i;
      break;
    }
  }
  return { englishStart, englishEnd };
}

/** Determine whether a 0-based line index sits inside the `# English`
 *  facet's BODY (not the heading line, not the line after the
 *  section). Returns true when the line is in the half-open range
 *  (englishStart, englishEnd). */
export function isLineInsideEnglishBody(
  doc: string,
  line: number,
): boolean {
  const bounds = findEnglishFacetBounds(doc);
  if (!bounds) return false;
  return line > bounds.englishStart && line < bounds.englishEnd;
}
