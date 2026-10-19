// Beat-as-data Phase 8 (drain 2026-10-10-2200) — the `forge-rhythm` embed block, pure half. Obsidian-free (the repo's pure-core
// convention): rhythm-embed-view.ts supplies the vault, the DOM and the engine and calls into this for every decision.
//
//   parseRhythmEmbedSource   the block body: a wikilink, then optional `height:` / `title:` / `view:` lines.
//   decideEmbedFreshness     the note changed on disk: reload, tell, or ignore.
//   createPlaybackCoordinator  one sound at a time across embeds.
//   createRhythmEmbedSession the host side of ONE embed: what each widget message means, with every effect injected.
//
// THE invariant: an embed never writes. EmbedSessionDeps contains no write function, and a widget `save` is dropped at the parser.

import { parseHeightPx } from './html-embed-view-core.ts';
import {
  buildLoadMessage, buildRequestDataMessage, buildStopMessage, contentFingerprint, parseEmbedWidgetMessage, readRhythmNote, rhythmDataEqual,
  type RhythmData, type RhythmWidgetView,
} from './rhythm-edit-core.ts';
import { produceScoreFromData, type ScoreOutcome } from './rhythm-score-core.ts';

/** The default height of a Beat Box embed, grid view, with FOUR instruments — the worst case; a note with fewer gets less (`embedHeightFor`).
 *  Drain 2026-10-15-2230: measured in real Chromium at a 460 px pane (a wider pane is shorter), after the compact layout. Before it, the grid
 *  needed 488-602 px for 1-4 instruments and this was 420, so every playground embed scrolled inside its frame. */
export const DEFAULT_RHYTHM_EMBED_HEIGHT_PX = 290;
/** The same for `view: circle` with four rings (the circle's limit). Was 960 — a fixed 460 px square plus a tall toolbar whatever the note held. */
export const DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX = 630;

// Measured heights at a 460 px pane, rounded UP with 10-20 px of slack (fonts differ in Obsidian's Electron), by instrument count:
//   grid   1: 184  2: 214  3: 244  4: 274   (+30 per row beyond four — the grid has no instrument limit)
//   circle 1: 432  2: 484  3: 536  4: 610   (the circle is sized by its ring count; more than four falls back to the grid)
// Drain 2026-10-20-0900: re-measured (they were 290-380 / 502-710 at Iteration 78): Reset, the "not saved" reminder and the note name left the iframe for the host's
// toolbar (the host bar's two rows are gone), the five transforms and Add instrument share one row, Tap tempo is gone, and a hidden host bar no longer takes a stray row.
const GRID_BY_INSTRUMENTS = [200, 230, 260, 290];
const CIRCLE_BY_RINGS = [450, 500, 550, 630];
const GRID_ROW_PX = 30;

/** The default height for an embed that gave no `height:` line, from what is IN the note. An unknown count (0) gets the worst case. */
export function embedHeightFor(view: RhythmWidgetView | null, instruments: number): number {
  const n = Math.max(0, Math.floor(instruments));
  const gridHeight = n === 0 ? DEFAULT_RHYTHM_EMBED_HEIGHT_PX
    : n <= GRID_BY_INSTRUMENTS.length ? GRID_BY_INSTRUMENTS[n - 1]
    : GRID_BY_INSTRUMENTS[GRID_BY_INSTRUMENTS.length - 1] + (n - GRID_BY_INSTRUMENTS.length) * GRID_ROW_PX;
  if (view !== 'circle') return gridHeight;
  if (n === 0) return DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX;
  return n <= CIRCLE_BY_RINGS.length ? CIRCLE_BY_RINGS[n - 1] : gridHeight;     // 5+ instruments: the widget falls back to Grid
}
export const RHYTHM_EMBED_LANGUAGE = 'forge-rhythm';
const SUPPORTED_OPTIONS = ['height', 'title', 'view'] as const;
const SUPPORTED_VIEWS: readonly RhythmWidgetView[] = ['grid', 'circle'];
export const DATA_REQUEST_TIMEOUT_MS = 2000;

