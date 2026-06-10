// v0.2.122 — source-mode CM6 line decoration that tags every line
// inside the `# Dependencies` section with `forge-deps-line`. CSS
// in styles.css then hides those lines when the editor is in a
// snippet (`.forge-snippet` class on the markdown view container,
// per v0.2.118).
//
// Pattern: same as v0.2.111 frontmatter-fold (StateField provides
// DecorationSet via EditorView.decorations.from). Decoration.line
// applies a CSS class to entire lines — survives CM6 viewport
// re-rendering since the decoration is state-derived, not DOM-patched.
//
// Per the v0.2.116 retrospective: CSS class gating beats decoration
// competition. We don't try to fold via foldEffect (Obsidian's
// renderer discards arbitrary fold ranges). We just tag the lines;
// Obsidian renders them, then CSS hides them.

import {
  EditorView,
  Decoration,
  type DecorationSet,
} from '@codemirror/view';
import {
  StateField,
  RangeSetBuilder,
  type Extension,
} from '@codemirror/state';
import { findDependenciesRange } from './dependencies-section-core.ts';

/** Build the Extension. Wires a StateField that recomputes line
 *  decorations from the current document state every transaction.
 *  Each line inside the `# Dependencies` section (heading + body
 *  through the next # heading or EOF) gets a Decoration.line with
 *  class `forge-deps-line`. */
export function makeDependenciesFoldExtension(): Extension {
  const decoField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state);
    },
    update(_deco, tr) {
      return buildDecorations(tr.state);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [decoField];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDecorations(state: any): DecorationSet {
  const doc: string = state.doc.toString();
  const range = findDependenciesRange(doc);
  if (!range) return Decoration.none;

  const builder = new RangeSetBuilder<Decoration>();
  const lineDeco = Decoration.line({ class: 'forge-deps-line' });

  // Convert 0-based line indices to character positions for
  // RangeSetBuilder. CM6's doc.line() is 1-based.
  for (let i = range.depsStart; i <= range.depsEnd; i++) {
    const lineNum = i + 1;  // 0-based → 1-based for doc.line()
    if (lineNum < 1 || lineNum > state.doc.lines) continue;
    const linePos = state.doc.line(lineNum).from;
    builder.add(linePos, linePos, lineDeco);
  }

  return builder.finish();
}
