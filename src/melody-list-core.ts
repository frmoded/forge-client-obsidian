// 2026-11-23-1030 (pitch in bars, Stage 1a) - the PURE half of a melody bar's list, the twin of bar-list-core.ts + bar-list-note-core.ts for the melody grammar. No `obsidian`, no DOM, no vault, no model call; nothing here throws.
//
//   replayMelody(list)             the lines, in order, on the bar before them -> the bar's data (what the json fence says, byte for byte through `formatMelodyJson`). An EMPTY list is MELODY_BASE; a head replaces everything.
//                                  A line that cannot be read or applied STOPS the replay before it (the earlier lines still apply) and says where; every line is kept.
//   baselineList(data)             the list of a bar that has none yet: its head, which replays to exactly the present data.
//   planMelodyAppend(list, typed)  what typed sentences become when appended: each canonicalized in the bar it is said in; a sentence that says nothing new is not added; tempo and instrument replace their earlier line in place (verified by replay).
//   melodyUndoStack()              the shared undo stack of the other lists, that never takes a head off.
//   writeMelodyNote / inspectMelodyNote   the NOTE side: the list is the front matter key `lines:` (the same one the rhythm bar's list uses: bar-list-note-core.ts reads and writes it), the body stays exactly one json fence (the Score reads it);
//                                  the fence is written from the replay in one go. A melody bar has no provenance sections (no `channels`, nothing to map).
import { applyMelodyLine, headSentence, melodySentencesOf, parseMelodySentence, renderMelodyLine, type MelodyLine } from './melody-grammar-core.ts';
import { MELODY_BASE, formatMelodyJson, readMelodyNote, type MelodyData } from './melody-bar-core.ts';
import { readBarLines, withBarLines } from './bar-list-note-core.ts';
import { extractJsonBlock } from './rhythm-edit-core.ts';
import { createUndoStack, stopNotice, type ListStop, type Replaced, type UndoStack } from './sentence-list-core.ts';
/** 2026-11-23-1030: this core is the LIST MODEL's (music-composer code, reached only through src/list-model-selected.ts); the music edition's list-model.full.ts lists this string in `cores`, scripts/build-main.test.mjs greps the lean bundle for it. */
export const LIST_MODEL_SENTINEL_MELODY_LIST_CORE = 'forge-list-model-core:melody-list-core';

const clone = (d: MelodyData): MelodyData => ({ ...d, notes: d.notes.map((n) => ({ ...n })) });
const eqBar = (a: MelodyData, b: MelodyData): boolean => formatMelodyJson(a) === formatMelodyJson(b);
const same = (a: readonly unknown[], b: readonly unknown[]): boolean => a.length === b.length && a.every((x, i) => x === b[i]);
const HEAD_LINE = /^\s*start with\b/i;
export const isMelodyHead = (line: string): boolean => HEAD_LINE.test(line);

// ---- replay ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface MelodyReplay { data: MelodyData; applied: number; stop: ListStop | null; list: string[] }

export function replayMelody(list: readonly string[]): MelodyReplay {
  const lines: string[] = Array.isArray(list) ? [...list] : [];
  let data = clone(MELODY_BASE), applied = 0, stop: ListStop | null = null;
  try {
    for (let i = 0; i < lines.length; i++) {
      const s = lines[i];
      const p = typeof s === 'string' ? parseMelodySentence(s) : ({ ok: false, message: 'This line is not text.', column: 1 } as const);
      if (p.ok === false) { stop = { index: i, reason: 'unreadable', message: p.message, line: i + 1, column: p.column }; break; }
      const a = applyMelodyLine(data, p.line);
      if (a.ok === false) { stop = { index: i, reason: 'unreadable', message: a.message, line: i + 1, column: 1 }; break; }
      data = a.data; applied++;
    }
  } catch { stop = { index: applied, reason: 'unreadable', message: 'That line could not be read.', line: applied + 1, column: 1 }; }
  return { data, applied, stop, list: lines };
}

/** The list of a bar that has none: its head. Null when the bar cannot be said (the caller keeps what it shows). */
export function baselineList(data: MelodyData): string[] | null {
  const head = headSentence(data);
  return head === null ? null : [head];
}

// ---- the plan of an append -------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type MelodyPlan =
  | { ok: true; list: string[]; added: string[]; replaced: Replaced[]; unchanged: boolean; replay: MelodyReplay }
  /** `empty` nothing to add; `blocked` the list has a line nobody can read (fix or undo it first); `unreadable` the typed sentence (line = which sentence of the typed text); `refused` read, but this bar cannot take it (a note off the bar, a second note at once). */
  | { ok: false; reason: 'empty' | 'blocked' | 'unreadable' | 'refused'; message: string; line: number; column: number };

const kindOf = (s: string): MelodyLine['kind'] | null => { const p = parseMelodySentence(s); return p.ok ? p.line.kind : null; };

