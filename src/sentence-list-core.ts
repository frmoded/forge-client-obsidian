// 2026-11-19-0970 (THE LIST MODEL, stage 1: compositions and arrangements; checklists/music_tabs_chat_ui_design.md section 11) - the PURE core of the description as an ORDERED LIST of CANONICAL sentences. No `obsidian`, no DOM, no vault: the
// vault, the clock and the writes are the controller's (description-apply.ts); this file only knows the sentences.
//
//   parseList(text, kind, vault)   the Description section -> the lines (a numbered list; a legacy PARAGRAPH is split into its sentences when every one of them is readable, else it stays ONE legacy line)
//   render(list)                   the lines -> the numbered Markdown list the note carries
//   append(list, sentence, kind)   a new line; it REPLACES (in place) an earlier line about the same subject: an arrangement's same kit or same volume target (compositions never conflict); says what it replaced
//   removeAt(list, i)              the list without line i
//   replay(list, kind, ctx)        every line through the kind's EXISTING grammar (parse, one prefix at a time: LOCAL ONLY, no model call) -> params, Recipe, Python and the json cache the Score reads; a line that cannot be read STOPS
//                                  the replay before it (the earlier lines still apply) and says where; for a composition the loop check (compositionLoopRefusal, 0910) runs here too
//   planAppend(...)                what a typed sentence becomes: canonical lines, what they replace, the replay of the result, or why not
//   createUndoStack()              the in-memory undo / redo of ONE open note (push, undo, redo; a new sentence clears redo)
//
// WHAT A CANONICAL SENTENCE IS. There is no second grammar here. A line is canonical when the grammar's own `describe` says it: the sentences of describe(params) are the canonical sentences, and the canonical form of line i is the sentence
// `describe` ADDS when line i is replayed after lines 1 to i-1 (the difference of two describes). So "play phrase_002 on the latin kit" becomes "Play [[phrase_002]] on the [[latin]] kit.", a composition's first section is "Play ...", the
// next ones "Then play ..." whatever the person typed, and a line that adds nothing (a mute said twice, a volume back at 100) is kept as written. Two things are NOT lines: an arrangement's closing "Together." (the grammar needs it at the end of
// the description; the replay adds it, the list never carries it) and, in a composition, nothing else. A seed is part of the sentence of a line that draws random choices (the grammar says "in seeded order, seed 3" itself), so a replay is the same
// twice.
// 2026-11-19-0980 (STAGE 2: PHRASES) - `kind` 'phrase' is a PIPELINE in the same loop: line 1 is the HEAD (Extend, Mix, Morph or Take), later lines are the head's modifier lines ("Make it 20 percent slower.", "Make it 8 bars long."), its structure steps,
// the transforms of a Take and the forks. The canonical line of a head is the first sentence `describe` says of it; of a modifier, its own sentence; of any later line, the sentence `describe` ADDS after the head (the same difference of two describes).
// A later head REPLACES line 1 (and the modifier lines of a segment it says itself); the lines still valid for the new head stay, the first invalid one stops the replay. A modifier replaces the earlier one of the same segment, a fork the earlier fork of the
// same bar, a thin out / double up the earlier one of the same range and row (all in place); a structure step never conflicts and one after a density step is REFUSED (never re-sorted). A random line draws its seed ONCE (`drawSeeds`), so a replay is the same.
// `listAfterParams` is the STRIP's side: what the lines become when a slider wrote new params.
import { parse, sentencesOf, type GrammarParams, type GrammarVault } from './phrase-grammar-core.ts';
import { canonical, compositionSentences, describe, lengthModifierSentence, tempoModifierSentence } from './phrase-describe-core.ts';
import { wrongKindSentence, type Family } from './note-family-core.ts';
import { arrangementPython, arrangementRecipeSteps, formatArrangementJson, type ArrangementParams } from './arrangement-core.ts';
import { compositionPython, compositionRecipeSteps, formatCompositionJson, type CompositionParams, type CompositionSection } from './composition-core.ts';
import { formatPhraseJson, type PhraseParams } from './phrase-core.ts';
import { phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { compositionLoopRefusal } from './sentence-plan-families-core.ts';

export type ListKind = Family;
export type SentenceList = readonly string[];
/** `empty` no line; `list` a numbered list; `paragraph` a legacy paragraph that was split (every sentence readable); `legacy` a paragraph kept as ONE line (some sentence cannot be read). */
export type ListShape = 'empty' | 'list' | 'paragraph' | 'legacy';
export interface ParsedList { list: string[]; shape: ListShape }
export interface Replaced { index: number; sentence: string }

const TOGETHER = /^together\.?$/i;
const NUMBERED = /^\s*\d+[.)]\s+/;
const norm = (s: string): string => s.replace(/\s+/g, ' ').trim();
const same = (a: SentenceList, b: SentenceList): boolean => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- parse and render ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const withStop = (t: string): string => (/[.!?]$/.test(t) ? t : `${t}.`);
/** The sentences of a text, each with its full stop (the grammar's own splitter drops it); an arrangement's "Together." is the closing of its description, not one of them. What the composer splits a typed text into. */
export function sentencesOfText(text: string, kind: ListKind): string[] {
  return sentencesOf(text).map((s) => s.text).filter((t) => !(kind === 'arrangement' && TOGETHER.test(t))).map(withStop);
}

