// v0.2.116 — frontmatter fold via CSS targeting Obsidian's own
// `.cm-hmd-frontmatter` line class.
//
// Eight prior releases (v0.2.108→v0.2.115) failed to fold the
// frontmatter through CM6 decorations. The empirical table:
//
//   foldEffect (v0.2.108)                  → CM6 state set, render filtered
//   Decoration.replace inline (v0.2.109)  → ViewPlugin RangeError
//   Same via StateField (v0.2.110-111)    → Mounts, but Obsidian overrides
//   Add Prec.highest wrapper (v0.2.114)   → Still overridden
//   Decoration.replace block (v0.2.115)   → Still overridden
//
// Conclusion from cohort smoke + the Obsidian community gist by
// @Boettner-eric: Obsidian's renderer owns the frontmatter region
// unconditionally. Decorations from external extensions targeting
// YAML lines never enter the visible path. The community-known fix
// is pure CSS: Obsidian tags each YAML line in source mode with the
// `.cm-hmd-frontmatter` class. CSS targeting `.cm-line:has(.cm-hmd-
// frontmatter)` hides those lines without competing with any
// decoration system.
//
// For per-file gating (only snippet files, not plain notes), we use
// CM6's `EditorView.editorAttributes` facet. A `.compute([], state
// => ...)` call inspects the doc's frontmatter `type:` field on
// every state change and emits a `class: forge-snippet` attribute
// on the editor's root element when the file is `type: action |
// data`. The CSS in styles.css uses `.forge-snippet` as the gate.
//
// Per-EditorView state (the expandedField from v0.2.110 that tracked
// "user clicked the placeholder to expand") is removed — the
// placeholder widget never reliably rendered, so the click-to-expand
// affordance was already vestigial. If cohort signal asks for an
// expand affordance, a follow-up drain re-adds it via a different
// mechanism (e.g. Cmd-P palette command).

import type { App, TFile } from 'obsidian';
import { EditorView } from '@codemirror/view';
import type { Extension } from '@codemirror/state';

/** Minimal callback interface (kept for backwards compatibility of
 *  the integration site in main.ts). */
export interface FrontmatterFoldHost {
  app: App;
  getActiveSnippetForFold(): { file: TFile } | null;
}

/** Locate the YAML frontmatter range in the document. v0.2.102
 *  utility, kept for test backwards-compat + because the helper is
 *  cheap and may be useful for future affordances (e.g. computing
 *  a fold widget position). Returns null when missing/malformed.
 *
 *  Returns 0-based character offsets:
 *    from = position of the first character after the opening `---`
 *           line's newline. Pre-v0.2.115 this was end-of-`---`-line
 *           (position 3); v0.2.115 widened it to 0 for block:true
 *           decorations. v0.2.116 reverts to the v0.2.111 convention
 *           (end of opening `---` line) since the CSS-only approach
 *           doesn't dispatch any decoration; the range is purely
 *           informational here.
 *    to   = end of the closing `---` line (newline excluded). */
export function computeFrontmatterFoldRange(
  doc: string,
): { from: number; to: number } | null {
  const lines = doc.split('\n');
  if (lines.length < 2) return null;
  if (lines[0].trim() !== '---') return null;
  let closeLine = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      closeLine = i;
      break;
    }
  }
  if (closeLine === -1) return null;
  const from = lines[0].length;
  let to = 0;
  for (let i = 0; i <= closeLine; i++) {
    to += lines[i].length;
    if (i < closeLine) to += 1;
  }
  return { from, to };
}

/** Read `type:` from a markdown document's YAML frontmatter inline,
 *  without depending on Obsidian's metadataCache (which doesn't
 *  hydrate in time for the initial CM6 mount). v0.2.111 introduced
 *  this; v0.2.116 still uses it as the gate-on-snippet check. */
export function readFrontmatterType(doc: string): string | null {
  const lines = doc.split('\n');
  if (lines.length < 2) return null;
  if (lines[0].trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') return null;
    const m = trimmed.match(/^type:\s*(.+?)\s*$/);
    if (m) {
      let v = m[1];
      if ((v.startsWith('"') && v.endsWith('"'))
          || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return v;
    }
  }
  return null;
}

/** Build the Extension. v0.2.116: pure CSS-class gating via
 *  EditorView.editorAttributes. When the document's frontmatter
 *  declares `type: action | data`, the editor root element gets
 *  class="forge-snippet"; CSS in styles.css does the actual hide.
 *
 *  No decorations. No widgets. No fold dispatch. The override
 *  mechanism Obsidian uses doesn't intercept HTML attributes on
 *  the editor root, so this is unaffected by the eight failed
 *  decoration attempts cataloged in the file header.
 *
 *  The `_getHost` param is preserved for backwards-compat with the
 *  v0.2.102 call site in main.ts (registerEditorExtension); not
 *  used by the CSS-class approach. */
export function makeFrontmatterFoldExtension(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _getHost: () => FrontmatterFoldHost | null,
): Extension {
  return EditorView.editorAttributes.compute([], (state) => {
    const type = readFrontmatterType(state.doc.toString());
    if (type === 'action' || type === 'data') {
      return { class: 'forge-snippet' };
    }
    return {};
  });
}

// Legacy alias preserved so the existing main.ts call site
// (registerEditorExtension) doesn't need to change.
export const makeFrontmatterFoldViewPlugin = makeFrontmatterFoldExtension;