/** Where a new line goes: at the end, except a tempo or an instrument, which takes the place of the last line that said the same thing (when the replay then gives the same bar). */
function place(list: readonly string[], canon: string, line: MelodyLine, target: MelodyData): { list: string[]; added: string[]; replaced: Replaced[] } {
  if (line.kind === 'tempo' || line.kind === 'instrument') {
    for (let i = list.length - 1; i >= 0; i--) {
      if (kindOf(list[i]) !== line.kind) continue;
      const cand = [...list]; cand[i] = canon;
      const r = replayMelody(cand);
      if (r.stop === null && eqBar(r.data, target)) return { list: cand, added: [canon], replaced: [{ index: i, sentence: list[i] }] };
      break;
    }
  }
  return { list: [...list, canon], added: [canon], replaced: [] };
}

/** What the typed sentences become when they are APPENDED to `list`, the whole result replayed. Nothing is written here. */
export function planMelodyAppend(list: readonly string[], typed: readonly string[]): MelodyPlan {
  try {
    const sentences = typed.flatMap((t) => melodySentencesOf(String(t ?? '')));
    if (sentences.length === 0) return { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 };
    const base = replayMelody(list);
    if (base.stop !== null) return { ok: false, reason: 'blocked', message: stopNotice(base.stop, base.applied), line: base.stop.line, column: base.stop.column };
    let cur: string[] = [...list]; const added: string[] = []; const replaced: Replaced[] = [];
    for (const [k, sentence] of sentences.entries()) {
      const p = parseMelodySentence(sentence);
      if (p.ok === false) return { ok: false, reason: 'unreadable', message: p.message, line: k + 1, column: p.column };
      const now = replayMelody(cur).data;
      const canon = renderMelodyLine(p.line);
      const again = parseMelodySentence(canon);
      if (again.ok === false) return { ok: false, reason: 'unreadable', message: again.message, line: k + 1, column: again.column };
      const target = applyMelodyLine(now, again.line);
      if (target.ok === false) return { ok: false, reason: 'refused', message: target.message, line: k + 1, column: 1 };
      if (eqBar(target.data, now)) continue;                                              // it says nothing the bar does not already say
      const placed = place(cur, canon, again.line, target.data);
      cur = placed.list; added.push(...placed.added); replaced.push(...placed.replaced);
    }
    const rep = replayMelody(cur);
    if (rep.stop !== null) return { ok: false, reason: 'refused', message: stopNotice(rep.stop, rep.applied), line: rep.stop.line, column: rep.stop.column };
    return { ok: true, list: cur, added, replaced, unchanged: same(cur, list), replay: rep };
  } catch (e) { return { ok: false, reason: 'refused', message: `That could not be planned: ${(e as Error)?.message ?? e}`, line: 1, column: 1 }; }
}

/** The shared undo stack, with the head protected: with no memory (a restart) undo takes the last line off, never the line that IS the bar as it was. */
export const melodyUndoStack = (): UndoStack => createUndoStack({ protects: isMelodyHead });

// ---- the note side ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type MelodyWrite = { ok: true; text: string; data: MelodyData; replay: MelodyReplay } | { ok: false; message: string };

/** The whole bar made again from its list in one go: the json fence = the replay (`formatMelodyJson`), `lines:` = the list (every line kept, readable or not). A list of which NO line can be read writes nothing (a typo in line 1 never empties the Score);
 *  a note that is not an editable melody bar is refused in words. */
export function writeMelodyNote(note: string, list: readonly string[]): MelodyWrite {
  const read = readMelodyNote(note);
  if (read.ok === false) return { ok: false, message: read.message };
  const block = extractJsonBlock(note);
  if (block.ok === false) return { ok: false, message: block.message };
  const rp = replayMelody(list);
  if (list.length > 0 && rp.applied === 0) return { ok: false, message: `No line of the list can be read, so nothing was written; the note keeps what it shows.${rp.stop === null ? '' : ` ${stopNotice(rp.stop, 0)}`}` };
  const json = formatMelodyJson(rp.data).replace(/\n/g, block.eol);
  const written = note.slice(0, block.contentStart) + json + note.slice(block.contentEnd);
  return { ok: true, text: withBarLines(written, list), data: rp.data, replay: rp };
}

export interface MelodyInspection {
  hasLines: boolean;
  /** The list: the lines of the note, or (an unlisted bar) the head its first write would give it. */
  list: string[];
  replay: MelodyReplay;
  /** The bar the json fence says (what the Score shows); null when the note is not a readable melody bar. */
  fence: MelodyData | null;
  /** The replay of the list says what the fence says (an unlisted bar is its fence: always). A hand edit of the list, or of the fence, makes it false. */
  inSync: boolean;
}

/** What a melody bar's list and its fence say, and whether they agree. Reads only. */
export function inspectMelodyNote(text: string): MelodyInspection {
  const l = readBarLines(text);
  const read = readMelodyNote(text);
  const fence = read.ok === true ? read.value.data : null;
  const list = l?.hasLines === true ? l.lines : (fence === null ? [] : baselineList(fence) ?? []);
  const replay = replayMelody(list);
  const inSync = fence !== null && (l?.hasLines !== true || eqBar(replay.data, fence));
  return { hasLines: l?.hasLines === true, list, replay, fence, inSync };
}
