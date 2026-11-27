// 2026-10-30-1030 (M15a, design 4.14) - the closed DESCRIPTION GRAMMAR of a phrase, as a pure, tested core. A phrase (and an arrangement, which is the same kind of note: a list of bars made by sentences) can be said as a few
// plain sentences and read back; the Description is to become the source of truth and the controls will WRITE it (M15b), hand edits come later (M15c, M16). Nothing reads this file yet: no behaviour change in the plugin (P3 trivially true).
//
//   describe(params) -> the canonical text;   parse(text, vault) -> { ok, params } | { ok: false, error: { message, line, column } };   canonical(params) -> the params as the text carries them.
//
// ONE VOCABULARY OF VERBS, not four (driver Q1, 2026-10-30): a description is a list of CLAUSES, one sentence each, a verb and its arguments. The first clause names the kind of note (Extend, Mix, Morph, Take, Play); the rest are the
// clauses that kind takes. Every verb lives in VERBS below, in ONE table: adding a verb (the composition's `Then play ...`, `Repeat that 2 more times.`, `For 8 bars play ...`, which M17b made real) is adding a row, and no
// existing sentence changes. A full stop followed by a space, or a line break, ends a sentence. A source is named by a wikilink and the grammar does not care what kind of note it is (a phrase, an arrangement, a composition): it asks the vault's lists.
//
// DEFAULTS. The text OMITS only: a tempo change of 0 (the sentence is not said), a Mix threshold of 50 percent and ghost notes off (their sentences are not said), a morph or mix seed that its order does not use, and a Double up grid of 16.
// Everything else is always said (bars, style, the share of a mix, its mode, the order of a morph, the amount and the kept beats of a thin out). On INPUT any parameter that has a default in the validators (`phrase-core.ts`) may be left out
// and is restored: extend bars 4, style repeat_with_fills, tempo 0; mix share 50, threshold 50, ghost off, vote; morph bars 5, musical order, seed 0; thin out by half keeping the downbeat; double up grid 16.
// canonical(params) is what the text can carry: a field the text cannot say (a seed on an order that ignores it, `mode: "vote"` which is the same as no mode, a track with `mute: false`, `solo: false` or `volume: 100`, -0) is dropped.
import {
  MORPH_ORDERS, NOTE_NAME, REPEAT_STYLE, STRUCTURE_RUNS_MAX, PHRASE_BARS_MAX, PHRASE_BARS_MIN, PHRASE_DEFAULTS, PHRASE_PCT_MAX, PHRASE_PCT_MIN, PHRASE_STYLES, MIX_DEFAULTS, MORPH_DEFAULTS, TRANSFORM_DEFAULTS, TRANSFORM_KEEPS, TRANSFORM_OPS_MAX, validatePhrase,
  type ExtendPhrase, type MixPhrase, type BarRun, type MorphOrder, type MorphPhrase, type PhraseParams, type StructureOp, type PhraseStyle, type TransformOp, type TransformPhrase,
} from './phrase-core.ts';
import { isRunsOp, isStructureOp, movePlaceProblem, runsWords } from './bar-structure-core.ts';
import { validateArrangement, type ArrangementParams, type ArrangementTrack } from './arrangement-core.ts';
import { COMPOSITION_LENGTH_MAX, COMPOSITION_REPEAT_MAX, validateComposition, type CompositionParams, type CompositionSection } from './composition-core.ts';
import { STYLE_WORDS, canonical, complementOf100, describe, link, noNegZero, orderWords, percentOf, plain, shiftDecimal, sortedOverrides, type GrammarParams } from './phrase-describe-core.ts';
// 2026-10-31-1140 (M16a): the scanner and its helpers (Scan, Fail, note, sentencesOf, followForks, orderFromWords, placeOf) are exported for other readers of the same words (the Recipe parser that was one of them is gone since 2026-11-26-1047).
// the saying half lives in phrase-describe-core.ts (M15b); these are re-exported so this file stays the one place a reader of the grammar looks
export { canonical, complementOf100, describe, orderWords, plain, shiftDecimal, type GrammarParams } from './phrase-describe-core.ts';

/** The notes of the vault a description may name (basenames, no folder, no .md). `arrangements` and `kits` are optional: a list that is not given is not checked (names are then only checked for their spelling). */
export interface GrammarVault { bars: readonly string[]; phrases: readonly string[]; arrangements?: readonly string[]; compositions?: readonly string[]; kits?: readonly string[]; melody?: readonly string[]; melodyPhrases?: readonly string[] }
/** `code` says WHY for the few refusals a caller must tell from the rest (2026-11-19-0980): `order` = a structure step after a Thin out or a Double up; `head` = a line the grammar understood but the phrase's head cannot take (a tempo after a Morph, a Thin out after an Extend), or a step with no head yet; `refused` (2026-11-19-0996b) = a line the grammar read and will not do ("Move bar 3 two bars left.").
 *  The sentence service cannot fix either: the person changes the order or the head. */
export interface GrammarError { message: string; line: number; column: number; code?: 'order' | 'head' | 'refused' }
export type ParseResult = { ok: true; params: GrammarParams } | { ok: false; error: GrammarError };

const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
export const GRAMMAR_VOCABULARY = { styles: PHRASE_STYLES, orders: MORPH_ORDERS, keeps: TRANSFORM_KEEPS, styleWords: STYLE_WORDS } as const;

/** The verbs. `kind` is the note a verb OPENS (the first clause) or `null` for a clause that follows. */
export const VERBS: ReadonlyArray<{ verb: string; kind: 'extend' | 'mix' | 'morph' | 'transform' | 'arrangement' | 'composition' | null; example: string }> = [
  { verb: 'extend', kind: 'extend', example: 'Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower.' },
  { verb: 'mix', kind: 'mix', example: 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.' },
  { verb: 'morph', kind: 'morph', example: 'Morph [[bar_003]] into [[bar_001]] over 8 bars, in musical order.' },
  { verb: 'take', kind: 'transform', example: 'Take [[phrase_006]].' },
  { verb: 'play', kind: 'arrangement', example: 'Play [[phrase_006]] on the [[rock]] kit.' },
  { verb: 'thin out', kind: null, example: 'Thin out bars 3 to 5, kick row, by half, keeping the downbeat.' },
  { verb: 'double up', kind: null, example: 'Double up bars 3 to 5, kick row.' },
  { verb: 'keep', kind: null, example: 'Keep bars 3 to 5 and bar 8.' },
  { verb: 'delete', kind: null, example: 'Delete bars 3 to 5 and bar 8.' },
  { verb: 'copy', kind: null, example: 'Copy bars 3 to 5.' },
  { verb: 'copy to a place', kind: null, example: 'Copy bar 6 and put it at the end.' },
  { verb: 'move', kind: null, example: 'Move bars 3 to 5 one bar left.' },
  { verb: 'move to a place', kind: null, example: 'Move bar 1 after bar 5.' },
  { verb: 'bar replaced', kind: null, example: 'Bar 9 is replaced by [[bar_009]].' },
  { verb: 'threshold', kind: null, example: 'Threshold 40 percent.' },
  { verb: 'ghost notes', kind: null, example: 'With ghost notes.' },
  { verb: 'volume', kind: null, example: 'Play the [[rock]] kit at 70 percent volume.' },
  { verb: 'mute', kind: null, example: 'Mute the [[latin]] kit.' },
  { verb: 'only', kind: null, example: 'Only the [[rock]] kit plays.' },
  { verb: 'together', kind: null, example: 'Together.' },
  { verb: 'play for', kind: 'composition', example: 'Play [[arr_001]] for 8 bars.' },
  { verb: 'then play', kind: null, example: 'Then play [[arr_002]] for 4 bars.' },
  { verb: 'repeat that', kind: null, example: 'Repeat that 2 more times.' },
  { verb: 'for bars play', kind: 'composition', example: 'For 8 bars play [[arr_001]].' },
  { verb: 'make it', kind: null, example: 'Make it 20 percent slower.' },
];


// ---- parse: a scanner over one sentence, errors with the place they are at ------------------------------------------------------------------------------------------------------------------------------------------------

export class Fail extends Error {
  at: number;
  code?: 'order' | 'head' | 'refused';
  constructor(at: number, message: string, code?: 'order' | 'head' | 'refused') { super(message); this.at = at; if (code !== undefined) this.code = code; }
}
const NAME = NOTE_NAME;                                        // 2026-11-16-1100: words joined by single spaces (a renamed phrase: [[my groove]]); see phrase-core.ts

export class Scan {
  s: string;
  base: number;
  i = 0;
  constructor(s: string, base: number) { this.s = s; this.base = base; }
  /** The offset of the next token (the spaces before it do not count): where an error about it points. */
  get at(): number { return this.base + this.i + (/^\s*/.exec(this.s.slice(this.i)) as RegExpExecArray)[0].length; }
  ws(): void { this.i += (/^\s*/.exec(this.s.slice(this.i)) as RegExpExecArray)[0].length; }
  done(): boolean { this.ws(); return this.i >= this.s.length; }
  /** What is next, for an error: the next token (a word, a number, a link or one character) or "the end of the sentence". */
  found(): string {
    this.ws();
    if (this.i >= this.s.length) return 'the end of the sentence';
    const m = /^(?:\[\[[^\]]*\]\]?|[A-Za-z0-9_.%-]+|.)/.exec(this.s.slice(this.i)) as RegExpExecArray;
    return `"${m[0]}"`;
  }
  fail(expected: string, at?: number): never { this.ws(); throw new Fail(at ?? this.at, `Expected ${expected}, but found ${this.found()}.`); }
  failAt(message: string, at: number, code?: 'order' | 'head' | 'refused'): never { throw new Fail(at, message, code); }
  comma(): boolean { this.ws(); if (this.s[this.i] === ',') { this.i++; return true; } return false; }
  /** Eat a keyword (several words separated by spaces, any case, any spacing), only whole words. */
  kw(phrase: string): boolean {
    this.ws();
    const re = new RegExp(`${phrase.split(' ').join('\\s+')}(?![A-Za-z0-9_-])`, 'iy');          // the keywords are plain words (letters, hyphens): nothing to escape
    re.lastIndex = this.i;
    if (!re.test(this.s)) return false;
    this.i = re.lastIndex;
    return true;
  }
  peekKw(phrase: string): boolean { const at = this.i; const ok = this.kw(phrase); this.i = at; return ok; }
  /** A number: digits with an optional decimal part, or one of the words one to ten. `text` is the digits (the word turned into digits). */
  number(): { value: number; text: string; at: number } | null {
    this.ws();
    const at = this.at;
    const m = /^\d+(?:\.\d+)?(?![A-Za-z0-9_.])/.exec(this.s.slice(this.i));
    if (m) { this.i += m[0].length; return { value: Number(m[0]), text: m[0], at }; }
    for (let n = 0; n < NUMBER_WORDS.length; n++) if (this.kw(NUMBER_WORDS[n])) return { value: n + 1, text: String(n + 1), at };
    return null;
  }
  /** A whole number between `min` and `max` (inclusive), said as `what`. */
  whole(what: string, min: number, max = Number.MAX_SAFE_INTEGER): number {
    const n = this.number();
    if (n === null) this.fail(`${what}`);
    if (!Number.isInteger(n.value)) this.failAt(`Expected ${what} as a whole number, but found ${n.text}.`, n.at);
    if (!Number.isSafeInteger(n.value) || n.value < min || n.value > max) this.failAt(`Expected ${what}${max < Number.MAX_SAFE_INTEGER ? ` from ${min} to ${max}` : `, ${min} or more`}, but found ${n.text}.`, n.at);
    return n.value;
  }
  /** `N percent` or `N%`: the number as a share of 1, exactly (70 -> 0.7), between `min` and `max` percent. */
  percent(what: string, min: number, max: number): number {
    const n = this.number();
    if (n === null) this.fail(`${what} as a number of percent`);
    if (!(this.kw('percent') || this.eatPercentSign())) this.fail(`"percent" after ${n.text}`);
    if (n.value < min || n.value > max) this.failAt(`Expected ${what} from ${min} to ${max} percent, but found ${n.text}.`, n.at);
    return Number(shiftDecimal(n.text, -2));
  }
  eatPercentSign(): boolean { this.ws(); if (this.s[this.i] === '%') { this.i++; return true; } return false; }
  end(): void { if (!this.done()) this.fail('the end of the sentence'); }
}

