// Beat-as-data Phase 5 + 5b (drains 2026-10-05-2100, 2026-10-06-1200) — a rhythm data note, viewed as a Beat Box.
//
// The note's OWN tab switches view: markdown ⇄ Beat Box ("Open as Beat Box" in a matching note's header; "Open as JSON" in the Beat
// Box's header). Edits in the widget AUTOSAVE into the note's json block; there is no Save button. The Obsidian-coupled half —
// every decision lives in the pure cores: rhythm-edit-core.ts (protocol, validation, the note session) and rhythm-autosave-core.ts
// (debounce / one-in-flight / flush / error persistence). This file wires them to the vault, the leaf and the timers; like
// html-embed-view.ts it is not unit-run (the wiring pins in rhythm-edit-view.test.ts read its source). The live behaviour needs a
// real Obsidian — see the drain's FEEDBACK for the manual checklist.
//
// Hosting: the widget is rendered through createSandboxedWidgetIframe (html-embed-view.ts) — the SAME blob-URL iframe, with the
// same sandbox flags (allow-scripts + allow-same-origin, nothing wider), as every html-embed widget. No second iframe code path.
//
// Trust: only messages whose `event.source` is OUR iframe's window are considered. A malformed message is dropped with a console
// warning and never written. A write is validated BEFORE it happens, made with one atomic `vault.process`, replaces ONLY the
// note's json block, and is refused if the note changed on disk since the baseline or if it is marked `read_only: true` (D7).

