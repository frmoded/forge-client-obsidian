// 2026-11-17-2001 - "Insert a link to a note" in the composer's "+" menu: a fuzzy picker over the vault's notes, answering the link text ([[...]] is added by the composer). Obsidian glue: not unit-tested (the composer's
// menu and the insertion at the caret are, in prompt-box-dom.test.ts); the answer is null when the person closes it.
import { FuzzySuggestModal, type App, type TFile } from 'obsidian';

class NotePicker extends FuzzySuggestModal<TFile> {
  private chosen: TFile | null = null;
  constructor(app: App, private readonly done: (link: string | null) => void) { super(app); this.setPlaceholder('Link to a note...'); }
  getItems(): TFile[] { return this.app.vault.getMarkdownFiles(); }
  getItemText(file: TFile): string { return file.path.replace(/\.md$/, ''); }
  onChooseItem(file: TFile): void { this.chosen = file; }
  onClose(): void {
    super.onClose();
    const file = this.chosen;
    window.setTimeout(() => { this.done(file ? this.app.metadataCache.fileToLinktext(file, '') : null); }, 0);      // after onChooseItem has run
  }
}
export function pickNoteLink(app: App): Promise<string | null> {
  return new Promise((resolve) => { new NotePicker(app, resolve).open(); });
}
