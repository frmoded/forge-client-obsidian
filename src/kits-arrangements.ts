// score_first M10 slice 1 (drain 2026-10-29-0820, design 4.10) - the Obsidian-coupled half of kits and arrangements: the arrangement tab (a Score drawn by the code that draws every phrase, nothing else on it), the two dialogs' Modal frames, and the commands **New kit**,
// **New arrangement** and **Open arrangement as Score**. The decisions are in kit-core.ts / arrangement-core.ts / kit-arrangement-flow-core.ts, the dialogs' DOM in kit-dom.ts / arrangement-dom.ts, all unit-tested without Obsidian. Registered ONLY in a score-first vault
// (score-first.ts calls this after its gate; the commands also ask the live answer when offered), so no other vault gets a command, a view or a byte of this (P3). 2026-10-29-0910: the tab's one write is the row of controls per kit (Mute, Solo, volume), which edits the note through the builders New arrangement uses. An arrangement is otherwise edited as its note.
import { EditableFileView, MarkdownView, Modal, Notice, TFile, type App, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { musicEdition } from './music-edition-selected.ts';
import { scoreClickPlays } from './score-click-policy.ts';
import { computeArrangementScoreViaEngine, computePhraseScoreViaEngine } from './phrase-engine.ts';
import { PHRASE_FOLDER, isPhrasePath } from './phrase-core.ts';
import { attachScoreArea, type ScoreArea } from './live-score-dom.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { SCORE_ZOOM_LEVELS, createZoomMemory } from './zoom-memory-core.ts';
import { isFileExistsError, type ScorePanelPlan } from './score-first-core.ts';
import { ARRANGEMENT_VIEW_TYPE, applySettingsPatches, arrangementDescription, isArrangementPath, produceArrangement, readArrangementNote, tempoRangeOf } from './arrangement-core.ts';
import { barsOfPayload } from './phrase-core.ts';
import { KIT_FOLDER, isKitPath } from './kit-core.ts';
import { NEW_ARRANGEMENT_COMMAND_ID, NEW_ARRANGEMENT_COMMAND_NAME, NEW_KIT_COMMAND_ID, NEW_KIT_COMMAND_NAME, OPEN_ARRANGEMENT_COMMAND_ID, OPEN_ARRANGEMENT_COMMAND_NAME, createArrangement, createKit, newArrangementAvailable, newKitAvailable, openArrangementAvailable, type CreatePorts } from './kit-arrangement-flow-core.ts';
import { mountKitDialog } from './kit-dom.ts';
import { mountArrangementDialog } from './arrangement-dom.ts';
import { mountArrangementStrip, type ArrangementStrip } from './arrangement-strip-dom.ts';
import { mountArrangementControls, type ArrangementControls } from './arrangement-controls-dom.ts';
import type { PhraseStructureHooks } from './phrase-view.ts';

const stripLinks = (s: string): string => s.replace(/\[\[([^\]]+)\]\]/g, '$1');

export class ArrangementView extends EditableFileView {
  private area: ScoreArea | null = null;
  private strip: ArrangementStrip | null = null;
  private controls: ArrangementControls | null = null;
  private headerEl: HTMLElement | null = null;
  private readonly zoom = createZoomMemory(SCORE_ZOOM_LEVELS, 1.0);
  private disposed = false;

  /** 2026-10-29-0830: `structure` sends a chip click to the notes pane of this tab's pair (the hooks of a phrase tab), `openNote` opens the note when there is no pair. Absent = no strip. */
  constructor(leaf: WorkspaceLeaf, private readonly plan: ScorePanelPlan, private readonly structure?: PhraseStructureHooks, private readonly openNote?: (noteId: string) => void) {
    super(leaf);
    this.addAction('code', 'Open as JSON', () => { void this.openAsJson(); });
  }

