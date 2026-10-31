// score_first M10 slice 1 (drain 2026-10-29-0820, design 4.10) - the Obsidian-coupled half of kits and arrangements: the arrangement tab (a Score drawn by the code that draws every phrase, nothing else on it), the two dialogs' Modal frames, and the commands **New kit**,
// **New arrangement** and **Open arrangement as Score**. The decisions are in kit-core.ts / arrangement-core.ts / kit-arrangement-flow-core.ts, the dialogs' DOM in kit-dom.ts / arrangement-dom.ts, all unit-tested without Obsidian. Registered ONLY in a score-first vault
// (score-first.ts calls this after its gate; the commands also ask the live answer when offered), so no other vault gets a command, a view or a byte of this (P3). 2026-10-29-0910: the tab's one write is the row of controls per kit (Mute, Solo, volume), which edits the note through the builders New arrangement uses. An arrangement is otherwise edited as its note.
import { EditableFileView, MarkdownView, Modal, Notice, TFile, type App, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { musicEdition } from './music-edition-selected.ts';
import { scoreClickPlays } from './score-click-policy.ts';
import { computeArrangementScoreViaEngine, computeCompositionScoreViaEngine, computePhraseScoreViaEngine } from './phrase-engine.ts';
import { phraseDepsWithSources } from './composition-core.ts';
import { PHRASE_FOLDER, isPhrasePath } from './phrase-core.ts';
import { attachScoreArea, type ScoreArea } from './live-score-dom.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { SCORE_ZOOM_LEVELS, createZoomMemory } from './zoom-memory-core.ts';
import { isFileExistsError, type ScorePanelPlan } from './score-first-core.ts';
import { ARRANGEMENT_VIEW_TYPE, applySettingsPatches, arrangementDescription, isArrangementPath, produceArrangement, readArrangementNote, tempoRangeOf } from './arrangement-core.ts';
import { ARRANGEMENT_INSPECTOR_HINT, ARRANGEMENT_ROW_ROLE, annotateArrangementPayload, arrangementLineageOf, chipsOfRow, readLineage, rowIdsPlayedBy, barsPlayedBy, type LineageBar } from './arrangement-nav-core.ts';
import { ensureArrangementRows } from './arrangement-rows-dom.ts';
import { litEvidence } from './structure-strip-core.ts';
import { phraseNoteId } from './phrase-lineage-core.ts';
import { pinnedNoteFor, type PinnedNote } from './linked-panes-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';
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
  /** 2026-10-30-1000 (slice 3): what the Score on screen is made of - the engine's lineage (which kit and phrase played each row of each bar), the rows the inspector can pin, the rows the notes pane's note lit, and the way to stop hearing the pane. */
  private lineage: LineageBar[] | null = null;
  private rows: ProvenanceMap = {};
  /** The note the pair's notes pane shows (a chip clicked, a link followed), or null: the rows of what it played stay lit until the next navigation, across redraws. */
  private notesNote: string | null = null;
  private stopListening: (() => void) | null = null;

  /** 2026-10-29-0830: `structure` sends a chip click to the notes pane of this tab's pair (the hooks of a phrase tab), `openNote` opens the note when there is no pair. Absent = no strip. 2026-10-30-1000: `onPin` is told the note
   *  that made the row the person pinned (or null: let go), for the notes pane beside this Score, exactly as a phrase tab's. */
  constructor(leaf: WorkspaceLeaf, private readonly plan: ScorePanelPlan, private readonly structure?: PhraseStructureHooks, private readonly openNote?: (noteId: string) => void, private readonly onPin?: (leaf: WorkspaceLeaf, pin: PinnedNote | null) => void) {
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
      // 2026-10-30-1000: hovering a chip lights the rows of that kit or phrase in the Score; with nothing hovered, the rows of the note the notes pane shows stay lit (a chip clicked, a link followed)
      this.strip = mountArrangementStrip(this.contentEl, { goto: (noteId) => structure.goto(leaf, noteId), openNote, onHover: (chip) => { this.light(chip ? rowIdsPlayedBy(this.lineage ?? [], chip.noteId) : this.litByNotes()); } });
      this.strip.show(text);
      this.stopListening = structure.onNotesNavigated(leaf, (notesPath) => {
        const noteId = notesPath.replace(/\.md$/, '');
        this.notesNote = noteId;
        this.light(this.litByNotes());
        console.info(litEvidence(notesPath, barsPlayedBy(this.lineage ?? [], noteId)));
      });
    }
    // the row per kit sits between the strip and the Score; a change goes out as one batch after a quiet moment and is written to the note (writeSettings), which redraws everything below
    this.controls = mountArrangementControls(this.contentEl, { commit: (patches) => { void this.writeSettings(patches); }, trace: (line) => { console.info(line); }, setTimer: (fn, ms) => window.setTimeout(fn, ms), clearTimer: (h) => window.clearTimeout(h as number) });
    this.showControls(text);
    const readNote = async (p: string): Promise<string> => {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) throw new Error('File not found');
      return this.app.vault.read(f);
    };
    const arrangementNote = phraseNoteId(file.path);
    this.area = attachScoreArea(this.contentEl, this.plan, {
      title: file.basename,
      // 2026-10-30-1000 (slice 3): a click on a row of a bar pins it (the inspector shared with the phrase tabs, with the opt-in flags a score-first surface sets: P3), and the notes pane follows. Only with the hooks a pair needs.
      inspector: this.openNote ? {
        noteId: arrangementNote,
        openNote: this.openNote,
        annotate: (_note, payload) => { const r = annotateArrangementPayload(arrangementNote, payload); this.rows = r.map; return r; },
        lineage: arrangementLineageOf,
        hint: ARRANGEMENT_INSPECTOR_HINT,
        order: (map) => Object.keys(map),
        enlargeTargets: null,                          // the rows are drawn into the staves already; a rectangle over a notehead would take its click
        pointRoles: [ARRANGEMENT_ROW_ROLE],            // a click on a notehead or the unpainted part of a staff is decided by the row's box
        trace: (line) => { console.info(line); },
        pinLabel: (id, prov) => (prov.role === ARRANGEMENT_ROW_ROLE ? `bar ${String(prov.params.bar)}, ${String(prov.params.channel)}` : id),
        previewOnHover: true,
        releaseOnEscapeFrom: this.contentEl,           // Esc from the row of controls or the strip lets go too (score-first surfaces only: P3)
        keepPinOnControls: true,                       // the player and zoom buttons do not release the pin
        band: true,
        decorate: (host, map) => { ensureArrangementRows(host, map); },      // a redrawn SVG (the Kit / multi-staff toggle) gets its rows again
        kitNote: 'Kit view: not mapped for this arrangement (use the multi-staff view to inspect).',
        onPinned: (e) => {
          const pin = e ? pinnedNoteFor(e.prov) : null;
          this.onPin?.(this.leaf, pin);
          this.strip?.emphasise(e ? chipsOfRow(e.prov) : null);
        },
      } : undefined,
      onShown: (host) => { ensureArrangementRows(host, this.rows); this.light(this.litByNotes()); },       // the rows are drawn into the SVG the moment it is shown, before the first click; what the notes pane's note played stays lit
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
          phrases: phraseDepsWithSources({ readNote, compute: (data, params, t) => computePhraseScoreViaEngine(data, params, t) }, { computeArrangement: (data, t) => computeArrangementScoreViaEngine(data, t), computeComposition: (data, t) => computeCompositionScoreViaEngine(data, t) }),      // 2026-10-30-1050 (M15b): a phrase it plays may be a transform of an arrangement
          compute: (data, t) => computeArrangementScoreViaEngine(data, t),
        }, note as string | { unreadable: string }, title);
        if (out.kind === 'score' && !this.disposed) { this.paintTempo(file, note, out.payload); this.keepLineage(out.payload); }
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

  /** The engine's lineage of the Score on screen, checked; a Score without a usable one has no lighting (the inspector says why it cannot be pinned). */
  private keepLineage(payload: Record<string, unknown>): void {
    const bars = barsOfPayload(payload);
    const l = bars === null ? null : readLineage(payload.arrangement_lineage, bars.length);
    this.lineage = l === null || typeof l === 'string' ? null : l;
  }

  /** The rows the note in the notes pane played (the Score lights them; a row that is not drawn lights nothing). */
  private litByNotes(): string[] { return this.notesNote === null ? [] : rowIdsPlayedBy(this.lineage ?? [], this.notesNote); }

  /** Light these rows of the Score (none = clear). */
  private light(ids: readonly string[]): void { this.area?.lightAll([...ids]); }

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
    this.stopListening?.();
    this.stopListening = null;
    this.lineage = null; this.rows = {}; this.notesNote = null;
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
  /** 2026-10-30-1000: the note that made the row pinned in an arrangement's Score (null = let go), for the notes pane of its pair: the same hook a phrase tab has. */
  onPin(leaf: WorkspaceLeaf, pin: PinnedNote | null): void;
}

export function registerKitsAndArrangements(plugin: Plugin, opts: KitsArrangementsOptions): void {
  const app = plugin.app;
  plugin.registerView(ARRANGEMENT_VIEW_TYPE, (leaf) => new ArrangementView(leaf, opts.plan, opts.structure, opts.openNote, opts.onPin));

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
