// 2026-11-19-0991 - the Obsidian Modal around new-note-name-dom.ts: what "New phrase" / "New arrangement" / "New composition" open. Nothing but the frame lives here; the rules are new-note-name-core.ts, the dialog is
// new-note-name-dom.ts (both tested without Obsidian).
// Why not Obsidian's own "Note title" dialog (`fileManager.promptForFileRename`, the one 0975 made Cancel-aware): that dialog RENAMES a note that already exists (so a new note would have to be made first and taken away on Cancel, which
// is what 0975 had to do for a note a bar selection had already written); here a Cancel must leave the vault as it was, so the note is made only after the name is chosen. What is reused is the SHAPE of the plugin's own dialogs
// (kit-dom.ts + the Modal of kits-arrangements.ts): one DOM module, one frame.
import { Modal, type App } from 'obsidian';
import { NEW_NOTE_KINDS, checkNewNoteName, defaultNewNoteName, type NewNoteKind } from './new-note-name-core.ts';
import { mountNewNoteNameDialog, type MadeNote } from './new-note-name-dom.ts';

/** What the action does once there is a name: `beforeOpen` is called by the flow right before it opens the new note, which closes the dialog first (so the dialog cannot take the focus back from the composer the new note opens with). */
export type MakeNamedNote = (name: string, beforeOpen: () => void) => Promise<MadeNote>;

class NewNoteNameModal extends Modal {
  private handle: { dispose(): void } | null = null;
  private done = false;
  private made = false;
  constructor(private readonly vaultApp: App, private readonly kind: NewNoteKind, private readonly make: MakeNamedNote) { super(vaultApp); }

  private finish(): void { if (this.done) return; this.done = true; this.close(); }
  private notePaths(): string[] { return this.vaultApp.vault.getMarkdownFiles().map((f) => f.path); }

  onOpen(): void {
    const info = NEW_NOTE_KINDS[this.kind];
    const initial = defaultNewNoteName(this.kind, this.notePaths());
    console.info(`[forge-newname] ${info.title}: the name dialog opened (default ${initial === '' ? 'none' : initial})`);
    this.handle = mountNewNoteNameDialog(this.contentEl, {
      title: info.title, noun: info.noun, initial,
      check: (raw) => checkNewNoteName(this.kind, raw, this.notePaths()),
      create: async (name) => {
        const made = await this.make(name, () => { this.made = true; this.finish(); });          // the flow calls this once the note is written, right before it opens it
        if (made.ok) this.made = true;
        return made;
      },
      close: () => { this.finish(); },
      trace: (line) => { console.info(line); },
    });
  }

  onClose(): void {
    this.done = true;
    if (!this.made) console.info(`[forge-newname] ${NEW_NOTE_KINDS[this.kind].title}: the name dialog closed without a name: nothing was made`);
    this.handle?.dispose();
    this.contentEl.empty();
  }
}

/** Open the name dialog of one kind of new note. Nothing is made until a valid name is confirmed in it. */
export function openNewNoteNameDialog(app: App, kind: NewNoteKind, make: MakeNamedNote): void {
  new NewNoteNameModal(app, kind, make).open();
}