/** The Description section's text -> the list. A numbered list is read item by item (an item with two sentences is two lines; a wrapped item is one); anything else is the legacy paragraph. Never throws. */
export function parseList(text: string, kind: ListKind, vault: GrammarVault): ParsedList {
  const body = String(text ?? '').replace(/\r\n?/g, '\n').trim();
  if (body === '') return { list: [], shape: 'empty' };
  const rows = body.split('\n').map((r) => r.trimEnd()).filter((r) => r.trim() !== '');
  if (NUMBERED.test(rows[0])) {
    const items: string[] = [];
    for (const row of rows) { if (NUMBERED.test(row)) items.push(row.replace(NUMBERED, '').trim()); else items[items.length - 1] += ` ${row.trim()}`; }
    const list = items.flatMap((item) => {                                                              // an item of ONE sentence is the line exactly as written (a line the grammar cannot read is kept to the letter); an item of several is split
      const raw = sentencesOf(item);
      return raw.length === 1 && !(kind === 'arrangement' && TOGETHER.test(raw[0].text)) ? [item] : sentencesOfText(item, kind);
    });
    return { list, shape: list.length === 0 ? 'empty' : 'list' };
  }
  const sentences = sentencesOfText(body, kind);
  if (sentences.length > 0 && replayGrammar(sentences, kind, { vault }).stop === null) return { list: sentences, shape: 'paragraph' };
  return { list: [norm(body)], shape: 'legacy' };
}

/** The numbered list the note carries: "1. first\n2. second". `eol` is the note's own line break. */
export function render(list: SentenceList, eol = '\n'): string { return list.map((line, i) => `${i + 1}. ${line}`).join(eol); }

// ---- the conflict rule ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const NAME = '(?:\\[\\[([^\\]]+)\\]\\]|([A-Za-z0-9_-]+))';
const PLAY_ON = new RegExp(`^play\\s+${NAME}\\s+on\\s+(?:the\\s+)?${NAME}\\s+kit\\b`, 'i');
const VOLUME = new RegExp(`^play\\s+(?:the\\s+)?${NAME}\\s+kit\\s+at\\b`, 'i');
const MUTE = new RegExp(`^mute\\s+(?:the\\s+)?${NAME}\\s+kit\\b`, 'i');
const pick = (m: RegExpExecArray, i: number): string => (m[i] ?? m[i + 1] ?? '').toLowerCase();

/** What a line is ABOUT, for the conflict rule: an arrangement line is about a kit's phrase (`play:K`), a kit's volume (`volume:K`), a kit's mute (`mute:K`) or the solo (`only`); a composition line is about nothing (null: compositions
 *  are plain sequences and never conflict), and so is a line of any shape the grammar knows nothing of. A reading of the sentence's SHAPE only: whether the line means anything is the grammar's. */
export function subjectOf(sentence: string, kind: ListKind): string | null {
  if (kind === 'phrase') return phraseSubjectOf(sentence);
  if (kind !== 'arrangement') return null;
  const s = sentence.trim();
  let m = VOLUME.exec(s); if (m) return `volume:${pick(m, 1)}`;
  m = PLAY_ON.exec(s); if (m) return `play:${pick(m, 3)}`;
  m = MUTE.exec(s); if (m) return `mute:${pick(m, 1)}`;
  if (/^only\b/i.test(s)) return 'only';
  return null;
}

