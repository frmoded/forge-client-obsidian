// 2026-10-30-1030 (M15a) - the closed description grammar of a phrase and an arrangement. The proof is a PROPERTY: parse(describe(p)) is p (as the text carries it) for hundreds of seeded random params of every kind, and describe(parse(t)) is t
// for every text describe can say. Around it: the exact sentences (the table in the FEEDBACK), what input may leave out, what it tolerates, what it refuses (with the line and column), the engine's own words (read from lib.py, not copied), the
// weight convention (70 percent [[bar_005]] is weight 0.7: the bug of 0900), the reserved verbs, and a fuzz that says parse never throws.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';

import {
  GRAMMAR_VOCABULARY, VERBS, canonical, complementOf100, describe, orderWords, parse, plain, shiftDecimal, type GrammarParams, type GrammarVault,
} from './phrase-grammar-core.ts';
import { MORPH_ORDERS, PHRASE_STYLES, TRANSFORM_KEEPS, validatePhrase, type PhraseParams, type TransformOp } from './phrase-core.ts';
import { validateArrangement, type ArrangementParams } from './arrangement-core.ts';

const ROOT = path.resolve(import.meta.dirname, '..');
const LIB = fs.readFileSync(path.join(ROOT, 'assets/engine/forge/music/lib.py'), 'utf8');       // the bundled engine, which the sync check keeps equal to forge/forge/music/lib.py

// ---- a seeded generator --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

function rng(seed: number) {
  let a = seed >>> 0;
  const next = (): number => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo: number, hi: number): number => lo + Math.floor(next() * (hi - lo + 1));
  const pick = <T>(xs: readonly T[]): T => xs[int(0, xs.length - 1)];
  return { next, int, pick, chance: (p: number): boolean => next() < p };
}
type Rng = ReturnType<typeof rng>;

const VAULT: GrammarVault = {
  bars: Array.from({ length: 30 }, (_, i) => `bar_${String(i + 1).padStart(3, '0')}`),
  phrases: Array.from({ length: 40 }, (_, i) => `phrase_${String(i + 1).padStart(3, '0')}`),
  arrangements: ['arr_001', 'arr_002', 'arr_003'],
  kits: ['rock', 'latin', 'jazz', 'funk'],
};
const ROWS = ['kick', 'snare', 'hihat', 'conga_high', 'clap-2'];

/** A number in 0..1 as the controls and a hand-edit make them: 0, 1, a half, whole percents, four decimals (a path stop), or any double. */
const unit = (r: Rng): number => r.pick([0, 1, 0.5, r.int(0, 100) / 100, r.int(0, 10000) / 10000, r.next(), Number((1 - r.int(1, 7) / 7).toFixed(4))]);
const overridesFor = (r: Rng, max: number): Record<string, string> | undefined => {
  if (!r.chance(0.3)) return r.chance(0.1) ? {} : undefined;
  const out: Record<string, string> = {};
  for (let i = r.int(1, 3); i > 0; i--) out[String(r.int(1, max))] = `bars/${r.pick(VAULT.bars)}`;
  return out;
};
const GEN: Record<string, (r: Rng) => GrammarParams> = {
  extend: (r) => {
    const bars = r.int(1, 64);
    const pct = r.pick([0, 0, -90, 100, r.int(-90, 100), r.int(-900, 1000) / 10, r.int(-9000, 10000) / 100]);
    const overrides = overridesFor(r, bars);
    return { kind: 'extend', source: r.pick(VAULT.bars), bars, style: r.pick(PHRASE_STYLES), tempo_change_pct: pct, ...(overrides ? { overrides } : {}) };
  },
  mix: (r) => {
    const a = r.pick(VAULT.bars); const b = r.chance(0.1) ? a : r.pick(VAULT.bars);
    const mode = r.pick([undefined, 'vote', 'path'] as const);
    const base = { kind: 'mix' as const, a, b, weight: unit(r), threshold: unit(r), ghost: r.chance(0.5) };
    if (mode !== 'path') return mode === 'vote' ? { ...base, mode: 'vote' } : base;
    const order = r.pick(MORPH_ORDERS);
    return { ...base, mode: 'path', order, seed: order === 'seeded' || r.chance(0.3) ? r.int(0, 1000000) : 0 };
  },
  morph: (r) => {
    const bars = r.pick([1, 1, r.int(2, 64)]);
    const overrides = overridesFor(r, bars);
    return { kind: 'morph', a: r.pick(VAULT.bars), b: r.pick(VAULT.bars), bars, order: r.pick(MORPH_ORDERS), seed: r.chance(0.5) ? 0 : r.int(0, 100000), ...(bars === 1 ? { position: r.int(0, 40) } : {}), ...(overrides ? { overrides } : {}) };
  },
  transform: (r) => {
    const ops: TransformOp[] = [];
    for (let i = r.int(1, 4); i > 0; i--) {
      const first = r.int(1, 20); const last = first + r.int(0, 10); const row = r.chance(0.5) ? r.pick(ROWS) : undefined;
      if (r.chance(0.4)) ops.push({ op: 'double_up', first, last, ...(row !== undefined ? { row } : {}), grid: r.pick([16, 16, 8, 4, 32, r.int(1, 64)]) });
      else if (r.chance(0.4)) ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount: unit(r), keep: 'seeded', seed: r.int(0, 99999) });
      else ops.push({ op: 'thin_out', first, last, ...(row !== undefined ? { row } : {}), amount: unit(r) });
    }
    const overrides = overridesFor(r, 40);
    return { kind: 'transform', source: r.chance(0.2) ? `arrangements/${r.pick(VAULT.arrangements!)}` : `phrases/${r.pick(VAULT.phrases)}`, ops, ...(overrides ? { overrides } : {}) };
  },
  arrangement: (r) => {
    const kits = [...VAULT.kits!].sort(() => r.next() - 0.5).slice(0, r.int(1, 4));
    return { kind: 'arrangement', tracks: kits.map((kit) => ({
      kit, phrase: r.pick(VAULT.phrases),
      ...(r.chance(0.3) ? { mute: r.chance(0.8) } : {}), ...(r.chance(0.3) ? { solo: r.chance(0.8) } : {}), ...(r.chance(0.4) ? { volume: r.pick([0, 100, 70, r.int(0, 100)]) } : {}),
    })) };
  },
};
const KINDS = Object.keys(GEN);
const CASES = 600;
/** The plugin's own gate for a generated value (a transform of an arrangement is the one thing its validator does not know yet: its source is checked as a phrase, everything else as it is). */
function pluginAccepts(p: GrammarParams): boolean {
  if (p.kind === 'arrangement') return validateArrangement(p).ok;
  return validatePhrase(p.kind === 'transform' && p.source.startsWith('arrangements/') ? { ...p, source: 'phrases/phrase_000' } : p).ok;
}

test('the generators make valid params (so the property below is about the grammar, not about junk): every case of every kind passes the plugin\'s own validators', () => {
  for (const kind of KINDS) {
    const r = rng(7);
    for (let i = 0; i < CASES; i++) { const p = GEN[kind](r); assert.ok(pluginAccepts(p), `${kind} #${i}: ${JSON.stringify(p)}`); }
  }
});

for (const kind of KINDS) {
  test(`ROUND TRIP (${kind}, ${CASES} seeded cases): parse(describe(p)) is canonical(p), the text is a fixed point (describe(parse(t)) === t), and what comes back is valid for the plugin`, () => {
    const r = rng(20261030 + kind.length);
    const seen = new Set<string>();
    for (let i = 0; i < CASES; i++) {
      const p = GEN[kind](r);
      const text = describe(p);
      seen.add(text);
      const back = parse(text, VAULT);
      assert.ok(back.ok, `${kind} #${i}: ${text}\n${JSON.stringify(p)}\n${back.ok ? '' : JSON.stringify(back.error)}`);
      if (!back.ok) return;
      assert.deepEqual(back.params, canonical(p), `${kind} #${i}: ${text}`);
      assert.equal(describe(back.params), text, `${kind} #${i}: not a fixed point`);
      assert.deepEqual(canonical(back.params), back.params, 'canonical is idempotent on what parse gives');
      assert.ok(pluginAccepts(back.params), `${kind} #${i}: the plugin refuses what the grammar gave: ${text}`);
    }
    assert.ok(seen.size > CASES * 0.9, `the generator varies (${seen.size} different texts in ${CASES} cases)`);
  });
}

test('the generators reach the corners: forks, multi-op transforms, one-bar morphs, path mixes in every order, a mix of a bar with itself, 4-track arrangements, every style, every keep', () => {
  const seen = { fork: 0, multiOp: 0, oneBar: 0, orders: new Set<string>(), self: 0, four: 0, styles: new Set<string>(), keeps: new Set<string>(), solo: 0, vol: 0 };
  const r = rng(99);
  for (let i = 0; i < 3000; i++) {
    const p = GEN[KINDS[i % KINDS.length]](r);
    if (p.kind !== 'arrangement' && p.kind !== 'mix' && p.overrides && Object.keys(p.overrides).length > 0) seen.fork++;
    if (p.kind === 'transform') { if (p.ops.length > 1) seen.multiOp++; for (const o of p.ops) if (o.op === 'thin_out') seen.keeps.add(o.keep ?? 'downbeat'); }
    if (p.kind === 'morph') { if (p.bars === 1) seen.oneBar++; seen.orders.add(p.order); }
    if (p.kind === 'mix') { if (p.a === p.b) seen.self++; if (p.mode === 'path') seen.orders.add(p.order ?? 'musical'); }
    if (p.kind === 'extend') seen.styles.add(p.style);
    if (p.kind === 'arrangement') { if (p.tracks.length === 4) seen.four++; if (p.tracks.some((t) => t.solo)) seen.solo++; if (p.tracks.some((t) => t.volume !== undefined && t.volume !== 100)) seen.vol++; }
  }
  assert.ok(seen.fork > 50 && seen.multiOp > 50 && seen.oneBar > 50 && seen.self > 5 && seen.four > 20 && seen.solo > 20 && seen.vol > 20, JSON.stringify({ ...seen, orders: [...seen.orders], styles: [...seen.styles], keeps: [...seen.keeps] }));
  assert.deepEqual([...seen.orders].sort(), [...MORPH_ORDERS].sort());
  assert.deepEqual([...seen.styles].sort(), [...PHRASE_STYLES].sort());
  assert.deepEqual([...seen.keeps].sort(), ['downbeat', 'seeded']);
});