import { ItemView, MarkdownView, Notice, TFile, type App, type Menu, type Plugin, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { createSandboxedWidgetIframe } from './html-embed-view.ts';
import { createAutosavePipeline, type AutosavePipeline, type SaveOutcome } from './rhythm-autosave-core.ts';
import {
  RHYTHM_BOX_WIDGET_PATH,
  RhythmNoteSession,
  buildLoadMessage,
  buildStatusMessage,
  isRhythmEditCandidate,
  parseWidgetMessage,
  readRhythmNote,
} from './rhythm-edit-core.ts';

export const RHYTHM_EDIT_VIEW_TYPE = 'forge-rhythm-edit';
export const RHYTHM_EDIT_COMMAND_NAME = 'Edit rhythm in Rhythm Box';
export const OPEN_AS_BEAT_BOX_TITLE = 'Open as Beat Box';
export const OPEN_AS_JSON_TITLE = 'Open as JSON';
const EXTERNAL_CHANGE_MESSAGE = 'The note changed on disk — your latest edit was not saved. Reload from the note to continue.';

/** Thrown inside the vault.process callback to ABORT the write (nothing is written when the callback throws). */
class RhythmSaveRefused extends Error {
  constructor(readonly kind: 'invalid' | 'stale' | 'refused', message: string) {
    super(message);
  }
}

export class RhythmEditView extends ItemView {
  private file: TFile | null = null;
  /** The path this pane was asked to show — kept even when the file cannot be loaded, so "Open as JSON" can still switch back. */
  private filePath: string | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private blobUrl: string | null = null;
  private session: RhythmNoteSession | null = null;
  private pipeline: AutosavePipeline | null = null;

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
    if (msg.kind === 'reload') {
      void this.reloadFromNote();
      return;
    }
    this.pipeline?.submit(msg.data);
  };

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
    this.addAction('braces', OPEN_AS_JSON_TITLE, () => { void this.openAsJson(); });
  }

  getViewType(): string { return RHYTHM_EDIT_VIEW_TYPE; }
  getDisplayText(): string { return this.file ? `Rhythm: ${this.file.basename}` : 'Rhythm Box'; }
  getIcon(): string { return 'music'; }

  getState(): Record<string, unknown> {
    return { filePath: this.filePath };
  }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const filePath = (state as { filePath?: unknown } | null)?.filePath;
    if (typeof filePath === 'string') await this.mount(filePath);
    await super.setState(state, result);
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass('forge-rhythm-edit-view');
    window.addEventListener('message', this.onMessage);
    // The vault `modify` event for the open note: our own writes are recognised and ignored; an external change reloads the widget
    // (nothing pending) or halts autosave with a "Reload from note" prompt (a save pending). Never written over.
    this.registerEvent(this.app.vault.on('modify', (f) => {
      if (this.file && f.path === this.file.path) void this.onNoteModified();
    }));
  }

  async onClose(): Promise<void> {
    window.removeEventListener('message', this.onMessage);
    await this.flush();
    this.pipeline?.dispose();
    this.pipeline = null;
    this.releaseIframe();
  }

  /** Write any pending edit now (close, switch back to JSON, navigation, plugin unload). */
  async flush(): Promise<void> {
    await this.pipeline?.flush();
  }

  private releaseIframe(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.iframe = null;
  }

  /** The note is gone: nothing to show and nothing to switch back to, so the pane closes (with a Notice). */
  private fail(message: string): void {
    new Notice(message, 8000);
    this.leaf.detach();
  }

  /** The note exists but cannot be shown as a Beat Box (now, or any more): say why, and offer the way out — "Open as JSON". */
  private showRefusal(message: string): void {
    this.releaseIframe();
    this.contentEl.empty();
    const box = this.contentEl.createDiv({ cls: 'forge-rhythm-edit-refusal' });
    box.createEl('p', { text: message });
    const btn = box.createEl('button', { text: OPEN_AS_JSON_TITLE });
    btn.addEventListener('click', () => { void this.openAsJson(); });
  }

  private async mount(filePath: string): Promise<void> {
    await this.flush();                       // a previous note's pending edit is written before this pane moves to another note
    this.pipeline?.dispose();
    this.pipeline = null;
    this.session = null;
    this.filePath = filePath;
    const file = this.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return this.fail(`Edit rhythm: ${filePath} was not found.`);
    this.file = file;
    const text = await this.app.vault.read(file);
    const note = readRhythmNote(text);
    if (note.ok === false) return this.showRefusal(`Edit rhythm: ${note.message}`);
    const widget = this.app.vault.getAbstractFileByPath(RHYTHM_BOX_WIDGET_PATH);
    if (!(widget instanceof TFile)) {
      return this.showRefusal(`Edit rhythm: the Rhythm Box widget was not found at ${RHYTHM_BOX_WIDGET_PATH} (it ships in the music-theory vault).`);
    }
    const html = await this.app.vault.read(widget);
    if (!html.trim()) return this.showRefusal(`Edit rhythm: ${RHYTHM_BOX_WIDGET_PATH} is empty.`);

    this.session = RhythmNoteSession.fromText(text);
    this.pipeline = createAutosavePipeline({
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      write: (payload) => this.writeNote(file, payload),
      onStatus: (s) => { this.iframe?.contentWindow?.postMessage(buildStatusMessage(s), '*'); },
    });
    this.releaseIframe();
    this.contentEl.empty();
    const { iframe, blobUrl } = createSandboxedWidgetIframe(this.contentEl, html, '100%');
    this.iframe = iframe;
    this.blobUrl = blobUrl;
  }

  /** Answer the widget's `ready` (and a reload): re-read the note fresh, take its text as the new baseline, and send the pattern. */
  private async sendLoad(): Promise<void> {
    if (!this.file || !this.session) return;
    const text = await this.app.vault.read(this.file);
    const note = readRhythmNote(text);
    if (note.ok === false) {
      this.showRefusal(`Edit rhythm: ${note.message}`);     // the note stopped being rhythm data (e.g. hand-edited in the JSON view)
      return;
    }
    if (!this.iframe) return;
    this.session.rebaseline(text);
    this.iframe.contentWindow?.postMessage(buildLoadMessage(note.value.data, this.file.basename), '*');
  }

  /** "Reload from note": drop the halt and any error, then load what is on disk now. */
  private async reloadFromNote(): Promise<void> {
    this.pipeline?.resume();
    await this.sendLoad();
  }

  private async onNoteModified(): Promise<void> {
    const file = this.file;
    const session = this.session;
    const pipeline = this.pipeline;
    if (!file || !session || !pipeline) return;
    const verdict = session.classifyModify(await this.app.vault.read(file), pipeline.busy());
    if (verdict === 'reload') await this.sendLoad();
    else if (verdict === 'conflict') pipeline.halt(EXTERNAL_CHANGE_MESSAGE);
  }

  /** The autosave pipeline's one write: validation, the staleness check and the read_only check all run inside one atomic
   *  read-modify-write; a refusal throws and so writes nothing. On success the written text becomes the new baseline. */
  private async writeNote(file: TFile, payload: unknown): Promise<SaveOutcome> {
    const session = this.session;
    if (!session) return { ok: false, kind: 'error', message: 'Not saved: no note is open' };
    try {
      await this.app.vault.process(file, (current) => {
        const result = session.apply(current, payload);
        if (result.ok === false) throw new RhythmSaveRefused(result.kind, result.message);
        return result.text;
      });
      session.commit();
      return { ok: true };
    } catch (e) {
      session.rollback();
      if (e instanceof RhythmSaveRefused) {
        console.warn('[forge] rhythm-edit: save refused:', e.message);
        return { ok: false, kind: e.kind, message: e.message };
      }
      const message = `Not saved: ${(e as Error)?.message ?? e}`;
      console.warn('[forge] rhythm-edit: save failed:', message);
      return { ok: false, kind: 'error', message };
    }
  }

  /** Switch THIS tab back to the note's normal markdown view (pending edits are written first). */
  private async openAsJson(): Promise<void> {
    const filePath = this.filePath ?? this.file?.path;
    if (!filePath) return;
    await this.flush();
    await this.leaf.setViewState({ type: 'markdown', active: true, state: { file: filePath } });
  }
}