// ---- the conflict subjects of a phrase (2026-11-19-0980): a SHAPE reading, like the arrangement's above -------------------------------------------------------------------------------------------------------------------
const HEAD_LINE = /^\s*(?:extend|mix|morph|take)\b/i;
const TEMPO_LINE = /^\s*make\s+it\s+[^\s]+\s*(?:percent|%)\s*(?:slower|faster)\b/i;
const LENGTH_LINE = /^\s*make\s+it\s+[^\s]+\s+bars?\s+long\b/i;
const FORK_LINE = /^\s*bar\s+(\d+)\s+is\b/i;
const DENSITY_LINE = /^\s*(thin\s+out|double\s+up)\s+bars?\s+(\d+)(?:\s+to\s+(\d+))?\b(.*)$/i;
/** Is this line a HEAD of a phrase (it opens a phrase: Extend, Mix, Morph or Take)? */
export const isHeadLine = (sentence: string): boolean => HEAD_LINE.test(sentence);
function phraseSubjectOf(sentence: string): string | null {
  const s = sentence.trim();
  if (HEAD_LINE.test(s)) return 'head';
  if (TEMPO_LINE.test(s)) return 'tempo';
  if (LENGTH_LINE.test(s)) return 'length';
  let m = FORK_LINE.exec(s); if (m) return `fork:${Number(m[1])}`;
  m = DENSITY_LINE.exec(s);
  if (m) { const row = /,\s*([A-Za-z0-9_-]+)\s+row\b/i.exec(m[4])?.[1]?.toLowerCase() ?? ''; return `${/^thin/i.test(m[1]) ? 'thin' : 'double'}:${Number(m[2])}-${Number(m[3] ?? m[2])}:${row}`; }
  if (/^\s*threshold\b/i.test(s)) return 'threshold';
  if (/^\s*with\s+ghost\s+notes\b/i.test(s)) return 'ghost';
  return null;
}
/** The head segments a TYPED head sentence says itself ("to 12 bars", "over 5 bars", "as one bar", "20 percent slower"): a modifier line of that segment is then superseded (the typed words win). */
export function segmentsSaidBy(head: string): Array<'length' | 'tempo'> {
  const out: Array<'length' | 'tempo'> = [];
  if (/\b(?:to|over)\s+[^\s,]+\s+bars?\b|\b(?:as|in)\s+one\s+bar\b/i.test(head)) out.push('length');
  if (/[^\s,]+\s*(?:percent|%)\s+(?:slower|faster)\b/i.test(head)) out.push('tempo');
  return out;
}

/** `sentence` as the next line, or in the place of the LAST earlier line about the same subject (in place: the lines that came after it still follow, so a mute of that kit still finds its kit). `replaced` is what it took the place of. */
export function append(list: SentenceList, sentence: string, kind: ListKind): { list: string[]; replaced: Replaced | null; at: number; also: Replaced[] } {
  const subject = subjectOf(sentence, kind);
  if (kind === 'phrase' && subject === 'head' && list.length > 0) {                                      // a later HEAD replaces line 1; a modifier line of a segment the new head says itself is superseded (dropped), every other line stays where it is
    const said = new Set<string>(segmentsSaidBy(sentence));
    const dropped: Replaced[] = []; const rest: string[] = [];
    list.forEach((line, i) => { if (i === 0) return; const sub = phraseSubjectOf(line); if (sub !== null && said.has(sub)) dropped.push({ index: i, sentence: line }); else rest.push(line); });
    return { list: [sentence, ...rest], replaced: { index: 0, sentence: list[0] }, at: 0, also: dropped };
  }
  if (subject !== null) {
    for (let i = list.length - 1; i >= 0; i--) {
      if (subjectOf(list[i], kind) !== subject) continue;
      const next = [...list]; next[i] = sentence;
      return { list: next, replaced: { index: i, sentence: list[i] }, at: i, also: [] };
    }
  }
  return { list: [...list, sentence], replaced: null, at: list.length, also: [] };
}

/** The list without line `i` (an index outside the list, or not a whole number, changes nothing). */
export function removeAt(list: SentenceList, i: number): string[] {
  return Number.isInteger(i) && i >= 0 && i < list.length ? list.filter((_, j) => j !== i) : [...list];
}

