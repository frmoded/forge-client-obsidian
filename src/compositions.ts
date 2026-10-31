// 2026-10-31-1100 (score_first M17b, design 4.14) - the Obsidian-coupled half of COMPOSITIONS: the composition tab (a Score drawn by the code that draws every phrase, a header "<N> sections, <B> bars, <t> min", the structure strip as a TREE
// of the sections, a click on a bar following its lineage to the section and then to the note the section plays), and the four commands: **New composition**, **Open composition as Score**, **Open the piece** (the root composition's
// Score with its notes pane) and **Make this composition the root of the piece**. The decisions are in composition-core.ts / composition-nav-core.ts / composition-strip-core.ts / composition-flow-core.ts / composition-root-core.ts, the DOM in
// composition-dialog-dom.ts / composition-strip-dom.ts, all unit-tested without Obsidian (score-first.ts calls this after its gate; the commands also ask the live answer when offered), so no other vault gets a command, a view or a byte of this (P3).
import { EditableFileView, MarkdownView, Modal, Notice, TFile, type App, type Plugin, type WorkspaceLeaf } from 'obsidian';
import { musicEdition } from './music-edition-selected.ts';
import { scoreClickPlays } from './score-click-policy.ts';
import { computeArrangementScoreViaEngine, computeCompositionScoreViaEngine, computePhraseScoreViaEngine } from './phrase-engine.ts';
import { attachScoreArea, type ScoreArea } from './live-score-dom.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { SCORE_ZOOM_LEVELS, createZoomMemory } from './zoom-memory-core.ts';
import { isFileExistsError, type ScorePanelPlan } from './score-first-core.ts';
import { PHRASE_FOLDER, barsOfPayload, isPhrasePath } from './phrase-core.ts';
import { ARRANGEMENT_FOLDER, isArrangementPath } from './arrangement-core.ts';
import { COMPOSITION_FOLDER, COMPOSITION_VIEW_TYPE, compositionHeader, isCompositionPath, phraseDepsWithSources, produceComposition, readCompositionNote, FORGE_COMPOSITION_KEY, type CompositionParams, type CompositionShape } from './composition-core.ts';
import { COMPOSITION_INSPECTOR_HINT, COMPOSITION_BAR_ROLE, annotateCompositionPayload, barIdsPlayedFrom, barsPlayedFrom, compositionLineageOf, readCompositionLineage, type CompositionLineageBar } from './composition-nav-core.ts';
import { treeRows, treeText } from './composition-strip-core.ts';
import { mountCompositionStrip, type CompositionStrip } from './composition-strip-dom.ts';
import { mountCompositionDialog } from './composition-dialog-dom.ts';
import { NEW_COMPOSITION_COMMAND_ID, NEW_COMPOSITION_COMMAND_NAME, OPEN_COMPOSITION_COMMAND_ID, OPEN_COMPOSITION_COMMAND_NAME, createComposition, moveRoot, newCompositionAvailable, openCompositionAvailable } from './composition-flow-core.ts';
import { MAKE_ROOT_COMMAND_ID, MAKE_ROOT_COMMAND_NAME, OPEN_PIECE_COMMAND_ID, OPEN_PIECE_COMMAND_NAME, makeRootAvailable, manyRootsMessage, noRootMessage, openPieceAvailable, rootOf, withRoot } from './composition-root-core.ts';
import type { CreatePorts } from './kit-arrangement-flow-core.ts';
import { litEvidence } from './structure-strip-core.ts';
import { phraseNoteId } from './phrase-lineage-core.ts';
import { pinnedNoteFor, type PinnedNote } from './linked-panes-core.ts';
import type { PhraseStructureHooks } from './phrase-view.ts';

export class CompositionView extends EditableFileView {
  private area: ScoreArea | null = null;
  private strip: CompositionStrip | null = null;
  private headerEl: HTMLElement | null = null;
  private readonly zoom = createZoomMemory(SCORE_ZOOM_LEVELS, 1.0);
  private disposed = false;
  /** What the Score on screen is made of: the engine's lineage (which section and which bar of its note made each bar) and the sections. */
  private lineage: CompositionLineageBar[] | null = null;
  private params: CompositionParams | null = null;
  private shape: CompositionShape | null = null;
  /** The note the pair's notes pane shows (a chip clicked, a link followed), or null: the bars it played stay lit until the next navigation, across redraws. */
  private notesNote: string | null = null;
  private stopListening: (() => void) | null = null;