/** Switch `leaf` (the note's own tab) to the Beat Box for `file`. The ONLY place that changes a leaf to the rhythm view — it never
 *  opens a tab. A matching note is checked up front, so the user gets a Notice naming why instead of an empty pane. */
export async function switchLeafToBeatBox(app: App, leaf: WorkspaceLeaf, file: TFile): Promise<void> {
  const note = readRhythmNote(await app.vault.read(file));
  if (note.ok === false) {
    new Notice(`Edit rhythm: ${note.message}`, 8000);
    return;
  }
  await leaf.setViewState({ type: RHYTHM_EDIT_VIEW_TYPE, active: true, state: { filePath: file.path } });
}

/** The command / file-menu entry: "switch this note's tab to Beat Box". A tab already showing the note is reused; only when there
 *  is none (the note is not open) does a new tab open. */
export async function openRhythmEditor(app: App, file: TFile, from?: WorkspaceLeaf | null): Promise<void> {
  const own = from ?? app.workspace.getLeavesOfType('markdown').find((l) => l.view instanceof MarkdownView && l.view.file?.path === file.path);
  await switchLeafToBeatBox(app, own ?? app.workspace.getLeaf('tab'), file);
}

function isCandidateFile(app: App, file: TFile | null | undefined): file is TFile {
  if (!file || file.extension !== 'md') return false;
  return isRhythmEditCandidate(app.metadataCache.getFileCache(file)?.frontmatter as Record<string, unknown> | undefined);
}

/** Register the view, the command (visible only on a `type: data`, `content_type: json` note), the file / editor context-menu
 *  items and the "Open as Beat Box" header action on matching notes' markdown views. */
export function registerRhythmEdit(plugin: Plugin): void {
  const app = plugin.app;
  plugin.registerView(RHYTHM_EDIT_VIEW_TYPE, (leaf) => new RhythmEditView(leaf));
  plugin.addCommand({
    id: 'edit-rhythm-in-rhythm-box',
    name: RHYTHM_EDIT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const file = app.workspace.getActiveFile();
      if (!isCandidateFile(app, file)) return false;
      if (!checking) void openRhythmEditor(app, file, app.workspace.getActiveViewOfType(MarkdownView)?.leaf);
      return true;
    },
  });
  const addItem = (menu: Menu, file: TFile, from?: WorkspaceLeaf | null) => {
    menu.addItem((item) => item.setTitle(RHYTHM_EDIT_COMMAND_NAME).setIcon('music').onClick(() => { void openRhythmEditor(app, file, from); }));
  };
  plugin.registerEvent(app.workspace.on('file-menu', (menu, file) => {
    if (file instanceof TFile && isCandidateFile(app, file)) addItem(menu, file);
  }));
  plugin.registerEvent(app.workspace.on('editor-menu', (menu, _editor, view) => {
    const file = view.file;
    if (file && isCandidateFile(app, file)) addItem(menu, file, view instanceof MarkdownView ? view.leaf : null);
  }));

  // Header action: present on a markdown view exactly while its note is a candidate. A markdown view is reused when its tab navigates to
  // another note, so the set is re-synced on every event that can change the answer.
  const headerActions = new WeakMap<MarkdownView, HTMLElement>();
  const syncHeaderActions = () => {
    for (const leaf of app.workspace.getLeavesOfType('markdown')) {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) continue;
      const want = isCandidateFile(app, view.file);
      const have = headerActions.get(view);
      if (want && !have) {
        headerActions.set(view, view.addAction('music', OPEN_AS_BEAT_BOX_TITLE, () => {
          const file = view.file;
          if (isCandidateFile(app, file)) void switchLeafToBeatBox(app, view.leaf, file);
        }));
      } else if (!want && have) {
        have.remove();
        headerActions.delete(view);
      }
    }
  };
  plugin.registerEvent(app.workspace.on('file-open', syncHeaderActions));
  plugin.registerEvent(app.workspace.on('active-leaf-change', syncHeaderActions));
  plugin.registerEvent(app.workspace.on('layout-change', syncHeaderActions));
  plugin.registerEvent(app.metadataCache.on('changed', syncHeaderActions));
  app.workspace.onLayoutReady(syncHeaderActions);

  // Plugin unload: write whatever is pending (the debounce timer would otherwise die with the plugin).
  plugin.register(() => {
    for (const leaf of app.workspace.getLeavesOfType(RHYTHM_EDIT_VIEW_TYPE)) {
      if (leaf.view instanceof RhythmEditView) void leaf.view.flush();
    }
  });
}
