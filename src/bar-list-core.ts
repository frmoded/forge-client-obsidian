// 2026-11-19-0993 (THE LIST MODEL, stage 3: BARS; checklists/music_tabs_chat_ui_design.md 11d) - the PURE half of a bar's list. No `obsidian`, no DOM, no vault, no model call; nothing here throws.
//
//   replayBar(list)               the lines, in order, on the bar before them -> the bar's data (what the json fence says, byte for byte through `formatRhythmJson`). An EMPTY list is the groove "New bar" writes today (BAR_BASE);
//                                 a head ("Start with ...") replaces everything. A line that cannot be read or applied STOPS the replay before it (the earlier lines still apply) and says where; every line is kept.
//   baselineList(data)            the list of a bar that has none yet: its head, which replays to exactly the present data (11d.2).
//   diffBarData(before, after)    what ONE Beat Box message (the widget posts the whole bar) says, in canonical sentences. The widget's own gestures give one sentence; anything no sentence says is said as a new head, so the replay
//                                 ALWAYS equals the bar the widget holds.
//   planBarAppend(list, typed)    what typed sentences become when they are appended: a line that touches a cell an earlier line set REPLACES that cell's mention (the step leaves the earlier line, an emptied line is dropped, a line that
//                                 would say nothing new is not added); tempo, swing and grid replace the earlier line in place. EVERY shortcut is verified by replaying it: when it would not give the same bar the line is simply appended.
//                                 The head is never edited (it is the bar as it was).
//   mergeGestureSentences(...)    one pointer gesture (press, drag across cells, release) is ONE line: its cell sentences become one Hit and one Clear per channel.
//   barUndoStack()                the shared undo stack of the other lists, that never takes a head off (the "no memory" fallback would give the starter groove back).
import { applyBarLine, barSentencesOf, canonicalBarLine, headSentence, parseBarSentence, renderBarLine, type BarLine } from './bar-grammar-core.ts';
import { RHYTHM_STARTER } from './new-note-core.ts';
import { formatRhythmJson, type RhythmData, type RhythmStep } from './rhythm-edit-core.ts';
import { createUndoStack, stopNotice, type ListStop, type Replaced, type UndoStack } from './sentence-list-core.ts';

const clone = (d: RhythmData): RhythmData => ({ ...d, channels: Object.fromEntries(Object.entries(d.channels).map(([k, row]) => [k, [...row]])) });
/** The bar of an EMPTY list: what "New bar" writes today (a kick on steps 1 and 9, a snare on 5 and 13, 4/4, 16 steps, tempo 100). Not an empty grid: the prompt's "today's grid" is this one. */
export const BAR_BASE: RhythmData = clone(RHYTHM_STARTER);

const cell = (v: unknown): RhythmStep => (v === true ? true : typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 127 ? v : false);        // the widget's normalizeCell
const normalized = (d: RhythmData): string => formatRhythmJson({ ...d, channels: Object.fromEntries(Object.entries(d.channels).map(([k, row]) => [k, row.map(cell)])) });
const eqBar = (a: RhythmData, b: RhythmData): boolean => normalized(a) === normalized(b);
const same = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const HEAD_LINE = /^\s*start with\b/i;
export const isBarHead = (line: string): boolean => HEAD_LINE.test(line);

// ---- replay ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface BarReplay { data: RhythmData; applied: number; stop: ListStop | null; list: string[] }

export function replayBar(list: readonly string[]): BarReplay {
  const lines: string[] = Array.isArray(list) ? [...list] : [];
  let data = clone(BAR_BASE), applied = 0, stop: ListStop | null = null;
  try {
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i];
      const p = typeof s === 'string' ? parseBarSentence(s) : ({ ok: false, message: 'This line is not text.', column: 1 } as const);
      if (p.ok === false) { stop = { index: i, reason: 'unreadable', message: p.message, line: i + 1, column: p.column }; break; }
      const a = applyBarLine(data, p.line);
      if (a.ok === false) { stop = { index: i, reason: 'unreadable', message: a.message, line: i + 1, column: 1 }; break; }
      data = a.data; applied++;
    }
  } catch { stop = { index: applied, reason: 'unreadable', message: 'That line could not be read.', line: applied + 1, column: 1 }; }
  return { data, applied, stop, list: lines };
}