  /** `structure` sends a chip click to the notes pane of this tab's pair (the hooks of a phrase tab), `openNote` opens the note when there is no pair; `onPin` is told the note that made the bar the person pinned (or null: let go). */
  constructor(leaf: WorkspaceLeaf, private readonly plan: ScorePanelPlan, private readonly structure?: PhraseStructureHooks, private readonly openNote?: (noteId: string) => void, private readonly onPin?: (leaf: WorkspaceLeaf, pin: PinnedNote | null) => void) {
    super(leaf);
    this.addAction('code', 'Open as JSON', () => { void this.openAsJson(); });
  }

  getViewType(): string { return COMPOSITION_VIEW_TYPE; }
  getIcon(): string { return 'music'; }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass('forge-composition-view');
    // A composition is made of phrases, arrangements, other compositions and (through them) bars and kits: any of them changing, or the composition's own note, redraws the Score.
    this.registerEvent(this.app.vault.on('modify', (f) => { this.noteChanged(f.path); }));
    this.registerEvent(this.app.vault.on('delete', (f) => { this.noteChanged(f.path); }));
  }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.release();
    this.disposed = false;
    const text = await this.readText(file);
    this.headerEl = this.contentEl.createDiv({ cls: 'forge-composition-header', text: this.headerText(file, text, null) });
    if (this.structure && this.openNote) {
      const leaf = this.leaf, structure = this.structure, openNote = this.openNote;
      // hovering a chip lights the bars that note plays in the Score; with nothing hovered, the bars of the note the notes pane shows stay lit (a chip clicked, a link followed)
      this.strip = mountCompositionStrip(this.contentEl, {
        onClick: (row) => { void structure.goto(leaf, row.noteId).catch(() => false).then((handled) => { if (!handled) openNote(row.noteId); }); },
        onHover: (row) => { this.light(row ? barIdsPlayedFrom(this.lineage ?? [], row.noteId) : this.litByNotes()); },
      });
      this.stopListening = structure.onNotesNavigated(leaf, (notesPath) => {
        const noteId = notesPath.replace(/\.md$/, '');
        this.notesNote = noteId;
        this.light(this.litByNotes());
        this.strip?.emphasise([noteId]);
        console.info(litEvidence(notesPath, barsPlayedFrom(this.lineage ?? [], noteId)));
      });
      void this.showTree(text);
    }
    const readNote = async (p: string): Promise<string> => {
      const f = this.app.vault.getAbstractFileByPath(p);
      if (!(f instanceof TFile)) throw new Error('File not found');
      return this.app.vault.read(f);
    };
    const compositionNote = phraseNoteId(file.path);
    const computeArrangement = (data: Parameters<typeof computeArrangementScoreViaEngine>[0], t: string) => computeArrangementScoreViaEngine(data, t);
    const computeComposition = (data: Parameters<typeof computeCompositionScoreViaEngine>[0], t: string) => computeCompositionScoreViaEngine(data, t);
    this.area = attachScoreArea(this.contentEl, this.plan, {
      title: file.basename,
      // a click on a bar pins it (the inspector shared with the phrase tabs, with the opt-in flags a score-first surface sets: P3), and the notes pane follows. Only with the hooks a pair needs.
      inspector: this.openNote ? {
        noteId: compositionNote,
        openNote: this.openNote,
        annotate: (_note, payload) => annotateCompositionPayload(compositionNote, payload),
        lineage: compositionLineageOf,
        hint: COMPOSITION_INSPECTOR_HINT,
        order: (map) => Object.keys(map).filter((id) => map[id].role === COMPOSITION_BAR_ROLE).sort((x, y) => Number(map[x].params.bar) - Number(map[y].params.bar)),
        enlargeTargets: null,                          // no hit rectangle: it would sit over the noteheads and take the Score's click; a click on any drawn part of a bar selects the BAR
        pointRoles: [COMPOSITION_BAR_ROLE],            // ... and so does a click on the unpainted part of a bar: the bar's box decides
        trace: (line) => { console.info(line); },
        pinLabel: (id, prov) => (typeof prov.params.bar === 'number' ? `bar ${prov.params.bar}` : id),
        previewOnHover: true,
        releaseOnEscapeFrom: this.contentEl,
        keepPinOnControls: true,
        band: true,
        kitNote: 'Kit view: not mapped for this composition (use the multi-staff view to inspect).',
        onPinned: (e) => {
          const pin = e ? pinnedNoteFor(e.prov) : null;
          this.onPin?.(this.leaf, pin);
          this.strip?.emphasise(pin ? [pin.noteId] : null);
        },
      } : undefined,
      onShown: () => { this.light(this.litByNotes()); },
      renderInto: (host, payload) => musicEdition.renderTaggedMusicXML(host, payload, file.basename, { clickToPlay: scoreClickPlays, zoom: this.zoom, trace: (line) => console.info(line) }),
      stopPlayers: (host) => musicEdition.stopPlayers(host, (m, e) => console.error(m, e)),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      now: () => performance.now(),
      onTiming: (t) => console.debug(`Forge: composition score ${t.outcome} in ${Math.round(t.totalMs)} ms (engine ${Math.round(t.engineMs)} ms)`),
      messages: messageDelivery,
      // the composition note's text in, the Score of the whole piece out: every section's note is read fresh by the producer and drawn by the code that draws it
      produce: async (note, title) => {
        const out = await produceComposition({
          phrases: phraseDepsWithSources({ readNote, compute: (data, params, t) => computePhraseScoreViaEngine(data, params, t) }, { computeArrangement, computeComposition }),
          compute: computeComposition,
          computeArrangement,
        }, note as string | { unreadable: string }, title);
        if (out.kind === 'score' && !this.disposed) this.scoreShown(file, note, out.payload);
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

  private headerText(file: TFile, text: string | { unreadable: string }, bars: ReturnType<typeof barsOfPayload>): string {
    if (typeof text !== 'string') return `${file.basename}: the note could not be read (${text.unreadable}).`;
    const read = readCompositionNote(text);
    return read.ok === false ? `${file.basename}: ${read.message}` : `${file.basename} — ${compositionHeader(read.value, bars)}`;
  }

  private noteChanged(path: string): void {
    const mine = this.file?.path;
    if (!mine || this.disposed || !this.area) return;
    if (path === mine || isCompositionPath(path) || isArrangementPath(path) || isPhrasePath(path) || path.startsWith('bars/') || path.startsWith('kits/')) {
      void this.readText(this.file!).then((text) => { if (!this.disposed) { void this.showTree(text); this.area?.update(text); } });
    }
  }

  /** The tree of the strip: the sections, and the sections of a composition a section plays (read now: one level). */
  private async showTree(text: string | { unreadable: string }): Promise<void> {
    const read = typeof text === 'string' ? readCompositionNote(text) : null;
    this.params = read !== null && read.ok ? read.value : null;
    if (this.params === null) { this.strip?.show([]); return; }
    const inner: Record<string, CompositionParams | undefined> = {};
    for (const s of this.params.sections) {
      if (!s.source.startsWith('compositions/') || s.source in inner) continue;
      const f = this.app.vault.getAbstractFileByPath(`${s.source}.md`);
      const r = f instanceof TFile ? readCompositionNote(await this.app.vault.read(f).catch(() => '')) : null;
      inner[s.source] = r !== null && r.ok ? r.value : undefined;
    }
    if (this.disposed) return;
    const rows = treeRows(this.params, this.shape, inner);
    this.strip?.show(rows);
    this.strip?.emphasise(this.notesNote === null ? null : [this.notesNote]);
    console.info(`[forge-composition] tree of ${this.file?.path ?? '?'}\n${treeText(rows)}`);
  }

  /** The Score is on screen: keep its lineage and shape (the lighting and the tree need them), say "<N> sections, <B> bars, <t> min" in the header, and draw the tree again with the bars each section covers. */
  private scoreShown(file: TFile, note: unknown, payload: Record<string, unknown>): void {
    const bars = barsOfPayload(payload);
    const l = bars === null ? null : readCompositionLineage(payload.composition_lineage, bars.length);
    this.lineage = l === null || typeof l === 'string' ? null : l;
    const s = payload[FORGE_COMPOSITION_KEY];
    this.shape = typeof s === 'object' && s !== null ? (s as CompositionShape) : null;
    this.headerEl?.setText(this.headerText(file, note as string | { unreadable: string }, bars));
    if (typeof note === 'string') void this.showTree(note);
  }

  /** The bars the note in the notes pane plays (the Score lights them). */
  private litByNotes(): string[] { return this.notesNote === null ? [] : barIdsPlayedFrom(this.lineage ?? [], this.notesNote); }

  /** Light these bars of the Score (none = clear). */
  private light(ids: readonly string[]): void { this.area?.lightAll([...ids]); }

  private release(): void {
    this.disposed = true;
    this.headerEl = null;
    this.stopAudio();
    this.area?.dispose();
    this.area = null;
    this.strip?.dispose();
    this.strip = null;
    this.stopListening?.();
    this.stopListening = null;
    this.lineage = null; this.params = null; this.shape = null; this.notesNote = null;
    this.contentEl.empty();
  }

  /** The same leaf, the note's own text. */
  private async openAsJson(): Promise<void> {
    const file = this.file;
    if (!file) return;
    await this.leaf.setViewState({ type: 'markdown', active: true, state: { file: file.path } });
  }
}

/** Open a composition note as a Score: a tab already showing it is reused, else a new tab. Returns the leaf. */
export async function openComposition(app: App, file: TFile): Promise<WorkspaceLeaf> {
  for (const leaf of app.workspace.getLeavesOfType(COMPOSITION_VIEW_TYPE)) {
    if (leaf.view instanceof CompositionView && leaf.view.file?.path === file.path) { app.workspace.revealLeaf(leaf); return leaf; }
  }
  const leaf = app.workspace.getLeaf(true);
  await leaf.setViewState({ type: COMPOSITION_VIEW_TYPE, active: true, state: { file: file.path } });
  app.workspace.revealLeaf(leaf);
  return leaf;
}

class DialogModal extends Modal {
  constructor(app: App, private readonly mount: (parent: HTMLElement, close: () => void) => { dispose(): void }) { super(app); }
  private handle: { dispose(): void } | null = null;
  onOpen(): void { this.handle = this.mount(this.contentEl, () => { this.close(); }); }
  onClose(): void { this.handle?.dispose(); this.contentEl.empty(); }
}

export interface CompositionsOptions {
  plan: ScorePanelPlan;
  /** The live answer to "is this vault score-first": asked each time a command is offered, so a forge.toml that stops declaring the profile turns the commands off at once. */
  scoreFirst(): boolean;
  /** The strip's hooks (the same as a phrase tab's) and the opener for a chip when the tab has no pair. */
  structure: PhraseStructureHooks;
  openNote(noteId: string): void;
  /** The note that made the bar pinned in a composition's Score (null = let go), for the notes pane of its pair: the same hook a phrase tab has. */
  onPin(leaf: WorkspaceLeaf, pin: PinnedNote | null): void;
  /** Open the notes pane beside this composition's Score ("Open the piece" opens the Score with its notes, like any phrase). Absent = the Score alone. */
  pair?(leaf: WorkspaceLeaf, file: TFile): Promise<void>;
}

export function registerCompositions(plugin: Plugin, opts: CompositionsOptions): void {
  const app = plugin.app;
  plugin.registerView(COMPOSITION_VIEW_TYPE, (leaf) => new CompositionView(leaf, opts.plan, opts.structure, opts.openNote, opts.onPin));

  const names = (folder: string): string[] => app.vault.getFiles().filter((f) => f.path.startsWith(`${folder}/`) && f.extension === 'md' && f.basename !== 'README').map((f) => `${folder}/${f.basename}`).sort();
  const compositionFiles = (): TFile[] => app.vault.getFiles().filter((f) => isCompositionPath(f.path));
  const readAll = async (): Promise<Array<{ path: string; text: string }>> => Promise.all(compositionFiles().map(async (f) => ({ path: f.path, text: await app.vault.read(f) })));

  /** The root mark moves to `target` (every other composition loses it); only the notes that change are written. */
  const makeRoot = async (target: string): Promise<void> => {
    for (const { path } of moveRoot(await readAll(), target)) {
      const f = app.vault.getAbstractFileByPath(path);
      if (f instanceof TFile) await app.vault.process(f, (current) => withRoot(current, path === target));
    }
  };

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

  plugin.addCommand({
    id: NEW_COMPOSITION_COMMAND_ID,
    name: NEW_COMPOSITION_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const phrases = names(PHRASE_FOLDER), arrangements = names(ARRANGEMENT_FOLDER);
      if (!newCompositionAvailable({ scoreFirst: opts.scoreFirst(), phraseCount: phrases.length, arrangementCount: arrangements.length })) return false;
      if (!checking) {
        const compPorts = ports(async (file) => { await openComposition(app, file); });
        void readAll().then((all) => {
          new DialogModal(app, (parent, close) => mountCompositionDialog(parent, {
            phrases, arrangements, compositions: names(COMPOSITION_FOLDER), hasRoot: rootOf(all).kind !== 'none',
            create: (choice) => createComposition(compPorts, choice, (path) => makeRoot(path)),
            close,
          })).open();
        });
      }
      return true;
    },
  });

  plugin.addCommand({
    id: OPEN_COMPOSITION_COMMAND_ID,
    name: OPEN_COMPOSITION_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const active = app.workspace.getActiveViewOfType(MarkdownView)?.file ?? app.workspace.getActiveFile();
      if (!openCompositionAvailable({ scoreFirst: opts.scoreFirst(), activePath: active?.path ?? null }) || !(active instanceof TFile) || !isCompositionPath(active.path)) return false;
      if (!checking) {
        openComposition(app, active).then(async (leaf) => { await opts.pair?.(leaf, active); }).catch((e) => {
          console.error('Open composition as Score failed', e);
          new Notice(`${OPEN_COMPOSITION_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
        });
      }
      return true;
    },
  });

  plugin.addCommand({
    id: OPEN_PIECE_COMMAND_ID,
    name: OPEN_PIECE_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      if (!openPieceAvailable({ scoreFirst: opts.scoreFirst(), compositionCount: compositionFiles().length })) return false;
      if (!checking) {
        void (async () => {
          const answer = rootOf(await readAll());
          if (answer.kind === 'none') { new Notice(noRootMessage); return; }
          if (answer.kind === 'many') { new Notice(manyRootsMessage(answer.paths)); return; }
          const file = app.vault.getAbstractFileByPath(answer.path);
          if (!(file instanceof TFile)) { new Notice(noRootMessage); return; }
          const leaf = await openComposition(app, file);
          await opts.pair?.(leaf, file);
        })().catch((e) => {
          console.error('Open the piece failed', e);
          new Notice(`${OPEN_PIECE_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
        });
      }
      return true;
    },
  });

  plugin.addCommand({
    id: MAKE_ROOT_COMMAND_ID,
    name: MAKE_ROOT_COMMAND_NAME,
    checkCallback: (checking: boolean) => {
      const active = app.workspace.getActiveViewOfType(CompositionView)?.file ?? app.workspace.getActiveViewOfType(MarkdownView)?.file ?? app.workspace.getActiveFile();
      if (!makeRootAvailable({ scoreFirst: opts.scoreFirst(), activePath: active?.path ?? null }) || !(active instanceof TFile)) return false;
      if (!checking) {
        makeRoot(active.path).then(() => { new Notice(`${active.basename} is now the root of the piece.`); console.info(`[forge-composition] root ${active.path}`); }).catch((e) => {
          console.error('Make this composition the root failed', e);
          new Notice(`${MAKE_ROOT_COMMAND_NAME} failed: ${(e as Error)?.message ?? e}`);
        });
      }
      return true;
    },
  });
}
