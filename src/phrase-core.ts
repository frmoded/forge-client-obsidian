// score_first M5 (drain 2026-10-22-1850) — phrases: a bar stretched into n bars, with an optional ritardando or accelerando. M7 Phase A (drain 2026-10-22-2330) adds the second kind, a MIX; M7c Phase A
// (drain 2026-10-24-1200) the third, a MORPH.
//
// A phrase is a DATA NOTE in `phrases/` that holds only parameters, never bars:
//   { "kind": "extend", "source": "bar_005", "bars": 8, "style": "repeat_with_fills", "tempo_change_pct": -20 }
//   { "kind": "mix", "a": "bar_005", "b": "bar_006", "weight": 0.5, "threshold": 0.5, "ghost": false }
//   { "kind": "morph", "a": "bar_005", "b": "bar_006", "bars": 5, "order": "musical", "seed": 0 }          (bars = 1 also holds a "position")
// The Score it shows is DERIVED (P4, P6): an extend's source bar goes through the engine's `extend_rhythm` and `rhythm_bars_to_stream`; a mix's two bars go through `mix_rhythm` (one bar that is a
// weighted mix of them) and the same `rhythm_bars_to_stream`. Nothing here is stored but those fields.
//
// Pure core (no obsidian, no engine): parse + validate (defaults, refuse), the clamps the control strip uses, the note's text and its rewrite, the next free name, the "New phrase from this
// bar" decision and its action with the vault injected, and the Score of a phrase with the engine injected. The gate (score-first vault or not) is an INPUT here; it is read in one place,
// score-first.ts, like every other score-first decision.

import { editabilityProblem, parseFrontmatter, readRhythmNote, type RhythmData, type Validation } from './rhythm-edit-core.ts';
import { extractPhraseJsonBlock, newPhraseNote, renderPhraseNote } from './phrase-notes-core.ts';
import { computeScore, type ScoreOutcome } from './rhythm-score-core.ts';
import { TRANSFORM_DEFAULT_GRID, rangeWords } from './phrase-words-core.ts';
export { rangeWords, selectionWords, transformOpWords } from './phrase-words-core.ts';
import type { ProvenanceMap } from './provenance-core.ts';

export const PHRASE_FOLDER = 'phrases';
export const PHRASE_VIEW_TYPE = 'forge-phrase';
const BAR_FOLDER = 'bars';                       // the same folder score-first-core.ts names; kept here so this file stays free of the profile gate's module
export const BAR_FOLDER_NAME = BAR_FOLDER;
const BAR_PATH = /^bars\/(bar_\d+)\.md$/;
const PHRASE_PATH = /^phrases\/phrase_\d+\.md$/;
const PHRASE_NAME = /^phrase_(\d+)$/;
const BAR_NAME = /^bar_(\d+)$/;
const SOURCE_NAME = /^[A-Za-z0-9_-]+$/;

/** The three styles `extend_rhythm` knows (`_RHYTHM_EXTEND_STYLES` in forge/music/lib.py). */
export const PHRASE_STYLES = ['repeat_with_fills', 'building', 'ghost_notes'] as const;
export type PhraseStyle = typeof PHRASE_STYLES[number];

/** What each style does, in plain words, for the strip next to the style's name (drain 2026-10-22-2100: the driver noticed bar 4 differs and nothing said why). Each is what `extend_rhythm` really does
 *  (forge/music/lib.py docstring; a real-engine test in phrase-engine.test.ts pins the fill rule), not a paraphrase of what its name suggests. */
export const PHRASE_STYLE_NOTES: Record<PhraseStyle, string> = {
  repeat_with_fills: '(every bar repeats the bar, with a fill in the last beat of every 4th bar; the last bar gets one too unless the bar before it already has one)',
  building: '(the hi-hat gets busier: quarters in bar 1, eighths in bar 2, sixteenths from bar 3)',
  ghost_notes: '(every bar repeats the bar, with quiet snare notes added between the beats, never where the bar already hits)',
};

export const PHRASE_BARS_MIN = 1;
export const PHRASE_BARS_MAX = 64;
export const PHRASE_PCT_MIN = -90;
export const PHRASE_PCT_MAX = 100;
export const PHRASE_DEFAULTS = { bars: 4, style: 'repeat_with_fills' as PhraseStyle, tempo_change_pct: 0 };

export interface ExtendPhrase {
  kind: 'extend';
  source: string;
  bars: number;
  style: PhraseStyle;
  tempo_change_pct: number;
  /** M9 (fork on edit): bar number (1-based, as a string key) -> the bar note that stands in for that generated bar (`bars/bar_NNN`, no .md). Absent = every bar is generated. */
  overrides?: Record<string, string>;
}

/** A bar as a weighted mix of two bars (`mix_rhythm` in forge/music/lib.py). `weight` is the weight of `a` (1 = all a, 0 = all b); a hit is placed where the weights reach `threshold`. */
export interface MixPhrase {
  kind: 'mix';
  a: string;
  b: string;
  weight: number;
  threshold: number;
  ghost: boolean;
  /** 2026-10-26-0900: "vote" (the weighted vote above; absent = vote, byte-identical to a mix note that never had the field) or "path": the Weight slider walks the morph's single-hit steps between a and b (`threshold` and
   *  `ghost` are then ignored but kept). */
  mode?: MixMode;
  /** Only in path mode: the order of the single-hit changes, as the morph's (default musical). */
  order?: MorphOrder;
  /** Only in path mode (seeded order). */
  seed?: number;
}
export const MIX_MODES = ['vote', 'path'] as const;
export type MixMode = typeof MIX_MODES[number];

/** A morph (M7c): `bars` bars along an ordered path of single-hit edits from bar `a` to bar `b` (`morph_rhythm` in forge/music/lib.py). `order` is the order of the edits, `seed` drives "seeded"; with bars = 1 the
 *  `position` (0..d) picks which state of the path is the one bar. */
export interface MorphPhrase {
  kind: 'morph';
  a: string;
  b: string;
  bars: number;
  order: MorphOrder;
  seed: number;
  /** Only when bars = 1. */
  position?: number;
  /** M7c Phase B (fork on edit, as an extend's): bar number (1-based, as a string key) -> the bar note that stands in for that morph bar (`bars/bar_NNN`, no .md). Absent = every bar is generated. */
  overrides?: Record<string, string>;
}

export const MORPH_ORDERS = ['musical', 'seeded', 'by_channel'] as const;
export type MorphOrder = typeof MORPH_ORDERS[number];
export const MORPH_DEFAULTS = { bars: 5, order: 'musical' as MorphOrder, seed: 0 };
export const MORPH_KEYS = ['kind', 'a', 'b', 'bars', 'order', 'seed', 'position', 'overrides'] as const;

/** 2026-10-27-1030 (M14 slice 1, design 4.13): a TRANSFORM changes a region of another phrase's bars. `source` is a phrase note id (`phrases/phrase_006`, no .md); `ops` run in order over the bars the source makes
 *  (`thin_out_bars` / `double_up_bars` in forge/music/lib.py: a 1-based inclusive range of bars and an optional row, i.e. a channel name). Bar numbers are those of the source's bars (a transform keeps their count).
 *  `overrides` are forks of the DERIVED bars, as an extend's: bar number -> the bar note that stands in for it. */
export interface TransformPhrase {
  kind: 'transform';
  source: string;
  ops: TransformOp[];
  overrides?: Record<string, string>;
}
export interface ThinOutOp { op: 'thin_out'; first: number; last: number; row?: string; amount: number; keep?: 'seeded'; seed?: number }
export interface DoubleUpOp { op: 'double_up'; first: number; last: number; row?: string; grid: number }
export type TransformOp = ThinOutOp | DoubleUpOp;
export const TRANSFORM_OPS = ['thin_out', 'double_up'] as const;
export const TRANSFORM_KEEPS = ['downbeat', 'seeded'] as const;
export const TRANSFORM_DEFAULTS = { amount: 0.5, grid: TRANSFORM_DEFAULT_GRID };
export const TRANSFORM_OPS_MAX = 16;
export const TRANSFORM_KEYS = ['kind', 'source', 'ops', 'overrides'] as const;
const TRANSFORM_SOURCE = /^phrases\/phrase_\d+$/;
const CHANNEL_NAME = /^[A-Za-z0-9_-]+$/;

export type PhraseParams = ExtendPhrase | MixPhrase | MorphPhrase | TransformPhrase;

/** The two bars a mix reads, as the engine gets them. */
export interface MixBars { a: RhythmData; b: RhythmData }
/** The bars a transform changes, as the engine gets them: what its source phrase made. */
export interface TransformInput { bars: RhythmData[] }

export const MIX_DEFAULTS = { weight: 0.5, threshold: 0.5, ghost: false };

export const PHRASE_KEYS = ['kind', 'source', 'bars', 'style', 'tempo_change_pct', 'overrides'] as const;
const OVERRIDE_NOTE = /^bars\/bar_\d+$/;
export const MIX_KEYS = ['kind', 'a', 'b', 'weight', 'threshold', 'ghost', 'mode', 'order', 'seed'] as const;

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A phrase as the engine will be asked for it. `kind` and `source` are required; the rest default. Hand-edited JSON that is wrong is REFUSED naming the field (never silently
 *  corrected: the person should see that 99 bars is not a thing); the control strip CLAMPS what it writes, so it never produces such a value. */
