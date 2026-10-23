// score_first M5 (drain 2026-10-22-1850) — the phrase tab: a `phrases/phrase_NNN.md` data note shown as a control strip over a live Score. The Obsidian-coupled half (the decisions are in
// phrase-core.ts, the DOM and its freshness in phrase-dom.ts, both unit-tested without Obsidian). It is registered, and opened, ONLY in a score-first vault (score-first.ts).
//
// It writes ONE thing: the phrase note's json block, when a person edits a control (`vault.process`, so the rewrite is atomic against the note's current text). It never writes the source bar.
import { EditableFileView, TFile, type App, type WorkspaceLeaf } from 'obsidian';
import { musicEdition } from './music-edition-selected.ts';
import { scoreClickPlays } from './score-click-policy.ts';
import { computePhraseScoreViaEngine } from './phrase-engine.ts';
import { PHRASE_VIEW_TYPE, applyPhraseWrite, isBarPath } from './phrase-core.ts';
import { mountPhrase, type PhraseHandle } from './phrase-dom.ts';
import type { ScorePanelPlan } from './score-first-core.ts';
import { messageDelivery } from './score-first-messages-core.ts';
import { headerResync } from './header-resync.ts';

export class PhraseView extends EditableFileView {
  private handle: PhraseHandle | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plan: ScorePanelPlan, private readonly openNote: (noteId: string) => void) {
    super(leaf);
    this.addAction('code', 'Open as JSON', () => { void this.openAsJson(); });
  }

  getViewType(): string { return PHRASE_VIEW_TYPE; }
  getIcon(): string { return 'music'; }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass('forge-phrase-view');
    // Every vault `modify` goes to the phrase: it reloads when it is this phrase's note and redraws when it is the bar the phrase is made of; anything else costs nothing.
    this.registerEvent(this.app.vault.on('modify', (f) => { this.handle?.noteModified(f.path); }));
  }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.release();
    // The note's text first, so the surface drawn is the right one for its kind (a mix gets the mix strip at once, not the extend strip for a moment). Unreadable = the default surface; load() says why.
    const initial = await this.app.vault.read(file).catch(() => undefined);
    this.handle = mountPhrase(this.contentEl, {
      path: file.path,
      title: file.basename,
      plan: this.plan,
      initial,
      listBars: () => this.app.vault.getFiles().filter((f) => isBarPath(f.path)).map((f) => f.basename),
      inspector: { openNote: this.openNote },          // M6: click a bar for its lineage; the bracket; the source link — each opens a note through the plugin's own openers
      readNote: async (p) => {
        const f = this.app.vault.getAbstractFileByPath(p);
        if (!(f instanceof TFile)) throw new Error('File not found');
        return this.app.vault.read(f);
      },
      writePhrase: async (params) => {
        let refusal: string | null = null;
        try {
          await this.app.vault.process(file, (text) => {
            const w = applyPhraseWrite(text, params);
            if (w.ok === false) { refusal = w.message; return text; }
            return w.text;
          });
        } catch (e) {
          console.error('PhraseView: could not write the phrase', e);
          return { ok: false, message: `Not saved: ${(e as Error)?.message ?? e}` };
        }
        return refusal === null ? { ok: true } : { ok: false, message: refusal };
      },
      compute: computePhraseScoreViaEngine,
      renderInto: (host, payload) => musicEdition.renderTaggedMusicXML(host, payload, file.basename, { clickToPlay: scoreClickPlays }),
      stopPlayers: (host) => musicEdition.stopPlayers(host, (m, e) => console.error(m, e)),
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      now: () => performance.now(),
      onTiming: (t) => console.debug(`Forge: phrase score ${t.outcome} in ${Math.round(t.totalMs)} ms (engine ${Math.round(t.engineMs)} ms)`),
      messages: messageDelivery,                         // the same message line and "Forge log (N)" as the bar's Score: the panel stays closed
    });
    await this.handle.load();
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
  stopAudio(): void {
    musicEdition.stopPlayers(this.contentEl, (m, e) => console.error(m, e));
  }

  private release(): void {
    this.stopAudio();
    this.handle?.dispose();
    this.handle = null;
    this.contentEl.empty();
  }

  /** The same leaf, the note's own text (the "Open as JSON" of the bar's Score tab). */
  private async openAsJson(): Promise<void> {
    const file = this.file;
    if (!file) return;
    await this.leaf.setViewState({ type: 'markdown', active: true, state: { file: file.path } });
    // The new markdown view may get no workspace event after its file is loaded (setViewState is not an "open"), so ask the header syncs directly, now and again once it has settled.
    headerResync.request('open-as-json');
    window.setTimeout(() => headerResync.request('open-as-json+150ms'), 150);
    window.setTimeout(() => headerResync.request('open-as-json+600ms'), 600);
  }
}

/** Open a phrase note in a phrase tab: a tab already showing it is reused, else a new tab. */
export async function openPhrase(app: App, file: TFile): Promise<void> {
  for (const leaf of app.workspace.getLeavesOfType(PHRASE_VIEW_TYPE)) {
    if (leaf.view instanceof PhraseView && leaf.view.file?.path === file.path) { app.workspace.revealLeaf(leaf); return; }
  }
  const leaf = app.workspace.getLeaf(true);
  await leaf.setViewState({ type: PHRASE_VIEW_TYPE, active: true, state: { file: file.path } });
  app.workspace.revealLeaf(leaf);
}

/** The phrase's Score in THIS leaf (the "Open as Score" button on the phrase's text tab). */
export async function openPhraseInLeaf(app: App, leaf: WorkspaceLeaf, file: TFile): Promise<void> {
  await leaf.setViewState({ type: PHRASE_VIEW_TYPE, active: true, state: { file: file.path } });
  app.workspace.revealLeaf(leaf);
}
