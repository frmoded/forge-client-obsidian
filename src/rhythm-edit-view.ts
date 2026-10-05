// Beat-as-data Phase 5 (drain 2026-10-05-2100) — "Edit rhythm in Rhythm Box": open a rhythm data note in the Rhythm Box widget,
// edit it by eye, and Save the pattern back into the note. The Obsidian-coupled half; every decision lives in rhythm-edit-core.ts
// (pure, unit-tested). This file is a thin composition of that core + Obsidian's vault/view APIs, like html-embed-view.ts —
// the live round trip needs a real Obsidian (see the drain's FEEDBACK for the manual checklist).
//
// Hosting: the widget is rendered through createSandboxedWidgetIframe (html-embed-view.ts) — the SAME blob-URL iframe, with the
// same sandbox flags (allow-scripts + allow-same-origin, nothing wider), as every html-embed widget. No second iframe code path.
//
// Trust: only messages whose `event.source` is OUR iframe's window are considered; everything else is ignored. A malformed message
// from the widget is dropped with a console warning and never written. A save is validated BEFORE any write, written with one
// atomic `vault.process` (read-modify-write), replaces ONLY the note's json block, and is refused if the note changed on disk
// since it was opened or if it is marked `read_only: true` (constitution D7).

import { ItemView, Notice, TFile, type App, type Menu, type Plugin, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { createSandboxedWidgetIframe } from './html-embed-view.ts';
import {
  RHYTHM_BOX_WIDGET_PATH,
  applySave,
  buildLoadMessage,
  buildSaveResultMessage,
  contentFingerprint,
  isRhythmEditCandidate,
  parseWidgetMessage,
  readRhythmNote,
} from './rhythm-edit-core.ts';

export const RHYTHM_EDIT_VIEW_TYPE = 'forge-rhythm-edit';
export const RHYTHM_EDIT_COMMAND_NAME = 'Edit rhythm in Rhythm Box';

/** Thrown inside the vault.process callback to ABORT the write (nothing is written when the callback throws). */
class RhythmSaveRefused extends Error {}

export class RhythmEditView extends ItemView {
  private file: TFile | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private blobUrl: string | null = null;
  /** Fingerprint of the note's full text when it was last loaded into / saved from the widget; a save is refused if the note differs. */
  private fingerprint = '';
  private saving = false;

  private readonly onMessage = (ev: MessageEvent): void => {
    // Only OUR iframe may talk to us. (The widget makes the mirror check: it accepts only its embedding window.)
    if (!this.iframe || ev.source !== this.iframe.contentWindow) return;
    const msg = parseWidgetMessage(ev.data);
    if (msg.kind === 'ignored') return;
    if (msg.kind === 'malformed') {
      console.warn('[forge] rhythm-edit: dropped a malformed message from the widget:', msg.reason);
      return;
    }
    if (msg.kind === 'ready') {
      void this.sendLoad();
      return;
    }
    void this.save(msg.data);
  };

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return RHYTHM_EDIT_VIEW_TYPE; }
  getDisplayText(): string { return this.file ? `Rhythm: ${this.file.basename}` : 'Rhythm Box'; }
  getIcon(): string { return 'music'; }

  getState(): Record<string, unknown> {
    return { filePath: this.file?.path ?? null };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const filePath = (state as { filePath?: unknown } | null)?.filePath;
    if (typeof filePath === 'string') await this.mount(filePath);
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('forge-rhythm-edit-view');
    window.addEventListener('message', this.onMessage);
  }

  async onClose(): Promise<void> {
    window.removeEventListener('message', this.onMessage);
    this.releaseIframe();
  }

  private releaseIframe(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.iframe = null;
  }

  private fail(message: string): void {
    new Notice(message, 8000);
    this.leaf.detach();
  }

  private async mount(filePath: string): Promise<void> {
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return this.fail(`Edit rhythm: ${filePath} was not found.`);
    const note = readRhythmNote(await this.app.vault.read(file));
    if (note.ok === false) return this.fail(`Edit rhythm: ${note.message}`);
    const widget = this.app.vault.getAbstractFileByPath(RHYTHM_BOX_WIDGET_PATH);
    if (!(widget instanceof TFile)) {
      return this.fail(`Edit rhythm: the Rhythm Box widget was not found at ${RHYTHM_BOX_WIDGET_PATH} (it ships in the music-theory vault).`);
    }
    const html = await this.app.vault.read(widget);
    if (!html.trim()) return this.fail(`Edit rhythm: ${RHYTHM_BOX_WIDGET_PATH} is empty.`);

    this.file = file;
    this.releaseIframe();
    this.contentEl.empty();
    const { iframe, blobUrl } = createSandboxedWidgetIframe(this.contentEl, html, '100%');
    this.iframe = iframe;
    this.blobUrl = blobUrl;
  }

  /** Answer the widget's `ready`: re-read the note fresh, remember its fingerprint, and send the pattern. */
  private async sendLoad(): Promise<void> {
    if (!this.file || !this.iframe) return;
    const text = await this.app.vault.read(this.file);
    const note = readRhythmNote(text);
    if (note.ok === false) {
      new Notice(`Edit rhythm: ${note.message}`, 8000);
      return;
    }
    this.fingerprint = note.value.fingerprint;
    this.iframe.contentWindow?.postMessage(buildLoadMessage(note.value.data, this.file.basename), '*');
  }

  private reply(ok: boolean, message: string): void {
    this.iframe?.contentWindow?.postMessage(buildSaveResultMessage(ok, message), '*');
  }

  /** Write the widget's pattern back. Validation, the staleness check and the read_only check all run inside one atomic
   *  read-modify-write; a refusal throws and so writes nothing. */
  private async save(payload: unknown): Promise<void> {
    if (!this.file || this.saving) return;
    this.saving = true;
    const file = this.file;
    let written = '';
    try {
      await this.app.vault.process(file, (current) => {
        const result = applySave(current, this.fingerprint, payload);
        if (result.ok === false) throw new RhythmSaveRefused(result.message);
        written = result.text;
        return result.text;
      });
      this.fingerprint = contentFingerprint(written);
      this.reply(true, `Saved to ${file.basename}`);
      new Notice(`Saved to ${file.basename}`);
    } catch (e) {
      const message = e instanceof RhythmSaveRefused ? e.message : `Not saved: ${(e as Error)?.message ?? e}`;
      console.warn('[forge] rhythm-edit: save refused or failed:', message);
      this.reply(false, message);
      new Notice(message, 8000);
    } finally {
      this.saving = false;
    }
  }
}

