// v0.2.102 Item A — auto-collapse the YAML frontmatter on snippet
// file-open so students see `# English` first.
//
// v0.2.109 — switched from foldEffect to Decoration.replace because
// Obsidian's renderer silently discarded foldEffect ranges that
// didn't align with markdown headings (v0.2.108 spike's
// post-dispatch foldedRanges probe confirmed CM6 state was correct
// but rendering wasn't). Decoration.replace gives us our own widget.
//
// v0.2.110 — CM6 hard rule: ViewPlugin-provided decorations cannot
// span line breaks. Our fold replaces multiple YAML lines including
// newlines, so v0.2.109 threw "RangeError: Decorations that replace
// line breaks may not be specified via plugins" the moment a snippet
// opened — the snippet didn't render at all. Cohort smoke (Tamar)
// surfaced this immediately. Fix: provide decorations via a
// StateField + EditorView.decorations.from() instead. StateField
// updates happen at well-defined transaction points so CM6 permits
// the line-spanning replace.
//
// Click-to-expand state lives in a side StateField + StateEffect
// because the dispatch from the widget DOM handler can carry an
// effect that flips per-file expanded membership.

import type { App, TFile } from 'obsidian';
import {
  EditorView,
  Decoration,
  type DecorationSet,
  WidgetType,
} from '@codemirror/view';
import {
  StateField,
  StateEffect,
  RangeSetBuilder,
  type Extension,
} from '@codemirror/state';

/** Minimal callback interface back to the ForgePlugin singleton. */
export interface FrontmatterFoldHost {
  app: App;
  /** Resolve the active snippet file + whether its frontmatter
   *  qualifies for auto-fold. Returns null if not a snippet. */
  getActiveSnippetForFold(): { file: TFile } | null;
}

/** Locate the YAML frontmatter range in the document — end of the
 *  opening `---` line (so the `---` stays visible) through the end
 *  of the closing `---` line (newline excluded so the body below
 *  starts cleanly). Returns null when the document doesn't start
 *  with a frontmatter delimiter or has no closing delimiter
 *  (malformed).
 *
 *  Pure-core extraction: pulled out for unit testing without a
 *  live EditorView. */
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

/** v0.2.111 — read `type:` from the YAML frontmatter inline. Used
 *  instead of Obsidian's metadataCache because the StateField runs
 *  at transaction time and the cache may not yet reflect a just-
 *  opened file. Tolerates leading whitespace, quoted values, and
 *  scans only inside the frontmatter delimiters.
 *
 *  Returns the trimmed value of the FIRST `type:` line found in the
 *  frontmatter, or null if frontmatter is missing/malformed/has no
 *  `type:` field. */
export function readFrontmatterType(doc: string): string | null {
  const lines = doc.split('\n');
  if (lines.length < 2) return null;
  if (lines[0].trim() !== '---') return null;
  for (let i = 1; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed === '---') return null;  // closed without type
    const m = trimmed.match(/^type:\s*(.+?)\s*$/);
    if (m) {
      // Strip surrounding quotes if present.
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

class FrontmatterPlaceholderWidget extends WidgetType {
  private readonly filePath: string;
  constructor(filePath: string) {
    super();
    this.filePath = filePath;
  }
  toDOM(view: EditorView): HTMLElement {
    const span = document.createElement('span');
    span.className = 'forge-frontmatter-placeholder';
    span.textContent = '⋯';
    span.title = 'Click to expand properties';
    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({ effects: setExpandedEffect.of(this.filePath) });
    });
    return span;
  }
  // Identity is per file-path: re-using widget across files would be
  // wrong (different expand state); within a file it's reusable.
  eq(other: FrontmatterPlaceholderWidget): boolean {
    return other.filePath === this.filePath;
  }
  ignoreEvent(): boolean { return false; }
}

// In-session per-file expansion state. Empty set = all folded by
// default. setExpandedEffect appends a file path; once expanded, the
// decoration provider returns no decorations for that file. Cleared
// when the active file changes (so re-opening a snippet re-folds).
const setExpandedEffect = StateEffect.define<string>();
const clearExpandedEffect = StateEffect.define<void>();

const expandedField = StateField.define<Set<string>>({
  create() { return new Set(); },
  update(value, tr) {
    let next = value;
    for (const eff of tr.effects) {
      if (eff.is(setExpandedEffect)) {
        if (!next.has(eff.value)) {
          next = new Set(next);
          next.add(eff.value);
        }
      } else if (eff.is(clearExpandedEffect)) {
        if (next.size > 0) next = new Set();
      }
    }
    return next;
  },
});

/** Build the Extension. Decorations come from a StateField (CM6
 *  hard rule: line-break-spanning Decoration.replace must come from
 *  a StateField, not a ViewPlugin — v0.2.110 fix).
 *
 *  v0.2.111 — no longer depends on the workspace's active view.
 *  Pre-v0.2.111 we read `type:` from Obsidian's metadataCache via
 *  host.getActiveSnippetForFold(), but the StateField runs at
 *  transaction time during initial EditorView creation, BEFORE the
 *  workspace's active-view pointer is updated to the just-opened
 *  file. Result: getActiveSnippetForFold returned null → no
 *  decoration → frontmatter rendered expanded with no later
 *  transaction to retry. Cohort smoke (Tamar): "at least I can see
 *  the snippet, but frontmatter still expanded."
 *
 *  v0.2.111 reads `type:` directly from the document's YAML inline
 *  via readFrontmatterType. No workspace dependency; works on first
 *  build whether or not Obsidian's metadataCache has hydrated.
 *  The host param stays in the signature for backwards-compat /
 *  per-file expansion identity but the host gate is dropped. */
export function makeFrontmatterFoldExtension(
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _getHost: () => FrontmatterFoldHost | null,
): Extension {
  const decoField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state);
    },
    update(deco, tr) {
      return buildDecorations(tr.state);
    },
    provide: (f) => EditorView.decorations.from(f),
  });

  return [expandedField, decoField];
}

// Legacy alias: existing main.ts call site uses
// makeFrontmatterFoldViewPlugin via registerEditorExtension. Keep the
// name so the integration site doesn't need to change.
export const makeFrontmatterFoldViewPlugin = makeFrontmatterFoldExtension;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildDecorations(state: any): DecorationSet {
  // Gate: only fold when frontmatter declares type: action | data.
  // Plain notes / non-snippet markdown pass through untouched.
  const doc = state.doc.toString();
  const type = readFrontmatterType(doc);
  if (type !== 'action' && type !== 'data') return Decoration.none;

  // Use a stable per-doc identity for the expanded-set key. We
  // don't have a TFile path from inside the StateField, so the doc
  // length + first-32-chars-hash serves as a cheap proxy. Re-opening
  // the same file produces the same key; editing the file invalidates
  // it (which means the user has to click "⋯" again to re-expand —
  // acceptable for V1).
  const docKey = `${state.doc.length}:${doc.slice(0, 32)}`;

  const expanded = state.field(expandedField, false) as Set<string> | undefined;
  if (expanded?.has(docKey)) return Decoration.none;

  const range = computeFrontmatterFoldRange(doc);
  if (!range) return Decoration.none;
  const docLen = state.doc.length;
  if (range.from < 0 || range.to > docLen || range.from >= range.to) {
    return Decoration.none;
  }
  const builder = new RangeSetBuilder<Decoration>();
  builder.add(
    range.from,
    range.to,
    Decoration.replace({
      widget: new FrontmatterPlaceholderWidget(docKey),
      block: false,
    }),
  );
  return builder.finish();
}