export function validatePhrase(raw: unknown): Validation<PhraseParams> {
  const bad = (message: string): Validation<PhraseParams> => ({ ok: false, message });
  if (!isPlainObject(raw)) return bad('The phrase must be an object.');
  if (raw.kind === 'mix') return validateMix(raw);
  if (raw.kind === 'morph') return validateMorph(raw);
  if (raw.kind === 'transform') return validateTransform(raw);
  if (raw.kind !== 'extend') return bad(`kind must be "extend", "mix", "morph" or "transform", got ${JSON.stringify(raw.kind)}.`);
  for (const key of Object.keys(raw)) {
    if (!(PHRASE_KEYS as readonly string[]).includes(key)) return bad(`Unexpected field "${key}" (a phrase holds only ${PHRASE_KEYS.join(', ')}).`);
  }
  const source = raw.source;
  if (typeof source !== 'string' || !SOURCE_NAME.test(source)) {
    return bad(`source must be the name of a bar in ${BAR_FOLDER}/ (letters, digits, _ and -; no folder, no .md), got ${JSON.stringify(source)}.`);
  }
  const bars = raw.bars === undefined ? PHRASE_DEFAULTS.bars : raw.bars;
  if (typeof bars !== 'number' || !Number.isInteger(bars) || bars < PHRASE_BARS_MIN || bars > PHRASE_BARS_MAX) {
    return bad(`bars must be a whole number from ${PHRASE_BARS_MIN} to ${PHRASE_BARS_MAX}, got ${JSON.stringify(raw.bars)}.`);
  }
  const style = raw.style === undefined ? PHRASE_DEFAULTS.style : raw.style;
  if (typeof style !== 'string' || !(PHRASE_STYLES as readonly string[]).includes(style)) {
    return bad(`style must be one of ${PHRASE_STYLES.join(', ')}, got ${JSON.stringify(raw.style)}.`);
  }
  const pct = raw.tempo_change_pct === undefined ? PHRASE_DEFAULTS.tempo_change_pct : raw.tempo_change_pct;
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < PHRASE_PCT_MIN || pct > PHRASE_PCT_MAX) {
    return bad(`tempo_change_pct must be a number from ${PHRASE_PCT_MIN} to ${PHRASE_PCT_MAX}, got ${JSON.stringify(raw.tempo_change_pct)}.`);
  }
  const overrides = validateOverrides(raw.overrides, bars);
  if (typeof overrides === 'string') return bad(overrides);
  return { ok: true, value: { kind: 'extend', source, bars, style: style as PhraseStyle, tempo_change_pct: pct, ...(overrides ? { overrides } : {}) } };
}

/** M9: `overrides` is {"<bar number>": "bars/bar_NNN"}; the keys are whole bar numbers of THIS phrase, the values bar note paths. `{}` is no override. Returns the cleaned map (keys in numeric order), undefined for none, or a refusal. */
function validateOverrides(raw: unknown, bars: number): Record<string, string> | undefined | string {
  if (raw === undefined) return undefined;
  if (!isPlainObject(raw)) return `overrides must be an object of bar number to bar note, like {"3": "bars/bar_009"}, got ${JSON.stringify(raw)}.`;
  const keys = Object.keys(raw);
  if (keys.length === 0) return undefined;
  const out: Record<string, string> = {};
  for (const key of keys.sort((x, y) => Number(x) - Number(y))) {
    if (!/^[1-9]\d*$/.test(key)) return `overrides: "${key}" is not a bar of this phrase (bars 1 to ${bars}).`;
    // 2026-10-26-1100: the way out is in the line (the person lowered Bars below a fork: raise it again, or let the fork go)
    if (Number(key) > bars) return `overrides: "${key}" is not a bar of this phrase (bars 1 to ${bars}); raise Bars, or remove the override with Revert to generated.`;
    const v = raw[key];
    if (typeof v !== 'string' || !OVERRIDE_NOTE.test(v)) return `overrides: bar ${key} must name a bar note like bars/bar_009 (no .md), got ${JSON.stringify(v)}.`;
    out[key] = v;
  }
  return out;
}

/** The trap of 2026-10-26-1100: a phrase whose ONLY problem is a fork on a bar past Bars (the person lowered Bars below it) can be fixed from the strip by raising Bars, so the strip must stay live for it. Returns the phrase
 *  WITHOUT the faulty overrides (what the strip shows), the phrase WITH them (what every write keeps: raising Bars loses no fork) and the refusal line; \`null\` for everything else (a valid phrase, another problem, another kind). */
export function salvageOverrideRefusal(text: string): { shown: ExtendPhrase | MorphPhrase; keep: ExtendPhrase | MorphPhrase; message: string } | null {
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false || !parseFrontmatter(text)) return null;
  let raw: unknown;
  try { raw = JSON.parse(text.slice(block.contentStart, block.contentEnd)); } catch { return null; }
  if (!isPlainObject(raw) || (raw.kind !== 'extend' && raw.kind !== 'morph') || !isPlainObject(raw.overrides)) return null;
  const refused = validatePhrase(raw);
  if (refused.ok === true) return null;
  if (!/^overrides: "[1-9]\d*" is not a bar of this phrase \(bars 1 to \d+\); raise Bars/.test(refused.message)) return null;
  const { overrides, ...rest } = raw;
  const without = validatePhrase(rest);
  if (without.ok === false || (without.value.kind !== 'extend' && without.value.kind !== 'morph')) return null;
  const kept: Record<string, string> = {};
  for (const key of Object.keys(overrides).sort((x, y) => Number(x) - Number(y))) {
    if (!/^[1-9]\d*$/.test(key) || typeof overrides[key] !== 'string' || !OVERRIDE_NOTE.test(overrides[key] as string)) return null;      // another problem hides behind the first: raising Bars alone would not fix it
    kept[key] = overrides[key] as string;
  }
  return { shown: without.value, keep: { ...without.value, overrides: kept }, message: refused.message };
}

function barNameProblem(field: string, v: unknown): string | null {
  return typeof v === 'string' && SOURCE_NAME.test(v) ? null : `${field} must be the name of a bar in ${BAR_FOLDER}/ (letters, digits, _ and -; no folder, no .md), got ${JSON.stringify(v)}.`;
}

function validateMix(raw: Record<string, unknown>): Validation<PhraseParams> {
  const bad = (message: string): Validation<PhraseParams> => ({ ok: false, message });
  for (const key of Object.keys(raw)) {
    if (!(MIX_KEYS as readonly string[]).includes(key)) return bad(`Unexpected field "${key}" (a mix holds only ${MIX_KEYS.join(', ')}).`);
  }
  for (const field of ['a', 'b'] as const) {
    const problem = barNameProblem(field, raw[field]);
    if (problem) return bad(problem);
  }
  const unit = (field: 'weight' | 'threshold'): number | string => {
    const v = raw[field] === undefined ? MIX_DEFAULTS[field] : raw[field];
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1 ? v : `${field} must be a number from 0 to 1, got ${JSON.stringify(raw[field])}.`;
  };
  const weight = unit('weight');
  if (typeof weight === 'string') return bad(weight);
  const threshold = unit('threshold');
  if (typeof threshold === 'string') return bad(threshold);
  const ghost = raw.ghost === undefined ? MIX_DEFAULTS.ghost : raw.ghost;
  if (typeof ghost !== 'boolean') return bad(`ghost must be true or false, got ${JSON.stringify(raw.ghost)}.`);
  // 2026-10-26-0900: the mode. Absent = a vote mix and the value carries no new field (a mix note that never had one reads back exactly as before); order and seed belong to path mode only.
  const mode = raw.mode;
  if (mode !== undefined && mode !== 'vote' && mode !== 'path') return bad(`mode must be "vote" or "path", got ${JSON.stringify(raw.mode)}.`);
  const base = { kind: 'mix' as const, a: raw.a as string, b: raw.b as string, weight, threshold, ghost };
  if (mode !== 'path') {
    for (const field of ['order', 'seed'] as const) if (raw[field] !== undefined) return bad(`${field} only applies in path mode (set "mode": "path").`);
    return { ok: true, value: mode === 'vote' ? { ...base, mode: 'vote' } : base };
  }
  const order = raw.order === undefined ? MORPH_DEFAULTS.order : raw.order;
  if (typeof order !== 'string' || !(MORPH_ORDERS as readonly string[]).includes(order)) return bad(`order must be one of ${MORPH_ORDERS.join(', ')}, got ${JSON.stringify(raw.order)}.`);
  const seed = raw.seed === undefined ? MORPH_DEFAULTS.seed : raw.seed;
  if (typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0) return bad(`seed must be a whole number, 0 or more, got ${JSON.stringify(raw.seed)}.`);
  return { ok: true, value: { ...base, mode: 'path', order: order as MorphOrder, seed } };
}

function validateTransform(raw: Record<string, unknown>): Validation<PhraseParams> {
  const bad = (message: string): Validation<PhraseParams> => ({ ok: false, message });
  for (const key of Object.keys(raw)) {
    if (!(TRANSFORM_KEYS as readonly string[]).includes(key)) return bad(`Unexpected field "${key}" (a transform holds only ${TRANSFORM_KEYS.join(', ')}).`);
  }
  if (typeof raw.source !== 'string' || !TRANSFORM_SOURCE.test(raw.source)) {
    return bad(`source must be a phrase note without .md, like phrases/phrase_006, got ${JSON.stringify(raw.source)}.`);
  }
  if (!Array.isArray(raw.ops) || raw.ops.length < 1 || raw.ops.length > TRANSFORM_OPS_MAX) {
    return bad(`ops must be a list of 1 to ${TRANSFORM_OPS_MAX} operations, got ${Array.isArray(raw.ops) ? `${raw.ops.length}` : JSON.stringify(raw.ops)}.`);
  }
  const ops: TransformOp[] = [];
  for (let i = 0; i < raw.ops.length; i++) {
    const op = validateTransformOp(raw.ops[i], i);
    if (typeof op === 'string') return bad(op);
    ops.push(op);
  }
  const overrides = validateOverrides(raw.overrides, Number.MAX_SAFE_INTEGER);
  if (typeof overrides === 'string') return bad(overrides);
  return { ok: true, value: { kind: 'transform', source: raw.source, ops, ...(overrides ? { overrides } : {}) } };
}