// ---- replay ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export interface ReplayCtx {
  /** The notes the sentences may name. */
  vault: GrammarVault;
  /** This note's id (`compositions/<name>`) and the reader of another composition's sections (null = cannot be read): when both are given, a composition's replay asks the loop check. */
  self?: string;
  readSections?: (id: string) => Promise<CompositionSection[] | null>;
  /** Apply at most this many lines (the loop check of the caller cut the list there). */
  maxApplied?: number;
}
export interface ListStop { index: number; reason: 'unreadable' | 'loop'; message: string; line: number; column: number; /** 2026-11-19-0980: the grammar's own code for a refusal that is about the ORDER or the HEAD of a phrase's list (see GrammarError) */ code?: 'order' | 'head' }
export interface Replay {
  /** The lines: the ones that were read in their canonical wording, the one that stopped the replay and the ones after it exactly as written. */
  list: string[];
  /** How many lines (from the first) the note shows. */
  applied: number;
  /** What the applied lines say (null: none). */
  params: GrammarParams | null;
  /** The Recipe lines, the Python and the json cache of those params (what the Score reads); '' / [] / '{}' when nothing is applied. */
  recipe: string[]; python: string; json: string;
  stop: ListStop | null;
}

/** The text of the first `n` lines as the grammar reads it: one sentence per line, and an arrangement's "Together." at the end (unless the lines already end with it: a legacy paragraph). */
function prefixText(lines: readonly string[], n: number, kind: ListKind): string {
  const text = lines.slice(0, n).join('\n');
  return kind === 'arrangement' && !/(?:^|[.\n]\s*)together\.?\s*$/i.test(text) ? `${text}\nTogether.` : text;
}

/** A composition's first section is "Play ...", the others "Then play ...": whatever the line says, so deleting or typing a section anywhere leaves a list the grammar reads. "For N bars play ..." and "Repeat that ..." are left alone. */
function withLeads(lines: readonly string[], kind: ListKind): string[] {
  if (kind !== 'composition') return [...lines];
  let seen = false;
  return lines.map((line) => {
    if (/^\s*for\s+\S+\s+bars?\s+play\b/i.test(line)) { seen = true; return line; }
    const m = /^(\s*)(?:then\s+play|play)(?=\s|$)/i.exec(line);
    if (!m) return line;
    const lead = seen ? 'Then play' : 'Play'; seen = true;
    return `${m[1]}${lead}${line.slice(m[0].length)}`;
  });
}

/** The canonical sentences of params, one per line ("Together." is not one): the form of every line the grammar accepts. What the sentence service's answer becomes, too. */
export function linesOfParams(params: GrammarParams, _kind?: ListKind): string[] {
  if (params.kind === 'composition') return compositionSentences(params);
  return sentencesOf(describe(params)).map((s) => s.text).filter((t) => !TOGETHER.test(t)).map(withStop);
}

/** What `a` has that `b` does not, as a multiset, in `a`'s order. */
export function extra(a: readonly string[], b: readonly string[]): string[] {
  const left = new Map<string, number>(); for (const x of b) left.set(x, (left.get(x) ?? 0) + 1);
  return a.filter((x) => { const n = left.get(x) ?? 0; if (n > 0) { left.set(x, n - 1); return false; } return true; });
}

/** 2026-11-19-0980: the canonical line of line `i` of a phrase's list (`per[i]` is what lines 1 to i+1 say): the head is the first sentence `describe` says; a modifier its own sentence with the value it set; any other line the sentence `describe` ADDS after the head (the difference of two describes, the head left out); a line that adds nothing is kept as written. */
function phraseLine(line: string, i: number, per: readonly GrammarParams[]): string {
  const after = (p: GrammarParams): string[] => linesOfParams(p, 'phrase').slice(1);
  if (i === 0) return linesOfParams(per[0], 'phrase')[0] ?? norm(line);
  const sub = phraseSubjectOf(line);
  const now = per[i] as unknown as { bars?: number; tempo_change_pct?: number };
  if (sub === 'tempo' && now.tempo_change_pct !== undefined) return tempoModifierSentence(now.tempo_change_pct);
  if (sub === 'length' && now.bars !== undefined) return lengthModifierSentence(now.bars);
  const added = extra(after(per[i]), after(per[i - 1]));
  return added.length === 1 ? added[0] : norm(line);
}

/** The Recipe, the Python and the json cache of params (the same builders the note writers use). */
function derived(params: GrammarParams | null): Pick<Replay, 'recipe' | 'python' | 'json'> {
  if (params === null) return { recipe: [], python: '', json: '{}' };
  if (params.kind === 'arrangement') return { recipe: arrangementRecipeSteps(params), python: arrangementPython(params), json: formatArrangementJson(params) };
  if (params.kind === 'composition') return { recipe: compositionRecipeSteps(params), python: compositionPython(params), json: formatCompositionJson(params) };
  return { recipe: phraseRecipeSteps(params as PhraseParams), python: phrasePython(params as PhraseParams), json: formatPhraseJson(params as PhraseParams) };
}

