// 2026-10-30-1030 (M15a, design 4.14) - the closed DESCRIPTION GRAMMAR of a phrase, as a pure, tested core. A phrase (and an arrangement, which is the same kind of note: a list of bars made by sentences) can be said as a few
// plain sentences and read back; the Description is to become the source of truth and the controls will WRITE it (M15b), hand edits come later (M15c, M16). Nothing reads this file yet: no behaviour change in the plugin (P3 trivially true).
//
//   describe(params) -> the canonical text;   parse(text, vault) -> { ok, params } | { ok: false, error: { message, line, column } };   canonical(params) -> the params as the text carries them.
//
// ONE VOCABULARY OF VERBS, not four (driver Q1, 2026-10-30): a description is a list of CLAUSES, one sentence each, a verb and its arguments. The first clause names the kind of note (Extend, Mix, Morph, Take, Play); the rest are the
// clauses that kind takes. Every verb lives in VERBS below, in ONE table: adding a verb (the composition's `Then play ...`, `Repeat that 2 times.`, `For 8 bars play ...`, which are RESERVED here and refused by name) is adding a row, and no
// existing sentence changes. A full stop followed by a space, or a line break, ends a sentence. A source is named by a wikilink and the grammar does not care what kind of note it is (a phrase, an arrangement, one day a composition): it asks the vault's lists.
//
// DEFAULTS. The text OMITS only: a tempo change of 0 (the sentence is not said), a Mix threshold of 50 percent and ghost notes off (their sentences are not said), a morph or mix seed that its order does not use, and a Double up grid of 16.
// Everything else is always said (bars, style, the share of a mix, its mode, the order of a morph, the amount and the kept beats of a thin out). On INPUT any parameter that has a default in the validators (`phrase-core.ts`) may be left out
// and is restored: extend bars 4, style repeat_with_fills, tempo 0; mix share 50, threshold 50, ghost off, vote; morph bars 5, musical order, seed 0; thin out by half keeping the downbeat; double up grid 16.
// canonical(params) is what the text can carry: a field the text cannot say (a seed on an order that ignores it, `mode: "vote"` which is the same as no mode, a track with `mute: false`, `solo: false` or `volume: 100`, -0) is dropped.
import {
  MIX_DEFAULTS, MORPH_DEFAULTS, MORPH_ORDERS, PHRASE_BARS_MAX, PHRASE_BARS_MIN, PHRASE_DEFAULTS, PHRASE_PCT_MAX, PHRASE_PCT_MIN, PHRASE_STYLES, TRANSFORM_DEFAULTS, TRANSFORM_KEEPS, TRANSFORM_OPS_MAX, validatePhrase,
  type ExtendPhrase, type MixPhrase, type MorphOrder, type MorphPhrase, type PhraseParams, type PhraseStyle, type TransformOp, type TransformPhrase,
} from './phrase-core.ts';
import { validateArrangement, type ArrangementParams, type ArrangementTrack } from './arrangement-core.ts';

export type GrammarParams = PhraseParams | ArrangementParams;
/** The notes of the vault a description may name (basenames, no folder, no .md). `arrangements` and `kits` are optional: a list that is not given is not checked (names are then only checked for their spelling). */
export interface GrammarVault { bars: readonly string[]; phrases: readonly string[]; arrangements?: readonly string[]; kits?: readonly string[] }
export interface GrammarError { message: string; line: number; column: number }
export type ParseResult = { ok: true; params: GrammarParams } | { ok: false; error: GrammarError };

// ---- the vocabulary: ONE source (the validators' lists), words keyed by them so a new style or order is a compile error here and a failing test ------------------------------------------------------------------------------------

