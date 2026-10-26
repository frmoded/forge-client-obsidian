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

import { editabilityProblem, extractJsonBlock, parseFrontmatter, readRhythmNote, type RhythmData, type Validation } from './rhythm-edit-core.ts';
import { computeScore, type ScoreOutcome } from './rhythm-score-core.ts';
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
}

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

export type PhraseParams = ExtendPhrase | MixPhrase | MorphPhrase;

/** The two bars a mix reads, as the engine gets them. */
export interface MixBars { a: RhythmData; b: RhythmData }

export const MIX_DEFAULTS = { weight: 0.5, threshold: 0.5, ghost: false };

export const PHRASE_KEYS = ['kind', 'source', 'bars', 'style', 'tempo_change_pct', 'overrides'] as const;
const OVERRIDE_NOTE = /^bars\/bar_\d+$/;
export const MIX_KEYS = ['kind', 'a', 'b', 'weight', 'threshold', 'ghost'] as const;

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
  if (raw.kind !== 'extend') return bad(`kind must be "extend", "mix" or "morph", got ${JSON.stringify(raw.kind)}.`);
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
    if (!/^[1-9]\d*$/.test(key) || Number(key) > bars) return `overrides: "${key}" is not a bar of this phrase (bars 1 to ${bars}).`;
    const v = raw[key];
    if (typeof v !== 'string' || !OVERRIDE_NOTE.test(v)) return `overrides: bar ${key} must name a bar note like bars/bar_009 (no .md), got ${JSON.stringify(v)}.`;
    out[key] = v;
  }
  return out;
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
  return { ok: true, value: { kind: 'mix', a: raw.a as string, b: raw.b as string, weight, threshold, ghost } };
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
  const block = extractJsonBlock(text);
  if (block.ok === false) return null;
  try {
    const kind = (JSON.parse(text.slice(block.contentStart, block.contentEnd)) as { kind?: unknown } | null)?.kind;
    return kind === 'mix' || kind === 'extend' || kind === 'morph' ? kind : null;
  } catch {
    return null;
  }
}

/** What the mix sliders write: into 0..1 and to two decimals (so a note never holds 0.30000000000000004). Anything that is not a number is the default. */
export function clampMixUnit(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return MIX_DEFAULTS.weight;
  return Math.round(Math.min(1, Math.max(0, n)) * 100) / 100;
}

/** The one line under the mix strip: what the current settings do, in plain words, with the numbers that are on the sliders. */
export function mixSentence(p: MixPhrase): string {
  const bars = p.a === p.b ? `${p.a} and itself` : `${p.a} and ${p.b}`;
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
  const block = extractJsonBlock(text);
  if (block.ok === false) return { ok: false, message: block.message };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text.slice(block.contentStart, block.contentEnd));
  } catch (e) {
    return { ok: false, message: `The json block is not valid JSON: ${(e as Error).message}` };
  }
  return validatePhrase(parsed);
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
      `  "ghost": ${p.ghost}`,
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
export function applyPhraseWrite(currentText: string, p: PhraseParams): { ok: true; text: string } | { ok: false; message: string } {
  const fm = parseFrontmatter(currentText);
  if (!fm) return { ok: false, message: 'Not saved: the note has no frontmatter, so it is not a data note.' };
  const problem = editabilityProblem(fm.fields);
  if (problem) return { ok: false, message: `Not saved: ${problem}` };
  const block = extractJsonBlock(currentText);
  if (block.ok === false) return { ok: false, message: `Not saved: ${block.message}` };
  const json = formatPhraseJson(p).replace(/\n/g, block.eol);
  return { ok: true, text: currentText.slice(0, block.contentStart) + json + currentText.slice(block.contentEnd) };
}

/** The starter content of a new phrase: the defaults, the source named. The description is a double-quoted scalar (a JSON string is a YAML one). */
export function phraseNoteContent(name: string, source: string): string {
  const p: ExtendPhrase = { kind: 'extend', source, ...PHRASE_DEFAULTS };
  return [
    '---',
    'type: data',
    'content_type: json',
    `description: ${JSON.stringify(`${name} — ${source} stretched into a longer phrase. Parameters only; the Score is derived from the bar.`)}`,
    '---',
    '',
    '```json',
    formatPhraseJson(p),
    '```',
    '',
  ].join('\n');
}

/** The starter content of a new mix: the defaults, the two bars named. */
export function mixNoteContent(name: string, a: string, b: string): string {
  const p: MixPhrase = { kind: 'mix', a, b, ...MIX_DEFAULTS };
  return [
    '---',
    'type: data',
    'content_type: json',
    `description: ${JSON.stringify(`${name} — a mix of ${a} and ${b}. Parameters only; the Score is derived from the two bars.`)}`,
    '---',
    '',
    '```json',
    formatPhraseJson(p),
    '```',
    '',
  ].join('\n');
}

/** The starter content of a new morph: the defaults, the two bars named. `from` (the mix it was made from, "Turn this mix into a morph") is named in the description; `bars` replaces the default. */
export function morphNoteContent(name: string, a: string, b: string, made: { from?: string; bars?: number } = {}): string {
  const p: MorphPhrase = { kind: 'morph', a, b, ...MORPH_DEFAULTS, ...(made.bars !== undefined ? { bars: made.bars } : {}) };
  return [
    '---',
    'type: data',
    'content_type: json',
    `description: ${JSON.stringify(`${name} — a morph from ${a} to ${b}, one single-hit change at a time${made.from ? ` (made from the mix ${made.from})` : ''}. Parameters only; the Score is derived from the two bars.`)}`,
    '---',
    '',
    '```json',
    formatPhraseJson(p),
    '```',
    '',
  ].join('\n');
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
  compute(data: RhythmData | MixBars, params: PhraseParams, title: string): Promise<unknown>;
}

/** The Score of a phrase, from the phrase's parameters (already parsed JSON): validate them, read the source bar FRESH from the vault, ask the engine. A phrase that is wrong or whose source is
 *  missing or not rhythm data is a refusal naming why — never a thrown error, never a blank result. Writes nothing. */
export async function producePhrase(deps: PhraseScoreDeps, raw: unknown, title: string): Promise<ScoreOutcome> {
  const valid = validatePhrase(raw);
  if (valid.ok === false) return { kind: 'refusal', message: `Phrase: ${valid.message}` };
  const params = valid.value;
  if (params.kind === 'mix') return produceMix(deps, params, title);
  if (params.kind === 'morph') return produceMorph(deps, params, title);
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
  const withForks = { ...params, override_bars: forks } as PhraseParams;
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
const mixFields = (p: MixPhrase): string => `weight=${p.weight} threshold=${p.threshold} ghost=${p.ghost}`;
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
  if (typeof r.multi_staff_content === 'string' && typeof r.kit_content === 'string') return `${head} notes: multi-staff ${notes(r.multi_staff_content)}, kit ${notes(r.kit_content)}`;
  return `${head} notes: single score ${notes(r.content)}`;
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
    asked = { ...params, override_bars: forks } as PhraseParams;
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
      const line = mixRhythmRefusal((e as Error)?.message ?? String(e));
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