/** The list of a bar that has none: its head. Null when the bar cannot be said (the caller keeps the Beat Box's old save for it). */
export function baselineList(data: RhythmData): string[] | null {
  const head = headSentence(data);
  return head === null ? null : [head];
}

// ---- the diff: one widget message in sentences ---------------------------------------------------------------------------------------------------------------------------------------

function stepsOfDiff(cur: RhythmData, after: RhythmData): Array<{ ch: string; i: number; was: RhythmStep; now: RhythmStep }> {
  const out: Array<{ ch: string; i: number; was: RhythmStep; now: RhythmStep }> = [];
  for (const ch of Object.keys(after.channels)) for (let i = 0; i < after.steps; i++) {
    const was = cell(cur.channels[ch]?.[i]), now = cell(after.channels[ch][i]);
    if (was !== now) out.push({ ch, i, was, now });
  }
  return out;
}
const runOf = (data: RhythmData, sentences: readonly string[]): RhythmData | null => {
  let cur = data;
  for (const s of sentences) {
    const p = parseBarSentence(s); if (p.ok === false) return null;
    const a = applyBarLine(cur, p.line); if (a.ok === false) return null;
    cur = a.data;
  }
  return cur;
};

function explain(before: RhythmData, after: RhythmData): string[] | null {
  const out: string[] = [];
  let cur = clone(before);
  const say = (line: BarLine): boolean => {
    const sentence = canonicalBarLine(line, cur);
    const next = runOf(cur, [sentence]); if (next === null) return false;
    out.push(sentence); cur = next; return true;
  };
  if (before.time_signature !== after.time_signature || before.steps !== after.steps || before.group_size !== after.group_size) {
    if (!say({ kind: 'grid', steps: after.steps, signature: after.time_signature, group: after.group_size })) return null;
  }
  const have = Object.keys(cur.channels), want = Object.keys(after.channels);
  for (const k of have) if (!want.includes(k) && !say({ kind: 'remove', channel: k })) return null;
  for (const k of want) if (!(k in cur.channels) && !say({ kind: 'add', channel: k })) return null;
  for (let i = 0; i < want.length; i++) {
    const order = Object.keys(cur.channels);
    if (order[i] === want[i]) continue;
    for (let j = order.indexOf(want[i]); j > i; j--) if (!say({ kind: 'move', channel: want[i], dir: 'earlier' })) return null;
  }
  if (cur.tempo_bpm !== after.tempo_bpm && !say({ kind: 'tempo', bpm: after.tempo_bpm })) return null;
  if ((cur.swing_pct ?? 0) !== (after.swing_pct ?? 0) && !say({ kind: 'swing', pct: after.swing_pct ?? 0 })) return null;
  const diff = stepsOfDiff(cur, after);
  if (diff.length === 1) {
    const d = diff[0];
    if (!say(d.now === false ? { kind: 'clear', channel: d.ch, steps: [d.i + 1] } : { kind: 'hit', channel: d.ch, steps: [d.i + 1], velocity: d.now === true ? null : d.now })) return null;
  } else if (diff.length > 1) {
    const transforms: BarLine[] = [{ kind: 'shift', dir: 'left' }, { kind: 'shift', dir: 'right' }, { kind: 'mirror' }, ...Object.keys(cur.channels).flatMap((channel): BarLine[] => [{ kind: 'rotate', channel, dir: 'left' }, { kind: 'rotate', channel, dir: 'right' }])];
    const hit = transforms.find((t) => { const r = applyBarLine(cur, t); return r.ok && stepsOfDiff(r.data, after).length === 0; });
    if (hit !== undefined) { if (!say(hit)) return null; }
    else {
      for (const ch of Object.keys(after.channels)) {
        const mine = diff.filter((d) => d.ch === ch);
        const clears = mine.filter((d) => d.now === false).map((d) => d.i + 1);
        if (clears.length > 0 && !say({ kind: 'clear', channel: ch, steps: clears })) return null;
        const values = [...new Set(mine.filter((d) => d.now !== false).map((d) => d.now))].sort((a, b) => (a === true ? -1 : b === true ? 1 : (a as number) - (b as number)));
        for (const v of values) if (!say({ kind: 'hit', channel: ch, steps: mine.filter((d) => d.now === v).map((d) => d.i + 1), velocity: v === true ? null : (v as number) })) return null;
      }
    }
  }
  return eqBar(cur, after) ? out : null;
}

