// score_first M12 (drain 2026-10-26-1250, DEMO profile) — two linked panes, phase A (a spike): the Score on one side and a read-only notes pane beside it that follows the bar the person pins. The decisions,
// without Obsidian (no `obsidian` import): which note made a pinned bar, when the command is offered, and the pair of panes as a small state machine whose every touch of the workspace is a port.
import type { Provenance } from './provenance-core.ts';
import { MIX_BAR_ROLE, MIX_HIT_ROLE } from './mix-lineage-core.ts';
import { MORPH_BAR_ROLE, MORPH_HIT_ROLE } from './morph-lineage-core.ts';
import { PHRASE_BAR_ROLE, phraseSourceNoteId } from './phrase-lineage-core.ts';

export interface PinnedNote {
  /** The note's path without `.md` (a lineage id: `bars/bar_005`). */
  noteId: string;
  /** For the evidence line: `forked` or `pinned bar N`. */
  reason: string;
}

/**
 * THE RULE (stated in the FEEDBACK): a pinned bar sends the notes pane to the note that made THAT bar. A forked bar: its fork note. Otherwise the first `from` note of the Inspector's stack:
 *  - an extend bar: its source bar;
 *  - a morph bar (or one of its hits): bar a when the bar is at or before the middle bar of the path ((bars + 1) / 2), else bar b;
 *  - a path mix (one bar): bar a when at most half of the single-hit changes are applied (2k <= d), else bar b;
 *  - a vote mix (one bar): the heavier parent, bar a on a tie (weight >= 0.5).
 * null = nothing to follow (not a bar of a phrase, or the provenance lacks what the rule reads): the notes pane stays where it is.
 */
export function pinnedNoteFor(prov: Provenance): PinnedNote | null {
  const p = prov.params;
  const str = (v: unknown): string | null => (typeof v === 'string' && v.length > 0 ? v : null);
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const barOf = (): number | null => num(p.bar);
  const pinnedLabel = (): string => `pinned bar ${barOf() ?? 1}`;
  if (prov.role === PHRASE_BAR_ROLE) {
    const fork = str(p.fork);
    if (fork) return { noteId: fork, reason: 'forked' };
    const source = str(p.source);
    return source ? { noteId: phraseSourceNoteId(source), reason: pinnedLabel() } : null;
  }
  if (prov.role === MORPH_BAR_ROLE || prov.role === MORPH_HIT_ROLE) {
    const fork = str(p.fork);
    if (fork) return { noteId: fork, reason: 'forked' };
    const a = str(p.a), b = str(p.b), bar = barOf(), bars = num(p.bars);
    if (!a || !b || bar === null || bars === null) return null;
    return { noteId: phraseSourceNoteId(bar <= (bars + 1) / 2 ? a : b), reason: pinnedLabel() };
  }
  if (prov.role === MIX_BAR_ROLE || prov.role === MIX_HIT_ROLE) {
    const a = str(p.a), b = str(p.b);
    if (!a || !b) return null;
    if (p.mode === 'path') {
      const k = num(p.k), d = num(p.d);
      if (k === null || d === null) return null;
      return { noteId: phraseSourceNoteId(2 * k <= d ? a : b), reason: pinnedLabel() };
    }
    const weight = num(p.weight);
    if (weight === null) return null;
    return { noteId: phraseSourceNoteId(weight >= 0.5 ? a : b), reason: pinnedLabel() };
  }
  return null;
}

export type PairSource = 'phrase' | 'phrase-text' | 'bar';

/** "Open Score with notes": a score-first vault, on a phrase tab (its Score), a phrase's JSON text tab, or a bar's Beat Box tab. Nowhere else, in no other vault. */
export function openPairAvailable(i: { scoreFirst: boolean; kind: PairSource | null }): boolean {
  return i.scoreFirst && i.kind !== null;
}

export interface PaneLinkerPorts<L> {
  /** Make the notes pane beside `score` (to its right) showing `path`, read-only. Rejects when it cannot. */
  openBeside(score: L, path: string): Promise<L>;
  /** Navigate the notes pane to `path` (read-only). Rejects when it cannot. */
  show(notes: L, path: string): Promise<void>;
  /** Is the pane still part of the workspace? */
  alive(leaf: L): boolean;
  focus(leaf: L): void;
  trace(line: string): void;
  /** The note path the pane shows right now, or null (no file, not loaded). Read when the workspace says something moved, to see whether the PERSON navigated the notes pane. */
  pathOf(leaf: L): string | null;
}