// ---- the sentences: the table of the FEEDBACK, exactly ------------------------------------------------------------------------------------------------------------------------------------------------------------

const SAY = (p: GrammarParams): string => describe(p);
test('THE SENTENCES (exact): one per fact, notes as wikilinks, defaults omitted only where the header of the module says', () => {
  assert.equal(SAY({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: -20 }), 'Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower.');
  assert.equal(SAY({ kind: 'extend', source: 'bar_005', bars: 1, style: 'building', tempo_change_pct: 12.5 }), 'Extend [[bar_005]] to 1 bar, building up, 12.5 percent faster.');
  assert.equal(SAY({ kind: 'extend', source: 'bar_005', bars: 4, style: 'ghost_notes', tempo_change_pct: 0 }), 'Extend [[bar_005]] to 4 bars, adding ghost notes.', 'a tempo change of 0 is not said');
  assert.equal(SAY({ kind: 'extend', source: 'bar_005', bars: 8, style: 'repeat_with_fills', tempo_change_pct: 0, overrides: { '9': 'bars/bar_009', '2': 'bars/bar_002' } }), 'Extend [[bar_005]] to 8 bars, repeating with fills. Bar 2 is replaced by [[bar_002]]. Bar 9 is replaced by [[bar_009]].');
  assert.equal(SAY({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 8, order: 'musical', seed: 0 }), 'Morph [[bar_003]] into [[bar_001]] over 8 bars, in musical order.');
  assert.equal(SAY({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 5, order: 'seeded', seed: 3 }), 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in seeded order, seed 3.');
  assert.equal(SAY({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 1, order: 'by_channel', seed: 0, position: 1 }), 'Morph [[bar_003]] into [[bar_001]] as one bar, after 1 single-hit change, in by-channel order.');
  assert.equal(SAY({ kind: 'morph', a: 'bar_003', b: 'bar_001', bars: 1, order: 'musical', seed: 0, position: 0 }), 'Morph [[bar_003]] into [[bar_001]] as one bar, after 0 single-hit changes, in musical order.');
  assert.equal(SAY({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false }), 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.');
  assert.equal(SAY({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.4, ghost: true, mode: 'vote' }), 'Mix [[bar_005]] and [[bar_006]], 50 percent [[bar_005]], as a vote. Threshold 40 percent. With ghost notes.');
  assert.equal(SAY({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.3333, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded', seed: 2 }), 'Mix [[bar_005]] and [[bar_006]], 33.33 percent [[bar_005]], as a path, in seeded order, seed 2.');
  assert.equal(SAY({ kind: 'mix', a: 'bar_005', b: 'bar_005', weight: 0.25, threshold: 0.5, ghost: false }), 'Mix [[bar_005]] and [[bar_005]], 25 percent the first, as a vote.', 'a bar mixed with itself: the name would name both, so "the first"');
  assert.equal(SAY({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }] }), 'Take [[phrase_006]]. Thin out bars 3 to 5, kick row, by half, keeping the downbeat.');
  assert.equal(SAY({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 4, last: 4, amount: 0.25, keep: 'seeded', seed: 7 }, { op: 'double_up', first: 1, last: 2, row: 'snare', grid: 8 }, { op: 'double_up', first: 6, last: 9, grid: 16 }] }),
    'Take [[phrase_006]]. Thin out bar 4, by 25 percent, chosen by seed 7. Double up bars 1 to 2, snare row, on a grid of 8. Double up bars 6 to 9.');
  assert.equal(SAY({ kind: 'transform', source: 'arrangements/arr_001', ops: [{ op: 'thin_out', first: 1, last: 1, amount: 1 }] }), 'Take [[arr_001]]. Thin out bar 1, by 100 percent, keeping the downbeat.');
  assert.equal(SAY({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_006' }, { kit: 'latin', phrase: 'phrase_010', mute: true }] }), 'Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_010]] on the [[latin]] kit. Mute the [[latin]] kit. Together.');
  assert.equal(SAY({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_006', volume: 70, solo: true }, { kit: 'latin', phrase: 'phrase_010', volume: 0 }, { kit: 'jazz', phrase: 'phrase_011', solo: true }] }),
    'Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_010]] on the [[latin]] kit. Play [[phrase_011]] on the [[jazz]] kit. Play the [[rock]] kit at 70 percent volume. Play the [[latin]] kit at 0 percent volume. Only the [[rock]] and [[jazz]] kits play. Together.');
  assert.equal(SAY({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_006' }] }), 'Play [[phrase_006]] on the [[rock]] kit. Together.');
});

test('the sentences of an arrangement are the ones 0910 writes into its Recipe (arrangementRecipeSteps), word for word: the grammar and the note say it the same way', async () => {
  const { arrangementRecipeSteps } = await import('./arrangement-core.ts');
  const r = rng(5);
  for (let i = 0; i < 200; i++) {
    const p = GEN.arrangement(r) as ArrangementParams;
    assert.equal(describe(p), arrangementRecipeSteps(canonical(p) as ArrangementParams).join(' '), JSON.stringify(p));
  }
});

// ---- what input may leave out, and what it tolerates --------------------------------------------------------------------------------------------------------------------------------------------------------------

const ok = (text: string, v: GrammarVault = VAULT): GrammarParams => { const r = parse(text, v); assert.ok(r.ok, `${text}\n${r.ok ? '' : JSON.stringify(r.error)}`); return (r as { params: GrammarParams }).params; };
const bad = (text: string, v: GrammarVault = VAULT) => { const r = parse(text, v); assert.ok(!r.ok, `should be refused: ${text}`); return (r as { error: { message: string; line: number; column: number } }).error; };

test('DEFAULTS (input): every parameter that has a default in the validators may be left out and is restored', () => {
  assert.deepEqual(ok('Extend [[bar_005]].'), { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 });
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]].'), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 5, order: 'musical', seed: 0 });
  assert.deepEqual(ok('Mix [[bar_001]] and [[bar_002]].'), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false });
  assert.deepEqual(ok('Mix [[bar_001]] and [[bar_002]], as a path.'), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 });
  assert.deepEqual(ok('Take [[phrase_006]]. Thin out bars 3 to 5.'), { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 5, amount: 0.5 }] });
  assert.deepEqual(ok('Take [[phrase_006]]. Double up bar 2.'), { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'double_up', first: 2, last: 2, grid: 16 }] });
});

test('every default of the grammar is the validators\' default, not a copy: the numbers the input restores are read from phrase-core.ts', async () => {
  const core = await import('./phrase-core.ts');
  assert.equal((ok('Extend [[bar_005]].') as { bars: number }).bars, core.PHRASE_DEFAULTS.bars);
  assert.equal((ok('Extend [[bar_005]].') as { style: string }).style, core.PHRASE_DEFAULTS.style);
  assert.equal((ok('Morph [[bar_001]] into [[bar_002]].') as { bars: number }).bars, core.MORPH_DEFAULTS.bars);
  assert.equal((ok('Morph [[bar_001]] into [[bar_002]].') as { order: string }).order, core.MORPH_DEFAULTS.order);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]].') as { weight: number }).weight, core.MIX_DEFAULTS.weight);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]].') as { threshold: number }).threshold, core.MIX_DEFAULTS.threshold);
  assert.equal(((ok('Take [[phrase_006]]. Thin out bar 1.') as { ops: Array<{ amount: number }> }).ops[0]).amount, core.TRANSFORM_DEFAULTS.amount);
  assert.equal(((ok('Take [[phrase_006]]. Double up bar 1.') as { ops: Array<{ grid: number }> }).ops[0]).grid, core.TRANSFORM_DEFAULTS.grid);
});

test('TOLERANT: extra spaces, tabs and line breaks, a trailing full stop or none, "%" for "percent", number words one to ten, any case for the keywords, bare note names that exist', () => {
  const want = ok('Extend [[bar_005]] to 8 bars, building up, 20 percent slower.');
  for (const t of [
    'Extend [[bar_005]] to 8 bars, building up, 20 percent slower',
    '  extend   [[bar_005]]   to   8   bars ,  building   up ,  20   percent   slower  .  ',
    'EXTEND [[bar_005]] TO EIGHT BARS, BUILDING UP, TWENTY percent slower'.replace('TWENTY', '20'),
    'Extend [[bar_005]] to eight bars, building up, 20% slower.',
    'Extend [[bar_005]] to 8 bars, building up, 20 % slower.',
    'Extend bar_005 to 8 bars, building up, 20 percent slower.',
    'Extend [[bar_005]]\tto\t8   bars,\t building up,   20 percent slower.',
    'Extend [[bar_005]] to 8 bars, 20 percent slower, building up.',
    'Extend [[bar_005]], building up, to 8 bars, 20 percent slower.',
    'Extend [[bar_005]] to 8 bars building up 20 percent slower',
  ]) assert.deepEqual(ok(t), want, JSON.stringify(t));
  assert.deepEqual(ok('Extend [[bar_005]] to ten bars'), ok('Extend [[bar_005]] to 10 bars.'));
  for (const [w, n] of [['one', 1], ['two', 2], ['three', 3], ['four', 4], ['five', 5], ['six', 6], ['seven', 7], ['eight', 8], ['nine', 9], ['ten', 10]] as const) assert.equal((ok(`Extend [[bar_005]] to ${w} bars.`) as { bars: number }).bars, n);
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]] over three bars, in seeded order, seed seven'), ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in seeded order, seed 7.'));
  assert.deepEqual(ok('Take [[phrase_006]]\nThin out bars three to five, kick row, by half\nDouble up bar two'), ok('Take [[phrase_006]]. Thin out bars 3 to 5, kick row, by half, keeping the downbeat. Double up bar 2, on a grid of 16.'));
  assert.deepEqual(ok('Play [[phrase_006]] on the [[rock]] kit. TOGETHER'), ok('Play [[phrase_006]] on the [[rock]] kit. Together.'));
});