/** The sentences one Beat Box message says: the widget posts the whole bar, so this is the difference between the bar it showed and the bar it shows now. [] = no difference. Never throws. */
export function diffBarData(before: RhythmData, after: RhythmData): string[] {
  try {
    if (eqBar(before, after)) return [];
    const said = explain(before, after);
    if (said !== null) return said;
  } catch { /* fall through to the head */ }
  const head = (() => { try { return headSentence(after); } catch { return null; } })();
  return head === null ? [] : [head];
}

// ---- one gesture is one line ---------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** A run of cell sentences (Hit, Clear with steps) becomes one Hit per value and one Clear per channel; the last word on a cell wins. Anything else is left as it is and ends the run. */
export function mergeGestureSentences(sentences: readonly string[]): string[] {
  const out: string[] = [];
  let run: Map<string, Map<number, RhythmStep | 'clear'>> | null = null;
  const flush = (): void => {
    if (run === null) return;
    for (const [channel, cells] of run) {
      const plain = [...cells].filter(([, v]) => v === true).map(([s]) => s);
      if (plain.length > 0) out.push(renderBarLine({ kind: 'hit', channel, steps: plain, velocity: null }));
      const vels = [...new Set([...cells.values()].filter((v): v is number => typeof v === 'number'))].sort((a, b) => a - b);
      for (const v of vels) out.push(renderBarLine({ kind: 'hit', channel, steps: [...cells].filter(([, x]) => x === v).map(([s]) => s), velocity: v }));
      const clears = [...cells].filter(([, v]) => v === 'clear').map(([s]) => s);
      if (clears.length > 0) out.push(renderBarLine({ kind: 'clear', channel, steps: clears }));
    }
    run = null;
  };
  for (const s of sentences) {
    const p = parseBarSentence(s);
    if (p.ok && (p.line.kind === 'hit' || (p.line.kind === 'clear' && p.line.steps !== null))) {
      run ??= new Map();
      const cells = run.get(p.line.channel) ?? new Map<number, RhythmStep | 'clear'>();
      run.set(p.line.channel, cells);
      for (const step of p.line.steps as number[]) cells.set(step, p.line.kind === 'clear' ? 'clear' : p.line.velocity === null ? true : p.line.velocity);
    } else { flush(); out.push(s); }
  }
  flush();
  return out;
}

// ---- the plan of an append -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type BarPlan =
  | { ok: true; list: string[]; added: string[]; replaced: Replaced[]; unchanged: boolean; replay: BarReplay }
  /** `empty` nothing to add; `blocked` the list has a line nobody can read (fix or undo it first); `unreadable` the typed sentence (line = which sentence of the typed text); `refused` read, but this bar cannot take it (no such channel, a step beyond the bar, a tempo the Beat Box does not play). */
  | { ok: false; reason: 'empty' | 'blocked' | 'unreadable' | 'refused'; message: string; line: number; column: number };

const kindOf = (s: string): BarLine['kind'] | null => { const p = parseBarSentence(s); return p.ok ? p.line.kind : null; };