  getViewType(): string { return ARRANGEMENT_VIEW_TYPE; }
  getIcon(): string { return 'music'; }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass('forge-arrangement-view');
    // An arrangement is made of kits, phrases and (through the phrases) bars: any of them changing, or the arrangement's own note, redraws the Score.
    this.registerEvent(this.app.vault.on('modify', (f) => { this.noteChanged(f.path); }));
    this.registerEvent(this.app.vault.on('delete', (f) => { this.noteChanged(f.path); }));
  }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.release();
    this.disposed = false;
    const text = await this.readText(file);
    this.headerEl = this.contentEl.createDiv({ cls: 'forge-arrangement-header', text: this.headerText(file, text) });
    if (this.structure && this.openNote) {
      const leaf = this.leaf, structure = this.structure, openNote = this.openNote;
      this.strip = mountArrangementStrip(this.contentEl, { goto: (noteId) => structure.goto(leaf, noteId), openNote });
      this.strip.show(text);
    }
    // the row per kit sits between the strip and the Score; a change goes out as one batch after a quiet moment and is written to the note (writeSettings), which redraws everything below
    this.controls = mountArrangementControls(this.contentEl, { commit: (patches) => { void this.writeSettings(patches); }, trace: (line) => { console.info(line); }, setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (h) => window.clearTimeout(h as number) });
    this.showControls(text);
    const readNote = async (p: string): Promise<string> => {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) throw new Error('File not found');
      return this.app.vault.read(f);
    };
    this.area = attachScoreArea(this.contentEl, this.plan, {
      title: file.basename,
      renderInto: (host, payload) => musicEdition.renderTaggedMusicXML(host, payload, file.basename, { clickToPlay: scoreClickPlays, zoom: this.zoom, trace: (line) => console.info(line) }),
      stopPlayers: (host) => musicEdition.stopPlayers(host, (m, e) => console.error(m, e)),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      now: () => performance.now(),
      onTiming: (t) => console.debug(`Forge: arrangement score ${t.outcome} in ${Math.round(t.totalMs)} ms (engine ${Math.round(t.engineMs)} ms)`),
      messages: messageDelivery,
      // the arrangement note's text in, the combined Score out: every kit and phrase is read fresh by the producer, each phrase drawn by the phrase code
      produce: async (note, title) => {
        const out = await produceArrangement({
          phrases: { readNote, compute: (data, params, t) => computePhraseScoreViaEngine(data, params, t) },
          compute: (data, t) => computeArrangementScoreViaEngine(data, t),
        }, note as string | { unreadable: string }, title);
        if (out.kind === 'score' && !this.disposed) this.paintTempo(file, note, out.payload);
        return out;
      },
    });
    this.area?.showNow(text);
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.release();
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.release();
    await super.onClose();
  }

  /** Silence any score playback in this view (close, plugin unload). */
  stopAudio(): void { musicEdition.stopPlayers(this.contentEl, (m, e) => console.error(m, e)); }

  private async readText(file: TFile): Promise<string | { unreadable: string }> {
    try { return await this.app.vault.read(file); } catch (e) { return { unreadable: (e as Error)?.message ?? String(e) }; }
  }

  private headerText(file: TFile, text: string | { unreadable: string }): string {
    if (typeof text !== 'string') return `${file.basename}: the note could not be read (${text.unreadable}).`;
    const read = readArrangementNote(text);
    return read.ok === false ? `${file.basename}: ${read.message}` : stripLinks(arrangementDescription(file.basename, read.value));
  }

  private noteChanged(path: string): void {
    const mine = this.file?.path;
    if (!mine || this.disposed || !this.area) return;
    if (path === mine || isKitPath(path) || isPhrasePath(path) || path.startsWith('bars/')) {
      void this.readText(this.file!).then((text) => { if (!this.disposed) { this.showControls(text); this.strip?.show(text); this.area?.update(text); } });
    }
  }

  private showControls(text: string | { unreadable: string }): void {
    const read = typeof text === 'string' ? readArrangementNote(text) : null;
    this.controls?.show(read !== null && read.ok ? read.value : null);
  }

  /** The tab header, once the engine has drawn the Score: the Description with the bpm the arrangement plays at (the first bar's to the last bar's), which only the engine's bars know. */
  private paintTempo(file: TFile, note: unknown, payload: Record<string, unknown>): void {
    const read = typeof note === 'string' ? readArrangementNote(note) : null;
    const bars = barsOfPayload(payload);
    if (!this.headerEl || read === null || read.ok === false || bars === null) return;
    this.headerEl.setText(stripLinks(arrangementDescription(file.basename, read.value, tempoRangeOf(bars) ?? undefined)));
  }

  /** The controls' write: the changes, applied to the CURRENT text of the note in one atomic read-modify-write (the vault's `modify` then redraws this tab). The file is captured before the await (L59). */
  async writeSettings(patches: Array<[number, { mute?: boolean; solo?: boolean; volume?: number }]>): Promise<void> {
    const file = this.file;
    if (!file || this.disposed || patches.length === 0) return;
    let refused: string | null = null;
    try {
      await this.app.vault.process(file, (current) => {
        const w = applySettingsPatches(current, file.basename, patches);
        if (w.ok === false) { refused = w.message; return current; }
        return w.changed ? w.text : current;
      });
    } catch (e) {
      console.error('ArrangementView.writeSettings failed', e);
      new Notice(`Arrangement: the change could not be written (${(e as Error)?.message ?? e}).`);
      return;
    }
    if (refused !== null) { console.error('ArrangementView.writeSettings refused', refused); new Notice(`Arrangement: ${refused}`); }
  }

  private release(): void {
    this.disposed = true;
    this.controls?.dispose();
    this.controls = null;
    this.headerEl = null;
    this.stopAudio();
    this.area?.dispose();
    this.area = null;
    this.strip?.dispose();
    this.strip = null;
    this.contentEl.empty();
  }

  /** The same leaf, the note's own text. */
  private async openAsJson(): Promise<void> {
    const file = this.file;
    if (!file) return;
    await this.leaf.setViewState({ type: 'markdown', active: true, state: { file: file.path } });
  }
}