export interface RhythmEmbedOptions {
  /** The link path as written (`rhythm_pattern_tresillo` or `rhythm_data/rhythm_pattern_tresillo`), alias and heading removed. */
  target: string;
  /** The block's height: the author's `height:` line, else the fixed default for the view (the 4-instrument worst case). */
  heightPx: number;
  /** True when the author wrote a `height:` line — the view then uses `heightPx` as written instead of sizing to the note. */
  heightExplicit: boolean;
  /** The `title:` option, or null (the host then uses the note's name). */
  title: string | null;
  /** The `view:` option (the view the widget starts in), or null (the widget's own default: grid). */
  view: RhythmWidgetView | null;
}

export type RhythmEmbedParse = { ok: true; value: RhythmEmbedOptions } | { ok: false; message: string };

const LINK_RE = /^\[\[([^\[\]|#]+?)(?:#[^\[\]|]*)?(?:\|[^\[\]]*)?\]\]$/;
const OPTION_RE = /^([A-Za-z_]+)\s*:\s*(.*)$/;

export function parseRhythmEmbedSource(source: string): RhythmEmbedParse {
  const bad = (message: string): RhythmEmbedParse => ({ ok: false, message });
  const lines = source.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
  if (lines.length === 0) {
    return bad('The block is empty. Its first line must be a link to a rhythm data note, e.g. [[rhythm_pattern_tresillo]].');
  }
  const link = LINK_RE.exec(lines[0]);
  if (!link || link[1].trim() === '') {
    return bad(`The first line must be a link to a rhythm data note, like [[rhythm_pattern_tresillo]] (got "${lines[0]}").`);
  }
  let heightPx: number | null = null;
  let title: string | null = null;
  let view: RhythmWidgetView | null = null;
  const seen = new Set<string>();
  for (const line of lines.slice(1)) {
    const m = OPTION_RE.exec(line);
    if (!m) return bad(`Unrecognised line "${line}". After the link, only "height: <px>", "title: <text>" and "view: circle|grid" are understood — one link per block.`);
    const key = m[1].toLowerCase();
    const value = m[2].trim();
    if (!(SUPPORTED_OPTIONS as readonly string[]).includes(key)) {
      return bad(`Unknown option "${m[1]}" (supported: ${SUPPORTED_OPTIONS.join(', ')}).`);
    }
    if (seen.has(key)) return bad(`The option "${key}" is given twice.`);
    seen.add(key);
    if (key === 'height') {
      const px = parseHeightPx(value);
      if (px === null || px <= 0) return bad(`height must be a whole number of pixels, like "height: 420" (got "${value}").`);
      heightPx = px;
    } else if (key === 'view') {
      const v = value.toLowerCase();
      if (!(SUPPORTED_VIEWS as readonly string[]).includes(v)) {
        return bad(`view must be "circle" or "grid" (got "${value}").`);
      }
      view = v as RhythmWidgetView;
    } else {
      if (value === '') return bad('title must not be empty — leave the line out to use the note\'s name.');
      title = value;
    }
  }
  const defaultHeight = view === 'circle' ? DEFAULT_RHYTHM_EMBED_CIRCLE_HEIGHT_PX : DEFAULT_RHYTHM_EMBED_HEIGHT_PX;
  return { ok: true, value: { target: link[1].trim(), heightPx: heightPx ?? defaultHeight, heightExplicit: heightPx !== null, title, view } };
}

// ---- freshness ----------------------------------------------------------------------------------------------------------

export type EmbedFreshness = 'ignore' | 'reload';

/** The label an embed shows, briefly, when it was reloaded because the data note changed on disk, and how long it stays. */
export const UPDATED_FROM_NOTE_LABEL = 'Updated from note';
export const UPDATED_FROM_NOTE_MS = 4000;

/** The data note changed on disk while the embed is up (the Beat Box tab autosaving, Restore to last commit, `git checkout`, an external editor,
 *  a sync). Drain 2026-10-18-1800, the driver's rule: by ANY route the embed shows the note as it now is — an unsaved playground experiment is
 *  ephemeral by design and is replaced (the view says "Updated from note"), where Phase 8 used to keep it and only warn. A modify event that did
 *  not change the text is nothing: a mere touch must not throw an experiment away. */
export function decideEmbedFreshness(input: { loadedFingerprint: string; currentFingerprint: string }): EmbedFreshness {
  return input.currentFingerprint === input.loadedFingerprint ? 'ignore' : 'reload';
}

// ---- recovering from an error state -------------------------------------------------------------------------------------------

/** A vault `modify` event for the embed's note. A live embed hands it to its session; an embed that is showing an inline ERROR has no session
 *  (showError disposes it), so before this decision existed a note that was briefly invalid and then restored stayed an error until the page
 *  re-rendered. Re-render exactly when the embed is in its error state and still on the page. */
export function shouldRerenderAfterModify(state: { hasSession: boolean; inErrorState: boolean; unloaded: boolean }): boolean {
  return !state.unloaded && !state.hasSession && state.inErrorState;
}

// ---- one sound at a time ------------------------------------------------------------------------------------------------

export interface PlaybackCoordinator {
  register(id: string, stop: () => void): void;
  /** The embed's widget started (true) or stopped (false) playing. Starting stops every OTHER registered embed. */
  setPlaying(id: string, playing: boolean): void;
  /** The embed is going away (block removed, note closed): it is stopped if it was the one playing, and forgotten. */
  unregister(id: string): void;
  playingId(): string | null;
}

export function createPlaybackCoordinator(): PlaybackCoordinator {
  const stops = new Map<string, () => void>();
  let playing: string | null = null;
  return {
    register(id, stop) { stops.set(id, stop); },
    setPlaying(id, isPlaying) {
      if (!stops.has(id)) return;
      if (!isPlaying) {
        if (playing === id) playing = null;
        return;
      }
      for (const [other, stop] of stops) {
        if (other !== id) {
          try { stop(); } catch { /* a stuck embed must not block the one that is starting */ }
        }
      }
      playing = id;
    },
    unregister(id) {
      const stop = stops.get(id);
      stops.delete(id);
      if (playing === id) {
        playing = null;
        if (stop) { try { stop(); } catch { /* going away anyway */ } }
      }
    },
    playingId: () => playing,
  };
}

// ---- the toolbar (drain 2026-10-20-0900 §1) -----------------------------------------------------------------------------------------

/** The playground's reminder, in the toolbar row beside Reset: two words, with the whole sentence as its tooltip and accessible name. Drain 2026-10-20-2100: it is a STATE — shown only while the
 *  embed differs from the note (embedToolbarState). */
export const PLAYGROUND_HINT_TEXT = 'not saved';
export const PLAYGROUND_SENTENCE = 'This embed is a playground: edits are not saved to the note; Open note to edit it.';
export const PLAYGROUND_HINT_TITLE = PLAYGROUND_SENTENCE;

/** What the hint and Reset look like in each state. Pristine (the embed shows the note as it is): the hint is hidden and Reset is disabled; dirty: the hint shows and Reset works. The sentence is
 *  in the tooltip AND the accessible name of both, in both states; the Reset tooltip says what Reset will do NOW. The accessible name of Reset starts with its visible word. */
export function embedToolbarState(dirty: boolean): {
  hintHidden: boolean; resetDisabled: boolean; hintTitle: string; hintAriaLabel: string; resetTitle: string; resetAriaLabel: string;
} {
  return {
    hintHidden: !dirty,
    resetDisabled: !dirty,
    hintTitle: PLAYGROUND_SENTENCE,
    hintAriaLabel: PLAYGROUND_SENTENCE,
    resetTitle: dirty
      ? `Reset: put the rhythm back exactly as it is in the note. ${PLAYGROUND_SENTENCE}`
      : `Nothing to reset: this embed shows the note as it is. ${PLAYGROUND_SENTENCE}`,
    resetAriaLabel: dirty
      ? `Reset \u2014 put the rhythm back as it is in the note. ${PLAYGROUND_SENTENCE}`
      : `Reset \u2014 nothing to reset yet. ${PLAYGROUND_SENTENCE}`,
  };
}

export interface EmbedToolbarItem {
  id: 'open-note' | 'score' | 'reset' | 'hint';
  kind: 'button' | 'hint';
  text: string;
  title: string;
  /** Present when the visible text is not the whole accessible name. */
  ariaLabel?: string;
}

/** The ONE row's items, left to right (the title and the "Updated from note" pill come first, from the view): Open note, Score (music edition only),
 *  Reset, then the hint. The view builds its DOM from this and nothing else, so the words and tooltips cannot differ from what the tests pin. */
export function embedToolbarItems(opts: { music: boolean }): EmbedToolbarItem[] {
  const items: EmbedToolbarItem[] = [
    { id: 'open-note', kind: 'button', text: 'Open note', title: 'Open this rhythm in its own tab, where changes are saved' },
  ];
  if (opts.music) items.push({ id: 'score', kind: 'button', text: 'Score', title: 'Engrave the rhythm as it is on screen right now' });
  items.push(
    { id: 'reset', kind: 'button', text: 'Reset', title: embedToolbarState(false).resetTitle, ariaLabel: embedToolbarState(false).resetAriaLabel },
    { id: 'hint', kind: 'hint', text: PLAYGROUND_HINT_TEXT, title: PLAYGROUND_HINT_TITLE, ariaLabel: PLAYGROUND_HINT_TITLE },
  );
  return items;
}

// ---- error wording (g) --------------------------------------------------------------------------------------------------

export const noteNotFoundMessage = (target: string) => `Rhythm embed: note not found: ${target}`;
export const notRhythmMessage = (reason: string) => `Rhythm embed: ${reason}`;
/** `searched` is the bundled-aware lookup's own message ("not found. Searched — …") — the previous drain's refusal text, reused. */
export const widgetMissingMessage = (searched: string) => `Rhythm embed: the Rhythm Box widget was ${searched}`;

// ---- the host side of one embed -----------------------------------------------------------------------------------------

export interface EmbedSessionDeps {
  /** The data note's name (what the widget shows as the note; used as the score title). */
  noteName: string;
  /** Header title: the `title:` option, else the note's name. */
  title: string;
  /** The `view:` option, handed to the widget with every load (it applies it once). Absent/null = the widget's default. */
  view?: RhythmWidgetView | null;
  /** True when the widget should size the iframe to its content (the block gave no `height:`): rides on every load as `autoHeight: true`. */
  autoHeight?: boolean;
  /** True when the host's toolbar draws the playground's Reset and "not saved" reminder (the widget then omits its own): rides on every load as `resetInHost: true`. */
  resetInHost?: boolean;
  /** The data note's CURRENT saved text. The ONLY thing an embed ever asks the vault for — there is no write counterpart. */
  readNote(): Promise<string>;
  /** Post a message to this embed's widget iframe. */
  post(message: Record<string, unknown>): void;
  /** Open the data note in its own tab (the Beat Box, with autosave as usual). */
  openNote(): void;
  /** Tell the plugin-level coordinator this embed started / stopped playing. */
  onPlaying(playing: boolean): void;
  /** The embed was just reloaded because the note changed on disk: show the brief "Updated from note" label (the view hides it again). */
  showUpdated(): void;
  /** Replace the widget with an inline error. */
  showError(message: string): void;
  /** Drain 2026-10-20-2100 — the embed became pristine / dirty (its data equals the note as loaded, or differs): the view shows or hides "not saved" and enables or disables Reset.
   *  Called with `false` on every load (first load, Reset, "Updated from note") and whenever a check changes the answer. */
  onDirtyChange?(dirty: boolean): void;
  /** Engine: `rhythm_data_to_stream` -> tagged MusicXML. Absent when there is no engine (the Score toggle then reports an error). */
  computeScore?(data: RhythmData, title: string): Promise<unknown>;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
}

export interface RhythmEmbedSession {
  onWidgetMessage(raw: unknown): Promise<void>;
  /** The host's Reset button: re-read the note and send a fresh load — the same path as the widget's own Reset message. */
  reset(): Promise<void>;
  /** The vault reported a modify of the data note. */
  onNoteModified(): Promise<void>;
  isDirty(): boolean;
  /** Ask the widget for its CURRENT (unsaved) data. Rejects if it does not answer. */
  requestCurrentData(): Promise<unknown>;
  /** The engraved score of the CURRENT playground state (validated; the saved note is not read). */
  currentScore(): Promise<ScoreOutcome>;
  stop(): void;
  dispose(): void;
}

export function createRhythmEmbedSession(deps: EmbedSessionDeps): RhythmEmbedSession {
  let disposed = false;
  let dirty = false;
  let loadedFingerprint = '';
  /** The note as last loaded — the baseline "pristine" is measured against. */
  let loadedData: RhythmData | null = null;
  const pending: Array<{ resolve(v: unknown): void; reject(e: Error): void; timer: unknown }> = [];

  const post = (m: Record<string, unknown>) => { if (!disposed) deps.post(m); };

  /** Read the saved note and send it as a playground load. An invalid note is an inline error, never a load. */
  async function loadNote(): Promise<boolean> {
    let text: string;
    try {
      text = await deps.readNote();
    } catch (e) {
      deps.showError(notRhythmMessage(`could not read the note (${(e as Error)?.message ?? e})`));
      return false;
    }
    if (disposed) return false;
    const note = readRhythmNote(text);
    if (note.ok === false) {
      deps.showError(notRhythmMessage(note.message));
      return false;
    }
    loadedFingerprint = contentFingerprint(text);
    loadedData = note.value.data;
    dirty = false;
    deps.onDirtyChange?.(false);                                      // a load is pristine by definition: first load, Reset, and "Updated from note" all come through here
    post(buildLoadMessage(note.value.data, deps.noteName, 'playground', deps.view ?? null, deps.autoHeight === true, deps.resetInHost === true) as Record<string, unknown>);
    return true;
  }

  /** Ask the widget for its current data (resolves with it; rejects on the 2 s timeout or when the embed is removed). */
  function requestData(): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const entry = { resolve, reject, timer: null as unknown };
      entry.timer = deps.setTimer(() => {
        const i = pending.indexOf(entry);
        if (i >= 0) pending.splice(i, 1);
        reject(new Error('the widget did not answer'));
      }, DATA_REQUEST_TIMEOUT_MS);
      pending.push(entry);
      post(buildRequestDataMessage());
    });
  }

  /** Dirty = the widget's CURRENT data differs from the note as loaded — compared, not remembered (rhythmDataEqual), so an edit undone by hand is pristine again. An edit asks the widget for its
   *  data; a burst of edits (a slider) coalesces into the check in flight plus one more at the end, and the last answer decides. If the widget cannot answer, or answers with nothing, we cannot
   *  prove the embed matches the note, so it is called dirty. */
  let checking = false;
  let again = false;
  async function checkDirty(): Promise<void> {
    if (checking) { again = true; return; }
    checking = true;
    try {
      do {
        again = false;
        const baseline = loadedData;
        if (disposed || baseline === null) return;
        let current: unknown = null;
        try { current = await requestData(); } catch { current = null; }
        if (disposed || loadedData !== baseline) continue;            // the note was (re)loaded meanwhile: that load already said "pristine"
        const next = !rhythmDataEqual(baseline, current);
        if (next !== dirty) { dirty = next; deps.onDirtyChange?.(dirty); }
      } while (again);
    } finally {
      checking = false;
    }
  }

  return {
    async onWidgetMessage(raw) {
      if (disposed) return;
      const msg = parseEmbedWidgetMessage(raw);
      switch (msg.kind) {
        case 'ready': await loadNote(); return;
        case 'edited': void checkDirty(); return;
        case 'reset': await loadNote(); return;      // also picks up a note that changed while the student had local edits
        case 'open-note': deps.openNote(); return;
        case 'playing': deps.onPlaying(msg.playing); return;
        case 'current-data': {
          for (const p of pending.splice(0)) { deps.clearTimer(p.timer); p.resolve(msg.data); }
          return;
        }
        case 'malformed': console.warn('[forge] rhythm-embed: dropped a malformed message from the widget:', msg.reason); return;
        case 'save-ignored':     // an embed never writes — dropped on purpose
        case 'ignored':
          return;
      }
    },

    async reset() {
      if (disposed) return;
      await loadNote();
    },

    async onNoteModified() {
      if (disposed) return;
      let text: string;
      try { text = await deps.readNote(); } catch { return; }
      const verdict = decideEmbedFreshness({ loadedFingerprint, currentFingerprint: contentFingerprint(text) });
      if (verdict === 'reload' && await loadNote()) deps.showUpdated();
    },

    isDirty: () => dirty,

    requestCurrentData() { return requestData(); },

    async currentScore() {
      let data: unknown;
      try {
        data = await this.requestCurrentData();
      } catch (e) {
        return { kind: 'error', message: `Score: ${(e as Error).message}` };
      }
      const compute = deps.computeScore;
      if (!compute) return { kind: 'error', message: 'Score: the engine is not available.' };
      return produceScoreFromData(compute, data, deps.noteName);
    },

    stop() { post(buildStopMessage()); },

    dispose() {
      disposed = true;
      for (const p of pending.splice(0)) { deps.clearTimer(p.timer); p.reject(new Error('the embed was removed')); }
    },
  };
}
