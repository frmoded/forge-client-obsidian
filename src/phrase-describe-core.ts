// 2026-10-30-1050 (M15b) - the SAYING half of the description grammar (phrase-grammar-core.ts, M15a): `describe` (the canonical text of a phrase or an arrangement), `canonical` (the params as that text carries them) and the
// words and numbers they use. Split out of phrase-grammar-core.ts so the note writers in phrase-core.ts and arrangement-core.ts can call `describe` without importing the parser (which imports them): this file takes from phrase-core.ts
// only the three DEFAULTS objects, read INSIDE functions (never at load), so the two modules may load in either order (a test loads each first, in its own process). Pure: no Obsidian.
import { MIX_DEFAULTS, MORPH_DEFAULTS, REPEAT_STYLE, TRANSFORM_DEFAULTS, type MorphOrder, type PhraseParams, type StructureOp, type TransformOp } from './phrase-core.ts';
import { structureSentence, isStructureOp } from './bar-structure-core.ts';
import { STYLE_WORDS, orderWords } from './step-words-core.ts';
import type { ArrangementParams, ArrangementTrack } from './arrangement-core.ts';
import type { CompositionParams, CompositionSection } from './composition-core.ts';

export type GrammarParams = PhraseParams | ArrangementParams | CompositionParams;

// ---- the vocabulary: ONE source (the validators' lists), words keyed by them so a new style or order is a compile error here and a failing test ------------------------------------------------------------------------------------

// 2026-11-19-0999b: STYLE_WORDS and orderWords moved, unchanged, to the leaf step-words-core.ts (the Extend and Mix steps of bar-structure-core.ts say them too); re-exported so every importer is unchanged.
export { STYLE_WORDS, orderWords };

/** 2026-11-19-0980 (the list model, stage 2): the MODIFIER lines of a phrase's list, which edit a segment of the head ("Make it 20 percent slower.", "Make it 8 bars long."). `describe` itself still says a head as ONE sentence with every segment (every note written before is byte for byte what it was);
 *  these are the lines the composer, the strip and the list write: the number as a person says it, "1 bar" for one. */
export const tempoModifierSentence = (pct: number): string => `Make it ${plain(Math.abs(pct))} percent ${pct > 0 ? 'faster' : 'slower'}.`;      // a tempo of 0 is "0 percent slower": back at the tempo of the bar
export const lengthModifierSentence = (bars: number): string => `Make it ${bars} ${bars === 1 ? 'bar' : 'bars'} long.`;

