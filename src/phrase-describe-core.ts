// 2026-10-30-1050 (M15b) - the SAYING half of the description grammar (phrase-grammar-core.ts, M15a): `describe` (the canonical text of a phrase or an arrangement), `canonical` (the params as that text carries them) and the
// words and numbers they use. Split out of phrase-grammar-core.ts so the note writers in phrase-core.ts and arrangement-core.ts can call `describe` without importing the parser (which imports them): this file takes from phrase-core.ts
// only the three DEFAULTS objects, read INSIDE functions (never at load), so the two modules may load in either order (a test loads each first, in its own process). Pure: no Obsidian.
import { MIX_DEFAULTS, MORPH_DEFAULTS, TRANSFORM_DEFAULTS, type MorphOrder, type PhraseParams, type PhraseStyle, type TransformOp } from './phrase-core.ts';
import type { ArrangementParams, ArrangementTrack } from './arrangement-core.ts';

export type GrammarParams = PhraseParams | ArrangementParams;

// ---- the vocabulary: ONE source (the validators' lists), words keyed by them so a new style or order is a compile error here and a failing test ------------------------------------------------------------------------------------

/** How a style is said. Keyed by `PHRASE_STYLES` (phrase-core.ts): a style that is added there and not here does not compile. */
export const STYLE_WORDS: Record<PhraseStyle, string> = { repeat_with_fills: 'repeating with fills', building: 'building up', ghost_notes: 'adding ghost notes' };
/** How an order is said: its engine name with the underscore a hyphen, then "order" (the notes' own words: `morphOrderWords` in phrase-core.ts says the same). */
export const orderWords = (order: MorphOrder): string => `${order.replace(/_/g, '-')} order`;

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
export const percentOf = (unit: number): string => shiftDecimal(plain(unit), 2);
/** 100 minus a plain non-negative decimal, exactly, on the digits (33.33 -> 66.67; the float 100 - 33.33 would not be). */
export function complementOf100(s: string): string {
  const [i, f = ''] = s.split('.');
  const scale = 10n ** BigInt(f.length);
  const left = 100n * scale - BigInt(i + f);
  return shiftDecimal(`${left / scale}.${String(left % scale).padStart(f.length, '0')}`, 0);          // shiftDecimal drops the trailing zeros (and the point of "70.0")
}

export const baseName = (path: string): string => path.split('/').pop() ?? path;
export const link = (name: string): string => `[[${name}]]`;
const barsWord = (n: number): string => (n === 1 ? 'bar' : 'bars');

// ---- canonical: the params as the text carries them -------------------------------------------------------------------------------------------------------------------------------------------------------------------

export const noNegZero = (n: number): number => (Object.is(n, -0) ? 0 : n);
export const sortedOverrides = (o: Record<string, string> | undefined): { overrides?: Record<string, string> } => {
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