/** One note reference: `[[name]]` or a bare name that exists. `kinds` say which lists of the vault it may be in; a name in two of them is two readings and is refused. */
export type NoteKind = 'bar' | 'phrase' | 'arrangement' | 'composition' | 'kit';
const LIST_OF: Record<NoteKind, (v: GrammarVault) => readonly string[] | undefined> = { bar: (v) => v.bars, phrase: (v) => v.phrases, arrangement: (v) => v.arrangements, composition: (v) => v.compositions, kit: (v) => v.kits };
const KIND_WORDS: Record<NoteKind, string> = { bar: 'a bar', phrase: 'a phrase', arrangement: 'an arrangement', composition: 'a composition', kit: 'a kit' };
export const FOLDER_OF = { phrase: 'phrases', arrangement: 'arrangements', composition: 'compositions' } as const;
export function note(sc: Scan, vault: GrammarVault, kinds: NoteKind[], what: string, melodyRefusal?: (name: string) => string): { name: string; kind: NoteKind; melody: boolean } {
  sc.ws();
  const at = sc.at;
  let name: string;
  if (sc.s.startsWith('[[', sc.i)) {
    const close = sc.s.indexOf(']]', sc.i);
    if (close === -1) sc.failAt(`Expected "]]" to close the link, but found ${sc.found()}.`, at);
    name = sc.s.slice(sc.i + 2, close);
    if (!NAME.test(name)) sc.failAt(`Expected a note name (letters, digits, spaces, _ and -, no folder) inside the link, but found "${name}".`, at);
    sc.i = close + 2;
  } else {
    const m = /^[A-Za-z0-9_-]+/.exec(sc.s.slice(sc.i));
    if (!m) sc.fail(`${what}, as [[a note]]`);
    name = m[0]; sc.i += name.length;
  }
  // a kind whose list the caller did not give is not checked: it is the reading only when no kind WITH a list has the name (the first such kind), so a name that is in a list is never also read as an unchecked kind
  const named = kinds.filter((k) => LIST_OF[k](vault)?.includes(name) === true);
  const unchecked = kinds.find((k) => LIST_OF[k](vault) === undefined);
  const hits = named.length > 0 || unchecked === undefined ? named : [unchecked];
  if (hits.length === 0) sc.failAt(`Expected ${kinds.length > 2 ? `${kinds.slice(0, -1).map((k) => KIND_WORDS[k]).join(', ')} or ${KIND_WORDS[kinds[kinds.length - 1]]}` : kinds.map((k) => KIND_WORDS[k]).join(' or ')} of this vault for ${what}, but "${name}" is not one.`, at);
  const melody = (hits[0] === 'bar' ? vault.melody : hits[0] === 'phrase' ? vault.melodyPhrases : undefined)?.includes(name) === true;          // 2026-11-24-1031: the vault's `melody` (bars) and `melodyPhrases` names say which notes are melody; each verb says what it does with one
  if (melody && melodyRefusal !== undefined) sc.failAt(melodyRefusal(name), at, 'head');
  if (hits.length > 1) sc.failAt(`Expected one note for ${what}, but "${name}" is both ${KIND_WORDS[hits[0]]} and ${KIND_WORDS[hits[1]]}; rename one of them.`, at);
  return { name, kind: hits[0], melody };
}

export interface Sentence { text: string; start: number }
/** The sentences of a text: a full stop followed by a space or the end, or a line break, ends one (a full stop inside a number, and anything inside a link, does not). */
export function sentencesOf(text: string): Sentence[] {
  const out: Sentence[] = [];
  let from = 0, inLink = false;
  const push = (to: number): void => {
    const raw = text.slice(from, to);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim() !== '') out.push({ text: raw.trim(), start: from + lead });
  };
  for (let i = 0; i < text.length; i++) {
    if (text.startsWith('[[', i)) { inLink = true; i++; continue; }
    if (inLink && text.startsWith(']]', i)) { inLink = false; i++; continue; }
    if (inLink) continue;
    const c = text[i];
    if (c === '\n' || (c === '.' && (i + 1 >= text.length || /\s/.test(text[i + 1])))) { push(i); from = i + 1; }
  }
  push(text.length);
  return out;
}

/** The sentences only a composition has: refused, by name, in a description of any other kind. */
const COMPOSITION_ONLY: Array<{ re: RegExp; verb: string }> = [{ re: /^then\s+play\b/i, verb: 'Then play' }, { re: /^repeat\s+that\b/i, verb: 'Repeat that' }, { re: /^for\s+\S+\s+bars?\s+play\b/i, verb: 'For N bars play' }];
/** 2026-11-24-1031 (pitch in bars, Stage 1b): a phrase is all rhythm bars or all melody bars. What works on hits is refused on notes in these words, at sentence time (never the Beat Box's). */
const BEATS = 'That works on beats, not on notes.';
const BEATS_MIX = (): string => `${BEATS} A Mix takes rhythm bars.`;
const BEATS_MORPH = (): string => `${BEATS} A Morph takes rhythm bars.`;
const BEATS_EXTEND = (name: string): string => `${BEATS} A melody bar is repeated as it is: "Repeat [[${name}]] for ${PHRASE_DEFAULTS.bars} bars."`;
const OPEN_VERBS: Array<{ re: RegExp; kind: 'extend' | 'mix' | 'morph' | 'transform' | 'arrangement' | 'repeat' }> = [
  { re: /^extend\b/i, kind: 'extend' }, { re: /^mix\b/i, kind: 'mix' }, { re: /^morph\b/i, kind: 'morph' }, { re: /^take\b/i, kind: 'transform' }, { re: /^play\b/i, kind: 'arrangement' }, { re: /^repeat\b/i, kind: 'repeat' },
];
const OPEN_EXAMPLES = 'Extend, Mix, Morph, Take or Play';

export const orderFromWords = (sc: Scan): MorphOrder | null => {
  for (const o of MORPH_ORDERS) { const words = orderWords(o); if (sc.kw(words) || sc.kw(words.replace(/-/g, ' ')) || sc.kw(`${o} order`)) return o; }
  return null;
};
const styleFromWords = (sc: Scan): PhraseStyle | null => {
  for (const s of PHRASE_STYLES) if (sc.kw(STYLE_WORDS[s]) || sc.kw(s)) return s;
  return null;
};