/** How a style is said. Keyed by `PHRASE_STYLES` (phrase-core.ts): a style that is added there and not here does not compile. */
const STYLE_WORDS: Record<PhraseStyle, string> = { repeat_with_fills: 'repeating with fills', building: 'building up', ghost_notes: 'adding ghost notes' };
/** How an order is said: its engine name with the underscore a hyphen, then "order" (the notes' own words: `morphOrderWords` in phrase-core.ts says the same). */
export const orderWords = (order: MorphOrder): string => `${order.replace(/_/g, '-')} order`;
const NUMBER_WORDS = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'] as const;
export const GRAMMAR_VOCABULARY = { styles: PHRASE_STYLES, orders: MORPH_ORDERS, keeps: TRANSFORM_KEEPS, styleWords: STYLE_WORDS } as const;

/** The verbs. `kind` is the note a verb OPENS (the first clause) or `null` for a clause that follows; `reserved` verbs are the composition's, refused by name until they exist. */
export const VERBS: ReadonlyArray<{ verb: string; kind: 'extend' | 'mix' | 'morph' | 'transform' | 'arrangement' | null; reserved?: boolean; example: string }> = [
  { verb: 'extend', kind: 'extend', example: 'Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower.' },
  { verb: 'mix', kind: 'mix', example: 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.' },
  { verb: 'morph', kind: 'morph', example: 'Morph [[bar_003]] into [[bar_001]] over 8 bars, in musical order.' },
  { verb: 'take', kind: 'transform', example: 'Take [[phrase_006]].' },
  { verb: 'play', kind: 'arrangement', example: 'Play [[phrase_006]] on the [[rock]] kit.' },
  { verb: 'thin out', kind: null, example: 'Thin out bars 3 to 5, kick row, by half, keeping the downbeat.' },
  { verb: 'double up', kind: null, example: 'Double up bars 3 to 5, kick row.' },
  { verb: 'bar replaced', kind: null, example: 'Bar 9 is replaced by [[bar_009]].' },
  { verb: 'threshold', kind: null, example: 'Threshold 40 percent.' },
  { verb: 'ghost notes', kind: null, example: 'With ghost notes.' },
  { verb: 'volume', kind: null, example: 'Play the [[rock]] kit at 70 percent volume.' },
  { verb: 'mute', kind: null, example: 'Mute the [[latin]] kit.' },
  { verb: 'only', kind: null, example: 'Only the [[rock]] kit plays.' },
  { verb: 'together', kind: null, example: 'Together.' },
  { verb: 'then play', kind: null, reserved: true, example: 'Then play [[arr_002]] for 4 bars.' },
  { verb: 'repeat that', kind: null, reserved: true, example: 'Repeat that 2 times.' },
  { verb: 'for bars play', kind: null, reserved: true, example: 'For 8 bars play [[arr_001]].' },
];

// ---- numbers, written the way a person writes them --------------------------------------------------------------------------------------------------------------------------------------------------------------------

/** A number as plain decimal digits (no exponent), the shortest text that reads back as the same number. `String(n)` writes an exponent only below 1e-6 (a mantissa, then e-N) and from 1e21 (e+N): those are the two shapes undone here. */
export function plain(n: number): string {
  const s = String(n);
  const m = /^(-?)(\d+)(?:\.(\d+))?e([+-])(\d+)$/.exec(s);
  if (!m) return s;
  const digits = m[2] + (m[3] ?? ''), shift = Number(m[5]);
  return m[4] === '-' ? `${m[1]}0.${'0'.repeat(shift - m[2].length)}${digits}` : `${m[1]}${digits}${'0'.repeat(shift - (m[3] ?? '').length)}`;
}
/** Move the decimal point of a non-negative plain decimal (`places` > 0 to the right: 0.7 -> 70; < 0 to the left: 70 -> 0.7), exactly, on the digits. */
export function shiftDecimal(s: string, places: number): string {
  const [i, f = ''] = s.split('.');
  let digits = i + f; let point = i.length + places;
  if (point < 0) { digits = '0'.repeat(-point) + digits; point = 0; }
  if (point > digits.length) digits += '0'.repeat(point - digits.length);
  const int = digits.slice(0, point).replace(/^0+(?=\d)/, '') || '0';
  const frac = digits.slice(point).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}
const percentOf = (unit: number): string => shiftDecimal(plain(unit), 2);
/** 100 minus a plain non-negative decimal, exactly, on the digits (33.33 -> 66.67; the float 100 - 33.33 would not be). */
export function complementOf100(s: string): string {
  const [i, f = ''] = s.split('.');
  const scale = 10n ** BigInt(f.length);
  const left = 100n * scale - BigInt(i + f);
  return shiftDecimal(`${left / scale}.${String(left % scale).padStart(f.length, '0')}`, 0);          // shiftDecimal drops the trailing zeros (and the point of "70.0")
}

const baseName = (path: string): string => path.split('/').pop() ?? path;
const link = (name: string): string => `[[${name}]]`;
const barsWord = (n: number): string => (n === 1 ? 'bar' : 'bars');

// ---- canonical: the params as the text carries them -------------------------------------------------------------------------------------------------------------------------------------------------------------------

const noNegZero = (n: number): number => (Object.is(n, -0) ? 0 : n);
const sortedOverrides = (o: Record<string, string> | undefined): { overrides?: Record<string, string> } => {
  if (o === undefined || Object.keys(o).length === 0) return {};
  const out: Record<string, string> = {};
  for (const k of Object.keys(o).sort((a, b) => Number(a) - Number(b))) out[k] = o[k];
  return { overrides: out };
};
function canonicalOp(o: TransformOp): TransformOp {
  const base = { first: o.first, last: o.last, ...(o.row !== undefined ? { row: o.row } : {}) };
  if (o.op === 'double_up') return { op: 'double_up', ...base, grid: o.grid };
  return o.keep === 'seeded' ? { op: 'thin_out', ...base, amount: noNegZero(o.amount), keep: 'seeded', seed: o.seed ?? 0 } : { op: 'thin_out', ...base, amount: noNegZero(o.amount) };
}
/** The params as `describe` says them and `parse` gives them back: ignored fields dropped, defaults filled, keys in the validators' order. `parse(describe(p)).params` is `canonical(p)` for every valid `p`. */
export function canonical(p: GrammarParams): GrammarParams {
  if (p.kind === 'arrangement') {
    return { kind: 'arrangement', tracks: p.tracks.map((t): ArrangementTrack => ({
      kit: t.kit, phrase: t.phrase, ...(t.mute === true ? { mute: true } : {}), ...(t.solo === true ? { solo: true } : {}), ...(t.volume !== undefined && t.volume !== 100 ? { volume: t.volume } : {}),
    })) };
  }
  if (p.kind === 'extend') return { kind: 'extend', source: p.source, bars: p.bars, style: p.style, tempo_change_pct: noNegZero(p.tempo_change_pct), ...sortedOverrides(p.overrides) };
  if (p.kind === 'morph') {
    return { kind: 'morph', a: p.a, b: p.b, bars: p.bars, order: p.order, seed: p.order === 'seeded' ? p.seed : 0, ...(p.bars === 1 ? { position: p.position ?? 0 } : {}), ...sortedOverrides(p.overrides) };
  }
  if (p.kind === 'transform') return { kind: 'transform', source: p.source, ops: p.ops.map(canonicalOp), ...sortedOverrides(p.overrides) };
  const base = { kind: 'mix' as const, a: p.a, b: p.b, weight: p.weight, threshold: p.threshold, ghost: p.ghost };
  if (p.mode !== 'path') return base;
  const order = p.order ?? MORPH_DEFAULTS.order;
  return { ...base, mode: 'path', order, seed: order === 'seeded' ? p.seed ?? 0 : 0 };
}

// ---- describe ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const forkSentences = (o: Record<string, string> | undefined): string[] => (o ? Object.keys(o).map((k) => `Bar ${k} is replaced by ${link(baseName(o[k]))}.`) : []);
const amountWords = (a: number): string => (a === 0.5 ? 'half' : `${percentOf(a)} percent`);
const rangeText = (first: number, last: number): string => (first === last ? `bar ${first}` : `bars ${first} to ${last}`);
function opSentence(o: TransformOp): string {
  const where = `${rangeText(o.first, o.last)}${o.row !== undefined ? `, ${o.row} row` : ''}`;
  if (o.op === 'double_up') return `Double up ${where}${o.grid !== TRANSFORM_DEFAULTS.grid ? `, on a grid of ${o.grid}` : ''}.`;
  return `Thin out ${where}, by ${amountWords(o.amount)}, ${o.keep === 'seeded' ? `chosen by seed ${o.seed}` : 'keeping the downbeat'}.`;
}
const kitsPlay = (kits: string[]): string => (kits.length === 1 ? `the ${link(kits[0])} kit plays` : `the ${kits.slice(0, -1).map(link).join(', ')} and ${link(kits[kits.length - 1])} kits play`);

/** The canonical text of a phrase or an arrangement: one sentence per fact, notes as wikilinks, joined by single spaces. */
export function describe(params: GrammarParams): string {
  const p = canonical(params);
  const out: string[] = [];
  if (p.kind === 'arrangement') {
    out.push(...p.tracks.map((t) => `Play ${link(t.phrase)} on the ${link(t.kit)} kit.`));
    out.push(...p.tracks.filter((t) => t.volume !== undefined).map((t) => `Play the ${link(t.kit)} kit at ${t.volume} percent volume.`));
    out.push(...p.tracks.filter((t) => t.mute === true).map((t) => `Mute the ${link(t.kit)} kit.`));
    const solo = p.tracks.filter((t) => t.solo === true).map((t) => t.kit);
    if (solo.length > 0) out.push(`Only ${kitsPlay(solo)}.`);
    out.push('Together.');
  } else if (p.kind === 'extend') {
    const parts = [`Extend ${link(p.source)} to ${p.bars} ${barsWord(p.bars)}`, STYLE_WORDS[p.style]];
    if (p.tempo_change_pct !== 0) parts.push(`${plain(Math.abs(p.tempo_change_pct))} percent ${p.tempo_change_pct < 0 ? 'slower' : 'faster'}`);
    out.push(`${parts.join(', ')}.`, ...forkSentences(p.overrides));
  } else if (p.kind === 'morph') {
    const order = p.order === 'seeded' ? `${orderWords(p.order)}, seed ${p.seed}` : orderWords(p.order);
    const how = p.bars === 1 ? `as one bar, after ${p.position} single-hit ${p.position === 1 ? 'change' : 'changes'}` : `over ${p.bars} bars`;
    out.push(`Morph ${link(p.a)} into ${link(p.b)} ${how}, in ${order}.`, ...forkSentences(p.overrides));
  } else if (p.kind === 'transform') {
    out.push(`Take ${link(baseName(p.source))}.`, ...p.ops.map(opSentence), ...forkSentences(p.overrides));
  } else {
    const share = `${percentOf(p.weight)} percent ${p.a === p.b ? 'the first' : link(p.a)}`;
    const how = p.mode === 'path' ? `as a path, in ${p.order === 'seeded' ? `${orderWords(p.order)}, seed ${p.seed}` : orderWords(p.order as MorphOrder)}` : 'as a vote';
    out.push(`Mix ${link(p.a)} and ${link(p.b)}, ${share}, ${how}.`);
    if (p.threshold !== MIX_DEFAULTS.threshold) out.push(`Threshold ${percentOf(p.threshold)} percent.`);
    if (p.ghost) out.push('With ghost notes.');
  }
  return out.join(' ');
}

// ---- parse: a scanner over one sentence, errors with the place they are at ------------------------------------------------------------------------------------------------------------------------------------------------

class Fail extends Error {
  at: number;
  constructor(at: number, message: string) { super(message); this.at = at; }
}
const NAME = /^[A-Za-z0-9_-]+$/;

class Scan {
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
  failAt(message: string, at: number): never { throw new Fail(at, message); }
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
type NoteKind = 'bar' | 'phrase' | 'arrangement' | 'kit';
const LIST_OF: Record<NoteKind, (v: GrammarVault) => readonly string[] | undefined> = { bar: (v) => v.bars, phrase: (v) => v.phrases, arrangement: (v) => v.arrangements, kit: (v) => v.kits };
const KIND_WORDS: Record<NoteKind, string> = { bar: 'a bar', phrase: 'a phrase', arrangement: 'an arrangement', kit: 'a kit' };
function note(sc: Scan, vault: GrammarVault, kinds: NoteKind[], what: string): { name: string; kind: NoteKind } {
  sc.ws();
  const at = sc.at;
  let name: string;
  if (sc.s.startsWith('[[', sc.i)) {
    const close = sc.s.indexOf(']]', sc.i);
    if (close === -1) sc.failAt(`Expected "]]" to close the link, but found ${sc.found()}.`, at);
    name = sc.s.slice(sc.i + 2, close);
    if (!NAME.test(name)) sc.failAt(`Expected a note name (letters, digits, _ and -, no folder) inside the link, but found "${name}".`, at);
    sc.i = close + 2;
  } else {
    const m = /^[A-Za-z0-9_-]+/.exec(sc.s.slice(sc.i));
    if (!m) sc.fail(`${what}, as [[a note]]`);
    name = m[0]; sc.i += name.length;
  }
  const hits = kinds.filter((k) => (LIST_OF[k](vault) ?? [name]).includes(name));
  if (hits.length === 0) sc.failAt(`Expected ${kinds.map((k) => KIND_WORDS[k]).join(' or ')} of this vault for ${what}, but "${name}" is not one.`, at);
  if (hits.length > 1) sc.failAt(`Expected one note for ${what}, but "${name}" is both ${KIND_WORDS[hits[0]]} and ${KIND_WORDS[hits[1]]}; rename one of them.`, at);
  return { name, kind: hits[0] };
}

interface Sentence { text: string; start: number }
/** The sentences of a text: a full stop followed by a space or the end, or a line break, ends one (a full stop inside a number, and anything inside a link, does not). */
function sentencesOf(text: string): Sentence[] {
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

const RESERVED: Array<{ re: RegExp; verb: string }> = [{ re: /^then\s+play\b/i, verb: 'Then play' }, { re: /^repeat\s+that\b/i, verb: 'Repeat that' }, { re: /^for\s+\S+\s+bars?\s+play\b/i, verb: 'For N bars play' }];
const OPEN_VERBS: Array<{ re: RegExp; kind: 'extend' | 'mix' | 'morph' | 'transform' | 'arrangement' }> = [
  { re: /^extend\b/i, kind: 'extend' }, { re: /^mix\b/i, kind: 'mix' }, { re: /^morph\b/i, kind: 'morph' }, { re: /^take\b/i, kind: 'transform' }, { re: /^play\b/i, kind: 'arrangement' },
];
const OPEN_EXAMPLES = 'Extend, Mix, Morph, Take or Play';

const orderFromWords = (sc: Scan): MorphOrder | null => {
  for (const o of MORPH_ORDERS) { const words = orderWords(o); if (sc.kw(words) || sc.kw(words.replace(/-/g, ' ')) || sc.kw(`${o} order`)) return o; }
  return null;
};
const styleFromWords = (sc: Scan): PhraseStyle | null => {
  for (const s of PHRASE_STYLES) if (sc.kw(STYLE_WORDS[s]) || sc.kw(s)) return s;
  return null;
};

/** The sentences after the first that every kind with forks takes. */
function fork(sc: Scan, vault: GrammarVault, max: number): { bar: number; note: string } {
  const at = sc.at;                                                     // the caller has read the word "Bar"
  const bar = sc.whole('a bar number', 1);
  if (bar > max) sc.failAt(`Expected a bar of this phrase (1 to ${max}), but found ${bar}.`, at);
  if (!sc.kw('is replaced by') && !sc.kw('is')) sc.fail('"is replaced by"');
  const n = note(sc, vault, ['bar'], `bar ${bar}`);
  sc.end();
  return { bar, note: n.name };
}
function readRange(sc: Scan): { first: number; last: number } {
  if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bar N" or "bars N to M"');
  const first = sc.whole('a bar number', 1);
  let last = first;
  if (sc.kw('to')) { const lastAt = sc.at; last = sc.whole('a bar number', 1); if (last < first) sc.failAt(`Expected the last bar to be ${first} or more, but found ${last}.`, lastAt); }
  return { first, last };
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
    if (hit === null) sc.fail(expected);
    if (seen.has(hit)) sc.failAt(`Expected ${hit} to be said once, but it is said twice.`, at);
    seen.add(hit);
  }
}

function parseExtend(ss: Sentence[], vault: GrammarVault): ExtendPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('extend');
  const source = note(sc, vault, ['bar'], 'the bar to extend').name;
  let bars: number = PHRASE_DEFAULTS.bars, style: PhraseStyle = PHRASE_DEFAULTS.style, pct: number = PHRASE_DEFAULTS.tempo_change_pct;
  segments(sc, [
    { name: '"to N bars"', read: () => { if (!sc.kw('to')) return false; bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX); if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"'); return true; } },
    { name: 'the style', read: () => { const s = styleFromWords(sc); if (s === null) return false; style = s; return true; } },
    { name: 'the tempo change', read: () => {
      const at = sc.i; const n = sc.number(); if (n === null) return false;
      if (!(sc.kw('percent') || sc.eatPercentSign())) { sc.i = at; return false; }
      const slower = sc.kw('slower');
      if (!slower && !sc.kw('faster')) sc.fail('"slower" or "faster"');
      if (n.value < 0 || n.value > (slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX)) sc.failAt(`Expected a tempo change of 0 to ${slower ? -PHRASE_PCT_MIN : PHRASE_PCT_MAX} percent ${slower ? 'slower' : 'faster'}, but found ${n.text}.`, n.at);
      pct = slower ? noNegZero(-n.value) : n.value; return true;
    } },
  ], `"to N bars", a style (${PHRASE_STYLES.map((s) => STYLE_WORDS[s]).join(', ')}) or "N percent slower" / "N percent faster"`);
  const overrides = followForks(ss.slice(1), vault, () => bars);
  return { kind: 'extend', source, bars, style, tempo_change_pct: pct, ...overrides };
}

/** The sentences after the head of a kind that only has forks after it: each is "Bar N is replaced by [[a bar]]". */
function followForks(ss: Sentence[], vault: GrammarVault, max: () => number): { overrides?: Record<string, string> } {
  const found: Record<string, string> = {};
  for (const s of ss) {
    const sc = new Scan(s.text, s.start);
    reservedGuard(sc);
    if (!sc.kw('bar')) sc.fail('"Bar N is replaced by [[a bar]]"');
    const f = fork(sc, vault, max());
    if (Object.prototype.hasOwnProperty.call(found, String(f.bar))) sc.failAt(`Expected bar ${f.bar} to be replaced once, but it is replaced twice.`, s.start);
    found[String(f.bar)] = `bars/${f.note}`;
  }
  return sortedOverrides(found);
}
function reservedGuard(sc: Scan): void {
  const rest = sc.s.slice(sc.i).trimStart();
  for (const r of RESERVED) if (r.re.test(rest)) sc.failAt(`Expected a sentence of this description, but "${r.verb}" is reserved for compositions and does not exist yet.`, sc.at);
}

function parseMorph(ss: Sentence[], vault: GrammarVault): MorphPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('morph');
  const a = note(sc, vault, ['bar'], 'the bar to start from').name;
  if (!sc.kw('into') && !sc.kw('to')) sc.fail('"into"');
  const b = note(sc, vault, ['bar'], 'the bar to end at').name;
  let bars: number = MORPH_DEFAULTS.bars, order: MorphOrder = MORPH_DEFAULTS.order, seed: number | null = null, position: number | null = null, seedAt = -1, positionAt = -1;
  segments(sc, [
    { name: '"over N bars"', read: () => { if (!sc.kw('over')) return false; bars = sc.whole('a number of bars', PHRASE_BARS_MIN, PHRASE_BARS_MAX); if (!(sc.kw('bars') || sc.kw('bar'))) sc.fail('"bars"'); return true; } },
    { name: '"as one bar"', read: () => { if (!sc.kw('as one bar') && !sc.kw('in one bar')) return false; bars = 1; return true; } },
    { name: '"after N single-hit changes"', read: () => { if (!sc.kw('after')) return false; positionAt = sc.at; position = sc.whole('a number of single-hit changes', 0); if (!(sc.kw('single-hit changes') || sc.kw('single-hit change'))) sc.fail('"single-hit changes"'); return true; } },
    { name: 'the order', read: () => { if (!sc.kw('in')) return false; const o = orderFromWords(sc); if (o === null) sc.fail(`an order (${MORPH_ORDERS.map(orderWords).join(', ')})`); order = o; return true; } },
    { name: '"seed N"', read: () => { if (!sc.kw('seed')) return false; seedAt = sc.at; seed = sc.whole('a seed', 0); return true; } },
  ], `"over N bars", "as one bar, after N single-hit changes", or "in musical order" (also seeded, by-channel)`);
  if (seed !== null && order !== 'seeded') sc.failAt(`Expected a seed only with the seeded order, but this morph is in ${orderWords(order)}.`, seedAt);
  if (bars === 1 && position === null) sc.failAt('Expected "after N single-hit changes" for a morph of one bar, but found none.', ss[0].start);
  if (bars !== 1 && position !== null) sc.failAt('Expected a position only for a morph of one bar, but this morph has more.', positionAt);
  const overrides = followForks(ss.slice(1), vault, () => bars);
  return { kind: 'morph', a, b, bars, order, seed: seed ?? MORPH_DEFAULTS.seed, ...(bars === 1 ? { position: position ?? 0 } : {}), ...overrides };
}

function parseMix(ss: Sentence[], vault: GrammarVault): MixPhrase {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('mix');
  const a = note(sc, vault, ['bar'], 'the first bar').name;
  if (!sc.kw('and') && !sc.kw('with')) sc.fail('"and"');
  const b = note(sc, vault, ['bar'], 'the second bar').name;
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
  for (const s of ss.slice(1)) {
    const f = new Scan(s.text, s.start);
    reservedGuard(f);
    if (f.kw('threshold')) {
      if (said.has('threshold')) f.failAt('Expected the threshold to be said once, but it is said twice.', s.start);
      said.add('threshold'); threshold = f.percent('a threshold', 0, 100); f.end();
    } else if (f.kw('with ghost notes')) {
      if (said.has('ghost')) f.failAt('Expected the ghost notes to be said once, but they are said twice.', s.start);
      said.add('ghost'); ghost = true; f.end();
    } else f.fail('"Threshold N percent." or "With ghost notes."');
  }
  const base = { kind: 'mix' as const, a, b, weight, threshold, ghost };
  if (mode !== 'path') return base;
  const o: MorphOrder = order ?? MORPH_DEFAULTS.order;
  return { ...base, mode: 'path', order: o, seed: seed ?? MORPH_DEFAULTS.seed };
}

function parseTransform(ss: Sentence[], vault: GrammarVault): TransformPhrase & { source: string } {
  const sc = new Scan(ss[0].text, ss[0].start);
  sc.kw('take');
  const src = note(sc, vault, ['phrase', 'arrangement'], 'the note to take');
  sc.end();
  const ops: TransformOp[] = [];
  const forks: Sentence[] = [];                                          // the "Bar N is replaced by" sentences, between or after the changes
  for (const s of ss.slice(1)) {
    const f = new Scan(s.text, s.start);
    reservedGuard(f);
    if (f.peekKw('bar')) {                                              // "Bar 9 is replaced by ..." (a one-bar RANGE starts with its verb, never with "bar"; "Bars" is not the word "bar")
      forks.push(s); continue;
    }
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
    } else f.fail('"Thin out ...", "Double up ..." or "Bar N is replaced by [[a bar]]"');
  }
  if (ops.length === 0) sc.failAt('Expected at least one change after "Take" (Thin out or Double up), but found none.', ss[0].start + ss[0].text.length);
  if (ops.length > TRANSFORM_OPS_MAX) sc.failAt(`Expected at most ${TRANSFORM_OPS_MAX} changes, but found ${ops.length}.`, ss[0].start);
  const overrides = followForks(forks, vault, () => Number.MAX_SAFE_INTEGER);
  return { kind: 'transform', source: `${src.kind === 'arrangement' ? 'arrangements' : 'phrases'}/${src.name}`, ops, ...overrides };
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
    const p = note(sc, vault, ['phrase'], 'the phrase to play');
    if (!sc.kw('on the') && !sc.kw('on')) sc.fail('"on the"');
    const kitAt = sc.at; const k = note(sc, vault, ['kit'], 'the kit to play it on');
    if (!sc.kw('kit')) sc.fail('"kit"'); sc.end();
    if (kitSet.has(k.name)) sc.failAt(`Expected a kit to play one phrase, but ${link(k.name)} is given a second one.`, kitAt);
    kitSet.add(k.name); tracks.push({ kit: k.name, phrase: p.name });
  }
  if (!together) { const last = ss[ss.length - 1]; throw new Fail(last.start + last.text.length, 'Expected "Together." after the tracks, but found the end of the description.'); }
  return { kind: 'arrangement', tracks: tracks.map((t) => ({ kit: t.kit, phrase: t.phrase, ...(t.mute === true ? { mute: true } : {}), ...(t.solo === true ? { solo: true } : {}), ...(t.volume !== undefined ? { volume: t.volume } : {}) })) };
}

