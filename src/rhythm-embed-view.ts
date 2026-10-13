// Beat-as-data Phase 8 (drain 2026-10-10-2200) — the `forge-rhythm` embed block: show a rhythm DATA note inline, in any note, as a
// PLAYGROUND Beat Box. The Obsidian-coupled half; every decision is in rhythm-embed-core.ts (parser, freshness, coordinator, the
// per-embed session) and rhythm-edit-core.ts (the protocol, with its `playground` mode).
//
//     ```forge-rhythm
//     [[rhythm_pattern_tresillo]]
//     ```
//
// What it is NOT: an editor. An embed has no write path of any kind — this file contains no vault or adapter write API (pinned in
// rhythm-embed-wiring.test.ts), the session's dependency bag has no write function, and a `forge-rhythm-save` from the iframe is
// dropped at the message parser. The data note stays the single source of truth; the chapter is a view of it, and a student's edits
// live only in the iframe until they press Reset or the page is rendered again.
//
// Hosting: the widget is rendered through createSandboxedWidgetIframe (html-embed-view.ts) — the same blob-URL iframe and flags as
// every html-embed widget and the Beat Box tab. The widget is found by the bundled-aware lookup (resolveWidgetFile); not copied.

import { MarkdownRenderChild, TFile, type App, type MarkdownPostProcessorContext, type Plugin } from 'obsidian';
import { createSandboxedWidgetIframe } from './html-embed-view.ts';
import { resolveWidgetFile } from './bundled-widget-lookup.ts';
import { RHYTHM_BOX_WIDGET_PATH, readRhythmNote } from './rhythm-edit-core.ts';
import {
  RHYTHM_EMBED_LANGUAGE,
  createPlaybackCoordinator,
  createRhythmEmbedSession,
  noteNotFoundMessage,
  notRhythmMessage,
  parseRhythmEmbedSource,
  widgetMissingMessage,
  type RhythmEmbedSession,
} from './rhythm-embed-core.ts';
import { musicEdition } from './music-edition-selected.ts';
import { computeRhythmScoreViaEngine } from './rhythm-score-engine.ts';

export interface RhythmEmbedHooks {
  /** Open the data note in its own tab (the plugin's Beat Box opener: a tab already showing it is reused). */
  openNote(file: TFile): void;
}

/** One coordinator for the whole plugin: all embeds on a page (and across open panes) share it, so only one is ever sounding. */
const coordinator = createPlaybackCoordinator();
let embedCounter = 0;

export function registerRhythmEmbed(plugin: Plugin, hooks: RhythmEmbedHooks): void {
  try {
    plugin.registerMarkdownCodeBlockProcessor(RHYTHM_EMBED_LANGUAGE, (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
      ctx.addChild(new RhythmEmbed(plugin.app, hooks, source, el, ctx.sourcePath));
    });
  } catch (e) {
    console.warn('[forge] the forge-rhythm code-block processor did not register:', e);
  }
}

class RhythmEmbed extends MarkdownRenderChild {
  private readonly id = `rhythm-embed-${++embedCounter}`;
  private file!: TFile;
  private session: RhythmEmbedSession | null = null;
  private iframe: HTMLIFrameElement | null = null;
  private blobUrl: string | null = null;
  private bodyEl!: HTMLElement;
  private staleEl: HTMLElement | null = null;
  private scoreBtn: HTMLButtonElement | null = null;
  private scoreHost: HTMLElement | null = null;
  private statusEl: HTMLElement | null = null;
  private unloaded = false;

  private readonly onMessage = (ev: MessageEvent): void => {
    // Only OUR iframe may talk to this embed (the widget makes the mirror check on its side).
    if (!this.iframe || ev.source !== this.iframe.contentWindow) return;
    void this.session?.onWidgetMessage(ev.data);
  };

  constructor(
    private readonly app: App,
    private readonly hooks: RhythmEmbedHooks,
    private readonly source: string,
    el: HTMLElement,
    private readonly sourcePath: string,
  ) {
    super(el);
  }

  onload(): void {
    window.addEventListener('message', this.onMessage);
    coordinator.register(this.id, () => this.session?.stop());
    // The data note changed on disk (the Beat Box tab autosaving, a hand edit, a sync): reload only if the playground has no local edits.
    this.registerEvent(this.app.vault.on('modify', (f) => {
      if (this.file && f.path === this.file.path) void this.session?.onNoteModified();
    }));
    void this.render();
  }

  onunload(): void {
    this.unloaded = true;
    window.removeEventListener('message', this.onMessage);
    coordinator.unregister(this.id);
    this.session?.dispose();
    this.session = null;
    this.releaseIframe();
    musicEdition.stopPlayers(this.containerEl, (m, e) => console.error(m, e));
  }

  private releaseIframe(): void {
    if (this.blobUrl) URL.revokeObjectURL(this.blobUrl);
    this.blobUrl = null;
    this.iframe = null;
  }