/** The sentences after the first that every kind with forks takes. */
function fork(sc: Scan, vault: GrammarVault, max: number, melodyHead: boolean): { bar: number; note: string } {
  const at = sc.at;                                                     // the caller has read the word "Bar"
  const bar = sc.whole('a bar number', 1);
  if (bar > max) sc.failAt(`Expected a bar of this phrase (1 to ${max}), but found ${bar}.`, at);
  if (!sc.kw('is replaced by') && !sc.kw('is')) sc.fail('"is replaced by"');
  const nameAt = sc.at, n = note(sc, vault, ['bar'], `bar ${bar}`);
  if (n.melody !== melodyHead) sc.failAt(`A phrase is all rhythm bars or all melody bars: ${n.name} is a ${n.melody ? 'melody' : 'rhythm'} bar and this phrase is made of ${melodyHead ? 'melody' : 'rhythm'} bars.`, nameAt, 'head');          // 2026-11-24-1031
  sc.end();
  return { bar, note: n.name };
}
export function readRange(sc: Scan): { first: number; last: number } {
  if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bar N" or "bars N to M"');
  const first = sc.whole('a bar number', 1);
  let last = first;
  const toAt = sc.i;
  const to = sc.kw('to');
  if (to && sc.peekKw('the')) sc.i = toAt;                           // 2026-11-19-0996b: "Move bar 3 to the left" is not a range
  else if (to) { const lastAt = sc.at; last = sc.whole('a bar number', 1); if (last < first) sc.failAt(`Expected the last bar to be ${first} or more, but found ${last}.`, lastAt); }
  return { first, last };
}

/**
 * 2026-11-19-0999 (deliberate): the bars of a step may be named in ANY ORDER ("Delete bar 5 and bar 3" is a person clicking 5 and then 3). 2026-11-20-1001 (deliberate): and bars that TOUCH ("bar 3 and bar 4") or OVERLAP ("bars 3 to 5 and bar 4") are ONE range: each new range
 * absorbs every range it touches or overlaps, so `runs` is always ascending and APART (what the json cache and the validator hold) and the canonical sentence says "Delete bars 3 to 4." A repeat is absorbed too. Only the runs of Copy, Delete, Keep and Move come through here (Mix "bars 2 and 3" is two bars).
 */
function addRun(runs: BarRun[], first: number, last: number): void {
  const apart = runs.filter((r) => r[1] < first - 1 || r[0] > last + 1), hit = runs.filter((r) => !apart.includes(r));
  const merged: BarRun = [Math.min(first, ...hit.map((r) => r[0])), Math.max(last, ...hit.map((r) => r[1]))];
  runs.splice(0, runs.length, ...[...apart, merged].sort((x, y) => x[0] - y[0]));
}

/**
 * 2026-11-16-1000: a STRUCTURE step of a transform, read from the start of a sentence: "Keep bars 3 to 5 and bar 8.", "Delete bar 2.", "Copy bars 3 to 5.", "Move bars 3 to 5 one bar left." (words: bar-structure-core.ts). Returns null (nothing eaten) when the
 * sentence starts with none of the verbs. The ranges are said in any order and kept ascending and apart, touching or overlapping ones merged (`addRun`: 2026-11-19-0999, 2026-11-20-1001); a structure step may not come after a Thin out or a Double up (it changes WHICH bars there are, and those two have already counted them).
 * 2026-11-19-0996b (the driver's words, read and written as the canonical ones): "Duplicate" is Copy, "Remove" is Delete, "Move bar 3 back / left / earlier" and "forward / right / later" (with or without "one bar", also "to the left") are one bar left / right and
 * several places ("two bars left") are READ and refused in words (code `refused`: the service cannot fix them), and "Morph bars 2 and 3 across 5 bars ..." is a step of its own (`readMorphBetween`); a Morph that is followed by a note ("Morph [[a]] into [[b]]") is a head, not a step: null.
 * 2026-11-24-1040: "Move bar 1 after bar 5." / "Move bars 3 to 5 to the end." / "Move bar 4 to the start." (also "and put it after bar 5", "before bar N" = after bar N - 1) is ONE op with `after` (no `by`); a place inside the moved bars or one that goes nowhere is refused in words (code `refused`: `movePlaceProblem`); the Morph, Mix and Extend steps take "and place after bar 5" / "put them ..." / "place it ..." (one `PUT` word list).
 * 2026-11-19-0999b: "Mix bars 2 and 3 ..." (`readMixBars`: ONE new bar, in a gap) and "Extend bar 2 to 4 bars ..." (`readExtendBar`: bar 2 REPLACED by 4 bars, or with a place word the bar stays and they are inserted) are steps of their own too; a Mix or an Extend followed by a note is a head: null.
 */
const STEP_VERBS: ReadonlyArray<readonly [string, 'keep' | 'delete' | 'copy' | 'move' | 'morph' | 'mix' | 'extend']> = [['keep', 'keep'], ['delete', 'delete'], ['remove', 'delete'], ['copy', 'copy'], ['duplicate', 'copy'], ['move', 'move'], ['morph', 'morph'], ['mix', 'mix'], ['extend', 'extend']];
export function readStructureStep(f: Scan, afterDensity: boolean): StructureOp | null {
  const start = f.i;
  const hit = STEP_VERBS.find(([word]) => f.kw(word));
  if (hit === undefined) { f.i = start; return null; }
  const [word, verb] = hit;
  if ((verb === 'morph' || verb === 'mix' || verb === 'extend') && !/^\s*bars?\s+\d/i.test(f.s.slice(f.i))) { f.i = start; return null; }          // "Morph [[a]] into [[b]]", "Mix [[a]] and [[b]]", "Extend [[a]] to 8 bars": a head (2026-11-19-0999b: the same for Mix and Extend)
  if (afterDensity) f.failAt(`Expected "${word[0].toUpperCase()}${word.slice(1)}" to come before any "Thin out" or "Double up" (a change of which bars there are comes first), but it comes after one.`, start, 'order');
  if (verb === 'morph') return readMorphBetween(f);
  if (verb === 'mix') return readMixBars(f);
  if (verb === 'extend') return readExtendBar(f);
  const runs: BarRun[] = [];
  for (;;) {
    const at = f.at;
    const { first, last } = readRange(f);
    addRun(runs, first, last);
    if (runs.length > STRUCTURE_RUNS_MAX) f.failAt(`Expected at most ${STRUCTURE_RUNS_MAX} ranges of bars, but found more.`, at);
    const more = f.comma();
    const here = f.i;
    if (verb !== 'keep' && verb !== 'delete' && placeSegment(f, () => {}).read()) { f.i = here; break; }          // 2026-11-24-1036: `and put it at the end` / `after bar 4` starts here, not another bar (2026-11-24-1040: a Move's too)
    if (f.kw('and')) continue;
    if (more) continue;
    break;
  }
  let after: number | 'end' | null = null;
  const placeAt = f.at;
  if (verb === 'copy' || verb === 'move') placeSegment(f, (p) => { after = p; }).read();                // 2026-11-24-1036: Copy takes the place words of Extend, Mix and Morph (`and put it at the end`); no place = the copy goes right after each original, as before. 2026-11-24-1040: Move takes them too (`Move bar 1 after bar 5.`)
  if (verb === 'move' && after === null) return readMoveDirection(f, runs);
  f.end();
  if (verb !== 'move') return verb === 'copy' ? { op: 'copy', runs, ...(after !== null ? { after } : {}) } : { op: verb, runs };
  const bad = movePlaceProblem(runs, after as unknown as number | 'end');
  if (bad !== null) f.failAt(bad, placeAt, 'refused');
  return { op: 'move', runs, after: after as unknown as number | 'end' };
}

/** "one bar left" / "left" / "back" / "earlier" / "to the left" -> -1 and the right-hand words -> 1; a number of places other than one is read and refused with the sentence to say instead. */
function readMoveDirection(f: Scan, runs: BarRun[]): StructureOp {
  const at = f.at, start = f.i;
  let places = 1;
  const n = f.number();
  if (n !== null && (f.kw('bars') || f.kw('bar'))) places = n.value; else { f.i = start; f.kw('a bar'); }
  f.kw('to the');
  let by: -1 | 1;
  if (['left', 'back', 'backwards', 'backward', 'earlier'].some((w) => f.kw(w))) by = -1;
  else if (['right', 'forwards', 'forward', 'later'].some((w) => f.kw(w))) by = 1;
  else f.fail('"one bar left", "one bar right", "back" or "forward"');
  f.end();
  if (places !== 1) {
    const say = `Move ${runsWords(runs)} one bar ${by === -1 ? 'left' : 'right'}.`;
    f.failAt(places < 1 ? `Expected a move of one bar, but found ${places} bars.` : `Move takes one bar at a time. Say "${say}" ${places === 2 ? 'twice' : `${places} times`}.`, at, 'refused');
  }
  return { op: 'move', runs, by };
}