export interface PaneLinker<L> {
  /** Make the pair, or focus it when this Score already has one (no third pane). `home` = the note the notes pane shows when nothing is pinned. */
  open(score: L, scorePath: string, home: string): Promise<'opened' | 'focused' | 'failed'>;
  /** The Score's pin changed (`null` = released): follow it. Does nothing for a Score without a pair. */
  pinned(score: L, pin: PinnedNote | null): Promise<void>;
  /** A pane may have closed (layout change): drop every pair that lost one, saying which. Idempotent. */
  sweep(): void;
  /** 2026-10-26-1270: a structure chip was clicked on this Score: the notes pane goes to that note. false = this Score has no pair (the caller opens the note itself). */
  navigate(score: L, noteId: string): Promise<boolean>;
  /** The workspace said something moved: if the PERSON navigated a notes pane (a wikilink click, a backlink), tell that pair's listeners the new path, once. A navigation the Score caused is never echoed back. */
  checkNotes(): void;
  /** Be told when the person navigates this Score's notes pane. Returns the way to stop. */
  onNotesNavigated(score: L, fn: (path: string) => void): () => void;
}

interface Pair<L> { notes: L; scorePath: string; home: string; shown: string; want: string; reason: string; busy: boolean; running: Promise<void> }

const message = (e: unknown): string => (e as Error)?.message ?? String(e);

export function createPaneLinker<L extends object>(ports: PaneLinkerPorts<L>): PaneLinker<L> {
  const pairs = new Map<L, Pair<L>>();
  const listeners = new Map<L, Set<(path: string) => void>>();

  /** One show at a time per pair, and always toward the LAST thing asked: a run of rapid pins is one navigation to the last of them. */
  const settle = (pair: Pair<L>): Promise<void> => {
    if (pair.busy) return pair.running;                  // the running loop reads `want` again after every show: it will get to the last ask
    pair.running = (async () => {
      pair.busy = true;                                  // set in the synchronous part, so a loop that ends without waiting cannot leave it set
      try {
        while (pair.want !== pair.shown) {
          const path = pair.want, reason = pair.reason;
          try { await ports.show(pair.notes, path); } catch (e) { ports.trace(`[forge-panes] could not show ${path} in the notes pane: ${message(e)}`); pair.want = pair.shown; return; }
          pair.shown = path;
          ports.trace(`[forge-panes] notes pane -> ${path} (reason: ${reason})`);
        }
      } finally { pair.busy = false; }
    })();
    return pair.running;
  };

  return {
    async open(score, scorePath, home) {
      this.sweep();
      const existing = pairs.get(score);
      if (existing) { ports.focus(score); return 'focused'; }
      let notes: L;
      try { notes = await ports.openBeside(score, home); } catch (e) { ports.trace(`[forge-panes] could not open the notes pane: ${message(e)}`); return 'failed'; }
      pairs.set(score, { notes, scorePath, home, shown: home, want: home, reason: 'opened', busy: false, running: Promise.resolve() });
      ports.trace(`[forge-panes] opened pair (score ${scorePath}, notes ${home})`);
      return 'opened';
    },
    async pinned(score, pin) {
      const pair = pairs.get(score);
      if (!pair) return;
      pair.want = pin ? `${pin.noteId}.md` : pair.home;
      pair.reason = pin ? pin.reason : 'released';
      await settle(pair);
    },
    async navigate(score, noteId) {
      const pair = pairs.get(score);
      if (!pair) return false;
      pair.want = `${noteId}.md`;
      pair.reason = 'structure chip';
      await settle(pair);
      return true;
    },
    checkNotes() {
      for (const [score, pair] of pairs) {
        if (pair.busy || !ports.alive(pair.notes)) continue;      // the cause is tagged by `busy`: the events a show of ours fires (inside it) are ours, not the person's
        const now = ports.pathOf(pair.notes);
        if (now === null || now === pair.shown) continue;
        pair.shown = now; pair.want = now; pair.reason = 'navigated in the pane';
        ports.trace(`[forge-panes] notes pane -> ${now} (reason: navigated in the pane)`);
        for (const fn of [...(listeners.get(score) ?? [])]) { try { fn(now); } catch { /* a listener's failure is not the pane's */ } }
      }
    },
    onNotesNavigated(score, fn) {
      const set = listeners.get(score) ?? listeners.set(score, new Set()).get(score)!;
      set.add(fn);
      return () => { set.delete(fn); };
    },
    sweep() {
      for (const [score, pair] of [...pairs]) {
        const scoreAlive = ports.alive(score), notesAlive = ports.alive(pair.notes);
        if (scoreAlive && notesAlive) continue;
        pairs.delete(score);
        listeners.delete(score);
        ports.trace(`[forge-panes] pair closed (${!scoreAlive && !notesAlive ? 'both panes' : !notesAlive ? 'notes pane' : 'score pane'})`);
      }
    },
  };
}