  /** An inline error in place of the widget — never thrown, never breaks the rest of the page. `openNote` offers the way out for a
   *  note that exists but is not (valid) rhythm data, so it can be fixed in its own tab. */
  private showError(message: string, openNote = false): void {
    this.session?.dispose();
    this.session = null;
    this.releaseIframe();
    coordinator.setPlaying(this.id, false);
    this.containerEl.empty();
    this.containerEl.addClass('forge-rhythm-embed');
    const box = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-error' });
    box.createEl('p', { text: message });
    if (openNote && this.file) {
      const btn = box.createEl('button', { text: 'Open note' });
      btn.addEventListener('click', () => { this.hooks.openNote(this.file); });
    }
  }

  private async render(): Promise<void> {
    try {
      const parsed = parseRhythmEmbedSource(this.source);
      if (parsed.ok === false) {
        this.showError(`Rhythm embed: ${parsed.message}`);
        return;
      }
      const options = parsed.value;
      const target = this.app.metadataCache.getFirstLinkpathDest(options.target, this.sourcePath);
      if (!(target instanceof TFile)) {
        this.showError(noteNotFoundMessage(options.target));
        return;
      }
      this.file = target;
      const text = await this.app.vault.read(this.file);
      const note = readRhythmNote(text);                 // the Beat Box's own validation and wording
      if (note.ok === false) {
        this.showError(notRhythmMessage(note.message), true);
        return;
      }
      const widget = await resolveWidgetFile(this.app, RHYTHM_BOX_WIDGET_PATH);
      if (widget.ok === false) {
        this.showError(widgetMissingMessage(widget.message), true);
        return;
      }
      if (this.unloaded) return;

      const title = options.title ?? this.file.basename;
      this.containerEl.empty();
      this.containerEl.addClass('forge-rhythm-embed');
      const bar = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-toolbar' });
      bar.createSpan({ cls: 'forge-rhythm-embed-title', text: title });
      const openBtn = bar.createEl('button', { text: 'Open note', attr: { title: 'Open this rhythm in its own tab, where changes are saved' } });
      openBtn.addEventListener('click', () => { this.hooks.openNote(this.file); });
      if (musicEdition.id === 'music') {
        this.scoreBtn = bar.createEl('button', { text: 'Score', attr: { title: 'Engrave the rhythm as it is on screen right now' } });
        this.scoreBtn.addEventListener('click', () => { void this.toggleScore(); });
      }
      this.statusEl = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-status' });
      this.staleEl = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-stale', text: 'The note changed — press Reset to load it.' });
      this.staleEl.toggleClass('forge-rhythm-embed-hidden', true);
      this.bodyEl = this.containerEl.createDiv({ cls: 'forge-rhythm-embed-body' });

      this.session = createRhythmEmbedSession({
        noteName: this.file.basename,
        title,
        view: options.view,
        readNote: () => this.app.vault.read(this.file),
        post: (message) => { this.iframe?.contentWindow?.postMessage(message, '*'); },
        openNote: () => { if (this.file) this.hooks.openNote(this.file); },
        onPlaying: (playing) => coordinator.setPlaying(this.id, playing),
        setStale: (show) => { this.staleEl?.toggleClass('forge-rhythm-embed-hidden', !show); },
        showError: (message) => { this.showError(message, true); },
        computeScore: computeRhythmScoreViaEngine,
        setTimer: (fn, ms) => window.setTimeout(fn, ms),
        clearTimer: (h) => window.clearTimeout(h as number),
      });
      const { iframe, blobUrl } = createSandboxedWidgetIframe(this.bodyEl, widget.html, `${options.heightPx}px`);
      this.iframe = iframe;
      this.blobUrl = blobUrl;
    } catch (e) {
      this.showError(`Rhythm embed: ${(e as Error)?.message ?? e}`);
    }
  }

  /** Beat Box <-> engraved score of the CURRENT playground state (music edition). The iframe is kept (hidden), never rebuilt, so the
   *  student's edits survive a look at the score. Nothing is written. */
  private async toggleScore(): Promise<void> {
    const session = this.session;
    const iframe = this.iframe;
    const btn = this.scoreBtn;
    if (!session || !iframe || !btn) return;
    this.statusEl?.setText('');
    if (this.scoreHost) {                                // score showing -> back to the grid
      musicEdition.stopPlayers(this.scoreHost, (m, e) => console.error(m, e));
      this.scoreHost.remove();
      this.scoreHost = null;
      iframe.toggleClass('forge-rhythm-embed-hidden', false);
      btn.setText('Score');
      return;
    }
    session.stop();                                      // the grid's audio must not run under the score
    const outcome = await session.currentScore();
    if (this.unloaded || this.session !== session) return;
    if (outcome.kind !== 'score') {
      this.statusEl?.setText(outcome.message);
      return;
    }
    const host = this.bodyEl.createDiv({ cls: 'forge-rhythm-score-host' });
    if (!musicEdition.renderTaggedMusicXML(host, outcome.payload, this.file.basename)) {
      host.remove();
      this.statusEl?.setText('The score needs the music edition of the plugin.');
      return;
    }
    this.scoreHost = host;
    iframe.toggleClass('forge-rhythm-embed-hidden', true);
    btn.setText('Beat Box');
  }
}