/** The place words of a Morph-between: "at the start", "at the end", "after bar 3", "before bar 2", "between bars 2 and 3" (the two bars must be neighbours); the gap after bar K (0 = the start) or the end. Null when none starts here. */
function readPlace(f: Scan): number | 'end' | null {
  if (f.kw('(?:at|to) the (?:start|beginning|front)')) return 0;          // 2026-11-24-1040: `kw` builds a regular expression from the words, so a group of alternatives is a word list (`to the start` is Move's)
  if (f.kw('(?:at the (?:end|back)|to the end)')) return 'end';
  if (f.kw('after')) { f.kw('bars') || f.kw('bar'); return f.whole('a bar number ("after bar N")', 1); }
  if (f.kw('before')) { f.kw('bars') || f.kw('bar'); return f.whole('a bar number ("before bar N")', 1) - 1; }
  if (f.kw('in between') || f.kw('between')) {
    f.kw('bars') || f.kw('bar');
    const at = f.at, x = f.whole('a bar number', 1);
    if (!f.kw('and')) f.fail('"and"');
    f.kw('bars') || f.kw('bar');
    const y = f.whole('a bar number', 1);
    if (y !== x + 1) f.failAt(`Expected two neighbouring bars after "between", but found bar ${x} and bar ${y}.`, at);
    return x;
  }
  return null;
}

/** 2026-11-19-0999b: the place segment of a step that makes new bars (Morph-between, Mix, Extend), in the one set of words: an optional "and", an optional "put them" / "put it" / "place them", then `readPlace`. `set` gets the gap (0 = the start, 'end', or the bar it follows). */
// 2026-11-24-1040: `and place after bar 5`, `put it ...`, `place them ...`: put or place, then optionally them / it / those / these (a group of alternatives in `kw` is a word list)
const PUT = '(?:put|place)(?: (?:them|it|those|these))?';
const PLACE_EXPECTED = 'a place ("after bar N", "before bar N", "between bars N and M", "at the start" or "at the end")';
function placeSegment(f: Scan, set: (place: number | 'end') => void): { name: string; read: () => boolean } {
  return { name: 'the place', read: () => { const s = f.i; f.kw('and'); const put = f.kw(PUT); const p = readPlace(f); if (p === null) { if (put) f.fail(PLACE_EXPECTED); f.i = s; return false; } set(p); return true; } };
}

