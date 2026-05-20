import { ItemView, WorkspaceLeaf, MarkdownView, Notice } from 'obsidian';

// Chip-palette POC for moda. One hardcoded chip; the framework is
// deliberately thin so v2 can decide whether to scale it (multiple
// chips, data-snippet-driven definitions, context filtering) without
// us having pre-committed to abstractions. Single chip = single button
// that calls `insertChip` on the active editor.

export const MODA_CHIPS_VIEW_TYPE = 'forge-moda-chips-view';

/** Minimal surface the chip view needs from the plugin — kept narrow
 *  so this module doesn't import main.ts. */
export interface ModaChipsHost {
  /** True iff the current vault declared "moda" in forge.toml's
   *  `domains` (or declared no domains at all — back-compat). */
  isMoDaVault(): boolean;
}

interface Chip {
  label: string;          // visible button text
  insertText: string;     // procedural-facet line to append
}

const CHIPS: Chip[] = [
  { label: 'set ink mass', insertText: 'Call set_ink_mass.' },
];

export class ModaChipsView extends ItemView {
  constructor(leaf: WorkspaceLeaf, private host: ModaChipsHost) {
    super(leaf);
    // The view's contents depend on which file is active, so re-render
    // on the two events that change that. file-open is the primary
    // one; active-leaf-change covers the "user moved focus to a
    // different already-open tab" case.
    this.registerEvent(
      this.app.workspace.on('active-leaf-change', () => this.render()));
    this.registerEvent(
      this.app.workspace.on('file-open', () => this.render()));
  }

  getViewType() { return MODA_CHIPS_VIEW_TYPE; }
  getDisplayText() { return 'MoDa chips'; }
  getIcon() { return 'sparkles'; }

  async onOpen() { this.render(); }
  async onClose() { /* nothing to tear down */ }

  private render() {
    const root = this.contentEl;
    root.empty();
    root.addClass('forge-moda-chips-view');
    root.createEl('h3', { text: 'MoDa chips' });

    // Vault-level gate first: if the surrounding vault isn't a moda
    // vault, the entire pane is dormant. Obsidian is one-vault-per-
    // window, so "the vault" is the only vault — we read it from the
    // plugin's already-cached activeDomains rather than re-parsing
    // forge.toml here.
    if (!this.host.isMoDaVault()) {
      root.createEl('p', {
        text:
          'No chips for this vault — switch to a moda snippet to see chips.',
      });
      return;
    }

    // File-level gate: we need an active markdown editor to insert
    // into. If nothing's open (or the open file isn't markdown),
    // explain rather than render a chip that would fail on click.
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!active?.file) {
      root.createEl('p', { text: 'Open a moda snippet to see chips.' });
      return;
    }

    const row = root.createDiv({ cls: 'forge-chip-row' });
    for (const chip of CHIPS) {
      const btn = row.createEl('button', {
        text: chip.label,
        cls: 'forge-chip',
      });
      // Resolve the active markdown view at CLICK time, not render
      // time — render-time capture goes stale if the user switches
      // files between the chip pane re-rendering and clicking.
      btn.onclick = () => {
        const current = this.app.workspace.getActiveViewOfType(MarkdownView);
        if (!current?.file) {
          new Notice('Forge chips: no markdown file is focused. ' +
            'Click into the moda snippet first, then click the chip.');
          return;
        }
        this.insertChip(current, chip.insertText);
      };
    }
  }

  /** Append a single-line procedural-facet statement to the END of the
   *  active file's `# English` section (just below the last non-blank
   *  content line, before the next heading or EOF).
   *
   *  Prefers the editor API (so undo is a single step in Source / Live
   *  Preview). Falls back to vault.process in Reading mode — in
   *  reading mode the CodeMirror editor has no live DOM, so
   *  editor.replaceRange would be a silent no-op for the user. The
   *  fallback writes through the file and the reading view re-renders.
   */
  private async insertChip(view: MarkdownView, text: string) {
    const mode = view.getMode();  // 'source' (incl. Live Preview) | 'preview'

    if (mode === 'source') {
      const editor = view.editor;
      const total = editor.lineCount();
      const found = findEnglishInsertLine(total, (i) => editor.getLine(i));
      if (found === null) {
        new Notice('Forge chips: this file has no # English section — ' +
          'nothing to insert into.');
        return;
      }
      const lineText = editor.getLine(found);
      const insertPos = { line: found, ch: lineText.length };
      editor.replaceRange('\n' + text, insertPos, insertPos);
      new Notice(`Forge chips: inserted "${text}".`);
      return;
    }

    // Reading mode: rewrite through the vault. Cmd+Z in the editor
    // won't undo this (no editor history) but Cmd+Z on the file via
    // Obsidian's file-history works; the trade is fine for an
    // explicit-action button.
    const file = view.file;
    if (!file) {
      new Notice('Forge chips: no file to write to.');
      return;
    }
    let succeeded = false;
    await view.app.vault.process(file, (content) => {
      const lines = content.split('\n');
      const found = findEnglishInsertLine(lines.length, (i) => lines[i]);
      if (found === null) return content;
      const result = [
        ...lines.slice(0, found + 1),
        text,
        ...lines.slice(found + 1),
      ].join('\n');
      succeeded = true;
      return result;
    });
    new Notice(succeeded
      ? `Forge chips: inserted "${text}".`
      : 'Forge chips: this file has no # English section — nothing to insert into.');
  }
}

/** Shared between source-mode (editor API) and reading-mode (file
 *  rewrite) paths. Returns the 0-indexed line number to insert AFTER
 *  — the last non-blank content line of `# English`, falling back to
 *  the heading itself when the section is empty. `null` = no
 *  `# English` heading in the file. */
function findEnglishInsertLine(
  total: number,
  getLine: (i: number) => string,
): number | null {
  let englishStart = -1;
  for (let i = 0; i < total; i++) {
    if (/^#{1,6}\s+english\s*$/i.test(getLine(i).trim())) {
      englishStart = i;
      break;
    }
  }
  if (englishStart === -1) return null;

  let endIdx = total;
  for (let i = englishStart + 1; i < total; i++) {
    const t = getLine(i).trim();
    if (t.startsWith('#') || t === '---') { endIdx = i; break; }
  }

  let lastContent = englishStart;
  for (let i = endIdx - 1; i > englishStart; i--) {
    if (getLine(i).trim() !== '') { lastContent = i; break; }
  }
  return lastContent;
}