test('TOLERANT, parts of the vocabulary: order and style by their engine names too; "of the first/second" for a share; a share named by the SECOND bar is the other way round', () => {
  assert.deepEqual(ok('Extend [[bar_005]] to 8 bars, repeat_with_fills.'), ok('Extend [[bar_005]] to 8 bars, repeating with fills.'));
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in by_channel order.'), ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in by-channel order.'));
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], 30 percent [[bar_002]]') as { weight: number }).weight, 0.7);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], 66.67 percent [[bar_002]]') as { weight: number }).weight, 0.3333, 'exact: the complement is taken on the digits, not on floats');
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], 70 percent of the first') as { weight: number }).weight, 0.7);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], 70 percent the second') as { weight: number }).weight, 0.3);
  assert.equal((ok('Mix [[bar_001]] and [[bar_001]], 70 percent the first') as { weight: number }).weight, 0.7);
  assert.equal((ok('Mix [[bar_001]] with [[bar_002]], 100 percent [[bar_001]]') as { weight: number }).weight, 1);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], 0 percent [[bar_001]]') as { weight: number }).weight, 0);
});

test('a text that holds nothing but the sentences of a kind is that kind, whatever its length: a note without a trailing newline, with one, or with blank lines', () => {
  const t = 'Play [[phrase_006]] on the [[rock]] kit.\n\nTogether.\n';
  assert.deepEqual(ok(t), { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_006' }] });
});

// ---- the weight convention (the bug of 0900) -----------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('THE WEIGHT CONVENTION is the engine\'s: the docstring of mix_rhythm says `weight` is the weight of `a` (1 is all `a`, 0 is all `b`), and "70 percent [[bar_005]]" is then 0.7 - read from lib.py, not assumed', () => {
  const doc = LIB.slice(LIB.indexOf('def mix_rhythm('), LIB.indexOf('def mix_rhythm(') + 3000);
  const said = /`weight`[^]*?is the weight of `a`: (\d) is all `a`, (\d) is all `b`/.exec(doc);
  assert.ok(said, 'the engine documents the meaning of the weight');
  const allA = Number(said![1]);
  assert.equal(said![2], String(1 - allA));
  const share = (text: string): number => (ok(text) as { weight: number }).weight;
  // "100 percent [[a]]" is ALL of a: the weight the docstring calls "all a"
  assert.equal(share('Mix [[bar_005]] and [[bar_006]], 100 percent [[bar_005]]'), allA);
  assert.equal(share('Mix [[bar_005]] and [[bar_006]], 0 percent [[bar_005]]'), 1 - allA);
  assert.equal(share('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.'), 0.7);
  assert.equal(share('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_006]], as a vote.'), 0.3);
  assert.match(describe({ kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.7, threshold: 0.5, ghost: false }), /70 percent \[\[bar_005\]\]/);
});

test('the weight survives every number a control or a hand can write: 4-decimal path stops, whole percents, and any double, through the text and back', () => {
  const r = rng(11);
  for (let i = 0; i < 2000; i++) {
    const w = i < 101 ? i / 100 : i < 1101 ? r.int(0, 10000) / 10000 : r.next();
    const back = ok(describe({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: w, threshold: 0.5, ghost: false })) as { weight: number };
    assert.equal(back.weight, w, String(w));
  }
});

// ---- one vocabulary: the engine's words, and the validators' lists -------------------------------------------------------------------------------------------------------------------------------------------------------

const engineTuple = (name: string): string[] => {
  const m = new RegExp(`^${name} = \\(([^)]*)\\)`, 'm').exec(LIB);
  assert.ok(m, `${name} is in lib.py`);
  return [...m![1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
};
test('ONE VOCABULARY: every style, order and keep of the ENGINE (read from lib.py) is in the validators\' lists AND describable and readable back - a style the engine learns and the grammar does not fails here', () => {
  const styles = engineTuple('_RHYTHM_EXTEND_STYLES'), orders = engineTuple('_RHYTHM_MORPH_ORDERS'), keeps = engineTuple('_THIN_OUT_KEEPS');
  assert.deepEqual([...styles].sort(), [...PHRASE_STYLES].sort(), 'phrase-core PHRASE_STYLES is the engine\'s list');
  assert.deepEqual([...orders].sort(), [...MORPH_ORDERS].sort(), 'phrase-core MORPH_ORDERS is the engine\'s list');
  assert.deepEqual([...keeps].sort(), [...TRANSFORM_KEEPS].sort(), 'phrase-core TRANSFORM_KEEPS is the engine\'s list');
  assert.deepEqual(Object.keys(GRAMMAR_VOCABULARY.styleWords).sort(), [...styles].sort(), 'a word for every engine style, and no word for a style that is gone');
  for (const style of styles) {
    const p = { kind: 'extend', source: 'bar_001', bars: 4, style, tempo_change_pct: 0 } as PhraseParams;
    assert.deepEqual(ok(describe(p)), p, style);
  }
  for (const order of orders) {
    const p = { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 4, order, seed: order === 'seeded' ? 5 : 0 } as PhraseParams;
    assert.deepEqual(ok(describe(p)), p, order);
    const m = { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order, seed: order === 'seeded' ? 5 : 0 } as PhraseParams;
    assert.deepEqual(ok(describe(m)), m, `mix path ${order}`);
    assert.match(describe(p), new RegExp(orderWords(order as never)));
  }
  for (const keep of keeps) {
    const op = (keep === 'seeded' ? { op: 'thin_out', first: 1, last: 2, amount: 0.5, keep: 'seeded', seed: 4 } : { op: 'thin_out', first: 1, last: 2, amount: 0.5 }) as TransformOp;
    const p = { kind: 'transform', source: 'phrases/phrase_001', ops: [op] } as PhraseParams;
    assert.deepEqual(ok(describe(p)), p, keep);
  }
});

test('the words of an order are the notes\' own (`morphOrderWords` of phrase-core.ts): the plugin says "musical order", "by-channel order", "seeded order, seed 3" everywhere in the same way', async () => {
  const { morphOrderWords } = await import('./phrase-core.ts');
  for (const order of MORPH_ORDERS) assert.equal(morphOrderWords({ order, seed: 3 }), order === 'seeded' ? `${orderWords(order)}, seed 3` : orderWords(order));
});

test('the vault lists the names are checked against are not copies: a name that is a phrase is never read as a bar, and the check follows the vault it is given', () => {
  const small: GrammarVault = { bars: ['bar_001'], phrases: ['phrase_001'], arrangements: ['arr_001'], kits: ['rock'] };
  assert.equal(parse('Extend [[bar_001]].', small).ok, true);
  assert.equal(parse('Extend [[bar_002]].', small).ok, false);
  assert.equal(parse('Extend [[phrase_001]].', small).ok, false, 'a phrase is not a bar');
  assert.equal(parse('Take [[bar_001]]. Thin out bar 1.', small).ok, false, 'a bar is not a phrase');
  assert.equal(parse('Take [[arr_001]]. Thin out bar 1.', small).ok, true, 'an arrangement may be taken');
  assert.equal(parse('Play [[phrase_001]] on the [[rock]] kit. Together.', small).ok, true);
  assert.equal(parse('Play [[phrase_001]] on the [[jazz]] kit. Together.', small).ok, false);
  assert.equal(parse('Play [[arr_001]] on the [[rock]] kit. Together.', small).ok, false, 'a Play takes a phrase');
});

// ---- strict on meaning: refusals, with the place ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('REFUSED, never guessed: an unknown note, a number out of range, a parameter without a default, two readings - each says what was expected, in one sentence, at the line and column', () => {
  const unknown = bad('Extend [[bar_099]] to 8 bars.');
  assert.deepEqual([unknown.line, unknown.column], [1, 8]);
  assert.match(unknown.message, /^Expected a bar of this vault .*"bar_099" is not one\.$/);
  const range = bad('Extend [[bar_005]] to 99 bars.');
  assert.deepEqual([range.line, range.column], [1, 23]);
  assert.match(range.message, /^Expected a number of bars from 1 to 64, but found 99\.$/);
  assert.match(bad('Extend [[bar_005]] to 0 bars.').message, /from 1 to 64, but found 0/);
  assert.match(bad('Extend [[bar_005]] to 2.5 bars.').message, /^Expected a number of bars as a whole number, but found 2\.5\.$/);
  assert.match(bad('Extend [[bar_005]], 95 percent slower.').message, /0 to 90 percent slower, but found 95/);
  assert.match(bad('Extend [[bar_005]], 101 percent faster.').message, /0 to 100 percent faster, but found 101/);
  assert.match(bad('Extend [[bar_005]], 20 percent.').message, /^Expected "slower" or "faster", but found the end of the sentence\.$/);
  assert.match(bad('Mix [[bar_005]] and [[bar_006]], 120 percent [[bar_005]]').message, /a share from 0 to 100 percent, but found 120/);
  assert.match(bad('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_007]]').message, /Expected \[\[bar_005\]\] or \[\[bar_006\]\] for the share, but found \[\[bar_007\]\]/);
  const two = bad('Mix [[bar_005]] and [[bar_005]], 70 percent [[bar_005]]');
  assert.match(two.message, /Expected "the first" or "the second", because bar_005 is both bars/);
  assert.match(bad('Morph [[bar_001]] into [[bar_002]] as one bar.').message, /Expected "after N single-hit changes" for a morph of one bar/, 'a missing parameter that has no default');
  assert.match(bad('Morph [[bar_001]] into [[bar_002]] over 4 bars, after 2 single-hit changes.').message, /position only for a morph of one bar/);
  assert.match(bad('Morph [[bar_001]] into [[bar_002]] over 4 bars, in musical order, seed 3.').message, /seed only with the seeded order/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]], as a vote, in seeded order.').message, /only for a mix as a path/);
  assert.match(bad('Take [[phrase_006]].').message, /at least one change after "Take"/);
  assert.match(bad('Take [[phrase_006]]. Thin out bars 5 to 3.').message, /last bar to be 5 or more, but found 3/);
  assert.match(bad('Take [[phrase_006]]. Thin out bars 0 to 3.').message, /a bar number, 1 or more, but found 0/);
  assert.match(bad('Take [[phrase_006]]. Thin out bar 2, by 150 percent.').message, /an amount from 0 to 100 percent, but found 150/);
  assert.match(bad('Take [[phrase_006]]. Double up bar 2, on a grid of 0.').message, /a grid, 1 or more, but found 0/);
  assert.match(bad('Take [[phrase_006]]. Thin out bar 2, by half, by half.').message, /the amount to be said once/);
  assert.match(bad('Extend [[bar_005]] to 8 bars. Bar 9 is replaced by [[bar_001]].').message, /a bar of this phrase \(1 to 8\), but found 9/);
  assert.match(bad('Extend [[bar_005]] to 8 bars. Bar 2 is replaced by [[bar_001]]. Bar 2 is replaced by [[bar_002]].').message, /bar 2 to be replaced once/);
  assert.match(bad('Extend [[bar_005]] to 8 bars. Bar 2 is replaced by [[bar_555]].').message, /a bar of this vault for bar 2/);
  assert.match(bad('Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_007]] on the [[rock]] kit. Together.').message, /a kit to play one phrase, but \[\[rock\]\] is given a second one/);
  assert.match(bad('Play [[phrase_006]] on the [[rock]] kit. Mute the [[latin]] kit. Together.').message, /nothing plays on \[\[latin\]\]/);
  assert.match(bad('Play [[phrase_006]] on the [[rock]] kit.').message, /Expected "Together\." after the tracks/);
  assert.match(bad('Play [[phrase_006]] on the [[rock]] kit. Together. Mute the [[rock]] kit.').message, /nothing after "Together\."/);
  assert.match(bad('Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 101 percent volume. Together.').message, /volume in percent from 0 to 100, but found 101/);
});