/** "Morph bars 2 and 3 across 5 bars, in seeded order, seed 7, and put them after bar 3." (the verb is eaten): the two bars of the phrase as it is before the step, the number of NEW bars between them, the order, the seed (only with the seeded order) and the place; the place defaults to between two neighbouring bars, else after the later one. */
function readMorphBetween(f: Scan): StructureOp {
  const at = f.at;
  if (!(f.kw('bars') || f.kw('bar'))) f.fail('"bars"');
  const a = f.whole('a bar number', 1);
  if (!(f.kw('and') || f.kw('into') || f.kw('to'))) f.fail('"and"');
  f.kw('bars') || f.kw('bar');
  const bAt = f.at;
  const b = f.whole('a bar number', 1);
  if (a === b) f.failAt(`Expected two different bars to morph between, but found bar ${a} twice.`, bAt);
  let bars = 0, order: MorphOrder = MORPH_DEFAULTS.order, seed: number | null = null, after: number | 'end' | null = null, seedAt = -1;
  segments(f, [
    placeSegment(f, (p) => { after = p; }),
    { name: '"across N bars"', read: () => { if (!(f.kw('across') || f.kw('over'))) return false; bars = f.whole('a number of new bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX); f.kw('new'); if (!(f.kw('bars') || f.kw('bar'))) f.fail('"bars"'); return true; } },
    { name: 'the order', read: () => { const s = f.i; if (!f.kw('in')) return false; const o = orderFromWords(f); if (o === null) { f.i = s; return false; } order = o; return true; } },
    { name: '"seed N"', read: () => { if (!f.kw('seed')) return false; seedAt = f.at; seed = f.whole('a seed', 0); return true; } },
  ], `"across N bars", an order ("in musical order", also seeded, by-channel), "seed N" or a place ("after bar N", "before bar N", "between bars N and M", "at the start", "at the end")`);
  if (bars === 0) f.failAt('Expected "across N bars" (how many new bars to make between them), but found none.', at);
  if (seed !== null && order !== 'seeded') f.failAt(`Expected a seed only with the seeded order, but this morph is in ${orderWords(order)}.`, seedAt);
  return { op: 'morph_between', a, b, bars, order, seed: order === 'seeded' ? seed ?? 0 : 0, after: after ?? (Math.abs(a - b) === 1 ? Math.min(a, b) : Math.max(a, b)) };
}

/** "70 percent slower" / "20% faster" (the Extend head's tempo words, a step's too): the change as a number (-90 to 100), or null (nothing eaten) when no number and "percent" start here. */
function readTempoChange(sc: Scan): number | null {
  const at = sc.i; const n = sc.number(); if (n === null) return null;
  if (!(sc.kw('percent') || sc.eatPercentSign())) { sc.i = at; return null; }
  const slower = sc.kw('slower');
  if (!slower && !sc.kw('faster')) sc.fail('"slower" or "faster"');
  if (n.value < 0 || n.value > (slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX)) sc.failAt(`Expected a tempo change of 0 to ${slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX} percent ${slower ? 'slower' : 'faster'}, but found ${n.text}.`, n.at);
  return slower ? noNegZero(-n.value) : n.value;
}

/**
 * 2026-11-19-0999b: "Mix bars 2 and 3, 70 percent bar 2, as a path, in seeded order, seed 7, and put it after bar 3." (the verb is eaten): the Mix HEAD's words about two bars of the phrase as it is before the step - the share (`N percent bar K`, `the first`, `the second`; a's weight, default 50), "as a vote" (default)
 * with "threshold N percent" and "with ghost notes" or "as a path" with an order and a seed (the head's own words, in the one sentence: a following "Threshold" line would belong to a Mix head) - and the place the ONE new bar goes (default: between two neighbouring bars, else after the later one).
 */
function readMixBars(f: Scan): StructureOp {
  if (!(f.kw('bars') || f.kw('bar'))) f.fail('"bars"');
  const a = f.whole('a bar number', 1);
  if (!(f.kw('and') || f.kw('with'))) f.fail('"and"');
  f.kw('bars') || f.kw('bar');
  const bAt = f.at;
  const b = f.whole('a bar number', 1);
  if (a === b) f.failAt(`Expected two different bars to mix, but found bar ${a} twice.`, bAt);
  let weight: number = MIX_DEFAULTS.weight, mode: 'vote' | 'path' | null = null, order: MorphOrder | null = null, seed: number | null = null, orderAt = -1, seedAt = -1, voteAt = -1;
  let threshold: number = MIX_DEFAULTS.threshold, ghost = false, after: number | 'end' | null = null;
  segments(f, [
    placeSegment(f, (p) => { after = p; }),
    { name: 'the share', read: () => {
      const s0 = f.i; const n = f.number(); if (n === null) return false;
      if (!(f.kw('percent') || f.eatPercentSign())) { f.i = s0; return false; }
      if (n.value < 0 || n.value > 100) f.failAt(`Expected a share from 0 to 100 percent, but found ${n.text}.`, n.at);
      const refAt = f.at;
      let named: 'a' | 'b';
      if (f.kw('the first') || f.kw('of the first')) named = 'a';
      else if (f.kw('the second') || f.kw('of the second')) named = 'b';
      else {
        if (!(f.kw('bars') || f.kw('bar'))) f.fail('"bar N", "the first" or "the second" for the share');
        const k = f.whole('a bar number', 1);
        if (k !== a && k !== b) f.failAt(`Expected bar ${a} or bar ${b} for the share, but found bar ${k}.`, refAt);
        named = k === a ? 'a' : 'b';
      }
      const share = Number(shiftDecimal(n.text, -2));
      weight = named === 'a' ? share : Number(shiftDecimal(complementOf100(n.text), -2)); return true;
    } },
    { name: '"as a vote" or "as a path"', read: () => { if (f.kw('as a vote')) { mode = 'vote'; return true; } if (f.kw('as a path')) { mode = 'path'; return true; } return false; } },
    { name: 'the order', read: () => { const s0 = f.i; if (!f.kw('in')) return false; orderAt = f.at; const o = orderFromWords(f); if (o === null) { f.i = s0; return false; } order = o; return true; } },
    { name: '"seed N"', read: () => { if (!f.kw('seed')) return false; seedAt = f.at; seed = f.whole('a seed', 0); return true; } },
    { name: 'the threshold', read: () => { if (!f.kw('threshold')) return false; voteAt = f.at; threshold = f.percent('a threshold', 0, 100); return true; } },
    { name: 'the ghost notes', read: () => { if (!f.kw('with ghost notes')) return false; voteAt = f.at; ghost = true; return true; } },
  ], `"N percent bar K", "as a vote" (with "threshold N percent" and "with ghost notes") or "as a path, in musical order", or a place ("after bar N", "before bar N", "between bars N and M", "at the start", "at the end")`);
  if ((order !== null || seed !== null) && mode !== 'path') f.failAt('Expected an order and a seed only for a mix as a path, but this mix is a vote.', orderAt >= 0 ? orderAt : seedAt);
  if (seed !== null && order !== 'seeded') f.failAt(`Expected a seed only with the seeded order, but this mix is in ${orderWords((order ?? MORPH_DEFAULTS.order) as MorphOrder)}.`, seedAt);
  if (mode === 'path' && (voteAt >= 0)) f.failAt('Expected a threshold and ghost notes only for a mix as a vote, but this mix is a path.', voteAt);
  const gap = after ?? (Math.abs(a - b) === 1 ? Math.min(a, b) : Math.max(a, b));
  const base = { op: 'mix_bars' as const, a, b, weight, threshold, ghost };
  if (mode !== 'path') return { ...base, mode: 'vote', after: gap };
  const o: MorphOrder = order ?? MORPH_DEFAULTS.order;
  return { ...base, mode: 'path', order: o, seed: o === 'seeded' ? seed ?? 0 : 0, after: gap };
}

/**
 * 2026-11-19-0999b: "Extend bar 2 to 4 bars, building up, 20 percent slower, and put them at the end." (the verb is eaten): the Extend HEAD's words about ONE bar of the phrase as it is before the step - "to N bars" (default 4), the style (default repeating with fills), the tempo change (default 0).
 * With NO place the bar is REPLACED by the N bars; a place ("and put them after bar 3", "at the start", ...) means INSERT: the bar stays. Several bars ("Extend bars 2 and 3 to 4 bars") are read and refused in words (code `refused`).
 */
function readExtendBar(f: Scan): StructureOp {
  const at = f.at;
  if (!(f.kw('bars') || f.kw('bar'))) f.fail('"bar"');
  const bar = f.whole('a bar number', 1);
  const s0 = f.i; const sep = f.comma(); const and = f.kw('and');
  const tempo = /^\s*\d+(?:\.\d+)?\s*(?:percent|%)(\s*(?:slower|faster)\b)?/i.exec(f.s.slice(f.i));          // 2026-11-20-1001: "20 percent slower" after the bar is the tempo, not a second bar
  const several = (sep || and) && (f.peekKw('bars') || f.peekKw('bar') || (tempo === null && f.number() !== null));
  const figureAt = f.at; const rest = f.s.slice(f.i);
  f.i = s0;
  if (several) { const m = /\bto\s+(\d+)\s+bars?\b/i.exec(f.s.slice(f.i)); f.failAt(`Extend takes one bar at a time. Say "Extend bar ${bar} to ${m ? m[1] : PHRASE_DEFAULTS.bars} bars." for one bar, and again for the next.`, at, 'refused'); }
  if ((sep || and) && tempo?.[1] !== undefined && !/\bto\b/i.test(rest)) f.failAt(`Expected "to N bars" after the bar, for example "Extend bar ${bar} to ${PHRASE_DEFAULTS.bars} bars, ${tempo[0].trim().replace(/\s+/g, ' ')}."`, figureAt, 'refused');
  let bars: number = PHRASE_DEFAULTS.bars, style: PhraseStyle = PHRASE_DEFAULTS.style, pct: number = PHRASE_DEFAULTS.tempo_change_pct, after: number | 'end' | null = null;
  segments(f, [
    placeSegment(f, (p) => { after = p; }),
    { name: '"to N bars"', read: () => { if (!f.kw('to')) return false; bars = f.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX); if (!(f.kw('bars') || f.kw('bar'))) f.fail('"bars"'); return true; } },
    { name: 'the style', read: () => { const st = styleFromWords(f); if (st === null) return false; style = st; return true; } },
    { name: 'the tempo change', read: () => { const t = readTempoChange(f); if (t === null) return false; pct = t; return true; } },
  ], `"to N bars", a style (${PHRASE_STYLES.map((x) => STYLE_WORDS[x]).join(', ')}), "N percent slower" / "N percent faster" or a place ("after bar N", "before bar N", "at the start", "at the end")`);
  return { op: 'extend_bar', bar, bars, style, tempo_change_pct: pct, ...(after !== null ? { after } : {}) };
}

/** The comma-separated segments of a head sentence, each at most once, in any order; `try` returns true when one was read. */
function segments(sc: Scan, tries: Array<{ name: string; read: () => boolean }>, expected: string): void {
  const seen = new Set<string>();
  for (;;) {
    sc.comma();
    if (sc.done()) return;
    const at = sc.at;
    let hit: string | null = null;
    for (const t of tries) { if (t.read()) { hit = t.name; break; } }
    if (hit === null) { if (tries[0].name === 'the place' && sc.kw('and')) { sc.kw(PUT); sc.fail(PLACE_EXPECTED); } sc.fail(expected); }          // 2026-11-24-1040: an `and` that no place follows says what is missing: the place
    if (seen.has(hit)) sc.failAt(`Expected ${hit} to be said once, but it is said twice.`, at);
    seen.add(hit);
  }
}

function parseExtend(ss: Sentence[], vault: GrammarVault): ExtendPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('extend');
  const source = note(sc, vault, ['bar'], 'the bar to extend', BEATS_EXTEND).name;
  let bars: number = PHRASE_DEFAULTS.bars, style: PhraseStyle = PHRASE_DEFAULTS.style, pct: number = PHRASE_DEFAULTS.tempo_change_pct;
  segments(sc, [
    { name: '"to N bars"', read: () => { if (!sc.kw('to')) return false; bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX); if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"'); return true; } },
    { name: 'the style', read: () => { const s = styleFromWords(sc); if (s === null) return false; style = s; return true; } },
    { name: 'the tempo change', read: () => { const t = readTempoChange(sc); if (t === null) return false; pct = t; return true; } },       // 2026-11-19-0999b: the same words as the Extend step's (`readTempoChange`)
  ], `"to N bars", a style (${PHRASE_STYLES.map((s) => STYLE_WORDS[s]).join(', ')}) or "N percent slower" / "N percent faster"`);
  const tail = readTail(ss.slice(1), vault, 'extend', { bars, pct });
  return { kind: 'extend', source, bars: tail.bars, style, tempo_change_pct: tail.pct, ...tail.overrides, ...(tail.ops.length > 0 ? { ops: tail.ops } : {}) };
}

/**
 * 2026-11-24-1031 (pitch in bars, Stage 1b) - "Repeat [[bar_101]] for 10 bars.": the PLAIN REPEAT, the head of a MELODY phrase (an extend whose style is `repeat`: the bar N times, nothing added; an Extend's fills are about beats). A melody phrase then takes `Bar N is replaced by [[a melody bar]].`
 * and the structure steps Keep, Delete, Copy (with its place words) and Move; everything that works on hits (a tempo change, a length by "Make it", Thin out, Double up, the steps Mix, Morph and Extend) is refused in plain words, with the code `head` (the service cannot fix it).
 */
function parseRepeat(ss: Sentence[], vault: GrammarVault): ExtendPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('repeat');
  const at = sc.at, src = note(sc, vault, ['bar'], 'the melody bar to repeat');
  if (!src.melody) sc.failAt(`Repeat is for melody bars, and ${src.name} is a rhythm bar. A rhythm bar is extended: "Extend [[${src.name}]] to ${PHRASE_DEFAULTS.bars} bars, repeating with fills."`, at, 'head');
  if (!sc.kw('for')) sc.fail('"for N bars"');
  const bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX);
  if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"');
  sc.end();
  const ops: StructureOp[] = [], forks: Sentence[] = [];
  for (const s of ss.slice(1)) {
    const f = new Scan(s.text, s.start);
    reservedGuard(f);
    if (f.peekKw('bar')) { forks.push(s); continue; }
    const no = (more: string): never => f.failAt(`${BEATS} ${more}`, s.start, 'head');
    if (f.peekKw('make it')) { const tempo = /^\s*make\s+it\s+\S+\s*(?:percent|%)/i.test(f.s); no(tempo ? 'A melody bar has its own tempo: say it in the bar, Set the tempo to 72.' : `To change how many bars there are, change the number in the first line: Repeat [[${src.name}]] for N bars.`); }
    const step = readStructureStep(f, false);
    if (step !== null) { if (!isRunsOp(step)) no('A melody phrase keeps, deletes, copies and moves bars.'); ops.push(step); continue; }
    if (f.peekKw('thin out') || f.peekKw('double up')) no('A melody phrase keeps, deletes, copies and moves bars.');
    f.fail('"Keep ...", "Delete ...", "Copy ...", "Move ..." or "Bar N is replaced by [[a melody bar]]"');
  }
  if (ops.length > TRANSFORM_OPS_MAX) throw new Fail(ss[0].start, `Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${ops.length}.`);
  return { kind: 'extend', source: src.name, bars, style: REPEAT_STYLE, tempo_change_pct: 0, ...followForks(forks, vault, () => (ops.length > 0 ? Number.MAX_SAFE_INTEGER : bars), true), ...(ops.length > 0 ? { ops } : {}) };
}

/**
 * 2026-11-19-0980 (the list model, stage 2): the sentences AFTER the head of an extend or a morph, in any order: the MODIFIER lines ("Make it 20 percent slower.", "Make it 8 bars long.": each edits the head's segment of that name, the last one said wins), the STRUCTURE
 * steps (Keep, Delete, Copy, Move: valid after any head, in the order said) and the forks ("Bar 3 is replaced by [[a bar]]"; they are checked against the bars the phrase has AFTER the modifiers and the steps). A Thin out or a Double up is a take's.
 */
