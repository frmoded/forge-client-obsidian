import { RangeSetBuilder } from '@codemirror/state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  ViewPlugin,
  ViewUpdate,
} from '@codemirror/view';

function buildSectionDecorations(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const doc = view.state.doc;
  const englishDeco = Decoration.line({ class: 'forge-english-line' });
  const pythonDeco = Decoration.line({ class: 'forge-python-line' });

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
      builder.add(line.from, line.from, englishDeco);
    } else if (trimmed === '# Python') {
      section = 'python';
      builder.add(line.from, line.from, pythonDeco);
    } else if (trimmed === '---') {
      section = 'none';
    } else if (section === 'english') {
      builder.add(line.from, line.from, englishDeco);
    } else if (section === 'python') {
      builder.add(line.from, line.from, pythonDeco);
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
