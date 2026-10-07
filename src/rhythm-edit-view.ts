// Beat-as-data Phase 5 + 5b + 5c (drains 2026-10-05-2100, 2026-10-06-1200, 2026-10-07-0100) — a rhythm data note, viewed as a Beat Box.
//
// The note's OWN tab switches view: markdown ⇄ Beat Box ("Open as Beat Box" in a matching note's header; "Open as JSON" in the Beat
// Box's header). Edits in the widget AUTOSAVE into the note's json block; there is no Save button. The Obsidian-coupled half —
// every decision lives in the pure cores: rhythm-edit-core.ts (protocol, validation, the note session), rhythm-autosave-core.ts
// (debounce / one-in-flight / flush / error persistence), rhythm-default-view-core.ts (when to open the Beat Box by default) and
// restore-hold-core.ts (cooperating with "Restore to last commit"). This file wires them to the vault, the leaf and the timers; like
// html-embed-view.ts it is not unit-run (the wiring pins in rhythm-edit-view.test.ts read its source). The live behaviour needs a
// real Obsidian — see the drains' FEEDBACK for the manual checklists.
//
// Phase 5c: the Beat Box is the DEFAULT view of a valid rhythm data note; the view is an Obsidian EditableFileView, so the tab title,
// rename-from-title, the "…" file menu, breadcrumbs and getActiveFile() come from Obsidian instead of being rebuilt by hand; and its
// header carries the same safety-net actions as a note tab (header-actions-core.ts is the audit).
//
// Hosting: the widget is rendered through createSandboxedWidgetIframe (html-embed-view.ts) — the SAME blob-URL iframe, with the
// same sandbox flags (allow-scripts + allow-same-origin, nothing wider), as every html-embed widget. No second iframe code path.
//
// Trust: only messages whose `event.source` is OUR iframe's window are considered. A malformed message is dropped with a console
// warning and never written. A write is validated BEFORE it happens, made with one atomic `vault.process`, replaces ONLY the
// note's json block, and is refused if the note changed on disk since the baseline or if it is marked `read_only: true` (D7).

import { EditableFileView, MarkdownView, Notice, TFile, type App, type Menu, type Plugin, type ViewStateResult, type WorkspaceLeaf } from 'obsidian';
import { createSandboxedWidgetIframe } from './html-embed-view.ts';
import { createAutosavePipeline, type AutosavePipeline, type SaveOutcome } from './rhythm-autosave-core.ts';
import { createDefaultViewController, type LeafInfo, type LeafLocation } from './rhythm-default-view-core.ts';
import { registerRestoreParticipants } from './restore-hold-core.ts';
import { restoreNoteToLastCommit } from './restore-note-to-git.ts';
import {
  RHYTHM_BOX_WIDGET_PATH,
  RHYTHM_EDIT_VIEW_TYPE,
  RhythmNoteSession,
  buildLoadMessage,
  buildStatusMessage,
  isRhythmEditCandidate,
  parseWidgetMessage,
  readRhythmNote,
} from './rhythm-edit-core.ts';

export { RHYTHM_EDIT_VIEW_TYPE };
export const RHYTHM_EDIT_COMMAND_NAME = 'Edit rhythm in Rhythm Box';
export const OPEN_AS_BEAT_BOX_TITLE = 'Open as Beat Box';
export const OPEN_AS_JSON_TITLE = 'Open as JSON';
const EXTERNAL_CHANGE_MESSAGE = 'The note changed on disk — your latest edit was not saved. Reload from the note to continue.';

/** What the plugin lends the view: the settings flag and the two vault-level actions that live in main.ts, plus the default-view marks. */
export interface RhythmEditHooks {
  isDefaultViewEnabled(): boolean;
  createNewNote(): void;
  toggleEdgesPanel(): void;
  /** "Open as JSON" was chosen on this leaf for this file: do not bounce it back to the Beat Box. */
  markPreferMarkdown(leaf: WorkspaceLeaf, path: string): void;
  /** An explicit switch to the Beat Box on this leaf. */
  clearPreferMarkdown(leaf: WorkspaceLeaf): void;
}

/** Thrown inside the vault.process callback to ABORT the write (nothing is written when the callback throws). */
class RhythmSaveRefused extends Error {
  constructor(readonly kind: 'invalid' | 'stale' | 'refused', message: string) {
    super(message);
  }
}

export class RhythmEditView extends EditableFileView {
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