// ---- numbers, written the way a person writes them: number-words-core.ts (a leaf, shared with phrase-words-core.ts), re-exported here so every importer is unchanged ----------------------------------------------------------------------
import { complementOf100, percentOf, plain, shiftDecimal } from './number-words-core.ts';
export { complementOf100, percentOf, plain, shiftDecimal };

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
  if (o.op === 'copy' && o.after !== undefined) return { op: 'copy', runs: o.runs.map(([a, b]): [number, number] => [a, b]), after: o.after };          // 2026-11-24-1036
  if (o.op === 'keep' || o.op === 'delete' || o.op === 'copy') return { op: o.op, runs: o.runs.map(([a, b]): [number, number] => [a, b]) };
  if (o.op === 'move') return { op: 'move', runs: o.runs.map(([a, b]): [number, number] => [a, b]), by: o.by };
  if (o.op === 'morph_between') return { op: 'morph_between', a: o.a, b: o.b, bars: o.bars, order: o.order, seed: o.order === 'seeded' ? o.seed : 0, after: o.after };       // 2026-11-19-0996b
  if (o.op === 'mix_bars') {                                                                                                                                                  // 2026-11-19-0999b: a path says its order and seed (0 unless seeded), a vote neither
    const base = { op: 'mix_bars' as const, a: o.a, b: o.b, weight: o.weight, threshold: o.threshold, ghost: o.ghost, mode: o.mode };
    return o.mode === 'path' ? { ...base, order: o.order ?? MORPH_DEFAULTS.order, seed: (o.order ?? MORPH_DEFAULTS.order) === 'seeded' ? o.seed ?? 0 : 0, after: o.after } : { ...base, after: o.after };
  }
  if (o.op === 'extend_bar') return { op: 'extend_bar', bar: o.bar, bars: o.bars, style: o.style, tempo_change_pct: noNegZero(o.tempo_change_pct), ...(o.after !== undefined ? { after: o.after } : {}) };       // 2026-11-19-0999b
  const base = { first: o.first, last: o.last, ...(o.row !== undefined ? { row: o.row } : {}) };
  if (o.op === 'double_up') return { op: 'double_up', ...base, grid: o.grid };
  return o.keep === 'seeded' ? { op: 'thin_out', ...base, amount: noNegZero(o.amount), keep: 'seeded', seed: o.seed ?? 0 } : { op: 'thin_out', ...base, amount: noNegZero(o.amount) };
}
/** 2026-11-19-0980: the structure steps that follow a head (none = the field is left out, as every note written before has it). */
const canonicalSteps = (ops: readonly TransformOp[] | undefined): { ops?: StructureOp[] } => (ops !== undefined && ops.length > 0 ? { ops: ops.map((o) => canonicalOp(o) as StructureOp) } : {});
/** The params as `describe` says them and `parse` gives them back: ignored fields dropped, defaults filled, keys in the validators' order. `parse(describe(p)).params` is `canonical(p)` for every valid `p`. */
export function canonical(p: GrammarParams): GrammarParams {
  if (p.kind === 'composition') {
    return { kind: 'composition', sections: p.sections.map((x): CompositionSection => ({ source: x.source, ...(x.length !== undefined ? { length: x.length } : {}), ...(x.repeat !== undefined && x.repeat > 0 ? { repeat: x.repeat } : {}) })) };
  }
  if (p.kind === 'arrangement') {
    return { kind: 'arrangement', tracks: p.tracks.map((t): ArrangementTrack => ({
      kit: t.kit, phrase: t.phrase, ...(t.mute === true ? { mute: true } : {}), ...(t.solo === true ? { solo: true } : {}), ...(t.volume !== undefined && t.volume !== 100 ? { volume: t.volume } : {}),
    })) };
  }
  if (p.kind === 'extend') return { kind: 'extend', source: p.source, bars: p.bars, style: p.style, tempo_change_pct: noNegZero(p.tempo_change_pct), ...sortedOverrides(p.overrides), ...canonicalSteps(p.ops) };
  if (p.kind === 'morph') {
    return { kind: 'morph', a: p.a, b: p.b, bars: p.bars, order: p.order, seed: p.order === 'seeded' ? p.seed : 0, ...(p.bars === 1 ? { position: p.position ?? 0 } : {}), ...sortedOverrides(p.overrides), ...canonicalSteps(p.ops) };
  }
  if (p.kind === 'transform') return { kind: 'transform', source: p.source, ops: p.ops.map(canonicalOp), ...sortedOverrides(p.overrides) };
  const base = { kind: 'mix' as const, a: p.a, b: p.b, weight: p.weight, threshold: p.threshold, ghost: p.ghost, ...canonicalSteps(p.ops) };
  if (p.mode !== 'path') return base;
  const order = p.order ?? MORPH_DEFAULTS.order;
  return { ...base, mode: 'path', order, seed: order === 'seeded' ? p.seed ?? 0 : 0 };
}

// ---- describe ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

const stepSentences = (ops: readonly TransformOp[] | undefined): string[] => (ops ?? []).map(opSentence);
const forkSentences = (o: Record<string, string> | undefined): string[] => (o ? Object.keys(o).map((k) => `Bar ${k} is replaced by ${link(baseName(o[k]))}.`) : []);
const amountWords = (a: number): string => (a === 0.5 ? 'half' : `${percentOf(a)} percent`);
const rangeText = (first: number, last: number): string => (first === last ? `bar ${first}` : `bars ${first} to ${last}`);
function opSentence(o: TransformOp): string {
  if (isStructureOp(o)) return structureSentence(o);
  const where = `${rangeText(o.first, o.last)}${o.row !== undefined ? `, ${o.row} row` : ''}`;
  if (o.op === 'double_up') return `Double up ${where}${o.grid !== TRANSFORM_DEFAULTS.grid ? `, on a grid of ${o.grid}` : ''}.`;
  return `Thin out ${where}, by ${amountWords(o.amount)}, ${o.keep === 'seeded' ? `chosen by seed ${o.seed}` : 'keeping the downbeat'}.`;
}
const kitsPlay = (kits: string[]): string => (kits.length === 1 ? `the ${link(kits[0])} kit plays` : `the ${kits.slice(0, -1).map(link).join(', ')} and ${link(kits[kits.length - 1])} kits play`);