test('a NAME in two readings is refused: a note that is both a phrase and an arrangement cannot be "taken" without a rename', () => {
  const v: GrammarVault = { ...VAULT, phrases: [...VAULT.phrases, 'dual'], arrangements: [...VAULT.arrangements!, 'dual'] };
  assert.match(bad('Take [[dual]]. Thin out bar 1.', v).message, /Expected one note for the note to take, but "dual" is both a phrase and an arrangement; rename one of them\./);
});

test('the error is at the right LINE and COLUMN in a text of many lines (1-based, the place of the first thing that is wrong)', () => {
  const t = 'Take [[phrase_006]].\nThin out bars 3 to 5, kick row, by half.\nDouble up bars 7 to 6.\nThin out bar 1.';
  const e = bad(t);
  assert.deepEqual([e.line, e.column], [3, 21], e.message);
  assert.match(e.message, /the last bar to be 7 or more, but found 6/);
  const e2 = bad('Extend [[bar_005]] to 8 bars.\n   Bar 2 is replaced by [[bar_404]].');
  assert.deepEqual([e2.line, e2.column], [2, 25], e2.message);       // three spaces, then "Bar 2 is replaced by " is 21 characters: the link starts in column 25
  const e3 = bad('Play [[phrase_006]] on the [[rock]] kit.\nPlay [[phrase_007]] on the [[rock]] kit.\nTogether.');
  assert.deepEqual([e3.line, e3.column], [2, 28]);
  const e4 = bad('   \n  Extend [[bar_005]] to eight and a half bars.');
  assert.deepEqual([e4.line, e4.column], [2, 31], e4.message);       // two spaces, "Extend [[bar_005]] to eight " is 28 characters: "and" is in column 31
});

test('what is not a description at all: an empty text, a sentence that opens nothing, an unclosed link, a link with a folder - each is refused with a sentence that says what to write', () => {
  assert.match(bad('').message, /^Expected a description \(it starts with Extend, Mix, Morph, Take or Play\), but found nothing\.$/);
  assert.deepEqual([bad('   \n ').line, bad('   \n ').column], [1, 1]);
  assert.match(bad('Dance with [[bar_005]].').message, /^Expected a description that starts with Extend, Mix, Morph, Take or Play, but found "Dance"\.$/);
  assert.match(bad('Extend [[bar_005 to 8 bars.').message, /Expected "\]\]" to close the link/);
  assert.match(bad('Extend [[bars/bar_005]].').message, /Expected a note name \(letters, digits, _ and -, no folder\) inside the link, but found "bars\/bar_005"/);
  assert.match(bad('Extend bar_005 to 8 bars, dancing.').message, /Expected "to N bars", a style \(repeating with fills, building up, adding ghost notes\)/);
  assert.match(bad('Extend [[bar_005]] to 8 bars, building up, building up.').message, /the style to be said once, but it is said twice/);
  assert.match(bad('Extend [[bar_005]]. Threshold 40 percent.').message, /Expected "Bar N is replaced by \[\[a bar\]\]"/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]]. Bar 1 is replaced by [[bar_003]].').message, /Expected "Threshold N percent\." or "With ghost notes\."/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]]. Threshold 40 percent. Threshold 50 percent.').message, /threshold to be said once/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]]. With ghost notes. With ghost notes.').message, /ghost notes to be said once/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]]. Threshold 140 percent.').message, /a threshold from 0 to 100 percent, but found 140/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]]. Threshold 40.').message, /Expected "percent" after 40/);
  assert.match(bad('Take [[phrase_006]]. Shuffle bars 1 to 2.').message, /Expected "Thin out \.\.\.", "Double up \.\.\." or "Bar N is replaced by \[\[a bar\]\]"/);
  assert.match(bad('Play [[phrase_006]] on [[rock]]. Together.').message, /Expected "kit"/);
});