function validateTransformOp(raw: unknown, i: number): TransformOp | string {
  const at = `ops[${i}]`;
  if (!isPlainObject(raw)) return `${at} must be an object like {"op": "thin_out", "first": 3, "last": 5}, got ${JSON.stringify(raw)}.`;
  if (raw.op !== 'thin_out' && raw.op !== 'double_up') return `${at}.op must be "thin_out" or "double_up", got ${JSON.stringify(raw.op)}.`;
  const allowed = raw.op === 'thin_out' ? ['op', 'first', 'last', 'row', 'amount', 'keep', 'seed'] : ['op', 'first', 'last', 'row', 'grid'];
  for (const key of Object.keys(raw)) {
    if (allowed.includes(key)) continue;
    if (raw.op === 'double_up' && (key === 'amount' || key === 'keep' || key === 'seed')) return `${at}: ${key} only applies to thin_out.`;
    if (raw.op === 'thin_out' && key === 'grid') return `${at}: grid only applies to double_up.`;
    return `${at}: unexpected field "${key}" (${raw.op} holds only ${allowed.join(', ')}).`;
  }
  const whole = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v);
  if (!whole(raw.first) || !whole(raw.last) || raw.first < 1 || raw.last < raw.first) {
    return `${at}: first and last must be whole bar numbers with 1 <= first <= last, got ${JSON.stringify(raw.first)} and ${JSON.stringify(raw.last)}.`;
  }
  if (raw.row !== undefined && (typeof raw.row !== 'string' || !CHANNEL_NAME.test(raw.row))) return `${at}.row must be a channel name (letters, digits, _ and -), got ${JSON.stringify(raw.row)}.`;
  const base = { first: raw.first, last: raw.last, ...(raw.row !== undefined ? { row: raw.row as string } : {}) };
  if (raw.op === 'double_up') {
    const grid = raw.grid === undefined ? TRANSFORM_DEFAULTS.grid : raw.grid;
    if (!whole(grid) || grid < 1) return `${at}.grid must be a whole number, 1 or more, got ${JSON.stringify(raw.grid)}.`;
    return { op: 'double_up', ...base, grid };
  }
  const amount = raw.amount === undefined ? TRANSFORM_DEFAULTS.amount : raw.amount;
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount < 0 || amount > 1) return `${at}.amount must be a number from 0 to 1, got ${JSON.stringify(raw.amount)}.`;
  if (raw.keep !== undefined && !(TRANSFORM_KEEPS as readonly unknown[]).includes(raw.keep)) return `${at}.keep must be "downbeat" or "seeded", got ${JSON.stringify(raw.keep)}.`;
  if (raw.keep !== 'seeded') {
    if (raw.seed !== undefined) return `${at}.seed only applies with keep "seeded".`;
    return { op: 'thin_out', ...base, amount };
  }
  const seed = raw.seed === undefined ? 0 : raw.seed;
  if (!whole(seed) || seed < 0) return `${at}.seed must be a whole number, 0 or more, got ${JSON.stringify(raw.seed)}.`;
  return { op: 'thin_out', ...base, amount, keep: 'seeded', seed };
}

function validateMorph(raw: Record<string, unknown>): Validation<PhraseParams> {
  const bad = (message: string): Validation<PhraseParams> => ({ ok: false, message });
  for (const key of Object.keys(raw)) {
    if (!(MORPH_KEYS as readonly string[]).includes(key)) return bad(`Unexpected field "${key}" (a morph holds only ${MORPH_KEYS.join(', ')}).`);
  }
  for (const field of ['a', 'b'] as const) {
    const problem = barNameProblem(field, raw[field]);
    if (problem) return bad(problem);
  }
  const bars = raw.bars === undefined ? MORPH_DEFAULTS.bars : raw.bars;
  if (typeof bars !== 'number' || !Number.isInteger(bars) || bars < PHRASE_BARS_MIN || bars > PHRASE_BARS_MAX) {
    return bad(`bars must be a whole number from ${PHRASE_BARS_MIN} to ${PHRASE_BARS_MAX}, got ${JSON.stringify(raw.bars)}.`);
  }
  const order = raw.order === undefined ? MORPH_DEFAULTS.order : raw.order;
  if (typeof order !== 'string' || !(MORPH_ORDERS as readonly string[]).includes(order)) {
    return bad(`order must be one of ${MORPH_ORDERS.join(', ')}, got ${JSON.stringify(raw.order)}.`);
  }
  const seed = raw.seed === undefined ? MORPH_DEFAULTS.seed : raw.seed;
  if (typeof seed !== 'number' || !Number.isSafeInteger(seed) || seed < 0) return bad(`seed must be a whole number, 0 or more, got ${JSON.stringify(raw.seed)}.`);
  const position = raw.position;
  if (bars === 1) {
    if (position === undefined) return bad('position is needed when bars is 1 (a whole number from 0 up to the number of single-hit changes).');
    if (typeof position !== 'number' || !Number.isSafeInteger(position) || position < 0) return bad(`position must be a whole number, 0 or more, got ${JSON.stringify(position)}.`);
  } else if (position !== undefined) {
    return bad('position only applies when bars is 1.');
  }
  const overrides = validateOverrides(raw.overrides, bars);
  if (typeof overrides === 'string') return bad(overrides);
  return { ok: true, value: { kind: 'morph', a: raw.a as string, b: raw.b as string, bars, order: order as MorphOrder, seed, ...(bars === 1 ? { position: position as number } : {}), ...(overrides ? { overrides } : {}) } };
}

/** What the morph strip writes: the position only while bars = 1 (0 when it was not there), never otherwise. Pure; the strip and the write both go through it, so a note never holds a position it ignores. */
export function normalizeMorph(p: MorphPhrase): MorphPhrase {
  const { position, ...rest } = p;
  return p.bars === 1 ? { ...rest, position: position ?? 0 } : rest;
}
/** The seed the strip writes: a whole number, 0 or more. Anything that is not a number is 0. */
export function clampMorphSeed(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return MORPH_DEFAULTS.seed;
  return Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.round(n)));
}
/** The position the strip writes: a whole number from 0 to the number of changes (`d`). */
export function clampMorphPosition(n: number, d: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  return Math.min(Math.max(0, Math.round(d)), Math.max(0, Math.round(n)));
}

/** How many single-hit edits turn bar `a` into bar `b`: the cells (channel, step) that have a hit in exactly one of them. The ENGINE decides the order and applies them (`morph_rhythm_info`); this count is
 *  the one rule mirrored here (so "Atomic" and the Position slider need no engine call), and a real-engine sweep (phrase-morph-engine.test.ts) pins it to the engine's own `d`. */
export function morphEditCount(a: RhythmData, b: RhythmData): number {
  const hit = (v: unknown): boolean => v !== false && v !== 0 && v !== null && v !== undefined;
  const names = Array.from(new Set([...Object.keys(a.channels), ...Object.keys(b.channels)]));
  let d = 0;
  for (const name of names) {
    const ra = a.channels[name] as unknown[] | undefined; const rb = b.channels[name] as unknown[] | undefined;
    for (let i = 0; i < a.steps; i++) if (hit(ra?.[i]) !== hit(rb?.[i])) d++;
  }
  return d;
}

/** What the control strip writes: bars as a whole number in range, the percentage in range. Anything that is not a number is the default. */
export function clampPhraseBars(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return PHRASE_DEFAULTS.bars;
  return Math.min(PHRASE_BARS_MAX, Math.max(PHRASE_BARS_MIN, Math.round(n)));
}
export function clampPhrasePct(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return PHRASE_DEFAULTS.tempo_change_pct;
  return Math.min(PHRASE_PCT_MAX, Math.max(PHRASE_PCT_MIN, n));
}

/** The `kind` a phrase note says it is, even when the rest of it is wrong (a mix with weight 3 is still a mix, and its strip should say what is wrong with it). `null` = it does not say. */
export function readPhraseKind(text: string): PhraseParams['kind'] | null {
  const fm = parseFrontmatter(text);
  if (!fm) return null;
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return null;
  try {
    const kind = (JSON.parse(text.slice(block.contentStart, block.contentEnd)) as { kind?: unknown } | null)?.kind;
    return kind === 'mix' || kind === 'extend' || kind === 'morph' || kind === 'transform' ? kind : null;
  } catch {
    return null;
  }
}