function readTail(ss: Sentence[], vault: GrammarVault, head: 'extend' | 'morph', now: { bars: number; pct: number }): { bars: number; pct: number; ops: StructureOp[]; overrides: { overrides?: Record<string, string> } } {
  let { bars, pct } = now;
  const ops: StructureOp[] = [];
  const forks: Sentence[] = [];
  for (const s of ss) {
    const sc = new Scan(s.text, s.start);
    reservedGuard(sc);
    if (sc.peekKw('bar')) { forks.push(s); continue; }
    const m = readModifier(sc, head);
    if (m !== null) { if (m.segment === 'length') bars = m.value; else pct = m.value; continue; }
    const step = readStructureStep(sc, false);
    if (step !== null) { ops.push(step); continue; }
    densityRefusal(sc, head);
    sc.fail('"Make it N percent slower.", "Make it N bars long.", "Keep ...", "Delete ...", "Copy ...", "Move ..." or "Bar N is replaced by [[a bar]]"');
  }
  if (ops.length > TRANSFORM_OPS_MAX) throw new Fail(ss[0].start, `Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${ops.length}.`);
  return { bars, pct, ops, overrides: followForks(forks, vault, () => (ops.length > 0 ? Number.MAX_SAFE_INTEGER : bars)) };
}

const HEAD_WORDS: Record<string, string> = { extend: 'an Extend', morph: 'a Morph', mix: 'a Mix', transform: 'a Take' };
/** "Make it N percent slower." / "Make it N percent faster." (the head's tempo segment: an Extend's) and "Make it N bars long." (the head's length segment: an Extend's or a Morph's). Null (nothing eaten) when the sentence is not one; a head that has no such segment refuses it in words. */
function readModifier(sc: Scan, head: 'extend' | 'morph' | 'mix' | 'transform'): { segment: 'tempo' | 'length'; value: number } | null {
  const start = sc.i;
  if (!sc.kw('make it')) { sc.i = start; return null; }
  const at = sc.at;
  const n = sc.number();
  if (n === null) sc.fail('"Make it N percent slower.", "Make it N percent faster." or "Make it N bars long."');
  if (sc.kw('percent') || sc.eatPercentSign()) {
    const slower = sc.kw('slower');
    if (!slower && !sc.kw('faster')) sc.fail('"slower" or "faster"');
    if (head !== 'extend') sc.failAt(`Expected a tempo change ("Make it N percent slower.") only after an Extend, but this phrase is ${HEAD_WORDS[head]}.`, at, 'head');
    if (n.value < 0 || n.value > (slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX)) sc.failAt(`Expected a tempo change of 0 to ${slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX} percent ${slower ? 'slower' : 'faster'}, but found ${n.text}.`, n.at);
    sc.end();
    return { segment: 'tempo', value: slower ? noNegZero(-n.value) : n.value };
  }
  if (head !== 'extend' && head !== 'morph') sc.failAt(`Expected a length ("Make it N bars long.") only after an Extend or a Morph, but this phrase is ${HEAD_WORDS[head]}.`, at, 'head');
  if (!Number.isInteger(n.value)) sc.failAt(`Expected a number of bars as a whole number, but found ${n.text}.`, n.at);
  if (n.value < PHRASE_BARS_MIN || n.value > PHRASE_BARS_MAX) sc.failAt(`Expected a number of bars from ${PHRASE_BARS_MIN} to ${PHRASE_BARS_MAX}, but found ${n.text}.`, n.at);
  if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars" after the number, as in "Make it 8 bars long."');
  if (!sc.kw('long')) sc.fail('"long", as in "Make it 8 bars long."');
  sc.end();
  return { segment: 'length', value: n.value };
}
/** A Thin out or a Double up after a head that is not a Take: refused in words that say what may follow it. */
function densityRefusal(sc: Scan, head: 'extend' | 'morph' | 'mix'): void {
  const start = sc.i;
  const verb = sc.kw('thin out') ? 'Thin out' : sc.kw('double up') ? 'Double up' : null;
  if (verb !== null) sc.failAt(`Expected "${verb}" only after a Take (after ${HEAD_WORDS[head]} a phrase takes "Keep", "Delete", "Copy" and "Move"), but this phrase is ${HEAD_WORDS[head]}.`, start, 'head');
  sc.i = start;
}

/** The sentences after the head of a kind that only has forks after it: each is "Bar N is replaced by [[a bar]]". */
export function followForks(ss: Sentence[], vault: GrammarVault, max: () => number, melodyHead = false): { overrides?: Record<string, string> } {
  const found: Record<string, string> = {};
  for (const s of ss) {
    const sc = new Scan(s.text, s.start);
    reservedGuard(sc);
    if (!sc.kw('bar')) sc.fail('"Bar N is replaced by [[a bar]]"');
    const f = fork(sc, vault, max(), melodyHead);
    if (Object.prototype.hasOwnProperty.call(found, String(f.bar))) sc.failAt(`Expected bar ${f.bar} to be replaced once, but it is replaced twice.`, s.start);
    found[String(f.bar)] = `bars/${f.note}`;
  }
  return sortedOverrides(found);
}
function reservedGuard(sc: Scan): void {
  const rest = sc.s.slice(sc.i).trimStart();
  for (const r of COMPOSITION_ONLY) if (r.re.test(rest)) sc.failAt(`Expected a sentence of this description, but "${r.verb}" belongs to a composition (a description that starts with "Play [[a note]] for N bars.") and this one is not.`, sc.at);
}

function parseMorph(ss: Sentence[], vault: GrammarVault): MorphPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('morph');
  const a = note(sc, vault, ['bar'], 'the bar to start from', BEATS_MORPH).name;
  if (!sc.kw('into') && !sc.kw('to')) sc.fail('"into"');
  const b = note(sc, vault, ['bar'], 'the bar to end at', BEATS_MORPH).name;
  let bars: number = MORPH_DEFAULTS.bars, order: MorphOrder = MORPH_DEFAULTS.order, seed: number | null = null, position: number | null = null, seedAt = -1, positionAt = -1;
  segments(sc, [
    { name: '"over N bars"', read: () => { if (!sc.kw('over')) return false; bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX); if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"'); return true; } },
    { name: '"as one bar"', read: () => { if (!sc.kw('as one bar') && !sc.kw('in one bar')) return false; bars = 1; return true; } },
    { name: '"after N single-hit changes"', read: () => { if (!sc.kw('after')) return false; positionAt = sc.at; position = sc.whole('a number of single-hit changes', 0); if (!(sc.kw('single-hit changes') || sc.kw('single-hit change'))) sc.fail('"single-hit changes"'); return true; } },
    { name: 'the order', read: () => { if (!sc.kw('in')) return false; const o = orderFromWords(sc); if (o === null) sc.fail(`an order (${MORPH_ORDERS.map(orderWords).join(', ')})`); order = o; return true; } },
    { name: '"seed N"', read: () => { if (!sc.kw('seed')) return false; seedAt = sc.at; seed = sc.whole('a seed', 0); return true; } },
  ], `"over N bars", "as one bar, after N single-hit changes", or "in musical order" (also seeded, by-channel)`);
  if (seed !== null && order !== 'seeded') sc.failAt(`Expected a seed only with the seeded order, but this morph is in ${orderWords(order)}.`, seedAt);
  const tail = readTail(ss.slice(1), vault, 'morph', { bars, pct: 0 });
  bars = tail.bars;                                                                                       // 2026-11-19-0980: "Make it N bars long." edits the head's length before the one-bar rules are asked
  if (bars === 1 && position === null) sc.failAt('Expected "after N single-hit changes" for a morph of one bar, but found none.', ss[0].start);
  if (bars !== 1 && position !== null) sc.failAt('Expected a position only for a morph of one bar, but this morph has more.', positionAt);
  return { kind: 'morph', a, b, bars, order, seed: seed ?? MORPH_DEFAULTS.seed, ...(bars === 1 ? { position: position ?? 0 } : {}), ...tail.overrides, ...(tail.ops.length > 0 ? { ops: tail.ops } : {}) };
}