/** Open an arrangement note as a Score: a tab already showing it is reused, else a new tab. */
export async function openArrangement(app: App, file: TFile): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType(ARRANGEMENT_VIEW_TYPE)) {
    if (leaf.view instanceof ArrangementView && leaf.view.file?.path === file.path) { app.workspace.revealLeaf(leaf); return; }
  }
  const leaf = app.workspace.getLeaf(true);
  await leaf.setViewState({ type: ARRANGEMENT_VIEW_TYPE, active: true, state: { file: file.path } });
  app.workspace.revealLeaf(leaf);
}

class DialogModal extends Modal {
  constructor(app: App, private readonly mount: (parent: HTMLElement, close: () => void) => { dispose(): void }) { super(app); }
  private handle: { dispose(): void } | null = null;
  onOpen(): void { this.handle = this.mount(this.contentEl, () => { this.close(); }); }
  onClose(): void { this.handle?.dispose(); this.contentEl.empty(); }
}

export interface KitsArrangementsOptions {
  plan: ScorePanelPlan;
  /** The live answer to "is this vault score-first": asked each time a command is offered, so a forge.toml that stops declaring the profile turns the commands off at once. */
  scoreFirst(): boolean;
  /** 2026-10-29-0830: the strip's hooks (the same as a phrase tab's) and the opener for a chip when the tab has no pair. */
  structure: PhraseStructureHooks;
  openNote(noteId: string): void;
}

export function registerKitsAndArrangements(plugin: Plugin, opts: KitsArrangementsOptions): void {
  const app = plugin.app;
  plugin.registerView(ARRANGEMENT_VIEW_TYPE, (leaf) => new ArrangementView(leaf, opts.plan, opts.structure, opts.openNote));

  const ports = (open: (file: TFile) => Promise<void>): CreatePorts<TFile> => ({
    folderExists: (folder) => app.vault.getAbstractFileByPath(folder) !== null,
    createFolder: async (folder) => { await app.vault.createFolder(folder); },
    exists: (p) => app.vault.getAbstractFileByPath(p) !== null,
    create: (p, content) => app.vault.create(p, content),
    open,
    notify: (message) => { new Notice(message); },
    trace: (line) => { console.info(line); },
    isAlreadyExists: isFileExistsError,
  });
  const names = (folder: string): string[] => app.vault.getFiles().filter((f) => f.path.startsWith(`${folder}/`) && f.extension === 'md' && f.basename !== 'README').map((f) => f.basename).sort();

  plugin.addCommand({
    id: NEW_KIT_COMMAND_ID,
    name: NEW_KIT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      if (!newKitAvailable({ scoreFirst: opts.scoreFirst() })) return false;
      if (!checking) {
        const kitPorts = ports(async (file) => { await app.workspace.getLeaf(true).openFile(file); });
        new DialogModal(app, (parent, close) => mountKitDialog(parent, { create: (choice) => createKit(kitPorts, choice), close })).open();
      }
      return true;
    },
  });

  plugin.addCommand({
    id: NEW_ARRANGEMENT_COMMAND_ID,
    name: NEW_ARRANGEMENT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const kits = names(KIT_FOLDER);
      const phrases = names(PHRASE_FOLDER);
      if (!newArrangementAvailable({ scoreFirst: opts.scoreFirst(), kitCount: kits.length, phraseCount: phrases.length })) return false;
      if (!checking) {
        const arrPorts = ports((file) => openArrangement(app, file));
        new DialogModal(app, (parent, close) => mountArrangementDialog(parent, { kits, phrases, create: (tracks) => createArrangement(arrPorts, tracks), close })).open();
      }
      return true;
    },
  });

  plugin.addCommand({
    id: OPEN_ARRANGEMENT_COMMAND_ID,
    name: OPEN_ARRANGEMENT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const active = app.workspace.getActiveViewOfType(MarkdownView)?.file ?? app.workspace.getActiveFile();
      if (!openArrangementAvailable({ scoreFirst: opts.scoreFirst(), activePath: active?.path ?? null }) || !(active instanceof TFile) || !isArrangementPath(active.path)) return false;
      if (!checking) {
        openArrangement(app, active).catch((e) => {
          console.error('Open arrangement as Score failed', e);
          new Notice(`${OPEN_ARRANGEMENT_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
        });
      }
      return true;
    },
  });
}