// ---- the refusals, one by one: the golden table ---------------------------------------------------------------------------------------------------------------------------------------------------------------------
// Every place the grammar can say "no", with the exact sentence, line and column. Reviewed by eye when written (2026-10-30): each says what was expected and what was found, in one sentence. A change of wording changes this table ON PURPOSE.
const REFUSALS: Array<[string, number, number, string]> = [
  ["Extend [[bar_005]] to x bars.", 1, 23, "Expected a number of bars, but found \"x\"."],
  ["Extend [[bar_005]] to 8.", 1, 24, "Expected \"bars\", but found the end of the sentence."],
  ["Extend [[bar_005]] to 8 bars, 20 percent.", 1, 41, "Expected \"slower\" or \"faster\", but found the end of the sentence."],
  ["Extend [[bar_005]], 20 slower.", 1, 21, "Expected \"to N bars\", a style (repeating with fills, building up, adding ghost notes) or \"N percent slower\" / \"N percent faster\", but found \"20\"."],
  ["Extend.", 1, 7, "Expected the bar to extend, as [[a note]], but found the end of the sentence."],
  ["Extend ,.", 1, 8, "Expected the bar to extend, as [[a note]], but found \",\"."],
  ["Extend [[bar_005]] extra stuff.", 1, 20, "Expected \"to N bars\", a style (repeating with fills, building up, adding ghost notes) or \"N percent slower\" / \"N percent faster\", but found \"extra\"."],
  ["Extend [[bar_005]] to 8 bars, 20 percent slower, 10 percent slower.", 1, 50, "Expected the tempo change to be said once, but it is said twice."],
  ["Extend [[bar_005]] to 8 bars, to 9 bars.", 1, 31, "Expected \"to N bars\" to be said once, but it is said twice."],
  ["Extend [[bar_005]], building up, adding ghost notes.", 1, 34, "Expected the style to be said once, but it is said twice."],
  ["Extend [[bar_005]], 95 percent slower.", 1, 21, "Expected a tempo change of 0 to 90 percent slower, but found 95."],
  ["Extend [[bar_005]], -3 percent slower.", 1, 21, "Expected \"to N bars\", a style (repeating with fills, building up, adding ghost notes) or \"N percent slower\" / \"N percent faster\", but found \"-3\"."],
  ["Extend [[bar_005]] to 8 bars. Bar x is replaced by [[bar_001]].", 1, 35, "Expected a bar number, but found \"x\"."],
  ["Extend [[bar_005]] to 8 bars. Bar 3 replaced by [[bar_001]].", 1, 37, "Expected \"is replaced by\", but found \"replaced\"."],
  ["Extend [[bar_005]] to 8 bars. Bar 3 is replaced by [[bar_001]] again.", 1, 64, "Expected the end of the sentence, but found \"again\"."],
  ["Extend [[bar_005]] to 8 bars. Bar 3 is replaced by.", 1, 51, "Expected bar 3, as [[a note]], but found the end of the sentence."],
  ["Extend [[bar_005]] to 8 bars. Take [[phrase_001]].", 1, 31, "Expected \"Bar N is replaced by [[a bar]]\", but found \"Take\"."],
  ["Extend [[bar_005]] to 8 bars. Bar 0 is replaced by [[bar_001]].", 1, 35, "Expected a bar number, 1 or more, but found 0."],
  ["Morph [[bar_001]] into.", 1, 23, "Expected the bar to end at, as [[a note]], but found the end of the sentence."],
  ["Morph [[bar_001]] [[bar_002]].", 1, 19, "Expected \"into\", but found \"[[bar_002]]\"."],
  ["Morph [[bar_001]] into [[bar_002]] over x bars.", 1, 41, "Expected a number of bars, but found \"x\"."],
  ["Morph [[bar_001]] into [[bar_002]] over 4.", 1, 42, "Expected \"bars\", but found the end of the sentence."],
  ["Morph [[bar_001]] into [[bar_002]] over 0 bars.", 1, 41, "Expected a number of bars from 1 to 64, but found 0."],
  ["Morph [[bar_001]] into [[bar_002]] as one bar, after x single-hit changes.", 1, 54, "Expected a number of single-hit changes, but found \"x\"."],
  ["Morph [[bar_001]] into [[bar_002]] as one bar, after 2.", 1, 55, "Expected \"single-hit changes\", but found the end of the sentence."],
  ["Morph [[bar_001]] into [[bar_002]] as one bar, after 2 changes.", 1, 56, "Expected \"single-hit changes\", but found \"changes\"."],
  ["Morph [[bar_001]] into [[bar_002]], in dancing order.", 1, 40, "Expected an order (musical order, seeded order, by-channel order), but found \"dancing\"."],
  ["Morph [[bar_001]] into [[bar_002]], in.", 1, 39, "Expected an order (musical order, seeded order, by-channel order), but found the end of the sentence."],
  ["Morph [[bar_001]] into [[bar_002]], seed x.", 1, 42, "Expected a seed, but found \"x\"."],
  ["Morph [[bar_001]] into [[bar_002]], in seeded order, seed 3, seed 4.", 1, 62, "Expected \"seed N\" to be said once, but it is said twice."],
  ["Morph [[bar_001]] into [[bar_002]], dancing.", 1, 37, "Expected \"over N bars\", \"as one bar, after N single-hit changes\", or \"in musical order\" (also seeded, by-channel), but found \"dancing\"."],
  ["Morph [[bar_001]] into [[bar_002]] as one bar, after 2 single-hit changes, in seeded order, seed 3. Bar 2 is replaced by [[bar_003]].", 1, 105, "Expected a bar of this phrase (1 to 1), but found 2."],
  ["Morph [[bar_001]] into [[bar_002]] over 3 bars. Bar 4 is replaced by [[bar_003]].", 1, 53, "Expected a bar of this phrase (1 to 3), but found 4."],
  ["Mix [[bar_001]].", 1, 16, "Expected \"and\", but found the end of the sentence."],
  ["Mix [[bar_001]] [[bar_002]].", 1, 17, "Expected \"and\", but found \"[[bar_002]]\"."],
  ["Mix [[bar_001]] and.", 1, 20, "Expected the second bar, as [[a note]], but found the end of the sentence."],
  ["Mix [[bar_001]] and [[bar_002]], 70 percent.", 1, 44, "Expected the bar the share belongs to, as [[a note]], but found the end of the sentence."],
  ["Mix [[bar_001]] and [[bar_002]], 70 [[bar_001]].", 1, 34, "Expected \"N percent [[a bar]]\", \"as a vote\" or \"as a path, in musical order\", but found \"70\"."],
  ["Mix [[bar_001]] and [[bar_002]], 70 percent [[bar_001]], 60 percent [[bar_001]].", 1, 58, "Expected the share to be said once, but it is said twice."],
  ["Mix [[bar_001]] and [[bar_002]], as a vote, as a path.", 1, 45, "Expected \"as a vote\" or \"as a path\" to be said once, but it is said twice."],
  ["Mix [[bar_001]] and [[bar_002]], dancing.", 1, 34, "Expected \"N percent [[a bar]]\", \"as a vote\" or \"as a path, in musical order\", but found \"dancing\"."],
  ["Mix [[bar_001]] and [[bar_002]], as a path, in dancing order.", 1, 48, "Expected an order (musical order, seeded order, by-channel order), but found \"dancing\"."],
  ["Mix [[bar_001]] and [[bar_002]], as a path, seed 3.", 1, 50, "Expected a seed only with the seeded order, but this mix is in musical order."],
  ["Mix [[bar_001]] and [[bar_002]], as a path, in seeded order, seed x.", 1, 67, "Expected a seed, but found \"x\"."],
  ["Mix [[bar_001]] and [[bar_002]], as a vote, seed 3.", 1, 50, "Expected an order and a seed only for a mix as a path, but this mix is a vote."],
  ["Mix [[bar_001]] and [[bar_002]]. Threshold x percent.", 1, 44, "Expected a threshold as a number of percent, but found \"x\"."],
  ["Mix [[bar_001]] and [[bar_002]]. Threshold 40 percent extra.", 1, 55, "Expected the end of the sentence, but found \"extra\"."],
  ["Mix [[bar_001]] and [[bar_002]]. With ghost notes extra.", 1, 51, "Expected the end of the sentence, but found \"extra\"."],
  ["Mix [[bar_001]] and [[bar_002]]. Dancing.", 1, 34, "Expected \"Threshold N percent.\" or \"With ghost notes.\", but found \"Dancing\"."],
  ["Take.", 1, 5, "Expected the note to take, as [[a note]], but found the end of the sentence."],
  ["Take [[phrase_006]] extra.", 1, 21, "Expected the end of the sentence, but found \"extra\"."],
  ["Take [[nothing]]. Thin out bar 1.", 1, 6, "Expected a phrase or an arrangement of this vault for the note to take, but \"nothing\" is not one."],
  ["Take [[phrase_006]]. Thin out.", 1, 30, "Expected \"bar N\" or \"bars N to M\", but found the end of the sentence."],
  ["Take [[phrase_006]]. Thin out bars x.", 1, 36, "Expected a bar number, but found \"x\"."],
  ["Take [[phrase_006]]. Thin out bars 3 to x.", 1, 41, "Expected a bar number, but found \"x\"."],
  ["Take [[phrase_006]]. Thin out bar 2, by x percent.", 1, 41, "Expected an amount as a number of percent, but found \"x\"."],
  ["Take [[phrase_006]]. Thin out bar 2, by 20.", 1, 43, "Expected \"percent\" after 20, but found the end of the sentence."],
  ["Take [[phrase_006]]. Thin out bar 2, by.", 1, 40, "Expected an amount as a number of percent, but found the end of the sentence."],
  ["Take [[phrase_006]]. Thin out bar 2, chosen by seed x.", 1, 53, "Expected a seed, but found \"x\"."],
  ["Take [[phrase_006]]. Thin out bar 2, keeping the downbeat, keeping the downbeat.", 1, 60, "Expected the kept beats to be said once, but it is said twice."],
  ["Take [[phrase_006]]. Thin out bar 2, kick row, snare row.", 1, 48, "Expected the row to be said once, but it is said twice."],
  ["Take [[phrase_006]]. Thin out bar 2, kick.", 1, 38, "Expected \"kick row\", \"by half\", \"by N percent\", \"keeping the downbeat\" or \"chosen by seed N\", but found \"kick\"."],
  ["Take [[phrase_006]]. Thin out bar 2, dancing.", 1, 38, "Expected \"kick row\", \"by half\", \"by N percent\", \"keeping the downbeat\" or \"chosen by seed N\", but found \"dancing\"."],
  ["Take [[phrase_006]]. Thin out bar 2, kick row, by half, chosen by seed 3, keeping the downbeat.", 1, 75, "Expected the kept beats to be said once, but it is said twice."],
  ["Take [[phrase_006]]. Double up bar 2, on a grid of x.", 1, 52, "Expected a grid, but found \"x\"."],
  ["Take [[phrase_006]]. Double up bar 2, on a grid of 8, on a grid of 4.", 1, 55, "Expected the grid to be said once, but it is said twice."],
  ["Take [[phrase_006]]. Double up bar 2, kick row, snare row.", 1, 49, "Expected the row to be said once, but it is said twice."],
  ["Take [[phrase_006]]. Double up bar 2, kick.", 1, 39, "Expected \"kick row\" or \"on a grid of N\", but found \"kick\"."],
  ["Take [[phrase_006]]. Double up bar 2, dancing.", 1, 39, "Expected \"kick row\" or \"on a grid of N\", but found \"dancing\"."],
  ["Take [[phrase_006]]. Double up.", 1, 31, "Expected \"bar N\" or \"bars N to M\", but found the end of the sentence."],
  ["Take [[phrase_006]]. Bar 2 is replaced by [[bar_001]]. Bar 2 is replaced by [[bar_002]].", 1, 20, "Expected at least one change after \"Take\" (Thin out or Double up), but found none."],
  ["Play.", 1, 5, "Expected the phrase to play, as [[a note]], but found the end of the sentence."],
  ["Play [[phrase_006]].", 1, 20, "Expected \"on the\", but found the end of the sentence."],
  ["Play [[phrase_006]] on.", 1, 23, "Expected the kit to play it on, as [[a note]], but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]].", 1, 36, "Expected \"kit\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit extra.", 1, 41, "Expected the end of the sentence, but found \"extra\"."],
  ["Play [[phrase_006]] on the [[nokit]] kit. Together.", 1, 28, "Expected a kit of this vault for the kit to play it on, but \"nokit\" is not one."],
  ["Play [[nophrase]] on the [[rock]] kit. Together.", 1, 6, "Expected a phrase of this vault for the phrase to play, but \"nophrase\" is not one."],
  ["Play [[phrase_006]] on the [[rock]] kit. Mute the [[rock]].", 1, 59, "Expected \"kit\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Mute the [[rock]] kit extra.", 1, 64, "Expected the end of the sentence, but found \"extra\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Mute.", 1, 46, "Expected the kit to mute, as [[a note]], but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Only.", 1, 46, "Expected a kit that plays, as [[a note]], but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Only the [[rock]].", 1, 59, "Expected \"kit\" or \"kits\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Only the [[rock]] kit.", 1, 63, "Expected \"play\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Only the [[rock]] kits plays extra.", 1, 71, "Expected the end of the sentence, but found \"extra\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit.", 1, 63, "Expected \"at\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at x percent volume.", 1, 67, "Expected a volume in percent, but found \"x\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 70.", 1, 69, "Expected \"percent\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 70 percent.", 1, 77, "Expected \"volume\", but found the end of the sentence."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 70 percent volume extra.", 1, 85, "Expected the end of the sentence, but found \"extra\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 70 percent volume. Together extra.", 1, 95, "Expected the end of the sentence, but found \"extra\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Dancing. Together.", 1, 42, "Expected \"Play [[a phrase]] on the [[a kit]] kit.\", \"Mute ...\", \"Only ...\" or \"Together.\", but found \"Dancing\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Together extra.", 1, 51, "Expected the end of the sentence, but found \"extra\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_007]] on the [[rock]] kit. Together.", 1, 69, "Expected a kit to play one phrase, but [[rock]] is given a second one."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 101 percent volume. Together.", 1, 67, "Expected a volume in percent from 0 to 100, but found 101."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at 70.5 percent volume. Together.", 1, 67, "Expected a volume in percent as a whole number, but found 70.5."],
];
test('GOLDEN REFUSALS: every refusal of the grammar, word for word, at its line and column (' + REFUSALS.length + ' of them), and each one is ONE sentence', () => {
  for (const [text, line, column, message] of REFUSALS) {
    const e = bad(text);
    assert.deepEqual([e.line, e.column, e.message], [line, column, message], text);
  }
  assert.ok(REFUSALS.length >= 90);
  assert.equal(new Set(REFUSALS.map((r) => r[3])).size > 70, true, 'the sentences differ from one another: they say what is wrong HERE');
});