function parseMix(ss: Sentence[], vault: GrammarVault): MixPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('mix');
  const a = note(sc, vault, ['bar'], 'the first bar', BEATS_MIX).name;
  if (!sc.kw('and') && !sc.kw('with')) sc.fail('"and"');
  const b = note(sc, vault, ['bar'], 'the second bar', BEATS_MIX).name;
  let weight: number = MIX_DEFAULTS.weight, mode: 'vote' | 'path' | null = null, order: MorphOrder | null = null, seed: number | null = null, orderAt = -1, seedAt = -1;
  segments(sc, [
    { name: 'the share', read: () => {
      const at = sc.i; const n = sc.number(); if (n === null) return false;
      if (!(sc.kw('percent') || sc.eatPercentSign())) { sc.i = at; return false; }
      if (n.value < 0 || n.value > 100) sc.failAt(`Expected a share from 0 to 100 percent, but found ${n.text}.`, n.at);
      const share = Number(shiftDecimal(n.text, -2));
      const refAt = sc.at;
      let named: 'a' | 'b';
      if (sc.kw('the first') || sc.kw('of the first')) named = 'a';
      else if (sc.kw('the second') || sc.kw('of the second')) named = 'b';
      else {
        const r = note(sc, vault, ['bar'], 'the bar the share belongs to');
        if (r.name === a && r.name === b) sc.failAt(`Expected "the first" or "the second", because ${a} is both bars of this mix, but found ${link(r.name)}.`, refAt);
        if (r.name !== a && r.name !== b) sc.failAt(`Expected ${link(a)} or ${link(b)} for the share, but found ${link(r.name)}.`, refAt);
        named = r.name === a ? 'a' : 'b';
      }
      weight = named === 'a' ? share : Number(shiftDecimal(complementOf100(n.text), -2)); return true;
    } },
    { name: '"as a vote" or "as a path"', read: () => { if (sc.kw('as a vote')) { mode = 'vote'; return true; } if (sc.kw('as a path')) { mode = 'path'; return true; } return false; } },
    { name: 'the order', read: () => { if (!sc.kw('in')) return false; orderAt = sc.at; const o = orderFromWords(sc); if (o === null) sc.fail(`an order (${MORPH_ORDERS.map(orderWords).join(', ')})`); order = o; return true; } },
    { name: '"seed N"', read: () => { if (!sc.kw('seed')) return false; seedAt = sc.at; seed = sc.whole('a seed', 0); return true; } },
  ], `"N percent [[a bar]]", "as a vote" or "as a path, in musical order"`);
  if ((order !== null || seed !== null) && mode !== 'path') sc.failAt('Expected an order and a seed only for a mix as a path, but this mix is a vote.', orderAt >= 0 ? orderAt : seedAt);
  if (seed !== null && order !== 'seeded') sc.failAt(`Expected a seed only with the seeded order, but this mix is in ${orderWords((order ?? MORPH_DEFAULTS.order) as MorphOrder)}.`, seedAt);
  let threshold: number = MIX_DEFAULTS.threshold, ghost = false;
  const said = new Set<string>();
  const ops: StructureOp[] = [];
  for (const s of ss.slice(1)) {
    const f = new Scan(s.text, s.start);
    reservedGuard(f);
    if (f.kw('threshold')) {
      if (said.has('threshold')) f.failAt('Expected the threshold to be said once, but it is said twice.', s.start);
      said.add('threshold'); threshold = f.percent('a threshold', 0, 100); f.end();
    } else if (f.kw('with ghost notes')) {
      if (said.has('ghost')) f.failAt('Expected the ghost notes to be said once, but they are said twice.', s.start);
      said.add('ghost'); ghost = true; f.end();
    } else {
      f.i = 0; readModifier(f, 'mix');                                                                      // 2026-11-19-0980: a tempo and a length are not a mix's: refused in words that say so
      const step = readStructureStep(f, false);
      if (step !== null) { ops.push(step); continue; }
      densityRefusal(f, 'mix');
      f.fail('"Threshold N percent.", "With ghost notes.", "Keep ...", "Delete ...", "Copy ..." or "Move ..."');
    }
  }
  if (ops.length > TRANSFORM_OPS_MAX) throw new Fail(ss[0].start, `Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${ops.length}.`);
  const base = { kind: 'mix' as const, a, b, weight, threshold, ghost, ...(ops.length > 0 ? { ops } : {}) };
  if (mode !== 'path') return base;
  const o: MorphOrder = order ?? MORPH_DEFAULTS.order;
  return { ...base, mode: 'path', order: o, seed: seed ?? MORPH_DEFAULTS.seed };
}

function parseTransform(ss: Sentence[], vault: GrammarVault): TransformPhrase & { source: string } {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('take');
  const src = note(sc, vault, ['phrase', 'arrangement', 'composition'], 'the note to take', () => `${BEATS} A melody phrase is not taken: Keep, Delete, Copy and Move work on the phrase itself.`);
  sc.end();
  const ops: TransformOp[] = [];
  const forks: Sentence[] = [];                                          // the "Bar N is replaced by" sentences, between or after the changes
  for (const s of ss.slice(1)) {
    const f = new Scan(s.text, s.start);
    reservedGuard(f);
    if (f.peekKw('bar')) {                                              // "Bar 9 is replaced by ..." (a one-bar RANGE starts with its verb, never with "bar"; "Bars" is not the word "bar")
      forks.push(s); continue;
    }
    readModifier(f, 'transform');                                        // 2026-11-19-0980: "Make it ..." is an Extend's or a Morph's: refused in words (it returns null, nothing eaten, for any other sentence)
    const structure = readStructureStep(f, ops.some((o) => !isStructureOp(o)));      // 2026-11-16-1000: Keep / Delete / Copy / Move
    if (structure !== null) { ops.push(structure); continue; }
    if (f.kw('thin out')) {
      const { first, last } = readRange(f);
      let row: string | undefined, amount: number = TRANSFORM_DEFAULTS.amount, keep: 'seeded' | null = null, seed: number | null = null;
      const tried = new Set<string>();
      for (;;) {
        f.comma();
        if (f.done()) break;
        const at = f.at;
        let name = '';
        if (f.kw('by')) {
          name = 'the amount';
          if (f.kw('half')) amount = 0.5; else amount = f.percent('an amount', 0, 100);
        } else if (f.kw('keeping the downbeat')) { name = 'the kept beats'; keep = null; seed = null; }
        else if (f.kw('chosen by seed')) { name = 'the kept beats'; keep = 'seeded'; seed = f.whole('a seed', 0); }
        else {
          const rowAt = f.i; const m = /^[A-Za-z0-9_-]+/.exec(f.s.slice(f.i));
          if (m) { f.i += m[0].length; if (f.kw('row')) { name = 'the row'; row = m[0]; } else f.i = rowAt; }
          if (name === '') f.fail('"kick row", "by half", "by N percent", "keeping the downbeat" or "chosen by seed N"');
        }
        if (tried.has(name)) f.failAt(`Expected ${name} to be said once, but it is said twice.`, at);
        tried.add(name);
      }
      ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount, ...(keep === 'seeded' ? { keep: 'seeded' as const, seed: seed ?? 0 } : {}) });
    } else if (f.kw('double up')) {
      const { first, last } = readRange(f);
      let row: string | undefined, grid: number = TRANSFORM_DEFAULTS.grid;
      const tried = new Set<string>();
      for (;;) {
        f.comma();
        if (f.done()) break;
        const at = f.at;
        let name = '';
        if (f.kw('on a grid of')) { name = 'the grid'; grid = f.whole('a grid', 1); }
        else {
          const rowAt = f.i; const m = /^[A-Za-z0-9_-]+/.exec(f.s.slice(f.i));
          if (m) { f.i += m[0].length; if (f.kw('row')) { name = 'the row'; row = m[0]; } else f.i = rowAt; }
          if (name === '') f.fail('"kick row" or "on a grid of N"');
        }
        if (tried.has(name)) f.failAt(`Expected ${name} to be said once, but it is said twice.`, at);
        tried.add(name);
      }
      ops.push({ op: 'double_up', first, last, ...(row !== undefined ? { row } : {}), grid });
    } else f.fail('"Thin out ...", "Double up ...", "Keep ...", "Delete ...", "Copy ...", "Move ..." or "Bar N is replaced by [[a bar]]"');
  }
  // 2026-11-19-0980 (deliberate): `Take [[x]].` alone is a phrase - a copy of x (zero changes); it was refused ("Expected at least one change after Take")
  if (ops.length > TRANSFORM_OPS_MAX) sc.failAt(`Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${ops.length}.`, ss[0].start);
  const overrides = followForks(forks, vault, () => Number.MAX_SAFE_INTEGER);
  return { kind: 'transform', source: `${FOLDER_OF[src.kind as 'phrase' | 'arrangement' | 'composition']}/${src.name}`, ops, ...overrides };
}

function parseArrangement(ss: Sentence[], vault: GrammarVault): ArrangementParams {
  const tracks: ArrangementTrack[] = [];
  const kitSet = new Set<string>();
  let together = false;
  const known = (sc: Scan, name: string, at: number): ArrangementTrack => {
    const t = tracks.find((x) => x.kit === name);
    if (!t) sc.failAt(`Expected a kit that plays a phrase above, but nothing plays on ${link(name)}.`, at);
    return t;
  };
  for (const s of ss) {
    const sc = new Scan(s.text, s.start);
    reservedGuard(sc);
    if (together) sc.failAt('Expected nothing after "Together.", but found another sentence.', s.start);
    if (sc.kw('together')) { sc.end(); together = true; continue; }
    if (sc.kw('mute')) {
      sc.kw('the'); const at = sc.at; const k = note(sc, vault, ['kit'], 'the kit to mute'); if (!sc.kw('kit')) sc.fail('"kit"'); sc.end();
      known(sc, k.name, at).mute = true; continue;
    }
    if (sc.kw('only')) {
      sc.kw('the');
      const names: Array<{ name: string; at: number }> = [];
      for (;;) {
        const at = sc.at; names.push({ name: note(sc, vault, ['kit'], 'a kit that plays').name, at });
        if (sc.comma() || sc.kw('and')) continue;
        break;
      }
      if (!(sc.kw('kits') || sc.kw('kit'))) sc.fail('"kit" or "kits"');
      if (!(sc.kw('play') || sc.kw('plays'))) sc.fail('"play"');
      sc.end();
      for (const n of names) known(sc, n.name, n.at).solo = true;
      continue;
    }
    if (!sc.kw('play')) sc.fail('"Play [[a phrase]] on the [[a kit]] kit.", "Mute ...", "Only ..." or "Together."');
    if (sc.kw('the')) {                                                    // "Play the [[rock]] kit at 70 percent volume."
      const at = sc.at; const k = note(sc, vault, ['kit'], 'the kit'); if (!sc.kw('kit')) sc.fail('"kit"');
      if (!sc.kw('at')) sc.fail('"at"');
      const volume = sc.whole('a volume in percent', 0, 100);
      if (!(sc.kw('percent') || sc.eatPercentSign())) sc.fail('"percent"');
      if (!sc.kw('volume')) sc.fail('"volume"'); sc.end();
      known(sc, k.name, at).volume = volume; continue;
    }
    const p = note(sc, vault, ['phrase'], 'the phrase to play', () => 'A melody phrase cannot be played on a kit: a kit plays beats, and a melody needs a track of its own (an instrument, not a kit), which does not exist yet.');          // 2026-11-24-1031
    if (!sc.kw('on the') && !sc.kw('on')) sc.fail('"on the"');
    const kitAt = sc.at; const k = note(sc, vault, ['kit'], 'the kit to play it on');
    if (!sc.kw('kit')) sc.fail('"kit"'); sc.end();
    if (kitSet.has(k.name)) sc.failAt(`Expected a kit to play one phrase, but ${link(k.name)} is given a second one.`, kitAt);
    kitSet.add(k.name); tracks.push({ kit: k.name, phrase: p.name });
  }
  if (!together) { const last = ss[ss.length - 1]; throw new Fail(last.start + last.text.length, 'Expected "Together." after the tracks, but found the end of the description.'); }
  return { kind: 'arrangement', tracks: tracks.map((t) => ({ kit: t.kit, phrase: t.phrase, ...(t.mute === true ? { mute: true } : {}), ...(t.solo === true ? { solo: true } : {}), ...(t.volume !== undefined ? { volume: t.volume } : {}) })) };
}