/** The sentence "this note is a composition, but the sentence describes an arrangement" when the first `n` lines read as the OTHER of the two kinds (an arrangement needs its closing "Together.", a composition has none); null otherwise. */
function wrongKindOf(lines: readonly string[], n: number, kind: ListKind, vault: GrammarVault): string | null {
  if (kind === 'phrase') return null;
  const text = lines.slice(0, n).join('\n');
  const as = parse(kind === 'composition' ? `${text}\nTogether.` : text, vault);
  return as.ok ? wrongKindSentence(kind, as.params.kind, 'the sentence') : null;
}

function run(list: SentenceList, kind: ListKind, ctx: ReplayCtx): { replay: Replay; per: GrammarParams[] } {
  const raw = [...list];
  const fixed = withLeads(raw, kind);
  const per: GrammarParams[] = [];
  let stop: ListStop | null = null;
  const limit = ctx.maxApplied === undefined ? fixed.length : Math.max(0, Math.min(fixed.length, Math.floor(ctx.maxApplied)));
  for (let i = 0; i < limit; i++) {
    const read = parse(prefixText(fixed, i + 1, kind), ctx.vault);
    if (read.ok === false) {
      const other = wrongKindOf(fixed, i + 1, kind, ctx.vault);                                       // a line of the OTHER kind fails in this kind's reading: the message says which kind it is, as a whole-description reading always did
      stop = { index: i, reason: 'unreadable', message: other ?? read.error.message, line: i + 1, column: other !== null || read.error.line - 1 !== i ? 1 : read.error.column, ...(read.error.code !== undefined && other === null ? { code: read.error.code } : {}) }; break;
    }
    const wrong = wrongKindSentence(kind, read.params.kind, 'the sentence');
    if (wrong !== null) { stop = { index: i, reason: 'unreadable', message: wrong, line: i + 1, column: 1 }; break; }
    per.push(read.params);
  }
  const lines = raw.map((line, i) => {
    if (i >= per.length) return line;
    if (kind === 'phrase') return phraseLine(fixed[i], i, per);
    const added = extra(linesOfParams(per[i], kind), i === 0 ? [] : linesOfParams(per[i - 1], kind));
    return added.length === 1 ? added[0] : norm(fixed[i]);                       // a line that adds nothing (a mute said twice, a volume back at 100) is kept as written
  });
  const params = per.length === 0 ? null : per[per.length - 1];
  return { replay: { list: lines, applied: per.length, params, ...derived(params), stop }, per };
}

/** The replay by the grammar alone (synchronous: no vault is read). A line the grammar cannot read stops it; the lines before it still apply. */
export function replayGrammar(list: SentenceList, kind: ListKind, ctx: ReplayCtx): Replay { return run(list, kind, ctx).replay; }

/** The replay, and for a composition (when `self` and `readSections` are given) the loop check of 0910 at every line that plays another composition: a line that loops stops the replay before it, with the check's own words. */
export async function replay(list: SentenceList, kind: ListKind, ctx: ReplayCtx): Promise<Replay> {
  const { replay: base, per } = run(list, kind, ctx);
  if (kind !== 'composition' || ctx.self === undefined || ctx.readSections === undefined) return base;
  for (let i = 0; i < per.length; i++) {
    const now = per[i] as CompositionParams, before = i === 0 ? null : per[i - 1] as CompositionParams;
    const last = now.sections[now.sections.length - 1];
    if (now.sections.length <= (before?.sections.length ?? 0) || !last.source.startsWith('compositions/')) continue;       // only a line that adds a composition can start a loop
    const refusal = await compositionLoopRefusal(ctx.self, now, ctx.readSections);
    if (refusal === null) continue;
    const cut = run(list, kind, { ...ctx, maxApplied: i }).replay;
    return { ...cut, stop: { index: i, reason: 'loop', message: refusal, line: i + 1, column: 1 } };
  }
  return base;
}

/** "Line 3 is not a sentence I can read; the note shows lines 1 and 2." plus the grammar's own reason: plain words, said in the dialog, never red. A loop says its own words (both notes and the trail) and where. */
export function stopNotice(stop: ListStop, applied: number): string {
  const shows = applied === 0 ? 'the note shows nothing yet' : applied === 1 ? 'the note shows line 1' : applied === 2 ? 'the note shows lines 1 and 2' : `the note shows lines 1 to ${applied}`;
  const reason = stop.message.trim();
  return stop.reason === 'loop' ? `Line ${stop.index + 1} is not played: ${reason} ${shows[0].toUpperCase()}${shows.slice(1)}.` : `Line ${stop.index + 1} is not a sentence I can read; ${shows}.${reason === '' ? '' : ` ${reason}`}`;
}