/** The sentences of a composition (2026-10-31-1100, M17b): "Play [[a]] for 8 bars." opens, "Then play [[b]] for 4 bars." follows, "Repeat that 2 more times." plays the section before it 2 more times; a section with no length is just "Play [[a]]." / "Then play [[b]].". */
export function compositionSentences(params: CompositionParams): string[] {
  const p = canonical(params) as CompositionParams;
  const out: string[] = [];
  p.sections.forEach((s, i) => {
    const length = s.length !== undefined ? ` for ${s.length} ${barsWord(s.length)}` : '';
    out.push(`${i === 0 ? 'Play' : 'Then play'} ${link(baseName(s.source))}${length}.`);
    if (s.repeat !== undefined) out.push(s.repeat === 1 ? 'Repeat that once more.' : `Repeat that ${s.repeat} more times.`);        // N MORE plays (N + 1 in all); the old "Repeat that N times." is still READ (phrase-grammar-core)
  });
  return out;
}

/** The canonical text of a phrase, an arrangement or a composition: one sentence per fact, notes as wikilinks, joined by single spaces. */
export function describe(params: GrammarParams): string {
  const p = canonical(params);
  const out: string[] = [];
  if (p.kind === 'composition') {
    out.push(...compositionSentences(p));
  } else if (p.kind === 'arrangement') {
    out.push(...p.tracks.map((t) => `Play ${link(t.phrase)} on the ${link(t.kit)} kit.`));
    out.push(...p.tracks.filter((t) => t.volume !== undefined).map((t) => `Play the ${link(t.kit)} kit at ${t.volume} percent volume.`));
    out.push(...p.tracks.filter((t) => t.mute === true).map((t) => `Mute the ${link(t.kit)} kit.`));
    const solo = p.tracks.filter((t) => t.solo === true).map((t) => t.kit);
    if (solo.length > 0) out.push(`Only ${kitsPlay(solo)}.`);
    out.push('Together.');
  } else if (p.kind === 'extend') {
    const parts = p.style === REPEAT_STYLE ? [`Repeat ${link(p.source)} for ${p.bars} ${barsWord(p.bars)}`] : [`Extend ${link(p.source)} to ${p.bars} ${barsWord(p.bars)}`, STYLE_WORDS[p.style]];          // 2026-11-24-1031: the plain repeat of a melody phrase
    if (p.tempo_change_pct !== 0) parts.push(`${plain(Math.abs(p.tempo_change_pct))} percent ${p.tempo_change_pct < 0 ? 'slower' : 'faster'}`);
    out.push(`${parts.join(', ')}.`, ...stepSentences(p.ops), ...forkSentences(p.overrides));
  } else if (p.kind === 'morph') {
    const order = p.order === 'seeded' ? `${orderWords(p.order)}, seed ${p.seed}` : orderWords(p.order);
    const how = p.bars === 1 ? `as one bar, after ${p.position} single-hit ${p.position === 1 ? 'change' : 'changes'}` : `over ${p.bars} bars`;
    out.push(`Morph ${link(p.a)} into ${link(p.b)} ${how}, in ${order}.`, ...stepSentences(p.ops), ...forkSentences(p.overrides));
  } else if (p.kind === 'transform') {
    out.push(`Take ${link(baseName(p.source))}.`, ...p.ops.map(opSentence), ...forkSentences(p.overrides));
  } else {
    const share = `${percentOf(p.weight)} percent ${p.a === p.b ? 'the first' : link(p.a)}`;
    const how = p.mode === 'path' ? `as a path, in ${p.order === 'seeded' ? `${orderWords(p.order)}, seed ${p.seed}` : orderWords(p.order as MorphOrder)}` : 'as a vote';
    out.push(`Mix ${link(p.a)} and ${link(p.b)}, ${share}, ${how}.`);
    if (p.threshold !== MIX_DEFAULTS.threshold) out.push(`Threshold ${percentOf(p.threshold)} percent.`);
    if (p.ghost) out.push('With ghost notes.');
    out.push(...stepSentences(p.ops));
  }
  return out.join(' ');
}