  constructor(leaf: WorkspaceLeaf, private readonly hooks: RhythmEditHooks) {
    super(leaf);
    // Obsidian's addAction PREPENDS, so these are added right-to-left; the rendered order is the one in header-actions-core.ts.
    this.addAction('braces', OPEN_AS_JSON_TITLE, () => { void this.openAsJson(); });
    this.addAction('history', 'Restore to last commit', () => { void restoreNoteToLastCommit(this.app, this.file); });
    this.addAction('network', 'Toggle edges panel', () => { this.hooks.toggleEdgesPanel(); });
    this.addAction('file-plus', 'New Forge note', () => { this.hooks.createNewNote(); });
  }

  getViewType(): string { return RHYTHM_EDIT_VIEW_TYPE; }
  getIcon(): string { return 'music'; }

  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    // Phase 5/5b persisted `{filePath}`; a FileView persists `{file}`. Accept both so a saved layout from 5b still opens.
    const legacy = (state as { filePath?: unknown; file?: unknown } | null);
    const migrated = legacy && typeof legacy.filePath === 'string' && typeof legacy.file !== 'string'
      ? { ...(state as object), file: legacy.filePath }
      : state;
    await super.setState(migrated, result);
  }

  async onOpen(): Promise<void> {
    await super.onOpen();                       // EditableFileView wires the editable title (rename from the tab header)
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
    await super.onClose();                      // FileView.onClose unloads the file → onUnloadFile below
  }

  /** FileView loads a note into the view: build the widget for it. */
  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    await this.mount(file);
  }

  /** FileView is moving off this note (another note, or the view closing): write what is pending, then let go. */
  async onUnloadFile(file: TFile): Promise<void> {
    await this.flush();
    this.pipeline?.dispose();
    this.pipeline = null;
    this.session = null;
    this.releaseIframe();
    await super.onUnloadFile(file);
  }

  /** Write any pending edit now (close, switch back to JSON, navigation, restore, plugin unload). */
  async flush(): Promise<void> {
    await this.pipeline?.flush();
  }

  /** Restore to last commit, step 1: write what is pending, then silence autosave so no queued save can land after the checkout. */
  async holdForRestore(): Promise<void> {
    await this.flush();
    this.pipeline?.pause();
  }

  /** Restore to last commit, last step (success OR failure): show what is on disk now and resume autosave. */
  async releaseAfterRestore(): Promise<void> {
    await this.reloadFromNote();
  }

  private releaseIframe(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.iframe = null;
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

  private async mount(file: TFile): Promise<void> {
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

  /** Switch THIS tab back to the note's normal markdown view (pending edits are written first), and remember — for this leaf and this
   *  file only — that the user chose JSON, so the default-view logic does not bounce the tab straight back to the Beat Box. */
  private async openAsJson(): Promise<void> {
    const filePath = this.file?.path;
    if (!filePath) return;
    await this.flush();
    this.hooks.markPreferMarkdown(this.leaf, filePath);
    await this.leaf.setViewState({ type: 'markdown', active: true, state: { file: filePath } });
  }
}

/** Switch `leaf` (the note's own tab) to the Beat Box for `file`. The ONLY place that changes a leaf to the rhythm view on request — it
 *  never opens a tab. A matching note is checked up front, so the user gets a Notice naming why instead of an empty pane. */
export async function switchLeafToBeatBox(app: App, leaf: WorkspaceLeaf, file: TFile): Promise<void> {
  const note = readRhythmNote(await app.vault.read(file));
  if (note.ok === false) {
    new Notice(`Edit rhythm: ${note.message}`, 8000);
    return;
  }
  await leaf.setViewState({ type: RHYTHM_EDIT_VIEW_TYPE, active: true, state: { file: file.path } });
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

/** Where does this leaf live? Only the main area and the sidebars are normal workspace leaves; hover previews, pop-out windows and
 *  canvas cards are 'other' (the default-view allow-list never touches them). */
function locationOf(app: App, leaf: WorkspaceLeaf): LeafLocation {
  const root = leaf.getRoot();
  if (root === app.workspace.rootSplit) return 'main';
  if (root === app.workspace.leftSplit || root === app.workspace.rightSplit) return 'sidebar';
  return 'other';
}

function describeLeaf(app: App, leaf: WorkspaceLeaf): LeafInfo | null {
  const view = leaf.view;
  if (!view) return null;
  const isPlainMarkdownView = view instanceof MarkdownView;
  const file = isPlainMarkdownView ? view.file : null;
  return {
    location: locationOf(app, leaf),
    viewType: view.getViewType(),
    isPlainMarkdownView,
    filePath: file ? file.path : null,
    extension: file ? file.extension : null,
    frontmatterIsCandidate: file ? isCandidateFile(app, file) : false,
  };
}

/** Register the view, the command (visible only on a `type: data`, `content_type: json` note), the file / editor context-menu
 *  items, the "Open as Beat Box" header action on matching notes' markdown views, and the default-view swap. */
export function registerRhythmEdit(plugin: Plugin, base: Pick<RhythmEditHooks, 'isDefaultViewEnabled' | 'createNewNote' | 'toggleEdgesPanel'>): void {
  const app = plugin.app;

  // ---- default view: a valid rhythm note opens as a Beat Box ---------------------------------------------------------------
  const defaultView = createDefaultViewController<WorkspaceLeaf>({
    settingOn: () => base.isDefaultViewEnabled(),
    describe: (leaf) => describeLeaf(app, leaf),
    readBodyIsRhythm: async (_leaf, path) => {
      const f = app.vault.getAbstractFileByPath(path);
      return f instanceof TFile && readRhythmNote(await app.vault.read(f)).ok === true;
    },
    swapToBeatBox: async (leaf, path) => {
      // keep focus where it is: only the already-active leaf is re-activated by the swap
      const active = app.workspace.getActiveViewOfType(MarkdownView)?.leaf === leaf;
      await leaf.setViewState({ type: RHYTHM_EDIT_VIEW_TYPE, active, state: { file: path } });
    },
  });
  const evaluateAllLeaves = () => {
    for (const leaf of app.workspace.getLeavesOfType('markdown')) {
      defaultView.evaluate(leaf).catch((e) => console.warn('[forge] rhythm-edit: default-view pass failed:', e));
    }
  };
  plugin.registerEvent(app.workspace.on('file-open', evaluateAllLeaves));
  plugin.registerEvent(app.workspace.on('active-leaf-change', evaluateAllLeaves));
  plugin.registerEvent(app.workspace.on('layout-change', evaluateAllLeaves));
  plugin.registerEvent(app.metadataCache.on('changed', evaluateAllLeaves));   // frontmatter can arrive just after the file opens
  app.workspace.onLayoutReady(evaluateAllLeaves);

  const hooks: RhythmEditHooks = {
    ...base,
    markPreferMarkdown: (leaf, path) => defaultView.markPreferMarkdown(leaf, path),
    clearPreferMarkdown: (leaf) => defaultView.clearPreferMarkdown(leaf),
  };

  plugin.registerView(RHYTHM_EDIT_VIEW_TYPE, (leaf) => new RhythmEditView(leaf, hooks));
  const toBeatBox = async (file: TFile, from?: WorkspaceLeaf | null) => {
    if (from) hooks.clearPreferMarkdown(from);
    await openRhythmEditor(app, file, from);
  };
  plugin.addCommand({
    id: 'edit-rhythm-in-rhythm-box',
    name: RHYTHM_EDIT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const file = app.workspace.getActiveFile();
      if (!isCandidateFile(app, file)) return false;
      if (!checking) void toBeatBox(file, app.workspace.getActiveViewOfType(MarkdownView)?.leaf);
      return true;
    },
  });
  const addItem = (menu: Menu, file: TFile, from?: WorkspaceLeaf | null) => {
    menu.addItem((item) => item.setTitle(RHYTHM_EDIT_COMMAND_NAME).setIcon('music').onClick(() => { void toBeatBox(file, from); }));
  };
  plugin.registerEvent(app.workspace.on('file-menu', (menu, file, _source, leaf) => {
    if (leaf?.view instanceof RhythmEditView) return;             // already in the Beat Box: its own "…" menu needs no "Edit rhythm"
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
          if (isCandidateFile(app, file)) {
            hooks.clearPreferMarkdown(view.leaf);
            void switchLeafToBeatBox(app, view.leaf, file);
          }
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

  // "Restore to last commit" cooperates with open Beat Boxes (restore-hold-core.ts): hold autosave, checkout, reload from disk.
  plugin.register(registerRestoreParticipants(() => {
    const out = [];
    for (const leaf of app.workspace.getLeavesOfType(RHYTHM_EDIT_VIEW_TYPE)) {
      const v = leaf.view;
      if (v instanceof RhythmEditView && v.file) {
        out.push({ path: v.file.path, flush: () => v.flush(), hold: () => v.holdForRestore(), release: () => v.releaseAfterRestore() });
      }
    }
    return out;
  }));

  // Plugin unload: write whatever is pending (the debounce timer would otherwise die with the plugin).
  plugin.register(() => {
    for (const leaf of app.workspace.getLeavesOfType(RHYTHM_EDIT_VIEW_TYPE)) {
      if (leaf.view instanceof RhythmEditView) void leaf.view.flush();
    }
  });
}