// ---- planning an append ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------

export type Plan =
  | { ok: true; list: string[]; added: string[]; replaced: Replaced[]; unchanged: boolean; replay: Replay }
  /** `empty` nothing to add; `blocked` the list has a line that cannot be read (fix or undo it first); `unreadable` the typed sentence (line and column are IN THE TYPED TEXT); `loop` the typed sentence would make a composition play itself;
   *  2026-11-19-0980: `order` a structure step after a Thin out or a Double up of a phrase (do the structure steps first; never re-sorted), `head` a line the grammar read but the phrase's head cannot take (or no head yet): neither is for the sentence service. */
  | { ok: false; reason: 'empty' | 'blocked' | 'unreadable' | 'loop' | 'order' | 'head'; message: string; line: number; column: number };

/** The words a structure step after a density step is refused in: what to do and what was left alone. */
export const orderRefusal = (sentence: string): string => `Do the structure steps first: "${sentence}" changes which bars there are, and this phrase already has a Thin out or a Double up before it (a Keep, Delete, Copy or Move comes before them). The list is unchanged.`;

/** What the typed sentences (already split: one per sentence) become when they are APPENDED to `list`: each one canonicalized, in place of the earlier line it conflicts with or at the end, the whole result replayed. Nothing is written here. */
export async function planAppend(list: SentenceList, kind: ListKind, typed: readonly string[], ctx: ReplayCtx): Promise<Plan> {
  const sentences = typed.map((t) => t.trim()).filter((t) => t !== '' && !(kind === 'arrangement' && TOGETHER.test(t)));
  if (sentences.length === 0) return { ok: false, reason: 'empty', message: 'There is no sentence to add.', line: 1, column: 1 };
  const base = await replay(list, kind, ctx);
  const newHead = kind === 'phrase' && sentences.some(isHeadLine);                                       // a head replaces line 1: it can repair a list whose line 1 cannot be read
  if (base.stop !== null && !newHead) return { ok: false, reason: 'blocked', message: stopNotice(base.stop, base.applied), line: base.stop.line, column: base.stop.column };
  let next: string[] = [...list]; const at: number[] = []; const replacedAll: Replaced[] = [];
  for (const sentence of sentences) { const r = append(next, sentence, kind); next = r.list; at.push(r.at); if (r.replaced !== null) replacedAll.push(r.replaced); replacedAll.push(...r.also); }
  const rep = await replay(next, kind, ctx);
  if (rep.stop !== null) {
    const j = at.indexOf(rep.stop.index);
    if (j === -1 && newHead) { /* the new head left a later line that it cannot take: the replay stops there (the unreadable-line words), nothing is dropped */ }
    else if (j === -1) return { ok: false, reason: 'blocked', message: stopNotice(rep.stop, rep.applied), line: rep.stop.line, column: rep.stop.column };
    else if (rep.stop.code === 'order') return { ok: false, reason: 'order', message: orderRefusal(sentences[j]), line: j + 1, column: rep.stop.column };
    else if (rep.stop.code === 'head' || (kind === 'phrase' && list.length === 0 && j === 0 && !isHeadLine(sentences[0]) && phraseSubjectOf(sentences[0]) !== null)) return { ok: false, reason: 'head', message: rep.stop.message, line: j + 1, column: rep.stop.column };
    else return { ok: false, reason: rep.stop.reason === 'loop' ? 'loop' : 'unreadable', message: rep.stop.message, line: j + 1, column: rep.stop.column };
  }
  const added = [...new Set(at)].filter((i) => i < rep.list.length).map((i) => rep.list[i]);
  const replaced = kind === 'phrase' ? replacedAll.filter((r) => !rep.list.includes(r.sentence)) : replacedAll.filter((r) => rep.list[r.index] !== base.list[r.index]);
  return { ok: true, list: rep.list, added, replaced, unchanged: same(rep.list, base.list), replay: rep };
}

// ---- a random line draws its seed ONCE (2026-11-19-0980) ---------------------------------------------------------------------------------------------------------------------------------------------------------

