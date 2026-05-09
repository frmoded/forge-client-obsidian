import { EditorState, RangeSetBuilder, Text, Transaction } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
  WidgetType,
} from '@codemirror/view';

// Phase 6.5: when a snippet is in `edit_mode: python`, the # English facet
// is read-only and vice versa. The CodeMirror plugin below decorates the
// inactive facet's lines with a dimming class and a small inline label, and
// the exported transaction filter blocks user-input transactions targeting
// the inactive range. Programmatic state changes (Obsidian's vault.modify
// writeback when /generate produces new python, or processFrontMatter
// rewrites) pass through unblocked because they don't carry a userEvent
// annotation.

type EditMode = 'english' | 'python';

interface DocAnalysis {
  isActionSnippet: boolean;
  editMode: EditMode;
  englishHeadingLine: number | null;  // 1-indexed; null = no # English heading
  englishBodyEndLine: number | null;  // last line included in the English body
  pythonHeadingLine: number | null;
  pythonBodyEndLine: number | null;
}

// Walk the doc once to discover (a) whether this is an action snippet,
// (b) which edit_mode it claims, and (c) the line ranges of # English and
// # Python sections. Cheap (O(N) lines) and recomputed on every doc change
// or viewport update.
function analyzeDoc(doc: Text): DocAnalysis {
  let isActionSnippet = false;
  let editMode: EditMode = 'english';
  let englishHeadingLine: number | null = null;
  let englishBodyEndLine: number | null = null;
  let pythonHeadingLine: number | null = null;
  let pythonBodyEndLine: number | null = null;

  type Section = 'none' | 'frontmatter' | 'english' | 'python';
  let section: Section = 'none';

  const closeCurrent = (n: number) => {
    if (section === 'english' && englishBodyEndLine === null) {
      englishBodyEndLine = n - 1;
    } else if (section === 'python' && pythonBodyEndLine === null) {
      pythonBodyEndLine = n - 1;
    }
  };

  for (let n = 1; n <= doc.lines; n++) {
    const trimmed = doc.line(n).text.trim();

    if (n === 1 && trimmed === '---') {
      section = 'frontmatter';
      continue;
    }
    if (section === 'frontmatter') {
      if (trimmed === '---') {
        section = 'none';
        continue;
      }
      // Crude `key: value` parse — covers all the keys we care about
      // (type, edit_mode, locked). Quoted YAML values lose their quotes.
      const m = trimmed.match(/^([\w_]+):\s*"?([^"]*)"?\s*$/);
      if (m) {
        const key = m[1];
        const val = m[2].trim();
        if (key === 'type' && val === 'action') isActionSnippet = true;
        if (key === 'edit_mode' && val === 'python') editMode = 'python';
        // Phase 5 legacy alias — still honored for one cycle.
        if (key === 'locked' && val === 'true') editMode = 'python';
      }
      continue;
    }

    if (trimmed === '# English') {
      closeCurrent(n);
      section = 'english';
      englishHeadingLine = n;
    } else if (trimmed === '# Python') {
      closeCurrent(n);
      section = 'python';
      pythonHeadingLine = n;
    } else if (trimmed === '---' || /^#+\s/.test(trimmed)) {
      // Any other heading or `---` separator terminates the current
      // section. Subsequent lines are considered out-of-section until the
      // next # English / # Python heading.
      closeCurrent(n);
      section = 'none';
    }
  }
  if (section === 'english' && englishBodyEndLine === null) englishBodyEndLine = doc.lines;
  if (section === 'python' && pythonBodyEndLine === null) pythonBodyEndLine = doc.lines;

  return {
    isActionSnippet,
    editMode,
    englishHeadingLine,
    englishBodyEndLine,
    pythonHeadingLine,
    pythonBodyEndLine,
  };
}