/** What the mix sliders write: into 0..1 and to two decimals (so a note never holds 0.30000000000000004). Anything that is not a number is the default. */
export function clampMixUnit(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return MIX_DEFAULTS.weight;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** The stop of the path a weight shows (2026-10-26-0900): k = round-half-up((1 - weight) * d) single-hit changes applied, weight 1 = bar a (k = 0), weight 0 = bar b (k = d). Integer arithmetic on the weight in millionths, so a
 *  weight like 0.45 is exact (1 - 0.45 is 0.5499999999999999 in floats). The plugin's engine glue (`_forge_mix_path` in pyodide-host.ts) computes the SAME rule; a real-engine sweep pins the two together. */
export function pathStopOf(weight: number, d: number): number {
  if (!(d > 0) || typeof weight !== 'number' || Number.isNaN(weight)) return 0;
  const w = Math.round(Math.min(1, Math.max(0, weight)) * 1e6);
  return Math.min(Math.round(d), Math.max(0, Math.floor(((1e6 - w) * Math.round(d) + 5e5) / 1e6)));
}
/** The weight a stop writes: 1 - j/d to FOUR decimals (so a note never holds 0.30000000000000004, and every stop of a path of up to hundreds of changes lands back on itself: two decimals would lose stops past d = 100). */
export function pathWeightFor(stop: number, d: number): number {
  if (!(d > 0)) return 1;
  const j = Math.min(Math.round(d), Math.max(0, Math.round(stop)));
  return Number((1 - j / Math.round(d)).toFixed(4));
}
/** What the mix strip writes when the mode changes: path mode carries its order and seed (the morph's defaults when it had none), vote mode carries neither; a mix with no mode stays one with no mode. */
export function normalizeMix(p: MixPhrase): MixPhrase {
  const { order, seed, ...rest } = p;
  return p.mode === 'path' ? { ...rest, mode: 'path', order: order ?? MORPH_DEFAULTS.order, seed: seed ?? MORPH_DEFAULTS.seed } : rest;
}

/** The one line under the mix strip: what the current settings do, in plain words, with the numbers that are on the sliders. In path mode `d` (the number of single-hit changes between the two bars, `null`/absent while it
 *  is not known yet) names the stop the Weight shows. */
export function mixSentence(p: MixPhrase, d?: number | null): string {
  const bars = p.a === p.b ? `${p.a} and itself` : `${p.a} and ${p.b}`;
  if (p.mode === 'path') {
    const order = morphOrderWords({ order: p.order ?? MORPH_DEFAULTS.order, seed: p.seed ?? MORPH_DEFAULTS.seed });
    if (d === undefined || d === null) return `Mix of ${bars}, path (${order}).`;
    const base = `Mix of ${bars}, path: ${pathStopOf(p.weight, d)} of ${d} single-hit change${d === 1 ? '' : 's'} (${order}).`;
    return d === 0 ? `${base.slice(0, -1)}; the two bars are the same, so there is nothing to walk.` : base;
  }
  const base = `Mix of ${bars}: ${Math.round(p.weight * 100)} % ${p.a}; a hit appears where the weights say it should (threshold ${p.threshold.toFixed(2)}).`;
  return p.ghost ? `${base} Ghost notes: quiet extra hits where the weights come close.` : base;
}

const ORDER_WORDS: Record<MorphOrder, string> = { musical: 'musical order', seeded: 'seeded order', by_channel: 'by-channel order' };
/** The order in plain words, as the sentence and the Inspector both say it: "musical order", "seeded order, seed 3", "by-channel order". */
export function morphOrderWords(p: Pick<MorphPhrase, 'order' | 'seed'>): string {
  return p.order === 'seeded' ? `${ORDER_WORDS.seeded}, seed ${p.seed}` : ORDER_WORDS[p.order];
}
/** The one line under the morph strip, with the numbers that are on the controls. `d` = the number of single-hit changes between the two bars, `null` while it is not known yet (then the line leaves it out). */
export function morphSentence(p: MorphPhrase, d: number | null): string {
  const order = morphOrderWords(p);
  const changes = (n: number): string => `${n} single-hit change${n === 1 ? '' : 's'}`;
  const from = `Morph from ${p.a} to ${p.b}`;
  if (p.bars === 1) {
    const at = p.position ?? 0;
    return d === null ? `${from}: one bar, at step ${at} (${order}).` : `${from}: one bar, after ${at} of ${changes(d)} (${order}).`;
  }
  const bars = `${p.bars} bars`;
  return d === null ? `${from} in ${bars} (${order}).` : `${from} in ${bars}: ${changes(d)} (${order}).`;
}

/** A phrase note's text -> its parameters. The note must be an editable (not read_only) `type: data`, `content_type: json` note holding exactly one json block. */
export function readPhraseNote(text: string): Validation<PhraseParams> {
  const fm = parseFrontmatter(text);
  if (!fm) return { ok: false, message: 'The note has no frontmatter, so it is not a data note.' };
  const problem = editabilityProblem(fm.fields);
  if (problem) return { ok: false, message: problem };
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd));
  } catch (e) {
    return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` };
  }
  return validatePhrase(parsed);
}

/** One transform op as the json text shows it, on one line: {"op": "thin_out", "first": 3, "last": 5, "row": "kick", "amount": 0.5}. */
export function formatTransformOp(o: TransformOp): string {
  const parts = [`"op": ${JSON.stringify(o.op)}`, `"first": ${o.first}`, `"last": ${o.last}`];
  if (o.row !== undefined) parts.push(`"row": ${JSON.stringify(o.row)}`);
  if (o.op === 'double_up') parts.push(`"grid": ${o.grid}`);
  else {
    parts.push(`"amount": ${o.amount}`);
    if (o.keep === 'seeded') parts.push(`"keep": "seeded"`, `"seed": ${o.seed ?? 0}`);
  }
  return `{${parts.join(', ')}}`;
}

/** The block's text, field order as in the design. */
export function formatPhraseJson(p: PhraseParams): string {
  if (p.kind === 'mix') {
    return [
      '{',
      `  "kind": "mix",`,
      `  "a": ${JSON.stringify(p.a)},`,
      `  "b": ${JSON.stringify(p.b)},`,
      `  "weight": ${p.weight},`,
      `  "threshold": ${p.threshold},`,
      `  "ghost": ${p.ghost}${p.mode !== undefined ? ',' : ''}`,
      ...(p.mode !== undefined ? [`  "mode": ${JSON.stringify(p.mode)}${p.mode === 'path' ? ',' : ''}`] : []),
      ...(p.mode === 'path' ? [`  "order": ${JSON.stringify(p.order ?? MORPH_DEFAULTS.order)},`, `  "seed": ${p.seed ?? MORPH_DEFAULTS.seed}`] : []),
      '}',
    ].join('\n');
  }
  if (p.kind === 'transform') {
    const oneOp = formatTransformOp;
    return [
      '{',
      `  "kind": "transform",`,
      `  "source": ${JSON.stringify(p.source)},`,
      '  "ops": [',
      ...p.ops.map((o, i) => `    ${oneOp(o)}${i < p.ops.length - 1 ? ',' : ''}`),
      `  ]${p.overrides ? ',' : ''}`,
      ...(p.overrides ? ['  "overrides": {', ...Object.keys(p.overrides).sort((x, y) => Number(x) - Number(y)).map((k, i, all) => `    ${JSON.stringify(k)}: ${JSON.stringify(p.overrides![k])}${i < all.length - 1 ? ',' : ''}`), '  }'] : []),
      '}',
    ].join('\n');
  }
  if (p.kind === 'morph') {
    return [
      '{',
      `  "kind": "morph",`,
      `  "a": ${JSON.stringify(p.a)},`,
      `  "b": ${JSON.stringify(p.b)},`,
      `  "bars": ${p.bars},`,
      `  "order": ${JSON.stringify(p.order)},`,
      `  "seed": ${p.seed}${p.position !== undefined || p.overrides ? ',' : ''}`,
      ...(p.position !== undefined ? [`  "position": ${p.position}${p.overrides ? ',' : ''}`] : []),
      ...(p.overrides ? ['  "overrides": {', ...Object.keys(p.overrides).sort((x, y) => Number(x) - Number(y)).map((k, i, all) => `    ${JSON.stringify(k)}: ${JSON.stringify(p.overrides![k])}${i < all.length - 1 ? ',' : ''}`), '  }'] : []),
      '}',
    ].join('\n');
  }
  return [
    '{',
    `  "kind": ${JSON.stringify(p.kind)},`,
    `  "source": ${JSON.stringify(p.source)},`,
    `  "bars": ${p.bars},`,
    `  "style": ${JSON.stringify(p.style)},`,
    `  "tempo_change_pct": ${p.tempo_change_pct}${p.overrides ? ',' : ''}`,
    ...(p.overrides ? ['  "overrides": {', ...Object.keys(p.overrides).sort((x, y) => Number(x) - Number(y)).map((k, i, all) => `    ${JSON.stringify(k)}: ${JSON.stringify(p.overrides![k])}${i < all.length - 1 ? ',' : ''}`), '  }'] : []),
    '}',
  ].join('\n');
}

/** A control-strip edit, as a pure rewrite of the note's CURRENT text: only the json block's content changes, every other byte (frontmatter, line endings) is kept. Refused for a note that
 *  is not an editable data note (including `read_only: true`, constitution D7). The caller runs it inside one atomic read-modify-write. */
export function applyPhraseWrite(currentText: string, p: PhraseParams, name?: string): { ok: true; text: string } | { ok: false; message: string } {
  const fm = parseFrontmatter(currentText);
  if (!fm) return { ok: false, message: 'Not saved: the note has no frontmatter, so it is not a data note.' };
  const problem = editabilityProblem(fm.fields);
  if (problem) return { ok: false, message: `Not saved: ${problem}` };
  const block = extractPhraseJsonBlock(currentText);
  if (block.ok === false) return { ok: false, message: `Not saved: ${block.message}` };
  const json = formatPhraseJson(p).replace(/\n/g, block.eol);
  const text = currentText.slice(0, block.contentStart) + json + currentText.slice(block.contentEnd);
  // 2026-10-26-1260: with the note's name, the derived parts (description, links, Description / Recipe / Bars made) are regenerated from the params just written, so they never disagree with the json. Without it: the fence only, as before.
  if (name === undefined) return { ok: true, text };
  const again = extractPhraseJsonBlock(text);
  return { ok: true, text: again.ok ? renderPhraseNote(text, name, p, again.fenceStart) : text };
}

/** "Refresh note links" on one phrase note: its derived parts regenerated from its json (the fence and its trailing bytes untouched). Idempotent: `changed` is false when nothing differs. Refuses a note it cannot read, with the reason. */
export function refreshPhraseNoteText(text: string, name: string): { ok: true; text: string; changed: boolean } | { ok: false; message: string } {
  const read = readPhraseNote(text);
  if (read.ok === false) return { ok: false, message: read.message };
  const block = extractPhraseJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  const next = renderPhraseNote(text, name, read.value, block.fenceStart);
  return { ok: true, text: next, changed: next !== text };
}

/** The starter content of a new phrase: the defaults, the source named. Its description, links and derived sections come from the json (phrase-notes-core.ts); the description is a double-quoted scalar (a JSON string is a YAML one). */
export function phraseNoteContent(name: string, source: string): string {
  const p: ExtendPhrase = { kind: 'extend', source, ...PHRASE_DEFAULTS };
  return noteContentFor(name, p);
}

/** The note text for any phrase value: the json fence last, the derived Description / Recipe / links above it (phrase-notes-core.ts). The ONE place a new phrase note is made, whoever asks: the starters below, and a sentence
 *  (2026-10-27-1015), so a note made from a sentence is byte for byte the note the controls would have made for the same value. */
export function noteContentFor(name: string, p: PhraseParams, extraFront: string[] = []): string {
  return newPhraseNote(name, p, formatPhraseJson(p), extraFront);
}

/** The starter content of a new mix (2026-10-26-0900): a PATH mix, explicit in its JSON (mode, order, seed), starting at weight 1 = all of bar a (stop 0, a stop for any d); threshold and ghost take the vote's defaults (kept, ignored in
 *  path mode, there when the person switches to Vote). */
export function mixNoteContent(name: string, a: string, b: string): string {
  return noteContentFor(name, starterMix(a, b));
}

/** The starter VALUE of a new mix (see mixNoteContent): what a sentence's mix starts from before the plan's own numbers are laid over it. */
export function starterMix(a: string, b: string): MixPhrase {
  return { kind: 'mix', a, b, ...MIX_DEFAULTS, weight: 1, mode: 'path', order: MORPH_DEFAULTS.order, seed: MORPH_DEFAULTS.seed };
}

/** The starter content of a new morph: the defaults, the two bars named. `bars` replaces the default. `from` (the mix it was made from, "Turn this mix into a morph") is a `made_from` wikilink property (the graph ties the morph to its mix); the description is derived from the json alone (2026-10-26-1260). */
export function morphNoteContent(name: string, a: string, b: string, made: { from?: string; bars?: number } = {}): string {
  const p: MorphPhrase = { kind: 'morph', a, b, ...MORPH_DEFAULTS, ...(made.bars !== undefined ? { bars: made.bars } : {}) };
  return noteContentFor(name, p, made.from ? [`made_from: ${JSON.stringify(`[[${made.from}]]`)}`] : []);
}

/** The starter content of a new transform phrase (2026-10-27-1030): the source phrase named, the ops as given. Made by the same note builder as every other kind. */
export function transformNoteContent(name: string, source: string, ops: TransformOp[]): string {
  return noteContentFor(name, { kind: 'transform', source, ops });
}

/** A new transform phrase note for a notebook cell: the value is checked first (a plan that does not validate is never a note), then the next free `phrase_NNN` as for every other kind. */
export function planNewTransform(input: { source: string; ops: TransformOp[]; existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): NewPhrasePlan {
  const valid = validatePhrase({ kind: 'transform', source: input.source, ops: input.ops });
  if (valid.ok === false) return { ok: false, message: `Notebook: ${valid.message}` };
  return planNewPhraseFromParams({ params: valid.value, existingBasenames: input.existingBasenames, exists: input.exists, attempts: input.attempts });
}

export function phraseName(n: number): string {
  return `phrase_${String(n).padStart(3, '0')}`;
}
export function phrasePath(name: string): string {
  return `${PHRASE_FOLDER}/${name}.md`;
}
export function phraseSourcePath(source: string): string {
  return `${BAR_FOLDER}/${source}.md`;
}
/** One past the highest `phrase_NNN` (not the first gap); names that do not look like that are ignored. */
export function nextPhraseName(existingBasenames: Iterable<string>): string {
  let max = 0;
  for (const b of existingBasenames) {
    const m = PHRASE_NAME.exec(b);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return phraseName(max + 1);
}
/** Is this path a phrase (`phrases/phrase_NNN.md`, directly in the folder)? The folder's README and anything else is not. */
export function isPhrasePath(path: string | null | undefined): boolean {
  return typeof path === 'string' && PHRASE_PATH.test(path);
}
/** Is this path a bar (`bars/bar_NNN.md`, directly in the folder)? */
export function isBarPath(path: string | null | undefined): boolean {
  return sourceBarName(path) !== null;
}
/** The bar's name when `path` is a bar (`bars/bar_NNN.md`, directly in the folder), else null. */
export function sourceBarName(path: string | null | undefined): string | null {
  if (typeof path !== 'string') return null;
  const m = BAR_PATH.exec(path);
  return m ? m[1] : null;
}

/** Is "New phrase from this bar" offered? Only in a score-first vault, and only while the active file is a bar. Everywhere else it does not exist (not hidden — absent). */
export function newPhraseAvailable(input: { scoreFirst: boolean; activePath: string | null | undefined }): boolean {
  return input.scoreFirst === true && sourceBarName(input.activePath) !== null;
}

export type NewPhrasePlan = { ok: true; name: string; path: string; content: string; notice?: string } | { ok: false; message: string };

/** The first free `phrase_NNN` (from a listing and an existence check), with its content made by `content(name)`. The one name-picking rule for every kind of phrase. */
function planPhraseNote(input: { existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }, content: (name: string) => string): NewPhrasePlan {
  const taken = new Set(input.existingBasenames);
  const attempts = input.attempts ?? 3;
  for (let i = 0; i < attempts; i++) {
    const name = nextPhraseName(taken);
    const path = phrasePath(name);
    if (!input.exists(path)) return { ok: true, name, path, content: content(name) };
    taken.add(name);
  }
  return { ok: false, message: `Could not find a free phrase name in ${PHRASE_FOLDER}/ — try again.` };
}

export function planNewPhrase(input: { activePath: string | null | undefined; existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): NewPhrasePlan {
  const source = sourceBarName(input.activePath);
  if (source === null) return { ok: false, message: `New phrase: open a bar from ${BAR_FOLDER}/ first (the note you are on is not a bar).` };
  return planPhraseNote(input, (name) => phraseNoteContent(name, source));
}

/** Is "New mix from this bar" offered? Under exactly the conditions of "New phrase from this bar": a score-first vault, and the active file is a bar. */
export function newMixAvailable(input: { scoreFirst: boolean; activePath: string | null | undefined }): boolean {
  return newPhraseAvailable(input);
}

/** "New mix from this bar": `a` is the bar you are on, `b` the first OTHER bar by number (or the same bar, with a notice saying there is only one). */
export function planNewMix(input: { activePath: string | null | undefined; existingBasenames: Iterable<string>; exists: (path: string) => boolean; barBasenames: Iterable<string>; attempts?: number }): NewPhrasePlan {
  const a = sourceBarName(input.activePath);
  if (a === null) return { ok: false, message: `New mix: open a bar from ${BAR_FOLDER}/ first (the note you are on is not a bar).` };
  const others = [...input.barBasenames].filter((n) => BAR_NAME.test(n) && n !== a).sort((x, y) => Number(BAR_NAME.exec(x)![1]) - Number(BAR_NAME.exec(y)![1]));
  const b = others.length > 0 ? others[0] : a;
  const plan = planPhraseNote(input, (name) => mixNoteContent(name, a, b));
  if (plan.ok && b === a) return { ...plan, notice: `There is only one bar in ${BAR_FOLDER}/ (${a}), so this mix is ${a} with itself. Make another bar, then pick it in the b list.` };
  return plan;
}

/** Is "New morph from this bar" offered? Under exactly the conditions of "New mix from this bar": a score-first vault, and the active file is a bar. */
export function newMorphAvailable(input: { scoreFirst: boolean; activePath: string | null | undefined }): boolean {
  return newPhraseAvailable(input);
}

/** "New morph from this bar": `a` is the bar you are on, `b` the first OTHER bar by number (or the same bar, with a notice saying there is only one). */
export function planNewMorph(input: { activePath: string | null | undefined; existingBasenames: Iterable<string>; exists: (path: string) => boolean; barBasenames: Iterable<string>; attempts?: number }): NewPhrasePlan {
  const a = sourceBarName(input.activePath);
  if (a === null) return { ok: false, message: `New morph: open a bar from ${BAR_FOLDER}/ first (the note you are on is not a bar).` };
  const others = [...input.barBasenames].filter((n) => BAR_NAME.test(n) && n !== a).sort((x, y) => Number(BAR_NAME.exec(x)![1]) - Number(BAR_NAME.exec(y)![1]));
  const b = others.length > 0 ? others[0] : a;
  const plan = planPhraseNote(input, (name) => morphNoteContent(name, a, b));
  if (plan.ok && b === a) return { ...plan, notice: `There is only one bar in ${BAR_FOLDER}/ (${a}), so this morph is ${a} to itself. Make another bar, then pick it in the b list.` };
  return plan;
}

/** A new phrase note for a value that is already decided (a sentence's plan, 2026-10-27-1015): the next free name from the listing, the same content the starters make. */
export function planNewPhraseFromParams(input: { params: PhraseParams; existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): NewPhrasePlan {
  return planPhraseNote(input, (name) => noteContentFor(name, input.params));
}

export interface NewPhrasePorts<F> {
  /** The path of the note the person is on right now. */
  activePath(): string | null;
  folderExists(): boolean;
  createFolder(): Promise<void>;
  /** Basenames in `phrases/` right now (fresh on every call: a retry must see the phrase that just took the name). */
  listPhraseBasenames(): string[];
  exists(path: string): boolean;
  create(path: string, content: string): Promise<F>;
  open(file: F): Promise<void>;
  notify(message: string): void;
  /** Obsidian's refusal to create a file that is already there. */
  isAlreadyExists(e: unknown): boolean;
}

export type NewPhraseResult = { ok: true; path: string } | { ok: false; message: string };

export interface NewMixPorts<F> extends NewPhrasePorts<F> {
  /** Basenames in `bars/` right now. */
  listBarBasenames(): string[];
}

/** The create-and-open loop shared by every kind of new phrase: make `phrases/` if missing, pick the next free name from a FRESH listing, create the note, open it. Every failure is a notice
 *  naming the reason, plus a `console.error` naming `fn` for a caught error. `plan` is asked with the live listing on every attempt. */
async function createPhraseNote<F>(ports: NewPhrasePorts<F>, how: { fn: string; noun: string; plan(existingBasenames: string[], exists: (path: string) => boolean): NewPhrasePlan }): Promise<NewPhraseResult> {
  const fail = (message: string): NewPhraseResult => { ports.notify(message); return { ok: false, message }; };
  try {
    const first = how.plan([], () => false);
    if (first.ok === false) return fail(first.message);               // not on a bar: say so before touching the vault
    if (!ports.folderExists()) {
      try { await ports.createFolder(); } catch (e) { if (!ports.isAlreadyExists(e)) throw e; }
    }
    for (let attempt = 0; attempt < 3; attempt++) {
      const plan = how.plan(ports.listPhraseBasenames(), (p) => ports.exists(p));
      if (plan.ok === false) return fail(plan.message);
      let file: F;
      try {
        file = await ports.create(plan.path, plan.content);
      } catch (e) {
        if (ports.isAlreadyExists(e)) continue;
        throw e;
      }
      if (plan.notice) ports.notify(plan.notice);
      await ports.open(file);
      return { ok: true, path: plan.path };
    }
    return fail(`Could not make a new ${how.noun}: the name kept being taken. Try again.`);
  } catch (e) {
    console.error(`${how.fn} failed`, e);
    return fail(`Could not make a new ${how.noun}: ${(e as Error)?.message ?? e}`);
  }
}

/** The create-and-open loop for a value that is already decided: what "Create" does after a sentence was planned. Same loop, same notices, same failure handling as every other new phrase. */
export function createNewPhraseFromParams<F>(ports: NewPhrasePorts<F>, params: PhraseParams): Promise<NewPhraseResult> {
  return createPhraseNote(ports, { fn: 'createNewPhraseFromParams', noun: 'phrase', plan: (existingBasenames, exists) => planNewPhraseFromParams({ params, existingBasenames, exists }) });
}

/** The whole "New phrase from this bar" action with the vault and the UI injected (same shape as `createNewBar`). */
export function createNewPhrase<F>(ports: NewPhrasePorts<F>): Promise<NewPhraseResult> {
  return createPhraseNote(ports, { fn: 'createNewPhrase', noun: 'phrase', plan: (existingBasenames, exists) => planNewPhrase({ activePath: ports.activePath(), existingBasenames, exists }) });
}

/** The whole "New morph from this bar" action: the same loop, the note is a morph from this bar to the first other one. */
export function createNewMorph<F>(ports: NewMixPorts<F>): Promise<NewPhraseResult> {
  return createPhraseNote(ports, {
    fn: 'createNewMorph',
    noun: 'morph',
    plan: (existingBasenames, exists) => planNewMorph({ activePath: ports.activePath(), existingBasenames, exists, barBasenames: ports.listBarBasenames() }),
  });
}

/** The whole "New mix from this bar" action: the same loop, the note is a mix of this bar and the first other one. */
export function createNewMix<F>(ports: NewMixPorts<F>): Promise<NewPhraseResult> {
  return createPhraseNote(ports, {
    fn: 'createNewMix',
    noun: 'mix',
    plan: (existingBasenames, exists) => planNewMix({ activePath: ports.activePath(), existingBasenames, exists, barBasenames: ports.listBarBasenames() }),
  });
}

// ---- "Turn this mix into a morph" (drain 2026-10-25-1000) -------------------------------------------------------------------------------------------------------------------------------------
// A mix is a weighted vote with about two visible states; the morph has the granular path (one single-hit change per bar). This is the one gesture from the first to the second: it makes the next free
// `phrases/phrase_NNN.md` of kind "morph" with the mix's two bars, musical order, seed 0 and Bars = d + 1 (the Atomic rule), and opens it. The mix is only READ, never written.

/** Is "Turn this mix into a morph" offered? In a score-first vault, and only while the active tab shows a mix phrase (its Score tab or its text). Everywhere else it does not exist for the person. */
export function turnMixIntoMorphAvailable(input: { scoreFirst: boolean; kind: PhraseParams['kind'] | null | undefined }): boolean {
  return input.scoreFirst === true && input.kind === 'mix';
}

/** The Bars of the morph made from a mix whose bars are `d` single-hit changes apart: d + 1 (every bar one hit from the last: the Atomic rule), at most 64; 5 (the morph's default) when there is nothing to morph. */
export function morphBarsFor(d: number): number {
  if (!Number.isFinite(d) || d <= 0) return MORPH_DEFAULTS.bars;
  return Math.min(PHRASE_BARS_MAX, Math.round(d) + 1);
}

/** The new morph note for a mix: its `a` and `b`, musical order, seed 0, `bars` from `d`; the next free name. The mix's vote settings (weight, threshold, ghost) are not carried. */
export function planMorphFromMix(input: { mixName: string; mix: MixPhrase; d: number; existingBasenames: Iterable<string>; exists: (path: string) => boolean; attempts?: number }): NewPhrasePlan {
  return planPhraseNote(input, (name) => morphNoteContent(name, input.mix.a, input.mix.b, { from: input.mixName, bars: morphBarsFor(input.d) }));
}

export interface TurnMixPorts<F> extends NewPhrasePorts<F> {
  /** A vault note's text by path, FRESH on every call (the mix note and its two bars). Rejects when the note is not there. */
  readNote(path: string): Promise<string>;
  /** The ENGINE's count of the single-hit changes between two bars (`morph_rhythm_info`): never a copy of its rule. Rejects when the engine cannot be asked or refuses the pair. */
  changes(a: RhythmData, b: RhythmData, order: MorphOrder, seed: number): Promise<number>;
  /** The evidence line. */
  trace?(line: string): void;
}

const TURN_FAIL = 'Could not turn this mix into a morph';

/** "Turn this mix into a morph" with the vault, the engine and the UI injected. `activePath()` is the mix note's path (the caller names it: the active tab's, or the button's own tab's). Every failure is ONE Notice
 *  naming the reason (and a `console.error` naming this function for a caught error); nothing is created, opened or traced for a turn that did not happen. */
export async function turnMixIntoMorph<F>(ports: TurnMixPorts<F>): Promise<NewPhraseResult> {
  const refuse = (message: string): NewPhraseResult => { ports.notify(message); return { ok: false, message }; };
  const path = ports.activePath();
  if (typeof path !== 'string' || !isPhrasePath(path)) return refuse('Turn this mix into a morph: open a mix phrase first (the note you are on is not a phrase).');
  const mixName = path.slice(PHRASE_FOLDER.length + 1).replace(/\.md$/, '');
  let mix: MixPhrase;
  let dataA: RhythmData; let dataB: RhythmData;
  try {
    let text: string;
    try { text = await ports.readNote(path); } catch (e) { console.error('turnMixIntoMorph: could not read the mix', e); return refuse(`${TURN_FAIL}: the mix ${mixName} (${path}) could not be read (${(e as Error)?.message ?? e}).`); }
    const read = readPhraseNote(text);
    if (read.ok === false) {
      const kind = readPhraseKind(text);
      return refuse(kind !== null && kind !== 'mix' ? `Turn this mix into a morph: ${mixName} is a ${kind} phrase, not a mix.` : `Turn this mix into a morph: ${mixName} is not usable: ${read.message}`);
    }
    if (read.value.kind !== 'mix') return refuse(`Turn this mix into a morph: ${mixName} is a ${read.value.kind} phrase, not a mix.`);
    mix = read.value;
    const bar = async (name: string): Promise<RhythmData | string> => {
      const barPath = phraseSourcePath(name);
      let barText: string;
      try { barText = await ports.readNote(barPath); } catch (e) { return `the bar ${name} (${barPath}) was not found or could not be read (${(e as Error)?.message ?? e}).`; }
      const r = readRhythmNote(barText);
      return r.ok === false ? `the bar ${name} is not usable: ${r.message}` : r.value.data;
    };
    const a = await bar(mix.a); const b = await bar(mix.b);
    if (typeof a === 'string') return refuse(`${TURN_FAIL}: ${a}`);
    if (typeof b === 'string') return refuse(`${TURN_FAIL}: ${b}`);
    dataA = a; dataB = b;
  } catch (e) {
    console.error('turnMixIntoMorph failed', e);
    return refuse(`${TURN_FAIL}: ${(e as Error)?.message ?? e}`);
  }
  let d: number;
  try {
    d = await ports.changes(dataA, dataB, MORPH_DEFAULTS.order, MORPH_DEFAULTS.seed);
  } catch (e) {
    console.error('turnMixIntoMorph: the engine could not count the changes', e);
    const msg = String((e as Error)?.message ?? e);
    const engineSays = /morph_rhythm\w*: [^\n]*/.exec(msg)?.[0].replace(/\s+$/, '');
    return refuse(`${TURN_FAIL}: ${engineSays ?? `the engine could not be asked (${msg.split('\n')[0]})`}`);
  }
  if (typeof d !== 'number' || !Number.isFinite(d) || d < 0) return refuse(`${TURN_FAIL}: the engine did not say how many changes lie between ${mix.a} and ${mix.b}.`);
  const made = await createPhraseNote(ports, {
    fn: 'turnMixIntoMorph',
    noun: 'morph',
    plan: (existingBasenames, exists) => planMorphFromMix({ mixName, mix, d, existingBasenames, exists }),
  });
  if (made.ok) ports.trace?.(`[forge-morph] turned ${mixName} (mix) into ${made.path.slice(PHRASE_FOLDER.length + 1).replace(/\.md$/, '')} (morph, bars ${morphBarsFor(d)}, d ${d})`);
  return made;
}

export interface PhraseScoreDeps {
  /** The text of a vault note by path (fresh on every call). Rejects when the note is not there. */
  readNote(path: string): Promise<string>;
  /** Engine: `extend_rhythm` + `rhythm_bars_to_stream` on the source bar's data with the phrase's parameters, as a tagged MusicXML payload. For a MIX the data is the two bars (`{ a, b }`) and the
   *  engine runs `mix_rhythm` + `rhythm_bars_to_stream`. */
  compute(data: RhythmData | MixBars | TransformInput, params: PhraseParams, title: string): Promise<unknown>;
}

/** The Score of a phrase, from the phrase's parameters (already parsed JSON): validate them, read the source bar FRESH from the vault, ask the engine. A phrase that is wrong or whose source is
 *  missing or not rhythm data is a refusal naming why — never a thrown error, never a blank result. Writes nothing. */
export async function producePhrase(deps: PhraseScoreDeps, raw: unknown, title: string): Promise<ScoreOutcome> {
  const valid = validatePhrase(raw);
  if (valid.ok === false) return { kind: 'refusal', message: `Phrase: ${valid.message}` };
  return produceValidated(deps, valid.value, title, []);
}

/** How far a chain of transforms may go (a transform of a transform of ...), and the guard against one that loops back to itself. */
export const TRANSFORM_DEPTH_MAX = 6;

async function produceValidated(deps: PhraseScoreDeps, params: PhraseParams, title: string, chain: string[]): Promise<ScoreOutcome> {
  if (params.kind === 'mix') return produceMix(deps, params, title);
  if (params.kind === 'morph') return produceMorph(deps, params, title);
  if (params.kind === 'transform') return produceTransform(deps, params, title, chain);
  const path = phraseSourcePath(params.source);
  let text: string;
  try {
    text = await deps.readNote(path);
  } catch (e) {
    return { kind: 'refusal', message: `Phrase: the source bar ${params.source} (${path}) was not found or could not be read (${(e as Error)?.message ?? e}).` };
  }
  const bar = readRhythmNote(text);
  if (bar.ok === false) return { kind: 'refusal', message: `Phrase: the source ${params.source} is not usable: ${bar.message}` };
  if (!params.overrides) return computeScore((data, t) => deps.compute(data, params, t), bar.value.data, title);
  // M9: forked bars. The fork notes are read FRESH (a bar edited in the Beat Box is what the phrase shows), checked against the source's grid, and handed to the engine as `override_bars`; the engine
  // glue lays each over the generated bar of that number. A phrase without overrides never reaches this line, so its engine call is exactly what it was.
  const forks = await readForks(deps, params.overrides, bar.value.data, `the source ${params.source}`);
  if (typeof forks === 'string') return { kind: 'refusal', message: `Phrase: ${forks}` };
  const withForks = { ...params, override_bars: forks } as unknown as PhraseParams;
  return computeScore((data, t) => deps.compute(data, withForks, t), bar.value.data, title);
}

/** The data of every fork note of a phrase, by bar number, or the reason one cannot be used (naming the bar and the note). Each distinct note is read once. */
async function readForks(deps: PhraseScoreDeps, overrides: Record<string, string> | undefined, source: RhythmData, sourceLabel: string): Promise<Record<string, RhythmData> | string> {
  const out: Record<string, RhythmData> = {};
  const reads = new Map<string, RhythmData>();
  for (const [n, noteId] of Object.entries(overrides ?? {})) {
    let data = reads.get(noteId);
    if (data === undefined) {
      const path = `${noteId}.md`;
      let text: string;
      try {
        text = await deps.readNote(path);
      } catch (e) {
        return `bar ${n} is forked to ${noteId} (${path}) but that note was not found or could not be read (${(e as Error)?.message ?? e}).`;
      }
      const read = readRhythmNote(text);
      if (read.ok === false) return `bar ${n} is forked to ${noteId} but that note is not usable: ${read.message}`;
      data = read.value.data;
      reads.set(noteId, data);
    }
    const differs = (['time_signature', 'steps', 'group_size'] as const).filter((f) => data![f] !== source[f]);
    if (differs.length > 0) {
      return `bar ${n} (${noteId}) differs from ${sourceLabel} in ${differs.join(' and ')} (it has ${data.time_signature}, ${data.steps} steps, group ${data.group_size}; the phrase has ${source.time_signature}, ${source.steps} steps, group ${source.group_size}).`;
    }
    out[n] = data;
  }
  return out;
}

/** Evidence lines for the mix path in the REAL Obsidian (2026-10-23-0130): the value a mix carries can only be lost at one of three hand-offs — what was written, what the Score re-read from the note, what the engine returned — and
 *  each prints one `[forge-mix]` line with what it saw. Pure formatters (the view prints them); an extend phrase prints nothing. */
const mixFields = (p: MixPhrase): string => `weight=${p.weight} threshold=${p.threshold} ghost=${p.ghost}${p.mode === 'path' ? ` mode=path order=${p.order ?? MORPH_DEFAULTS.order} seed=${p.seed ?? MORPH_DEFAULTS.seed}` : p.mode === 'vote' ? ' mode=vote' : ''}`;
export function mixTraceWritten(p: PhraseParams): string | null {
  return p.kind === 'mix' ? `[forge-mix] wrote a=${p.a} b=${p.b} ${mixFields(p)}` : null;
}
export function mixTraceRead(text: string): string | null {
  if (readPhraseKind(text) !== 'mix') return null;
  const read = readPhraseNote(text);
  if (read.ok === false) return `[forge-mix] Score read a mix note that is not valid: ${read.message}`;
  return read.value.kind === 'mix' ? `[forge-mix] Score read a=${read.value.a} b=${read.value.b} ${mixFields(read.value)}` : null;
}
export function mixTraceEngine(p: PhraseParams, payload: unknown): string | null {
  if (p.kind !== 'mix') return null;
  const head = `[forge-mix] engine asked ${mixFields(p)} ->`;
  if (typeof payload !== 'object' || payload === null) return `${head} no payload`;
  const r = payload as Record<string, unknown>;
  const notes = (xml: unknown): number => (typeof xml === 'string' ? (xml.match(/<note[ >\/]/g) ?? []).length : 0);
  const path = p.mode !== 'path' ? '' : (() => {
    const st = r.path_state as { d?: unknown; k?: unknown } | undefined;
    return st && typeof st.d === 'number' && typeof st.k === 'number' ? `, path ${st.k} of ${st.d} changes` : ', no path state';
  })();
  if (typeof r.multi_staff_content === 'string' && typeof r.kit_content === 'string') return `${head} notes: multi-staff ${notes(r.multi_staff_content)}, kit ${notes(r.kit_content)}${path}`;
  return `${head} notes: single score ${notes(r.content)}${path}`;
}

/** Evidence lines for the morph (M7c): what was written, and what the engine returned. The Score is the bars along the path, so the engine line says how many bars were drawn and how many single-hit changes (d) lie between a and b. */
const morphFields = (p: MorphPhrase): string => `a=${p.a} b=${p.b} bars=${p.bars} order=${p.order} seed=${p.seed}${p.position !== undefined ? ` position=${p.position}` : ''}`;
export function morphTraceWritten(p: PhraseParams): string | null {
  return p.kind === 'morph' ? `[forge-morph] wrote ${morphFields(p)}` : null;
}
export function morphTraceEngine(p: PhraseParams, payload: unknown): string | null {
  if (p.kind !== 'morph') return null;
  const head = `[forge-morph] engine asked ${morphFields(p)} ->`;
  const info = typeof payload === 'object' && payload !== null ? (payload as Record<string, unknown>).morph_info : null;
  if (typeof info !== 'object' || info === null) return `${head} no morph info`;
  const i = info as Record<string, unknown>;
  return `${head} bars ${typeof i.bars === 'number' ? i.bars : '?'}, d ${typeof i.d === 'number' ? i.d : '?'}`;
}

/** The engine's own `morph_rhythm: …` line out of an error (Pyodide hands a Python ValueError over as the whole traceback, whose last line is `ValueError: morph_rhythm: …`). `null` = not a morph_rhythm refusal. */
export function morphRhythmRefusal(message: string): string | null {
  const m = /(?:^|\n)(?:ValueError: )?(morph_rhythm: [^\n]*?)\s*$/.exec(message.trim());
  return m ? m[1] : null;
}

/** The engine's own `thin_out_bars: ...` / `double_up_bars: ...` line out of an error (the ValueError of a row a bar does not have, a range past the bars, a bar on another grid). `null` = not a region-transform refusal. */
export function regionRefusal(message: string): string | null {
  const m = /(?:^|\n)(?:ValueError: )?((?:thin_out_bars|double_up_bars): [^\n]*?)\s*$/.exec(message.trim());
  return m ? m[1] : null;
}

/** The bars a Score payload was drawn from, as the engine laid them out: an extend's, a morph's and a transform's `bars_data`, a mix's one `mixed_bar`. `null` = the payload says none. */
export function barsOfPayload(payload: Record<string, unknown>): RhythmData[] | null {
  if (Array.isArray(payload.bars_data) && payload.bars_data.length > 0) return payload.bars_data as RhythmData[];
  if (payload.mixed_bar && typeof payload.mixed_bar === 'object') return [payload.mixed_bar as RhythmData];
  return null;
}

/** The Score of a TRANSFORM (2026-10-27-1030): the source phrase is read FRESH and drawn by the same code that draws every phrase (so a transform of a morph, a mix, an extend or another transform works); the bars it
 *  made go to the engine with the ops, which change the regions asked for; forks lay over the result. A source that is missing, not a phrase, not drawable, or not as long as an op asks is a refusal naming which. */
async function produceTransform(deps: PhraseScoreDeps, params: TransformPhrase, title: string, chain: string[]): Promise<ScoreOutcome> {
  const name = params.source.replace(/^phrases\//, '');
  if (chain.includes(params.source) || chain.length >= TRANSFORM_DEPTH_MAX) {
    return { kind: 'refusal', message: `Phrase: the transform chain through ${name} loops back or is more than ${TRANSFORM_DEPTH_MAX} deep.` };
  }
  let text: string;
  try {
    text = await deps.readNote(`${params.source}.md`);
  } catch (e) {
    return { kind: 'refusal', message: `Phrase: the source phrase ${name} (${params.source}.md) was not found or could not be read (${(e as Error)?.message ?? e}).` };
  }
  const source = readPhraseNote(text);
  if (source.ok === false) return { kind: 'refusal', message: `Phrase: the source phrase ${name} is not usable: ${source.message}` };
  const made = await produceValidated(deps, source.value, name, [...chain, params.source]);
  if (made.kind !== 'score') return { kind: 'refusal', message: `Phrase: the source phrase ${name} could not be drawn: ${made.message}` };
  const bars = barsOfPayload(made.payload);
  if (bars === null) return { kind: 'refusal', message: `Phrase: the source phrase ${name} gave no bars to change.` };
  for (let i = 0; i < params.ops.length; i++) {
    if (params.ops[i].last > bars.length) {
      return { kind: 'refusal', message: `Phrase: ops[${i}] asks for ${rangeWords(params.ops[i].first, params.ops[i].last)}, but the source phrase ${name} has ${bars.length} bar${bars.length === 1 ? '' : 's'}.` };
    }
  }
  let asked: PhraseParams = params;
  if (params.overrides) {
    const forks = await readForks(deps, params.overrides, bars[0], `the source phrase ${name}`);
    if (typeof forks === 'string') return { kind: 'refusal', message: `Phrase: ${forks}` };
    asked = { ...params, override_bars: forks } as unknown as PhraseParams;
  }
  let refused: string | null = null;
  const outcome = await computeScore(async (_data, t) => {
    try {
      return await deps.compute({ bars }, asked, t);
    } catch (e) {
      const line = regionRefusal((e as Error)?.message ?? String(e));
      if (line !== null) { refused = line; return null; }
      throw e;
    }
  }, bars[0], title);
  if (refused !== null) return { kind: 'refusal', message: `Phrase: ${refused}` };
  return outcome;
}

/** The Score of a morph: both bars read FRESH (one read per distinct bar), then the engine's `morph_rhythm` + `rhythm_bars_to_stream`. A missing or unusable bar is a refusal naming which one (a or b); the engine's own
 *  `morph_rhythm` ValueError (two bars on different grids, a position past the last change) is a refusal line too — the person's data, not a fault. */
async function produceMorph(deps: PhraseScoreDeps, params: MorphPhrase, title: string): Promise<ScoreOutcome> {
  const reads = new Map<string, string>();
  const bars = {} as Record<'a' | 'b', RhythmData>;
  for (const side of ['a', 'b'] as const) {
    const name = params[side];
    const path = phraseSourcePath(name);
    let text = reads.get(path);
    if (text === undefined) {
      try {
        text = await deps.readNote(path);
      } catch (e) {
        return { kind: 'refusal', message: `Phrase: the bar for ${side}, ${name} (${path}), was not found or could not be read (${(e as Error)?.message ?? e}).` };
      }
      reads.set(path, text);
    }
    const bar = readRhythmNote(text);
    if (bar.ok === false) return { kind: 'refusal', message: `Phrase: the bar for ${side}, ${name}, is not usable: ${bar.message}` };
    bars[side] = bar.value.data;
  }
  // Phase B (fork on edit): a bar the person edited is its own note; its data stands in for the generated bar of that number. Read FRESH, checked against bar a's grid, handed to the engine as `override_bars`.
  let asked: PhraseParams = params;
  if (params.overrides) {
    const forks = await readForks(deps, params.overrides, bars.a, `bar a ${params.a}`);
    if (typeof forks === 'string') return { kind: 'refusal', message: `Phrase: ${forks}` };
    asked = { ...params, override_bars: forks } as unknown as PhraseParams;
  }
  let refused: string | null = null;
  const outcome = await computeScore(async (_data, t) => {
    try {
      return await deps.compute({ a: bars.a, b: bars.b }, asked, t);
    } catch (e) {
      const line = morphRhythmRefusal((e as Error)?.message ?? String(e));
      if (line !== null) { refused = line; return null; }
      throw e;
    }
  }, bars.a, title);
  if (refused !== null) return { kind: 'refusal', message: `Phrase: ${refused}` };
  // M7c Phase B: the Inspector derives every bar's state and every hit's parents from the two bars it was made of; they travel with the payload (the renderer ignores the extra key)
  return outcome.kind === 'score' ? { kind: 'score', payload: { ...outcome.payload, forge_morph: { a: bars.a, b: bars.b } } } : outcome;
}

/** M8: the mix Inspector's evidence line — the bar and how many hits it tied to the two bars, or why it could not map the Score (the same reason the Inspector shows). */
export function mixTraceInspector(problems: readonly string[], map: ProvenanceMap): string {
  if (problems.length > 0) return `[forge-mix] inspector could not map the Score: ${problems[0]}`;
  const hits = Object.values(map).filter((p) => p.role === 'mix-hit').length;
  return `[forge-mix] inspector mapped the bar and ${hits} hit${hits === 1 ? '' : 's'}`;
}

/** The engine's own `mix_rhythm: …` line out of an error: Pyodide hands a Python ValueError over as the whole traceback, whose last line is `ValueError: mix_rhythm: …`. `null` = not a mix_rhythm refusal. */
export function mixRhythmRefusal(message: string): string | null {
  const m = /(?:^|\n)(?:ValueError: )?(mix_rhythm: [^\n]*?)\s*$/.exec(message.trim());
  return m ? m[1] : null;
}

/** The Score of a mix: both bars read FRESH (one read per distinct bar), then the engine. A missing or unusable bar is a refusal naming which one (a or b). The engine's own `mix_rhythm` ValueError
 *  (two bars on different grids) is a refusal line too — the person's data, not a fault — while any other engine failure stays an error. */
async function produceMix(deps: PhraseScoreDeps, params: MixPhrase, title: string): Promise<ScoreOutcome> {
  const reads = new Map<string, string>();
  const bars = {} as Record<'a' | 'b', RhythmData>;
  for (const side of ['a', 'b'] as const) {
    const name = params[side];
    const path = phraseSourcePath(name);
    let text = reads.get(path);
    if (text === undefined) {
      try {
        text = await deps.readNote(path);
      } catch (e) {
        return { kind: 'refusal', message: `Phrase: the bar for ${side}, ${name} (${path}), was not found or could not be read (${(e as Error)?.message ?? e}).` };
      }
      reads.set(path, text);
    }
    const bar = readRhythmNote(text);
    if (bar.ok === false) return { kind: 'refusal', message: `Phrase: the bar for ${side}, ${name}, is not usable: ${bar.message}` };
    bars[side] = bar.value.data;
  }
  let refused: string | null = null;
  const outcome = await computeScore(async (_data, t) => {
    try {
      return await deps.compute({ a: bars.a, b: bars.b }, params, t);
    } catch (e) {
      // a vote mix is refused by mix_rhythm, a PATH mix (2026-10-26-0900) by the morph's own functions: both are the person's data (two bars on different grids), not a fault
      const msg = (e as Error)?.message ?? String(e);
      const line = mixRhythmRefusal(msg) ?? morphRhythmRefusal(msg);
      if (line !== null) { refused = line; return null; }
      throw e;
    }
  }, bars.a, title);
  if (refused !== null) return { kind: 'refusal', message: `Phrase: ${refused}` };
  // M8: the Score's inspector derives each hit's parents from the two bars it was made of; they travel with the payload (the renderer ignores the extra key)
  return outcome.kind === 'score' ? { kind: 'score', payload: { ...outcome.payload, forge_mix: { a: bars.a, b: bars.b } } } : outcome;
}

/** What the phrase view hands the live Score: the phrase note's current TEXT (or why it could not be read). The Score parses it itself, so a note that is not valid is the SAME kind of
 *  refusal line as a missing source — one path, one place that says why. The source bar is read only for a phrase that is valid. */
export async function producePhraseNote(deps: PhraseScoreDeps, note: string | { unreadable: string }, title: string): Promise<ScoreOutcome> {
  if (typeof note !== 'string') return { kind: 'refusal', message: `Phrase: the phrase note could not be read (${note.unreadable}).` };
  const read = readPhraseNote(note);
  if (read.ok === false) return { kind: 'refusal', message: `Phrase: ${read.message}` };
  return producePhrase(deps, read.value, title);
}