/** A seed for a random line: a whole number from 0 to 999 (the default draw; the controller may be given another). */
export const defaultSeed = (): number => Math.floor(Math.random() * 1000);
const SEEDED_ORDER = /\bin\s+seeded\s+order\b(?!\s*,?\s*seed\b)/i;
const AT_RANDOM = /,?\s*(?:chosen\s+)?at\s+random\b|,?\s*chosen\s+by\s+seed(?!\s+\d)/i;
/** The typed sentences of a phrase with the seed of every RANDOM line drawn once and said in the sentence ("... in seeded order, seed 3." / "..., chosen by seed 3."): a seeded morph or mix that said no seed, a thin out "chosen at random". A line that has its seed, or
 *  nothing random, is returned as it is, and `draw` is not asked. Called ONCE, when the sentence is typed (the preview): the replay of the stored line is the same every time, so undo, redo and a re-render give the same bars. Other kinds draw nothing. */
export function drawSeeds(sentences: readonly string[], kind: ListKind, draw: () => number): string[] {
  if (kind !== 'phrase') return [...sentences];
  return sentences.map((t) => {
    if (SEEDED_ORDER.test(t)) return t.replace(SEEDED_ORDER, (m) => `${m}, seed ${draw()}`);
    if (AT_RANDOM.test(t)) return t.replace(AT_RANDOM, () => `, chosen by seed ${draw()}`);
    return t;
  });
}

// ---- the strip (sliders) writes lines (2026-11-19-0980) -----------------------------------------------------------------------------------------------------------------------------------------------------------

type Mod = { sub: 'length' | 'tempo'; sentence: (p: Record<string, unknown>) => string; value: (p: Record<string, unknown>) => number | undefined };
const MODS: Mod[] = [
  { sub: 'length', sentence: (p) => lengthModifierSentence(p.bars as number), value: (p) => p.bars as number | undefined },
  { sub: 'tempo', sentence: (p) => tempoModifierSentence(p.tempo_change_pct as number), value: (p) => p.tempo_change_pct as number | undefined },
];
const sameParams = (a: GrammarParams, b: GrammarParams): boolean => JSON.stringify(canonical(a)) === JSON.stringify(canonical(b));

/**
 * What the LINES become when the strip wrote `params` (a slider moved, a bar was forked): the list is edited in the smallest way that makes its replay say `params`. The length and the tempo are MODIFIER lines (written or replaced in place; taken away when the
 * value is what the head itself says), a fork is a fork line (added, replaced in place, taken away), the mix's threshold and ghost notes their own lines, every other change (the source, the style, the share, the order) rewrites the HEAD line, and every
 * other line (a Keep, a Thin out) stays where it is. When the result does not replay to `params` (a list that cannot be read, a kind that changed) it is the canonical lines of `params`, as the strip always replaced the Description. Pure.
 */
export function listAfterParams(list: SentenceList, params: GrammarParams, kind: ListKind, ctx: ReplayCtx): string[] {
  const fallback = linesOfParams(params, kind);
  if (kind !== 'phrase' || params.kind === 'arrangement' || params.kind === 'composition') return fallback;
  const now = replayGrammar(list, kind, ctx), head = replayGrammar(list.slice(0, 1), kind, ctx);
  if (now.params === null || now.stop !== null || head.params === null || head.params.kind !== params.kind || now.params.kind !== params.kind) return fallback;
  const want = params as unknown as Record<string, unknown>, own = head.params as unknown as Record<string, unknown>;
  // the head line: the head's own sentence for the params, at the head's OWN length and tempo (the modifier lines carry the rest), without forks, steps, threshold and ghost notes of a mix
  const { overrides: _o, ops: _p, ...headOnly } = want;
  const headParams = { ...headOnly, ...(MODS.reduce<Record<string, unknown>>((acc, m) => { const v = m.value(own); if (v !== undefined) acc[m.sub === 'length' ? 'bars' : 'tempo_change_pct'] = v; return acc; }, {})), ...(params.kind === 'mix' ? { threshold: 0.5, ghost: false } : {}), ...(params.kind === 'transform' ? { ops: [] } : {}) } as unknown as GrammarParams;
  let out = [linesOfParams(headParams, kind)[0], ...list.slice(1)];
  // the modifier lines
  for (const m of MODS) {
    const desired = m.value(want), wasHead = m.value(own);
    if (desired === undefined) continue;
    const at = out.map((l, i) => (i > 0 && phraseSubjectOf(l) === m.sub ? i : -1)).filter((i) => i >= 0);
    if (desired === wasHead) { out = out.filter((_, i) => !at.includes(i)); continue; }
    const line = m.sentence(want);
    if (at.length === 0) { out = [...out, line]; continue; }
    const keep = at[at.length - 1]; out = out.map((l, i) => (i === keep ? line : l)).filter((_, i) => !at.slice(0, -1).includes(i));
  }
  // the lines the strip edits by name: forks, a mix's threshold and ghost notes
  const target = linesOfParams(params, kind).slice(1).filter((l) => { const sub = phraseSubjectOf(l); return sub !== null && (sub.startsWith('fork:') || sub === 'threshold' || sub === 'ghost'); });
  const named = (l: string): boolean => { const sub = phraseSubjectOf(l); return sub !== null && (sub.startsWith('fork:') || sub === 'threshold' || sub === 'ghost'); };
  const wanted = new Map(target.map((l) => [phraseSubjectOf(l)!, l] as const));
  const seen = new Set<string>(); const placed: string[] = [];
  for (let i = out.length - 1; i >= 0; i--) {                                                           // the LAST line of a subject is the one in force; earlier ones are dropped
    const l = out[i];
    if (!named(l)) { placed.unshift(l); continue; }
    const sub = phraseSubjectOf(l)!;
    if (seen.has(sub)) continue;
    seen.add(sub);
    if (wanted.has(sub)) placed.unshift(wanted.get(sub)!);
  }
  for (const [sub, l] of wanted) if (!seen.has(sub)) placed.push(l);
  const result = placed;
  const check = replayGrammar(result, kind, ctx);
  return check.stop === null && check.params !== null && sameParams(check.params, params) ? check.list : fallback;
}