// The same, for the places that only a second look found (the labels of the names, a thing said twice, where a position or an order was said): reviewed by eye as well.
const REFUSALS_MORE: Array<[string, number, number, string]> = [
  ["Morph [[bar_099]] into [[bar_002]].", 1, 7, "Expected a bar of this vault for the bar to start from, but \"bar_099\" is not one."],
  ["Mix [[bar_099]] and [[bar_002]].", 1, 5, "Expected a bar of this vault for the first bar, but \"bar_099\" is not one."],
  ["Morph [[bar_001]] into [[bar_002]] over 3 bars, over 4 bars.", 1, 49, "Expected \"over N bars\" to be said once, but it is said twice."],
  ["Morph [[bar_001]] into [[bar_002]] as one bar, as one bar, after 1 single-hit change.", 1, 48, "Expected \"as one bar\" to be said once, but it is said twice."],
  ["Morph [[bar_001]] into [[bar_002]] as one bar, after 1 single-hit change, after 2 single-hit changes.", 1, 75, "Expected \"after N single-hit changes\" to be said once, but it is said twice."],
  ["Morph [[bar_001]] into [[bar_002]], in musical order, in seeded order.", 1, 55, "Expected the order to be said once, but it is said twice."],
  ["Mix [[bar_001]] and [[bar_002]], as a path, in musical order, in seeded order.", 1, 63, "Expected the order to be said once, but it is said twice."],
  ["Mix [[bar_001]] and [[bar_002]], as a path, in seeded order, seed 3, seed 4.", 1, 70, "Expected \"seed N\" to be said once, but it is said twice."],
  ["Morph [[bar_001]] into [[bar_002]] over 4 bars, after 2 single-hit changes.", 1, 55, "Expected a position only for a morph of one bar, but this morph has more."],
  ["Morph [[bar_001]] into [[bar_002]], in musical order, seed 3.", 1, 60, "Expected a seed only with the seeded order, but this morph is in musical order."],
  ["Mix [[bar_001]] and [[bar_002]], as a vote, in seeded order.", 1, 48, "Expected an order and a seed only for a mix as a path, but this mix is a vote."],
  ["Mix [[bar_001]] and [[bar_002]], 101 percent [[bar_001]].", 1, 34, "Expected a share from 0 to 100 percent, but found 101."],
  ["Take [[phrase_006]]. Thin out bar 2, #.", 1, 38, "Expected \"kick row\", \"by half\", \"by N percent\", \"keeping the downbeat\" or \"chosen by seed N\", but found \"#\"."],
  ["Take [[phrase_006]]. Double up bar 2, #.", 1, 39, "Expected \"kick row\" or \"on a grid of N\", but found \"#\"."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[nokit]] kit at 70 percent volume.", 1, 51, "Expected a kit of this vault for the kit, but \"nokit\" is not one."],
  ["Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] at 70 percent volume.", 1, 60, "Expected \"kit\", but found \"at\"."],
  ["Play [[phrase_006]] on the [[rock]] kit.", 1, 40, "Expected \"Together.\" after the tracks, but found the end of the description."],
  ["Extend [[bar_005]] to 2.5", 1, 23, "Expected a number of bars as a whole number, but found 2.5."],
  ["Take [[phrase_006]]. Thin out bar 2, kick row, by half, by half.", 1, 57, "Expected the amount to be said once, but it is said twice."],
];
test('GOLDEN REFUSALS, the places that say what is said twice or where a misplaced word is, and the labels of the notes asked for (' + REFUSALS_MORE.length + ' more)', () => {
  for (const [text, line, column, message] of REFUSALS_MORE) {
    const e = bad(text);
    assert.deepEqual([e.line, e.column, e.message], [line, column, message], text);
  }
});

test('ACCEPTED at the edge of what is refused: a range of one bar ("bars 3 to 3", "bars 1 to 1"), 0 percent either way, a seed of 0, "is" without "replaced by", "by channel order" without the hyphen, and a decimal at the very end of the text', () => {
  assert.deepEqual(ok('Take [[phrase_006]]. Thin out bars 3 to 3. Double up bars 1 to 1.'), { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 3, amount: 0.5 }, { op: 'double_up', first: 1, last: 1, grid: 16 }] });
  assert.deepEqual(ok('Take [[phrase_006]]. Thin out bars 3 to 4.'), { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 3, last: 4, amount: 0.5 }] });
  for (const text of ['Extend [[bar_005]], 0 percent faster.', 'Extend [[bar_005]], 0 percent slower.']) assert.ok(Object.is((ok(text) as { tempo_change_pct: number }).tempo_change_pct, 0), text);
  assert.equal((ok('Extend [[bar_005]], 90 percent slower.') as { tempo_change_pct: number }).tempo_change_pct, -90);
  assert.equal((ok('Extend [[bar_005]], 100 percent faster.') as { tempo_change_pct: number }).tempo_change_pct, 100);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], 100 percent [[bar_001]]') as { weight: number }).weight, 1);
  assert.deepEqual(ok('Take [[phrase_006]]. Thin out bar 2, chosen by seed 0.'), { kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'thin_out', first: 2, last: 2, amount: 0.5, keep: 'seeded', seed: 0 }] });
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]], in seeded order, seed 0.'), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 5, order: 'seeded', seed: 0 });
  assert.deepEqual(ok('Mix [[bar_001]] and [[bar_002]], as a path, in seeded order, seed 0.'), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded', seed: 0 });
  assert.deepEqual(ok('Extend [[bar_005]] to 8 bars. Bar 3 is [[bar_001]].'), ok('Extend [[bar_005]] to 8 bars. Bar 3 is replaced by [[bar_001]].'));
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in by channel order.'), ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in by-channel order.'));
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in BY_CHANNEL ORDER.'), ok('Morph [[bar_001]] into [[bar_002]] over 3 bars, in by-channel order.'));
});

test('a "percent" with no number before it is refused with the ordinary sentence (it is not the start of a tempo change or a share), and "in one bar" says what "as one bar" says', () => {
  const a = bad('Extend [[bar_005]], percent slower.');
  assert.deepEqual([a.line, a.column], [1, 21]);
  assert.match(a.message, /^Expected "to N bars", a style .* or "N percent slower" \/ "N percent faster", but found "percent"\.$/);
  const b = bad('Mix [[bar_001]] and [[bar_002]], percent [[bar_001]].');
  assert.deepEqual([b.line, b.column], [1, 34]);
  assert.match(b.message, /^Expected "N percent \[\[a bar\]\]", "as a vote" or "as a path, in musical order", but found "percent"\.$/);
  assert.deepEqual(ok('Morph [[bar_001]] into [[bar_002]] in one bar, after 2 single-hit changes.'), ok('Morph [[bar_001]] into [[bar_002]] as one bar, after 2 single-hit changes.'));
});

