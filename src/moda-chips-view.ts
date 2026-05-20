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
      btn.onclick = () => this.insertChip(active, chip.insertText);
    }
  }

  /** Append a single-line procedural-facet statement to the END of the
   *  active file's `# English` section (just below the last non-blank
   *  content line, before the next heading or EOF).
   *
   *  Goes through the editor API rather than vault.modify so undo
   *  works as one step and the open editor view picks up the change
   *  without a reload race.
   */
  private insertChip(view: MarkdownView, text: string) {
    const editor = view.editor;
    const total = editor.lineCount();

    // Locate the # English heading.
    let englishStart = -1;
    for (let i = 0; i < total; i++) {
      if (/^#{1,6}\s+english\s*$/i.test(editor.getLine(i).trim())) {
        englishStart = i;
        break;
      }
    }
    if (englishStart === -1) {
      new Notice(
        'Forge chips: this file has no # English section — nothing to insert into.');
      return;
    }

    // Find the section boundary: next heading or `---`, else EOF.
    let endIdx = total;
    for (let i = englishStart + 1; i < total; i++) {
      const t = editor.getLine(i).trim();
      if (t.startsWith('#') || t === '---') { endIdx = i; break; }
    }

    // Last non-blank content line within the English section, falling
    // back to the heading line itself when the section is empty.
    let lastContent = englishStart;
    for (let i = endIdx - 1; i > englishStart; i--) {
      if (editor.getLine(i).trim() !== '') { lastContent = i; break; }
    }

    // Insert at end of `lastContent` so the result is one new line
    // directly below the last content. CodeMirror treats the inserted
    // '\n' + text as a single undoable edit.
    const lineText = editor.getLine(lastContent);
    const insertPos = { line: lastContent, ch: lineText.length };
    editor.replaceRange('\n' + text, insertPos, insertPos);
  }
}