// ---- undo and redo (in memory, per open note) -------------------------------------------------------------------------------------------------------------------------------------------

export interface UndoEntry { before: string[]; after: string[]; added: string[]; replaced: Replaced[] }
export interface Undone { list: string[]; removed: string[]; restored: string[] }
export interface Redone { list: string[]; added: string[] }
export interface UndoStack {
  /** An apply made `after` out of `before` (a new sentence: redo is gone). */
  push(entry: UndoEntry): void;
  /** The list one step back: what the last apply did is taken back (a replaced sentence is put back where it was); when the list is no longer what that apply left (a hand edit), the LAST item of the list as it is now is removed. Null: nothing to undo. */
  undo(current: SentenceList): Undone | null;
  /** The list one step forward again; null when the list is not what the undo left. */
  redo(current: SentenceList): Redone | null;
  canUndo(current: SentenceList): boolean;
  canRedo(current: SentenceList): boolean;
  /** 2026-11-19-0993 (a bar's gesture): the newest entry is made again (one pointer gesture whose cells came in one by one is ONE undo). With no entry it is a push. */
  replaceTop(entry: UndoEntry): void;
  clear(): void;
}
export const UNDO_CAP = 100;

/** `protects` (2026-11-19-0993): a line the "no memory" fallback must never take off the list (a bar's head: it IS the bar as it was; taking it off would give the starter groove back); with it a list of nothing but protected lines has nothing to undo. */
export function createUndoStack(opts: { protects?: (line: string) => boolean } = {}): UndoStack {
  let undos: UndoEntry[] = [], redos: UndoEntry[] = [];
  const takes = (current: SentenceList): boolean => current.length > 0 && !(opts.protects?.(current[current.length - 1]) ?? false);
  return {
    push(entry) { undos = [...undos, { ...entry }].slice(-UNDO_CAP); redos = []; },
    replaceTop(entry) { undos = undos.length === 0 ? [{ ...entry }] : [...undos.slice(0, -1), { ...entry }]; redos = []; },
    canUndo: (current) => current.length > 0 && ((undos.length > 0 && same(undos[undos.length - 1].after, current)) || takes(current)),
    canRedo: (current) => redos.length > 0 && same(redos[redos.length - 1].before, current),
    undo(current) {
      if (current.length === 0) return null;
      const top = undos[undos.length - 1];
      if (top !== undefined && same(top.after, current)) {
        undos = undos.slice(0, -1); redos = [...redos, top];
        return { list: [...top.before], removed: [...top.added], restored: top.replaced.map((r) => r.sentence) };
      }
      if (!takes(current)) return null;
      const last = current[current.length - 1], rest = current.slice(0, -1);
      redos = [...redos, { before: rest, after: [...current], added: [last], replaced: [] }];
      return { list: rest, removed: [last], restored: [] };
    },
    redo(current) {
      const top = redos[redos.length - 1];
      if (top === undefined || !same(top.before, current)) return null;
      redos = redos.slice(0, -1); undos = [...undos, top].slice(-UNDO_CAP);
      return { list: [...top.after], added: [...top.added] };
    },
    clear() { undos = []; redos = []; },
  };
}