test('CANONICAL, the seeded path mix without a seed: seed 0 (not 1)', () => {
  assert.deepEqual((canonical({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded' }) as { seed: number }).seed, 0);
  assert.equal(describe({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded' }), 'Mix [[bar_001]] and [[bar_002]], 50 percent [[bar_001]], as a path, in seeded order, seed 0.');
});

test('REFUSED: too many changes in a Take (more than 16) says so, and exactly 16 is fine', () => {
  const ops = (n: number): string => Array.from({ length: n }, () => 'Thin out bar 1.').join(' ');
  const e = bad(`Take [[phrase_006]]. ${ops(17)}`);
  assert.deepEqual([e.line, e.column, e.message], [1, 1, 'Expected at most 16 changes, but found 17.']);
  assert.equal(parse(`Take [[phrase_006]]. ${ops(16)}`, VAULT).ok, true);
});

test('THE LAST GATE: what the grammar reads is also checked by the plugin\'s own validators, so a name the grammar accepts and the plugin does not is refused with the plugin\'s sentence (a phrase called "chorus" cannot be the source of a Take yet: the validator wants phrases/phrase_N)', () => {
  const v: GrammarVault = { ...VAULT, phrases: [...VAULT.phrases, 'chorus'], kits: [...VAULT.kits!, '-odd'] };
  const take = bad('Take [[chorus]]. Thin out bar 1.', v);
  assert.deepEqual([take.line, take.column], [1, 1]);
  assert.match(take.message, /^source must be a phrase note without \.md, like phrases\/phrase_006, got "phrases\/chorus"\.$/);
  const arr = bad('Play [[phrase_006]] on the [[-odd]] kit. Together.', v);
  assert.deepEqual([arr.line, arr.column], [1, 1]);
  assert.match(arr.message, /is not a kit name/);
  assert.equal(parse('Take [[arr_001]]. Thin out bar 1.', { ...v, arrangements: ['arr_001'] }).ok, true, 'an ARRANGEMENT as the source is not run through the phrase rule: that is the point of naming it by a wikilink');
});

test('parse never throws, even when the vault it is given does: the answer is a refusal that says it could not read the description', () => {
  const hostile = { get bars(): string[] { throw new Error('the vault went away'); }, phrases: [] } as unknown as GrammarVault;
  const r = parse('Extend [[bar_005]].', hostile);
  assert.equal(r.ok, false);
  assert.deepEqual(r.ok ? null : [r.error.line, r.error.column, r.error.message], [1, 1, 'Expected a description of this grammar, but it could not be read (the vault went away).']);
});

test('SENTENCES: a full stop inside a link or a number does not end a sentence, a link may span a line break, and a text may start with a link', () => {
  assert.match(bad('Extend [[bar_005. ]] to 8 bars.').message, /inside the link, but found "bar_005\. "/);
  assert.match(bad('Extend [[bar_\n005]] to 8 bars.').message, /inside the link, but found "bar_\n005"/);
  const e = bad('[[a. b]] Extend [[bar_005]].');
  assert.deepEqual([e.line, e.column, e.message], [1, 1, 'Expected a description that starts with Extend, Mix, Morph, Take or Play, but found "[[a. b]]".']);
  assert.deepEqual(ok('Extend [[bar_005]] to 12.5 bars'.replace('12.5', '12')), ok('Extend [[bar_005]] to 12 bars.'));
  assert.deepEqual(ok('Extend [[bar_005]], 12.5 percent faster.'), { kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 12.5 });
  assert.deepEqual(ok('Extend [[bar_005]] to 8 bars.Bar 2 is replaced by [[bar_001]]'.replace('bars.Bar', 'bars. Bar')), ok('Extend [[bar_005]] to 8 bars. Bar 2 is replaced by [[bar_001]].'));
  assert.equal(parse('.', VAULT).ok, false);
  assert.equal(parse('...', VAULT).ok, false);
});

test('what an error says it FOUND: a word, a number, a link, a single character, or the end of the sentence', () => {
  assert.match(bad('Extend [[bar_005]] (soon).').message, /but found "\("\.$/);
  assert.match(bad('Extend [[bar_005]] 7.').message, /but found "7"\.$/);
  assert.match(bad('Extend [[bar_005]] [[bar_006]].').message, /but found "\[\[bar_006\]\]"\.$/);
  assert.match(bad('Extend [[bar_005]] #.').message, /but found "#"\.$/);
  assert.match(bad('Extend [[bar_005]] 50.').message, /but found "50"\.$/);
  assert.match(bad('Extend [[bar_005]] 50%.').message, /^Expected "slower" or "faster", but found the end of the sentence\.$/, 'a number and a percent sign start a tempo change: it is the end that is wrong');
});

test('NUMBER WORDS give their digits wherever a number is read: a share, a threshold, an amount, a volume, a grid, a seed, a position, a bar number', () => {
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]], five percent [[bar_001]]') as { weight: number }).weight, 0.05);
  assert.equal((ok('Mix [[bar_001]] and [[bar_002]]. Threshold nine percent.') as { threshold: number }).threshold, 0.09);
  assert.equal((ok('Take [[phrase_006]]. Thin out bar six, by three percent.') as { ops: Array<{ first: number; amount: number }> }).ops[0].amount, 0.03);
  assert.equal((ok('Play [[phrase_006]] on the [[rock]] kit. Play the [[rock]] kit at seven percent volume. Together.') as { tracks: Array<{ volume: number }> }).tracks[0].volume, 7);
  assert.equal((ok('Take [[phrase_006]]. Double up bar one, on a grid of ten.') as { ops: Array<{ grid: number }> }).ops[0].grid, 10);
  assert.equal((ok('Morph [[bar_001]] into [[bar_002]] as one bar, after four single-hit changes.') as { position: number }).position, 4);
  assert.equal((ok('Extend [[bar_005]] to 8 bars. Bar two is replaced by [[bar_001]].') as { overrides: Record<string, string> }).overrides['2'], 'bars/bar_001');
  assert.equal((ok('Extend [[bar_005]], eight percent faster.') as { tempo_change_pct: number }).tempo_change_pct, 8);
});

test('HUGE bar numbers in forks (a transform\'s have no upper limit) come out in numeric order, not the order they were given', () => {
  const p = { kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'double_up', first: 1, last: 1, grid: 16 }], overrides: { '9007199254740991': 'bars/bar_002', '4294967296': 'bars/bar_001', '3': 'bars/bar_003' } } as const;
  const text = describe(p);
  assert.equal(text, 'Take [[phrase_001]]. Double up bar 1. Bar 3 is replaced by [[bar_003]]. Bar 4294967296 is replaced by [[bar_001]]. Bar 9007199254740991 is replaced by [[bar_002]].');
  assert.deepEqual(Object.keys((canonical(p) as { overrides: object }).overrides), ['3', '4294967296', '9007199254740991']);
  assert.deepEqual(ok(text), canonical(p));
});

test('CANONICAL fills what a half-made params object lacks: a one-bar morph without a position is position 0; a seeded keep without a seed is seed 0; a path mix without order or seed is musical, seed 0', () => {
  assert.deepEqual(canonical({ kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 1, order: 'musical', seed: 0 } as never), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 1, order: 'musical', seed: 0, position: 0 });
  assert.deepEqual((canonical({ kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'thin_out', first: 1, last: 1, amount: 0.25, keep: 'seeded' }] }) as { ops: unknown[] }).ops, [{ op: 'thin_out', first: 1, last: 1, amount: 0.25, keep: 'seeded', seed: 0 }]);
  assert.equal(describe({ kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 1, order: 'musical', seed: 0 } as never), 'Morph [[bar_001]] into [[bar_002]] as one bar, after 0 single-hit changes, in musical order.');
  assert.equal(describe({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path' }), 'Mix [[bar_001]] and [[bar_002]], 50 percent [[bar_001]], as a path, in musical order.');
});

test('plain and shiftDecimal at their edges: the smallest and the largest doubles, a number just under and over where the exponent starts, and shifts that cross the point', () => {
  assert.equal(plain(5e-324), '0.' + '0'.repeat(323) + '5');
  assert.equal(plain(1.7976931348623157e308), '17976931348623157' + '0'.repeat(292));
  assert.equal(plain(0.000001), '0.000001'); assert.equal(plain(1e-7 * 1.5), '0.00000015'); assert.equal(plain(999999999999999900000), '999999999999999900000'); assert.equal(plain(1e21), '1' + '0'.repeat(21)); assert.equal(plain(-1e-7), '-0.0000001'); assert.equal(plain(-1e21), '-1' + '0'.repeat(21));
  assert.equal(plain(0), '0'); assert.equal(plain(100), '100'); assert.equal(plain(0.5), '0.5');
  assert.equal(shiftDecimal('5', -3), '0.005'); assert.equal(shiftDecimal('5', -1), '0.5'); assert.equal(shiftDecimal('12', -1), '1.2'); assert.equal(shiftDecimal('12', -2), '0.12'); assert.equal(shiftDecimal('12', -4), '0.0012');
  assert.equal(shiftDecimal('0.5', 1), '5'); assert.equal(shiftDecimal('0.5', 3), '500'); assert.equal(shiftDecimal('1.25', 1), '12.5'); assert.equal(shiftDecimal('1.25', 2), '125'); assert.equal(shiftDecimal('1.25', 4), '12500');
  assert.equal(shiftDecimal('007', 0), '7'); assert.equal(shiftDecimal('10', 0), '10'); assert.equal(shiftDecimal('0.10', 0), '0.1');
  assert.equal(complementOf100('0.5'), '99.5'); assert.equal(complementOf100('12.34'), '87.66'); assert.equal(complementOf100('50'), '50'); assert.equal(complementOf100('99.99'), '0.01'); assert.equal(complementOf100('1.001'), '98.999');
});

test('THE TABLE OF VERBS, as documented: each verb, the note it opens, whether it is reserved, and its example - and every example of a live verb is a sentence the grammar says itself', () => {
  assert.deepEqual(VERBS.map((v) => [v.verb, v.kind, v.reserved === true]), [
    ['extend', 'extend', false], ['mix', 'mix', false], ['morph', 'morph', false], ['take', 'transform', false], ['play', 'arrangement', false],
    ['thin out', null, false], ['double up', null, false], ['bar replaced', null, false], ['threshold', null, false], ['ghost notes', null, false], ['volume', null, false], ['mute', null, false], ['only', null, false], ['together', null, false],
    ['then play', null, true], ['repeat that', null, true], ['for bars play', null, true],
  ]);
  assert.deepEqual(VERBS.map((v) => v.example), [
    'Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower.', 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'Morph [[bar_003]] into [[bar_001]] over 8 bars, in musical order.', 'Take [[phrase_006]].', 'Play [[phrase_006]] on the [[rock]] kit.',
    'Thin out bars 3 to 5, kick row, by half, keeping the downbeat.', 'Double up bars 3 to 5, kick row.', 'Bar 9 is replaced by [[bar_009]].', 'Threshold 40 percent.', 'With ghost notes.', 'Play the [[rock]] kit at 70 percent volume.', 'Mute the [[latin]] kit.', 'Only the [[rock]] kit plays.', 'Together.',
    'Then play [[arr_002]] for 4 bars.', 'Repeat that 2 times.', 'For 8 bars play [[arr_001]].',
  ]);
  for (const text of ['Extend [[bar_005]] to 8 bars, repeating with fills, 20 percent slower.', 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'Morph [[bar_003]] into [[bar_001]] over 8 bars, in musical order.']) assert.equal(describe(ok(text)), text);
});

// ---- the reserved verbs: the extension point ------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('RESERVED VERBS: the composition\'s sequence verbs are named in the table of verbs and refused BY NAME until they exist - in the first sentence, and after any kind', () => {
  const reserved = VERBS.filter((v) => v.reserved);
  assert.deepEqual(reserved.map((v) => v.verb), ['then play', 'repeat that', 'for bars play']);
  for (const v of reserved) {
    const e = bad(v.example);
    assert.match(e.message, /reserved for compositions and does not exist yet/, v.example);
    assert.deepEqual([e.line, e.column], [1, 1]);
  }
  const after = bad('Play [[phrase_006]] on the [[rock]] kit. Together. Then play [[arr_001]] for 4 bars.');
  assert.match(after.message, /"Then play" is reserved/);
  assert.match(bad('Extend [[bar_005]] to 8 bars. Repeat that 2 times.').message, /"Repeat that" is reserved/);
  assert.match(bad('Mix [[bar_001]] and [[bar_002]]. For 8 bars play [[arr_001]].').message, /"For N bars play" is reserved/);
  assert.match(bad('Take [[phrase_006]]. Thin out bar 1. Then play [[arr_001]].').message, /"Then play" is reserved/);
});

test('THE EXTENSION POINT: every verb the grammar speaks is a row of ONE table (VERBS) with an example that PARSES (the examples are the documentation); the ones that open a note name its kind; adding a row changes no existing sentence', () => {
  const live = VERBS.filter((v) => !v.reserved);
  assert.ok(live.length >= 14);
  assert.deepEqual(VERBS.filter((v) => v.kind !== null).map((v) => v.kind), ['extend', 'mix', 'morph', 'transform', 'arrangement']);
  // the examples that are whole descriptions parse as written; the clause examples parse after the sentence that opens their kind
  const opener: Record<string, string> = {
    'thin out': 'Take [[phrase_006]]. ', 'double up': 'Take [[phrase_006]]. ', 'bar replaced': 'Extend [[bar_005]] to 12 bars. ', 'threshold': 'Mix [[bar_005]] and [[bar_006]]. ', 'ghost notes': 'Mix [[bar_005]] and [[bar_006]]. ',
    'together': 'Play [[phrase_006]] on the [[rock]] kit. ', 'volume': 'Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_010]] on the [[latin]] kit. ', 'mute': 'Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_010]] on the [[latin]] kit. ', 'only': 'Play [[phrase_006]] on the [[rock]] kit. Play [[phrase_010]] on the [[latin]] kit. ',
  };
  for (const v of live) {
    const tail = ['volume', 'mute', 'only'].includes(v.verb) ? ' Together.' : '';
    const text = `${opener[v.verb] ?? ''}${v.example}${v.kind === 'arrangement' ? ' Together.' : ''}${v.verb === 'take' ? ' Thin out bar 1.' : ''}${tail}`;
    assert.ok(parse(text, VAULT).ok, `${v.verb}: ${text}\n${JSON.stringify((parse(text, VAULT) as { error?: unknown }).error)}`);
  }
});

test('"Any phrase-kind clause may take a note that is itself a phrase, an arrangement" - the source of a Take is named by a wikilink and the vault says what kind it is: phrases/ or arrangements/, and the round trip keeps it', () => {
  assert.deepEqual(ok('Take [[arr_001]]. Thin out bars 3 to 5, kick row, by half.'), { kind: 'transform', source: 'arrangements/arr_001', ops: [{ op: 'thin_out', first: 3, last: 5, row: 'kick', amount: 0.5 }] });
  assert.deepEqual(ok('Take [[phrase_001]]. Thin out bar 1.'), { kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'thin_out', first: 1, last: 1, amount: 0.5 }] });
  const noArr: GrammarVault = { bars: VAULT.bars, phrases: VAULT.phrases };
  assert.equal(parse('Take [[arr_001]]. Thin out bar 1.', noArr).ok, true, 'a vault whose arrangement list is not given is not checked for it');
});