// Inline pill rendered at the end of the inactive facet's heading line.
// Subtle font + opacity so it doesn't compete with the heading itself; the
// dimming on the body below is the primary "this is read-only" signal.
class ReadOnlyLabelWidget extends WidgetType {
  constructor(private switchToMode: 'English' | 'Python') { super(); }
  eq(other: ReadOnlyLabelWidget) {
    return other.switchToMode === this.switchToMode;
  }
  toDOM() {
    const span = document.createElement('span');
    span.className = 'forge-facet-readonly-label';
    span.textContent = `  read-only · switch to ${this.switchToMode} mode to edit`;
    return span;
  }
  ignoreEvent() { return true; }
}

function buildSectionDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const info = analyzeDoc(doc);

  const englishReadOnly = info.isActionSnippet && info.editMode === 'python';
  const pythonReadOnly = info.isActionSnippet && info.editMode === 'english';

  const englishLineDeco = Decoration.line({
    class: englishReadOnly
      ? 'forge-english-line forge-facet-readonly'
      : 'forge-english-line',
  });
  const pythonLineDeco = Decoration.line({
    class: pythonReadOnly
      ? 'forge-python-line forge-facet-readonly'
      : 'forge-python-line',
  });

  type Section = 'none' | 'frontmatter' | 'english' | 'python';
  let section: Section = 'none';

  for (let n = 1; n <= doc.lines; n++) {
    const line = doc.line(n);
    const trimmed = line.text.trim();

    if (n === 1 && trimmed === '---') { section = 'frontmatter'; continue; }
    if (section === 'frontmatter') {
      if (trimmed === '---') section = 'none';
      continue;
    }

    if (trimmed === '# English') {
      section = 'english';
      builder.add(line.from, line.from, englishLineDeco);
      if (englishReadOnly) {
        builder.add(line.to, line.to, Decoration.widget({
          widget: new ReadOnlyLabelWidget('Python'),
          side: 1,
        }));
      }
    } else if (trimmed === '# Python') {
      section = 'python';
      builder.add(line.from, line.from, pythonLineDeco);
      if (pythonReadOnly) {
        builder.add(line.to, line.to, Decoration.widget({
          widget: new ReadOnlyLabelWidget('English'),
          side: 1,
        }));
      }
    } else if (trimmed === '---') {
      section = 'none';
    } else if (section === 'english') {
      builder.add(line.from, line.from, englishLineDeco);
    } else if (section === 'python') {
      builder.add(line.from, line.from, pythonLineDeco);
    }
  }

  return builder.finish();
}

export const sectionPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = buildSectionDecorations(view);
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged) {
        this.decorations = buildSectionDecorations(update.view);
      }
    }
  },
  { decorations: v => v.decorations }
);

// Reject user-input transactions that touch the inactive facet's range.
// Programmatic transactions (no userEvent annotation) pass through — that's
// what carries the post-/generate writeback that Forge does in English mode,
// and the frontmatter rewrite when toggleEditMode flips edit_mode.
export const readOnlyFacetFilter = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  if (!tr.annotation(Transaction.userEvent)) return tr;

  const doc = tr.startState.doc;
  const info = analyzeDoc(doc);
  if (!info.isActionSnippet) return tr;

  let roFrom: number | null = null;
  let roTo: number | null = null;
  if (info.editMode === 'python' && info.englishHeadingLine !== null) {
    roFrom = doc.line(info.englishHeadingLine).from;
    roTo = doc.line(info.englishBodyEndLine ?? doc.lines).to;
  } else if (info.editMode === 'english' && info.pythonHeadingLine !== null) {
    roFrom = doc.line(info.pythonHeadingLine).from;
    roTo = doc.line(info.pythonBodyEndLine ?? doc.lines).to;
  }
  if (roFrom === null || roTo === null) return tr;

  let blocked = false;
  tr.changes.iterChanges((fromA, toA) => {
    if (fromA <= roTo! && toA >= roFrom!) blocked = true;
  });
  return blocked ? [] : tr;
});