/** Where a new line goes, and what it replaces. Every shortcut is checked by replaying it: a candidate that would not give `target` is never taken. */
function place(list: readonly string[], canon: string, line: BarLine, target: RhythmData): { list: string[]; added: string[]; replaced: Replaced[] } {
  const good = (cand: readonly string[]): boolean => { const r = replayBar(cand); return r.stop === null && eqBar(r.data, target); };
  const appended = { list: [...list, canon], added: [canon], replaced: [] as Replaced[] };
  if (line.kind === 'hit' || (line.kind === 'clear' && line.steps !== null)) {
    const mine = new Set(line.steps as number[]);
    const kept: string[] = []; const replaced: Replaced[] = [];
    list.forEach((s, i) => {
      const p = parseBarSentence(s);
      if (p.ok === false || (p.line.kind !== 'hit' && p.line.kind !== 'clear') || p.line.steps === null || p.line.channel !== line.channel || !p.line.steps.some((x) => mine.has(x))) { kept.push(s); return; }
      replaced.push({ index: i, sentence: s });
      const left = p.line.steps.filter((x) => !mine.has(x));
      if (left.length > 0) kept.push(renderBarLine({ ...p.line, steps: left }));
    });
    if (replaced.length > 0) {
      if (good(kept)) return { list: kept, added: [], replaced };                          // the cell was only ever said by the lines that gave it up: nothing new to say
      if (good([...kept, canon])) return { list: [...kept, canon], added: [canon], replaced };
    }
    return appended;
  }
  if (line.kind === 'tempo' || line.kind === 'swing' || line.kind === 'grid') {
    for (let i = list.length - 1; i >= 0; i--) {
      if (kindOf(list[i]) !== line.kind) continue;
      const cand = [...list]; cand[i] = canon;
      return good(cand) ? { list: cand, added: [canon], replaced: [{ index: i, sentence: list[i] }] } : appended;
    }
  }
  return appended;
}

/** What the typed sentences become when they are APPENDED to `list` (each canonicalized in the bar it is said in, in place of the line it replaces, or at the end), the whole result replayed. Nothing is written here. */
export function planBarAppend(list: readonly string[], typed: readonly string[]): BarPlan {
  try {
    const sentences = typed.flatMap((t) => barSentencesOf(String(t ?? '')));
    if (sentences.length === 0) return { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 };
    const base = replayBar(list);
    if (base.stop !== null) return { ok: false, reason: 'blocked', message: stopNotice(base.stop, base.applied), line: base.stop.line, column: base.stop.column };
    let cur: string[] = [...list]; const added: string[] = []; const replaced: Replaced[] = [];
    for (const [k, sentence] of sentences.entries()) {
      const p = parseBarSentence(sentence);
      if (p.ok === false) return { ok: false, reason: 'unreadable', message: p.message, line: k + 1, column: p.column };
      const now = replayBar(cur).data;
      const canon = canonicalBarLine(p.line, now);
      const again = parseBarSentence(canon);
      if (again.ok === false) return { ok: false, reason: 'unreadable', message: again.message, line: k + 1, column: again.column };
      const target = applyBarLine(now, again.line);
      if (target.ok === false) return { ok: false, reason: 'refused', message: target.message, line: k + 1, column: 1 };
      if (eqBar(target.data, now)) continue;                                              // it says nothing the bar does not already say
      const placed = place(cur, canon, again.line, target.data);
      cur = placed.list; added.push(...placed.added); replaced.push(...placed.replaced);
    }
    const rep = replayBar(cur);
    if (rep.stop !== null) return { ok: false, reason: 'refused', message: stopNotice(rep.stop, rep.applied), line: rep.stop.line, column: rep.stop.column };
    return { ok: true, list: cur, added, replaced, unchanged: same(cur, list), replay: rep };
  } catch (e) { return { ok: false, reason: 'refused', message: `That could not be planned: ${(e as Error)?.message ?? e}`, line: 1, column: 1 }; }
}

/** The shared undo stack, with the head protected: with no memory (a restart) undo takes the last line off, never the line that IS the bar as it was. */
export const barUndoStack = (): UndoStack => createUndoStack({ protects: isBarHead });