/**
 * What follows "Repeat that": how many MORE times the section plays (2026-10-31-1130). The canonical sentence is "Repeat that N more times." ("Repeat that once more." for 1); "again" (1), "twice" (2), "once" (1) and the old
 * "Repeat that N times." / "N time." are read too, and EVERY one of them means N MORE (N + 1 plays in all): the old wording was ambiguous in English ("repeat twice" can be two plays in all), the new one says it.
 */
function repeatCount(sc: Scan): number {
  if (sc.kw('again')) return 1;
  if (sc.kw('twice')) return 2;
  if (sc.kw('once')) { sc.kw('more'); return 1; }
  const n = sc.whole('a number of times', 1, COMPOSITION_REPEAT_MAX);
  const more = sc.kw('more');
  if (!(sc.kw('times') || sc.kw('time'))) sc.fail(more ? '"times"' : '"more times"');
  return n;
}

/** A composition (M17b): "Play [[a]] for 8 bars." opens, "Then play [[b]] for 4 bars." follows (each also said "For 8 bars play [[a]]."), "Repeat that 2 more times." plays the section before it 2 more times. A section with no "for N bars" is all of its note, once. */
function parseComposition(ss: Sentence[], vault: GrammarVault): CompositionParams {
  const sections: CompositionSection[] = [];
  let notes: boolean | null = null;                                      // 2026-11-24-1031: a composition plays beats or notes, never both: the first phrase says which (an arrangement or a composition plays beats here; the engine checks what is inside)
  ss.forEach((s, i) => {
    const sc = new Scan(s.text, s.start);
    if (sc.kw('repeat that')) {
      if (sections.length === 0) sc.failAt('Expected a section to play before "Repeat that", but found none.', s.start);
      const last = sections[sections.length - 1];
      if (last.repeat !== undefined) sc.failAt('Expected "Repeat that" to be said once for a section, but it is said twice.', s.start);
      last.repeat = repeatCount(sc);
      sc.end();
      return;
    }
    const lengthOf = (): number => { const n = sc.whole('a number of bars', 1, COMPOSITION_LENGTH_MAX); if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"'); return n; };
    let length: number | undefined;
    let src: { name: string; kind: NoteKind; melody: boolean };
    if (sc.kw('for')) {                                                    // "For 8 bars play [[a]]."
      length = lengthOf();
      if (!sc.kw('play')) sc.fail('"play"');
      src = note(sc, vault, ['phrase', 'arrangement', 'composition'], 'the note to play');
    } else {
      if (!(i === 0 ? sc.kw('play') : sc.kw('then play'))) sc.fail(i === 0 ? '"Play [[a note]] for N bars." or "For N bars play [[a note]]."' : '"Then play [[a note]] for N bars.", "For N bars play [[a note]]." or "Repeat that N more times."');
      src = note(sc, vault, ['phrase', 'arrangement', 'composition'], 'the note to play');
      if (sc.kw('for')) length = lengthOf();
    }
    sc.end();
    const said = src.kind === 'composition' ? null : src.kind === 'phrase' && src.melody;                  // true = notes, false = beats, null = a composition (the engine looks inside it)
    if (said !== null) { if (notes !== null && notes !== said) throw new Fail(s.start, `A composition plays beats or notes, not both: ${src.name} ${said ? 'is a melody phrase' : 'plays beats'}, and an earlier section ${said ? 'plays beats' : 'plays notes'}.`, 'head'); notes = said; }
    sections.push({ source: `${FOLDER_OF[src.kind as 'phrase' | 'arrangement' | 'composition']}/${src.name}`, ...(length !== undefined ? { length } : {}) });
  });
  return { kind: 'composition', sections };
}

/** Is this description a composition's? Its first sentence is "For N bars play ..."; or "Play [[a]]" followed by "for N bars" or nothing (an arrangement's first sentence has "on the [[a kit]] kit"); or it has a sentence only a composition has. */
function compositionLike(ss: Sentence[]): boolean {
  const first = ss[0].text;
  if (/^for\s+\S+\s+bars?\s+play\b/i.test(first)) return true;
  if (!/^play\b/i.test(first)) return false;
  if (/^play\s+(?:\[\[[^\]]*\]\]|[A-Za-z0-9_-]+)\s+on\b/i.test(first)) return false;                 // "Play [[a phrase]] on the [[a kit]] kit.": an arrangement's
  if (ss.slice(1).some((x) => COMPOSITION_ONLY.some((r) => r.re.test(x.text)))) return true;
  return /^play\s+(?:\[\[[^\]]*\]\]|[A-Za-z0-9_-]+)\s*(?:for\b|$)/i.test(first);
}

export const placeOf = (text: string, offset: number): { line: number; column: number } => {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const line = before.split('\n').length;
  return { line, column: before.length - (before.lastIndexOf('\n') + 1) + 1 };
};

/** 2026-11-19-0999b: how a step that makes new bars is said in the refusal of a phrase that starts with one. */
const STEP_EXAMPLES: Record<string, string> = { morph: '"Morph bars N and M across K bars"', mix: '"Mix bars N and M"', extend: '"Extend bar N to K bars"' };
/** A description -> its params, or the first thing that is wrong, with the line and column it is at and one sentence saying what was expected. Never throws. `vault` is what the names are checked against. */
export function parse(text: string, vault: GrammarVault): ParseResult {
  const err = (offset: number, message: string): ParseResult => ({ ok: false, error: { message, ...placeOf(text, offset) } });
  try {
    const ss = sentencesOf(text);
    if (ss.length === 0) return err(0, `Expected a description (it starts with ${OPEN_EXAMPLES}), but found nothing.`);
    const first = new Scan(ss[0].text, ss[0].start);
    if (compositionLike(ss)) {
      const c = validateComposition(parseComposition(ss, vault));
      return c.ok === false ? err(ss[0].start, c.message) : { ok: true, params: c.value };
    }
    reservedGuard(first);
    const asStep = /^(morph|mix|extend)\s+bars?\s+\d/i.exec(ss[0].text);
    if (asStep) first.failAt(`A phrase starts with Extend, Mix, Morph or Take: ${STEP_EXAMPLES[asStep[1].toLowerCase()]} works on the bars the phrase already has, so it comes after the first line.`, ss[0].start, 'head');          // 2026-11-19-0996b: a step, not a head (2026-11-19-0999b: Mix and Extend too)
    const open = OPEN_VERBS.find((v) => v.re.test(ss[0].text));
    if (!open) first.fail(`a description that starts with ${OPEN_EXAMPLES}`);
    const params: GrammarParams = open.kind === 'extend' ? parseExtend(ss, vault) : open.kind === 'mix' ? parseMix(ss, vault) : open.kind === 'morph' ? parseMorph(ss, vault) : open.kind === 'transform' ? parseTransform(ss, vault) : open.kind === 'repeat' ? parseRepeat(ss, vault) : parseArrangement(ss, vault);
    // the last gate: what the grammar gives is what the plugin's own validators accept (since M15b a transform may take a phrase OR an arrangement as its source, so there is nothing the grammar says that the validators check differently)
    if (params.kind === 'arrangement') {
      const v = validateArrangement(params);
      if (v.ok === false) return err(ss[0].start, v.message);
      return { ok: true, params: v.value };
    }
    const v = validatePhrase(params);
    if (v.ok === false) return err(ss[0].start, v.message);
    return { ok: true, params };                                           // the validators are a gate: what they give back is what the grammar built
  } catch (e) {
    if (e instanceof Fail) { const r = err(e.at, e.message); return e.code !== undefined && r.ok === false ? { ok: false, error: { ...r.error, code: e.code } } : r; }
    return err(0, `Expected a description of this grammar, but it could not be read (${(e as Error)?.message ?? String(e)}).`);
  }
}
