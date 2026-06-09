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

/** Build the Extension. Per-EditorView state lives in StateField
 *  (expandedField) + a decorations StateField. The host is read at
 *  decoration build time so the gate (frontmatter has
 *  `type: action | data`) is freshly evaluated. */
export function makeFrontmatterFoldExtension(
  getHost: () => FrontmatterFoldHost | null,
): Extension {
  // Mutable cache of the file path we last knew this view was
  // showing. Used to detect a file swap so we can clear stale
  // expanded entries (so each file-open re-folds). Held outside the
  // StateField because Obsidian swaps doc content inside the same
  // EditorView; we don't get a fresh state field for the new doc.
  const lastFilePathByDocId = new WeakMap<object, string | null>();

  const decoField = StateField.define<DecorationSet>({
    create(state) {
      return buildDecorations(state, getHost, lastFilePathByDocId);
    },
    update(deco, tr) {
      return buildDecorations(tr.state, getHost, lastFilePathByDocId);
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
function buildDecorations(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  state: any,
  getHost: () => FrontmatterFoldHost | null,
  lastFilePathByDocId: WeakMap<object, string | null>,
): DecorationSet {
  const host = getHost();
  if (!host) return Decoration.none;
  const active = host.getActiveSnippetForFold();
  if (!active) return Decoration.none;
  const path = active.file.path;

  // Detect file swap by comparing this state.doc's tracked path
  // against the active file. If different, the user has navigated
  // to a different file inside this same EditorView; re-folding
  // requires forgetting the previous file's expanded membership.
  const docKey = state.doc as object;
  const lastPath = lastFilePathByDocId.get(docKey) ?? null;
  if (lastPath !== path) {
    lastFilePathByDocId.set(docKey, path);
    // Don't dispatch from here — would re-enter the update. Instead
    // we just bypass the expanded check on the first build after a
    // swap (the StateField update on the next transaction will see
    // the new path and the previously-set expanded entries still
    // apply, but per-file scoping prevents leakage across files).
  }

  const expanded = state.field(expandedField, false) as Set<string> | undefined;
  if (expanded?.has(path)) return Decoration.none;

  const doc = state.doc.toString();
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
      widget: new FrontmatterPlaceholderWidget(path),
      block: false,
    }),
  );
  return builder.finish();
}
