// Beat-as-data Phase 6 (drain 2026-10-07-1600) — the Score view: a READ-ONLY, non-destructive view of a rhythm data note as engraved
// notation, the third mode of the note's tab (JSON ⇄ Beat Box ⇄ Score). Music edition only (registered from registerRhythmEdit).
//
// What it does: reads the SAVED note, asks the engine (through the host's `computeRhythmScore`, plugin-side glue over
// `rhythm_data_to_stream`) for the tagged MusicXML payload, and hands it to the music-edition seam's `renderTaggedMusicXML` — the same
// Verovio + MIDI-player path the Run output uses (no duplicated render or player code). It never writes: no vault.modify / create /
// append / process anywhere in this file (pinned). It re-renders (debounced, single-flight) when the note changes on disk while open.
//
// Every decision is in rhythm-score-core.ts (produceScore, createScoreScheduler) and rhythm-mode-core.ts (the mode table).

import { EditableFileView, type TFile, type WorkspaceLeaf } from 'obsidian';
import { musicEdition } from './music-edition-selected.ts';
import { getPyodideHost } from './pyodide-host.ts';
import { produceScore, createScoreScheduler, type ScoreScheduler } from './rhythm-score-core.ts';
import { RHYTHM_SCORE_VIEW_TYPE, MODE_ACTIONS, headerActionsFor, type RhythmMode } from './rhythm-mode-core.ts';
import { switchLeafToMode, type ModeSwitchHooks } from './rhythm-mode-switch.ts';

export class RhythmScoreView extends EditableFileView {
  private scheduler: ScoreScheduler | null = null;
  /** Bumped on every render and on unload: a render that finishes after a newer one started (or after the view moved on) draws nothing. */
  private renderSeq = 0;

  constructor(leaf: WorkspaceLeaf, private readonly hooks: ModeSwitchHooks) {
    super(leaf);
    // Obsidian's addAction PREPENDS: add right-to-left so the rendered order is the table's order (Beat Box, JSON).
    for (const a of [...headerActionsFor('score', musicEdition.id)].reverse()) {
      this.addAction(a.icon, a.title, () => { void this.switchMode(a.mode); });
    }
  }

  getViewType(): string { return RHYTHM_SCORE_VIEW_TYPE; }
  getIcon(): string { return MODE_ACTIONS.score.icon; }

  async onOpen(): Promise<void> {
    await super.onOpen();
    this.contentEl.addClass('forge-rhythm-score-view');
    // The vault `modify` event for the open note (autosave from another pane, a hand edit, a sync): re-render, debounced.
    this.registerEvent(this.app.vault.on('modify', (f) => {
      if (this.file && f.path === this.file.path) this.scheduler?.request();
    }));
  }

  async onLoadFile(file: TFile): Promise<void> {
    await super.onLoadFile(file);
    this.scheduler?.dispose();
    this.scheduler = createScoreScheduler({
      setTimer: (fn, ms) => window.setTimeout(fn, ms),
      clearTimer: (h) => window.clearTimeout(h as number),
      render: () => this.render(file),
    });
    this.scheduler.renderNow();
  }

  async onUnloadFile(file: TFile): Promise<void> {
    this.renderSeq++;
    this.scheduler?.dispose();
    this.scheduler = null;
    this.stopAudio();
    await super.onUnloadFile(file);
  }

  async onClose(): Promise<void> {
    this.stopAudio();
    await super.onClose();
  }

  /** Silence any score playback in this view (mode switch, close, re-render, plugin unload). */
  stopAudio(): void {
    musicEdition.stopPlayers(this.contentEl, (m, e) => console.error(m, e));
  }

  private async switchMode(to: RhythmMode): Promise<void> {
    const file = this.file;
    if (!file) return;
    this.stopAudio();
    await switchLeafToMode(this.app, this.leaf, file, 'score', to, this.hooks);
  }

  private panel(message: string, withJsonAction: boolean): void {
    const box = this.contentEl.createDiv({ cls: 'forge-rhythm-score-panel' });
    box.createEl('p', { text: message });
    if (withJsonAction) {
      const btn = box.createEl('button', { text: MODE_ACTIONS.json.title });
      btn.addEventListener('click', () => { void this.switchMode('json'); });
    }
  }

  private async render(file: TFile): Promise<void> {
    const seq = ++this.renderSeq;
    this.stopAudio();                                  // never two audio streams: silence the previous render's player first
    this.contentEl.empty();
    this.contentEl.createDiv({ cls: 'forge-rhythm-score-status', text: 'Rendering score…' });
    const outcome = await produceScore({
      readNote: () => this.app.vault.read(file),       // the SAVED note, every time
      compute: async (data, title) => {
        const host = getPyodideHost();
        if (!host) throw new Error('the engine is not available');
        return (await host.getInstance()).computeRhythmScore(data, title);
      },
    }, file.basename);
    if (seq !== this.renderSeq) return;                // a newer render (or an unload) superseded this one
    this.contentEl.empty();
    if (outcome.kind !== 'score') {
      this.panel(outcome.message, true);               // refusal / engine error: say why, offer the way out
      return;
    }
    const host = this.contentEl.createDiv({ cls: 'forge-rhythm-score-host' });
    if (!musicEdition.renderTaggedMusicXML(host, outcome.payload, file.basename)) {
      this.panel('The score view needs the music edition of the plugin.', true);
      return;
    }
    const foot = this.contentEl.createDiv({ cls: 'forge-rhythm-score-footer' });
    foot.createSpan({ text: 'Read-only view of the note. ' });
    const edit = foot.createEl('button', { text: 'Edit in Beat Box' });
    edit.addEventListener('click', () => { void this.switchMode('beatbox'); });
  }
}