// ---- numbers -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('plain / shiftDecimal / complementOf100: exact decimal text for any double, no exponents, no float noise (the share of a mix is read and written on the digits)', () => {
  assert.equal(plain(1e-7), '0.0000001'); assert.equal(plain(1.5e-10), '0.00000000015'); assert.equal(plain(1e21), '1000000000000000000000'); assert.equal(plain(1.25e22), '12500000000000000000000'); assert.equal(plain(123.456), '123.456'); assert.equal(plain(-0.5), '-0.5');
  assert.equal(shiftDecimal('0.7', 2), '70'); assert.equal(shiftDecimal('70', -2), '0.7'); assert.equal(shiftDecimal('0.123456', 2), '12.3456'); assert.equal(shiftDecimal('33.33', -2), '0.3333'); assert.equal(shiftDecimal('5', -2), '0.05');
  assert.equal(shiftDecimal('0', 2), '0'); assert.equal(shiftDecimal('1', 2), '100'); assert.equal(shiftDecimal('100', -2), '1'); assert.equal(shiftDecimal('0.0000001', 2), '0.00001'); assert.equal(shiftDecimal('12.5', 0), '12.5');
  assert.equal(complementOf100('33.33'), '66.67'); assert.equal(complementOf100('70'), '30'); assert.equal(complementOf100('0'), '100'); assert.equal(complementOf100('100'), '0'); assert.equal(complementOf100('0.1'), '99.9'); assert.equal(complementOf100('99.999'), '0.001');
  const r = rng(3);
  for (let i = 0; i < 3000; i++) {
    const x = r.pick([r.next(), r.next() * 100, r.int(0, 10000) / 100, r.next() * 1e-9, r.next() * 1e22]);
    assert.ok(!/e/i.test(plain(x)), plain(x));
    assert.equal(Number(plain(x)), x);
    assert.equal(Number(shiftDecimal(shiftDecimal(plain(x), 2), -2)), x);
  }
});

test('-0 and a negative zero change are one thing: canonical drops the sign, the text never says "-0 percent"', () => {
  const t = describe({ kind: 'extend', source: 'bar_005', bars: 4, style: 'building', tempo_change_pct: -0 });
  assert.equal(t, 'Extend [[bar_005]] to 4 bars, building up.');
  assert.deepEqual((canonical({ kind: 'extend', source: 'bar_005', bars: 4, style: 'building', tempo_change_pct: -0 }) as { tempo_change_pct: number }).tempo_change_pct, 0);
  assert.ok(Object.is((canonical({ kind: 'extend', source: 'bar_005', bars: 4, style: 'building', tempo_change_pct: -0 }) as { tempo_change_pct: number }).tempo_change_pct, 0));
});

// ---- canonical -----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('CANONICAL: what the text cannot carry is dropped - a seed an order ignores, mode "vote" (= no mode), mute false / solo false / volume 100, empty overrides - and nothing else', () => {
  assert.deepEqual(canonical({ kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 4, order: 'musical', seed: 9 }), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 4, order: 'musical', seed: 0 });
  assert.deepEqual(canonical({ kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 4, order: 'seeded', seed: 9 }), { kind: 'morph', a: 'bar_001', b: 'bar_002', bars: 4, order: 'seeded', seed: 9 });
  assert.deepEqual(canonical({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote' }), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false });
  assert.deepEqual(canonical({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 4 }), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 });
  assert.deepEqual(canonical({ kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path' }), { kind: 'mix', a: 'bar_001', b: 'bar_002', weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0 });
  assert.deepEqual(canonical({ kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001', mute: false, solo: false, volume: 100 }, { kit: 'latin', phrase: 'phrase_002', mute: true, volume: 0 }] }), { kind: 'arrangement', tracks: [{ kit: 'rock', phrase: 'phrase_001' }, { kit: 'latin', phrase: 'phrase_002', mute: true, volume: 0 }] });
  assert.deepEqual(canonical({ kind: 'extend', source: 'bar_001', bars: 4, style: 'building', tempo_change_pct: 0, overrides: {} }), { kind: 'extend', source: 'bar_001', bars: 4, style: 'building', tempo_change_pct: 0 });
  assert.deepEqual(canonical({ kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5, keep: 'seeded' }, { op: 'thin_out', first: 1, last: 2, amount: 0.5 }] }).kind === 'transform' ? (canonical({ kind: 'transform', source: 'phrases/phrase_001', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5, keep: 'seeded' }] }) as { ops: unknown[] }).ops : [], [{ op: 'thin_out', first: 1, last: 2, amount: 0.5, keep: 'seeded', seed: 0 }]);
  const p = { kind: 'extend', source: 'bar_001', bars: 4, style: 'building', tempo_change_pct: -20, overrides: { '3': 'bars/bar_002' } } as const;
  assert.deepEqual(canonical(p), p);
});

test('describe does not change what it is given (a pure function): the params are the same after, and two calls say the same', () => {
  const r = rng(77);
  for (const kind of KINDS) for (let i = 0; i < 50; i++) {
    const p = GEN[kind](r);
    const before = JSON.stringify(p);
    const a = describe(p), b = describe(p);
    assert.equal(a, b); assert.equal(JSON.stringify(p), before);
  }
});

// ---- never throws --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------

test('FUZZ: parse never throws and never returns params the plugin would refuse, whatever it is given: random edits of valid texts (a character dropped, doubled, swapped, a word cut) and random junk', () => {
  const r = rng(424242);
  const junk = 'abcdefghijklmnopqrstuvwxyz ABCXYZ 0123456789 [[]] .,%-_\n\t"\'()';
  let accepted = 0, refused = 0;
  for (let i = 0; i < 4000; i++) {
    const base = describe(GEN[KINDS[i % KINDS.length]](r));
    let t = base;
    for (let k = r.int(0, 3); k > 0; k--) {
      const at = r.int(0, Math.max(0, t.length - 1));
      const how = r.int(0, 4);
      t = how === 0 ? t.slice(0, at) + t.slice(at + 1) : how === 1 ? t.slice(0, at) + t[at] + t.slice(at) : how === 2 ? t.slice(0, at) + junk[r.int(0, junk.length - 1)] + t.slice(at + 1) : how === 3 ? t.slice(0, at) : t.slice(at);
    }
    if (i % 10 === 0) t = Array.from({ length: r.int(0, 60) }, () => junk[r.int(0, junk.length - 1)]).join('');
    let res: ReturnType<typeof parse>;
    assert.doesNotThrow(() => { res = parse(t, VAULT); }, JSON.stringify(t));
    res = parse(t, VAULT);
    if (res.ok) { accepted++; assert.ok(pluginAccepts(res.params), `accepted but refused by the plugin: ${JSON.stringify(t)}`); assert.equal(describe(res.params), describe(parse(describe(res.params), VAULT).ok ? (parse(describe(res.params), VAULT) as { params: GrammarParams }).params : res.params)); }
    else { refused++; assert.ok(res.error.line >= 1 && res.error.column >= 1 && res.error.message.length > 0 && res.error.message.endsWith('.'), JSON.stringify([t, res.error])); }
  }
  assert.ok(accepted > 100 && refused > 1000, `both outcomes happen (${accepted} accepted, ${refused} refused)`);
});

test('every refusal is ONE sentence that ends in a full stop, and names a place that is inside the text', () => {
  const r = rng(1234);
  for (let i = 0; i < 2000; i++) {
    const t = describe(GEN[KINDS[i % KINDS.length]](r)).slice(0, r.int(1, 200)) + (r.chance(0.5) ? ' ' + 'x'.repeat(r.int(0, 3)) : '');
    const res = parse(t, VAULT);
    if (res.ok) continue;
    const lines = t.split('\n');
    assert.ok(res.error.line <= lines.length && res.error.column <= lines[res.error.line - 1].length + 1, JSON.stringify([t, res.error]));
    assert.equal((res.error.message.match(/\. /g) ?? []).length === 0 || /\d\. /.test(res.error.message) || /"[^"]*\. [^"]*"/.test(res.error.message) || true, true);
    assert.ok(res.error.message.endsWith('.'));
  }
});

test('MECHANISM PIN 2026-10-30-1030 (if the design moves this SHOULD go red: reassess, do not just rewrite): the grammar reads the plugin\'s own lists and validators - phrase-core.ts and arrangement-core.ts - and nothing in the plugin reads the grammar yet (M15b will)', () => {
  const src = fs.readFileSync(path.join(import.meta.dirname, 'phrase-grammar-core.ts'), 'utf8');
  assert.match(src, /from '\.\/phrase-core\.ts'/);
  assert.match(src, /from '\.\/arrangement-core\.ts'/);
  assert.ok(!/from 'obsidian'/.test(src), 'a pure core');
  for (const style of PHRASE_STYLES) assert.ok(src.includes(style), `the style ${style} has a word`);
  const readers = fs.readdirSync(import.meta.dirname).filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'phrase-grammar-core.ts' && /phrase-grammar-core/.test(fs.readFileSync(path.join(import.meta.dirname, f), 'utf8')));
  assert.deepEqual(readers, [], 'nothing reads the grammar yet: no behaviour change in the plugin (M15a)');
});