/** Open the editor for `file`, after checking up front that it really is an editable rhythm note (so the user gets a Notice naming
 *  why, instead of an empty pane). */
export async function openRhythmEditor(app: App, file: TFile): Promise<void> {
  const note = readRhythmNote(await app.vault.read(file));
  if (note.ok === false) {
    new Notice(`Edit rhythm: ${note.message}`, 8000);
    return;
  }
  const leaf = app.workspace.getLeaf('tab');
  await leaf.setViewState({ type: RHYTHM_EDIT_VIEW_TYPE, active: true, state: { filePath: file.path } });
}

function isCandidateFile(app: App, file: TFile | null | undefined): file is TFile {
  if (!file || file.extension !== 'md') return false;
  return isRhythmEditCandidate(app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined);
}

/** Register the view, the command (visible only on a `type: data`, `content_type: json` note) and the file / editor context-menu items. */
export function registerRhythmEdit(plugin: Plugin): void {
  const app = plugin.app;
  plugin.registerView(RHYTHM_EDIT_VIEW_TYPE, (leaf) => new RhythmEditView(leaf));
  plugin.addCommand({
    id: 'edit-rhythm-in-rhythm-box',
    name: RHYTHM_EDIT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const file = app.workspace.getActiveFile();
      if (!isCandidateFile(app, file)) return false;
      if (!checking) void openRhythmEditor(app, file);
      return true;
    },
  });
  const addItem = (menu: Menu, file: TFile) => {
    menu.addItem((item) => item.setTitle(RHYTHM_EDIT_COMMAND_NAME).setIcon('music').onClick(() => { void openRhythmEditor(app, file); }));
  };
  plugin.registerEvent(app.workspace.on('file-menu', (menu, file) => {
    if (file instanceof TFile && isCandidateFile(app, file)) addItem(menu, file);
  }));
  plugin.registerEvent(app.workspace.on('editor-menu', (menu, _editor, view) => {
    const file = view.file;
    if (file && isCandidateFile(app, file)) addItem(menu, file);
  }));
}
