// v0.2.102 Item A — auto-collapse the YAML frontmatter on snippet
// file-open so students see `# English` first.
//
// v0.2.109 — switched from foldEffect-based dispatch to a
// Decoration.replace-based ViewPlugin. v0.2.108's cohort smoke
// (Tamar) confirmed:
//   - The ViewPlugin fires on file-open (constructor + update logs).
//   - The fold range computes correctly (from=3, to=~150 for a
//     typical snippet).
//   - `foldEffect.of(range)` dispatch lands in `foldedRanges` state
//     (post-dispatch probe showed 2 ranges including ours).
//   - But Obsidian's fold-decoration renderer DOES NOT visually
//     collapse the range. Hypothesis: Obsidian's renderer only
//     honors fold ranges aligned with markdown headings (the
//     facet-mutex's # English / # Python folds DO render); arbitrary
//     YAML byte-ranges are silently discarded at the render layer.
//
// Workaround: own the decoration. Replace the frontmatter range with
// a click-to-expand placeholder widget directly. Bypasses Obsidian's
// fold renderer entirely. Per-file expanded state lives on the
// plugin instance so re-opening a snippet folds again by default but
// in-session expand survives.

import type { App, TFile } from 'obsidian';
import {
  ViewPlugin,
  type ViewUpdate,
  type EditorView,
  Decoration,
  type DecorationSet,
  WidgetType,
} from '@codemirror/view';
import { RangeSetBuilder } from '@codemirror/state';

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

// Per-EditorView in-session expanded set. Keyed by file path so
// re-opening a different snippet still defaults to folded.
type ExpandedSet = Set<string>;

class FrontmatterPlaceholderWidget extends WidgetType {
  private readonly filePath: string;
  private readonly onExpand: () => void;
  constructor(filePath: string, onExpand: () => void) {
    super();
    this.filePath = filePath;
    this.onExpand = onExpand;
  }
  toDOM(): HTMLElement {
    const span = document.createElement('span');
    span.className = 'forge-frontmatter-placeholder';
    span.textContent = '⋯';
    span.title = 'Click to expand properties';
    span.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      this.onExpand();
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

export function makeFrontmatterFoldViewPlugin(
  getHost: () => FrontmatterFoldHost | null,
) {
  return ViewPlugin.fromClass(class {
    decorations: DecorationSet = Decoration.none;
    private currentFilePath: string | null = null;
    private expanded: ExpandedSet = new Set();
    private view: EditorView;

    constructor(view: EditorView) {
      this.view = view;
      this.refresh();
    }

    update(u: ViewUpdate) {
      const host = getHost();
      if (!host) {
        if (this.decorations !== Decoration.none) {
          this.decorations = Decoration.none;
        }
        return;
      }
      const active = host.getActiveSnippetForFold();
      const newPath = active?.file.path ?? null;
      if (newPath !== this.currentFilePath || u.docChanged) {
        this.currentFilePath = newPath;
        this.refresh();
      }
    }

    private refresh() {
      this.decorations = this.buildDecorations();
    }

    private buildDecorations(): DecorationSet {
      const host = getHost();
      if (!host) return Decoration.none;
      const active = host.getActiveSnippetForFold();
      if (!active) return Decoration.none;
      const path = active.file.path;
      if (this.expanded.has(path)) return Decoration.none;
      const doc = this.view.state.doc.toString();
      const range = computeFrontmatterFoldRange(doc);
      if (!range) return Decoration.none;
      const docLen = this.view.state.doc.length;
      if (range.from < 0 || range.to > docLen || range.from >= range.to) {
        return Decoration.none;
      }
      const builder = new RangeSetBuilder<Decoration>();
      builder.add(
        range.from,
        range.to,
        Decoration.replace({
          widget: new FrontmatterPlaceholderWidget(path, () => {
            this.expanded.add(path);
            // Re-render decorations now that the file is marked
            // expanded. ViewPlugin's update hook expects state changes
            // to come via dispatch transactions; for our purposes a
            // direct refresh + view.dispatch(no-op) is enough to
            // trigger a re-render.
            this.refresh();
            this.view.dispatch({});
          }),
        }),
      );
      return builder.finish();
    }
  }, {
    decorations: (v) => v.decorations,
  });
}
