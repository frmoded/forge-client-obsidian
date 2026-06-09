// Pure-core helper: replace the `# Python` fenced section in a snippet
// .md file with new code, preserving frontmatter, English facet, and
// — crucially — any content AFTER the Python section (`# Dependencies`,
// user notes, comments).
//
// v0.2.42 fix — the inline main.ts:31 version was asymmetric to
// replaceEnglishSection (main.ts:69): the English helper preserves
// both `before` and `after` (its own comment said so), but the Python
// helper sliced only `before` and appended the new code, silently
// dropping the `# Dependencies` block. Forge-click on any snippet with
// a Dependencies section produced a file with the Dependencies block
// wiped — exactly the user-visible regression that surfaced in the
// smoke-v0.2.13 v0.2.41 user smoke (right-click wikilinks lost their
// targets because the Dependencies block was deleted).
//
// Pure-core extraction No. 13. Same `node --test` + `node:assert/strict`
// convention as the prior twelve.

/** Replace the body of the `# Python` section with a new code block.
 *  Keeps:
 *  - Everything before `# Python` (frontmatter, # English, separators)
 *  - The `# Python` heading line itself
 *  - The new code, wrapped in a ```python ... ``` fence
 *  - Everything after the closing ``` of the Python fence — the
 *    `# Dependencies` block, user notes, custom sections, anything.
 *
 *  When there is no `# Python` section in the file, returns the input
 *  unchanged (callers handle the "no Python facet" case at a higher
 *  level — see `replaceOrInsertPythonHeading` in
 *  python-cache-writer-core which inserts in canonical order). The
 *  legacy α-generate path in main.ts:writeGeneratedCode routes
 *  through that helper since v0.2.99 specifically so English-only
 *  bundled snippets (welcome.md, greet.md) get their Python facet
 *  written on first Forge.
 *
 *  When the Python section's closing ``` is missing or malformed,
 *  treats the rest of the file as part of the (broken) Python
 *  section and discards it — defensive against half-written files
 *  mid-edit, but documents the boundary.
 *
 *  Why preservation matters: the closed-beta path doesn't reach the
 *  `syncDependencies` BE, so without trailing preservation the Forge-
 *  click silently destroys the Dependencies block on every run. The
 *  v0.2.41 wikilink-right-click freeze surface depends on the
 *  Dependencies block holding the wikilinks that produce the menu —
 *  losing them disables the affordance.
 */
export function replacePythonSection(content: string, code: string): string {
  const lines = content.split('\n');
  const headingIdx = lines.findIndex(l => l.trim() === '# Python');
  if (headingIdx === -1) return content;

  // Locate the start of the python fenced block AFTER the heading. The
  // convention is one or more blank lines then ```python (or ```py).
  let fenceStart = -1;
  for (let i = headingIdx + 1; i < lines.length; i++) {
    const t = lines[i].trim();
    if (t === '```python' || t === '```py') {
      fenceStart = i;
      break;
    }
    // Walk past blanks; bail on any non-blank, non-fence line — we're
    // not in a recognizable Python facet shape.
    if (t !== '') break;
  }

  // Locate the closing ``` AFTER the opening fence.
  let fenceEnd = -1;
  if (fenceStart !== -1) {
    for (let i = fenceStart + 1; i < lines.length; i++) {
      if (lines[i].trim() === '```') {
        fenceEnd = i;
        break;
      }
    }
  }

  const before = lines.slice(0, headingIdx).join('\n');
  // `after` starts immediately after the closing fence. If fenceEnd is
  // -1 (malformed input — no closing fence), there's no preservable
  // trailing content (defensive against half-written files mid-edit).
  const after = fenceEnd === -1 ? '' : lines.slice(fenceEnd + 1).join('\n');

  const newPython = `# Python\n\n\`\`\`python\n${code}\n\`\`\`\n`;

  if (after === '' || after === '\n') {
    return `${before}\n${newPython}`;
  }
  // Reattach trailing content with a single blank line separator. If
  // `after` already starts with a blank line, don't double it.
  const afterPrefixed = after.startsWith('\n') ? after : `\n${after}`;
  return `${before}\n${newPython}${afterPrefixed}`;
}