const placeOf = (text: string, offset: number): { line: number; column: number } => {
  const before = text.slice(0, Math.max(0, Math.min(offset, text.length)));
  const line = before.split('\n').length;
  return { line, column: before.length - (before.lastIndexOf('\n') + 1) + 1 };
};

/** A description -> its params, or the first thing that is wrong, with the line and column it is at and one sentence saying what was expected. Never throws. `vault` is what the names are checked against. */
export function parse(text: string, vault: GrammarVault): ParseResult {
  const err = (offset: number, message: string): ParseResult => ({ ok: false, error: { message, ...placeOf(text, offset) } });
  try {
    const ss = sentencesOf(text);
    if (ss.length === 0) return err(0, `Expected a description (it starts with ${OPEN_EXAMPLES}), but found nothing.`);
    const first = new Scan(ss[0].text, ss[0].start);
    reservedGuard(first);
    const open = OPEN_VERBS.find((v) => v.re.test(ss[0].text));
    if (!open) first.fail(`a description that starts with ${OPEN_EXAMPLES}`);
    const params: GrammarParams = open.kind === 'extend' ? parseExtend(ss, vault) : open.kind === 'mix' ? parseMix(ss, vault) : open.kind === 'morph' ? parseMorph(ss, vault) : open.kind === 'transform' ? parseTransform(ss, vault) : parseArrangement(ss, vault);
    // the last gate: what the grammar gives is what the plugin's own validators accept (a transform of an ARRANGEMENT is the one thing they do not accept yet: its source is checked as a phrase, everything else as it is)
    if (params.kind === 'arrangement') {
      const v = validateArrangement(params);
      if (v.ok === false) return err(ss[0].start, v.message);
      return { ok: true, params: v.value };
    }
    const v = validatePhrase(params.kind === 'transform' && params.source.startsWith('arrangements/') ? { ...params, source: 'phrases/phrase_000' } : params);
    if (v.ok === false) return err(ss[0].start, v.message);
    return { ok: true, params };                                           // the validators are a gate: what they give back is what the grammar built
  } catch (e) {
    if (e instanceof Fail) return err(e.at, e.message);
    return err(0, `Expected a description of this grammar, but it could not be read (${(e as Error)?.message ?? String(e)}).`);
  }
}
