// 2026-11-19-0999b (MIX AND EXTEND AS STEPS INSIDE A PHRASE, with place words) - the GRAMMAR half, written RED first (against 1fa4685: `Mix bars 2 and 3.` and `Extend bar 2 to 4 bars.` were not steps; as later lines they were unreadable and the service was asked).
// The driver's decision (2026-11-19, "[3] yes"): `Mix bars 2 and 3.` makes the mix of the phrase's bar 2 and bar 3 (the Mix HEAD's words and defaults: share, vote or path, order and seed, threshold, ghost notes) and INSERTS the ONE bar it makes at the place named (the place words of
// Morph-between); `Extend bar 2 to 4 bars.` REPLACES bar 2 by the 4 bars (the Extend head's words and defaults: style, tempo), and with a place word the original STAYS and the 4 bars are INSERTED. Pinned here, for every word and refusal:
//   * the canonical sentence of every form and its round trip (the canonical sentence reads back to the same params), the defaults (share 50, vote, threshold 50, ghost off; 4 bars, repeating with fills, tempo 0; place between two neighbours else after the later bar; Extend with no place = replace);
//   * the refusals in words (the same bar twice, N out of range, a place that is not a gap, a share that names another bar, a threshold on a path, a step after a Thin out or a Double up with the code `order`, a step as the first line with the code `head`, Extend of several bars with the code `refused`);
//   * the json cache, the Recipe read back, the Python facet; a corruption fuzz (every token damaged: refused) and a never-throws fuzz (cut, repeated, shuffled), as the card section 24 asks of a parser.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { parse, describe, canonical, type GrammarParams } from './phrase-grammar-core.ts';
import { formatPhraseJson, readPhraseNote, validatePhrase, type PhraseParams } from './phrase-core.ts';
import { phrasePython, phraseRecipeSteps } from './phrase-notes-core.ts';
import { isHeadLine, subjectOf } from './sentence-list-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

const V = PHRASE_VAULT;
const EXTEND = 'Extend [[bar_005]] to 8 bars, repeating with fills.';
const TAKE = 'Take [[phrase_003]].';
const ok = (text: string): GrammarParams => { const r = parse(text, V); assert.ok(r.ok, `"${text}" should read: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: GrammarParams }).params; };
const bad = (text: string): { message: string; line: number; column: number; code?: string } => { const r = parse(text, V); assert.ok(!r.ok, `"${text}" should be refused`); return (r as { ok: false; error: { message: string; line: number; column: number; code?: string } }).error; };
const opsOf = (p: GrammarParams): unknown[] => ((p as { ops?: unknown[] }).ops ?? []);

// ---- Mix ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const MX = (extra: Record<string, unknown> = {}): unknown => ({ op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 2, ...extra });
const mixSaid = (rest: string): string => `${EXTEND} Mix bars 2 and 3${rest}`;
test('`Mix bars 2 and 3.` is a step of the phrase (not a head): the Mix head\'s defaults (50 percent, a vote, threshold 50, no ghost notes), put between the two neighbours; the canonical sentence says everything, and the Extend head stays', () => {
  const p = ok(`${EXTEND} Mix bars 2 and 3.`);
  assert.deepEqual(opsOf(p), [MX()]);
  assert.equal((p as { kind: string }).kind, 'extend', 'the head is still the Extend (the line did not replace it)');
  assert.equal(describe(p), `${EXTEND} Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it between bars 2 and 3.`);
  assert.deepEqual(ok(describe(p)), p);
});
test('the long forms and the click\'s words are read: "bar 2 and bar 3", "with", "bars 2 with 3", any case, with or without the full stop', () => {
  for (const t of ['Mix bar 2 and bar 3.', 'Mix bars 2 with 3.', 'mix bar 2 with bar 3', 'MIX BARS 2 AND 3', 'Mix bars 2 and 3']) assert.deepEqual(opsOf(ok(`${EXTEND} ${t}`)), [MX()], t);
});
test('the share is the head\'s: "70 percent bar 2", "70 percent the first", "70% of the second" (weight is a\'s: 70 percent of bar 3 is 30 percent of bar 2); the canonical sentence names the FIRST bar', () => {
  assert.deepEqual(opsOf(ok(mixSaid(', 70 percent bar 2.'))), [MX({ weight: 0.7 })]);
  assert.deepEqual(opsOf(ok(mixSaid(', 70 percent bar 3.'))), [MX({ weight: 0.3 })]);
  assert.deepEqual(opsOf(ok(mixSaid(', 70 percent the first.'))), [MX({ weight: 0.7 })]);
  assert.deepEqual(opsOf(ok(mixSaid(', 70 percent of the second.'))), [MX({ weight: 0.3 })]);
  assert.deepEqual(opsOf(ok(mixSaid(', 70% the first.'))), [MX({ weight: 0.7 })]);
  assert.deepEqual(opsOf(ok(mixSaid(', 0 percent bar 2.'))), [MX({ weight: 0 })]);
  assert.deepEqual(opsOf(ok(mixSaid(', 100 percent bar 2.'))), [MX({ weight: 1 })]);
  assert.deepEqual(opsOf(ok(mixSaid(' 70 percent bar 2.'))), [MX({ weight: 0.7 })], 'the comma before a segment is optional, as in the heads');
  assert.equal(describe(ok(mixSaid(', 70 percent bar 3.'))), `${EXTEND} Mix bars 2 and 3, 30 percent bar 2, as a vote, and put it between bars 2 and 3.`);
  assert.equal(describe(ok(mixSaid(', 33.5 percent bar 2.'))), `${EXTEND} Mix bars 2 and 3, 33.5 percent bar 2, as a vote, and put it between bars 2 and 3.`, 'exact decimals (the head\'s shiftDecimal)');
  assert.equal((opsOf(ok(mixSaid(', 33.5 percent bar 2.')))[0] as { weight: number }).weight, 0.335);
});
test('the mode, the order and the seed are the head\'s: "as a vote" (the default, always said), "as a path, in musical|seeded|by-channel order"; a seed is stored in the sentence and only with the seeded order', () => {
  const path = ok(mixSaid(', 50 percent bar 2, as a path.'));
  assert.deepEqual(opsOf(path), [MX({ mode: 'path', order: 'musical', seed: 0 })]);
  assert.equal(describe(path), `${EXTEND} Mix bars 2 and 3, 50 percent bar 2, as a path, in musical order, and put it between bars 2 and 3.`);
  const seeded = ok(mixSaid(', as a path, in seeded order, seed 17.'));
  assert.deepEqual(opsOf(seeded), [MX({ mode: 'path', order: 'seeded', seed: 17 })]);
  assert.equal(describe(seeded), `${EXTEND} Mix bars 2 and 3, 50 percent bar 2, as a path, in seeded order, seed 17, and put it between bars 2 and 3.`);
  assert.deepEqual(ok(describe(seeded)), seeded);
  assert.deepEqual(opsOf(ok(mixSaid(', as a path, in seeded order.'))), [MX({ mode: 'path', order: 'seeded', seed: 0 })], 'no seed said: 0 (the controller draws one at the preview)');
  assert.deepEqual(opsOf(ok(mixSaid(', as a path, in by-channel order, and put it at the end.'))), [MX({ mode: 'path', order: 'by_channel', seed: 0, after: 'end' })]);
  assert.deepEqual(opsOf(ok(mixSaid(', as a vote.'))), [MX()]);
  assert.match(bad(mixSaid(', as a path, in musical order, seed 4.')).message, /seed only with the seeded order/);
  assert.match(bad(mixSaid(', in seeded order.')).message, /only for a mix as a path/);
  assert.match(bad(mixSaid(', as a vote, in musical order.')).message, /only for a mix as a path/);
});
test('the threshold and the ghost notes are the head\'s words inside the step: "threshold 40 percent" and "with ghost notes" (omitted when they are the defaults, 50 and off); on a path they are refused in words, not ignored', () => {
  const p = ok(mixSaid(', 70 percent bar 2, as a vote, threshold 40 percent, with ghost notes.'));
  assert.deepEqual(opsOf(p), [MX({ weight: 0.7, threshold: 0.4, ghost: true })]);
  assert.equal(describe(p), `${EXTEND} Mix bars 2 and 3, 70 percent bar 2, as a vote, threshold 40 percent, with ghost notes, and put it between bars 2 and 3.`);
  assert.deepEqual(ok(describe(p)), p);
  assert.deepEqual(opsOf(ok(mixSaid(', with ghost notes, threshold 40%.'))), [MX({ threshold: 0.4, ghost: true })], 'any order');
  assert.equal(describe(ok(mixSaid(', threshold 50 percent.'))), describe(ok(mixSaid('.'))), 'a threshold of 50 is the default and is not said');
  assert.match(bad(mixSaid(', as a path, threshold 40 percent.')).message, /vote/);
  assert.match(bad(mixSaid(', with ghost notes, as a path.')).message, /vote/);
  assert.match(bad(mixSaid(', threshold 140 percent.')).message, /0 to 100/);
  assert.match(bad(mixSaid(', threshold 40 percent, threshold 30 percent.')).message, /said twice/);
});
const MIX_PLACES: Array<[string, unknown, string]> = [
  ['and put it after bar 3', MX({ after: 3 }), 'after bar 3'], ['and put it before bar 2', MX({ after: 1 }), 'after bar 1'], ['before bar 1', MX({ after: 0 }), 'at the start'], ['and put it between bars 2 and 3', MX({ after: 2 }), 'between bars 2 and 3'],
  ['put them in between 2 and 3', MX({ after: 2 }), 'between bars 2 and 3'], ['and put it at the start', MX({ after: 0 }), 'at the start'], ['at the beginning', MX({ after: 0 }), 'at the start'], ['and put it at the end', MX({ after: 'end' }), 'at the end'],
  ['after bar 6', MX({ after: 6 }), 'after bar 6'], ['before bar 4', MX({ after: 3 }), 'after bar 3'], ['place it after bar 3', MX({ after: 3 }), 'after bar 3'],
];
for (const [said, op, words] of MIX_PLACES) {
  test(`Mix: place words "${said}" are read; the canonical sentence says "${words}"`, () => {
    const p = ok(mixSaid(` ${said}.`));
    assert.deepEqual(opsOf(p), [op]);
    assert.equal(describe(p), `${EXTEND} Mix bars 2 and 3, 50 percent bar 2, as a vote, and put it ${words}.`);
    assert.deepEqual(ok(describe(p)), p, 'the canonical sentence reads back to the same params');
  });
}
test('Mix: the default place is between two neighbouring bars (whichever order they are said in), otherwise after the later bar; the canonical sentence always says its place', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Mix bars 2 and 5.`)), [MX({ a: 2, b: 5, after: 5 })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Mix bars 5 and 2.`)), [MX({ a: 5, b: 2, after: 5 })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Mix bars 3 and 2.`)), [MX({ a: 3, b: 2, after: 2 })], 'neighbours said backwards: the gap between them');
  assert.equal(describe(ok(`${EXTEND} Mix bars 3 and 2.`)), `${EXTEND} Mix bars 3 and 2, 50 percent bar 3, as a vote, and put it between bars 2 and 3.`);
  assert.equal(describe(ok(`${EXTEND} Mix bars 2 and 5.`)), `${EXTEND} Mix bars 2 and 5, 50 percent bar 2, as a vote, and put it after bar 5.`);
});
test('Mix is valid after every head and after other steps; the Mix HEAD is unchanged and still a HEAD (also with a bare note name)', () => {
  assert.deepEqual(opsOf(ok(`${TAKE} Mix bars 2 and 3.`)), [MX()]);
  assert.deepEqual(opsOf(ok('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote. Mix bars 1 and 2.')), [MX({ a: 1, b: 2, after: 1 })]);
  assert.deepEqual(opsOf(ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Mix bars 2 and 3.')), [MX()]);
  assert.deepEqual(opsOf(ok(`${TAKE} Delete bar 1. Mix bars 2 and 3. Copy bar 1.`)), [{ op: 'delete', runs: [[1, 1]] }, MX(), { op: 'copy', runs: [[1, 1]] }]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Morph bars 1 and 2 across 2 bars. Mix bars 2 and 3. Extend bar 1 to 2 bars.`)).map((o) => (o as { op: string }).op), ['morph_between', 'mix_bars', 'extend_bar']);
  for (const head of ['Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.', 'Mix bar_005 and bar_006.']) {
    const p = ok(head); assert.equal((p as { kind: string }).kind, 'mix', head); assert.deepEqual(opsOf(p), []);
  }
  assert.equal(describe(ok('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.')), 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote.');
  assert.equal((ok('Extend bar_005 to 4 bars.') as { kind: string }).kind, 'extend', 'a bare note name bar_005 is a head, not "bar 5"');
});
test('Mix refusals in words: the same bar twice, one bar only, a share that names another bar, a share out of range, a segment said twice, a place that is not a gap, an unknown place', () => {
  assert.match(bad(`${EXTEND} Mix bars 2 and 2.`).message, /two different bars/);
  assert.match(bad(`${EXTEND} Mix bar 2.`).message, /"and"/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3, 70 percent bar 5.`).message, /bar 2 or bar 3/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3, 140 percent bar 2.`).message, /0 to 100/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3, 50 percent bar 2, 60 percent bar 3.`).message, /said twice/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3, as a vote, as a path.`).message, /said twice/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3, between bars 2 and 5.`).message, /neighbouring/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3, put it somewhere.`).message, /place/);
  assert.match(bad(`${EXTEND} Mix bars 2 and 3 across 5 bars.`).message, /Expected/);
});

// ---- Extend ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
const EX = (extra: Record<string, unknown> = {}): unknown => ({ op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0, ...extra });
test('`Extend bar 2 to 4 bars.` REPLACES bar 2 by the 4 bars: no place word, so no `after`; the head\'s defaults (repeating with fills, tempo 0); the canonical sentence has no place', () => {
  const p = ok(`${EXTEND} Extend bar 2 to 4 bars.`);
  assert.deepEqual(opsOf(p), [EX()]);
  assert.ok(!('after' in (opsOf(p)[0] as object)), 'a replace has no `after` key at all');
  assert.equal((p as { kind: string }).kind, 'extend', 'the head is still the first Extend');
  assert.equal(describe(p), `${EXTEND} Extend bar 2 to 4 bars, repeating with fills.`);
  assert.deepEqual(ok(describe(p)), p);
});
test('the head\'s defaults when words are left out: `Extend bar 2.` is 4 bars; the number of bars is read as the head reads it ("to 4 bar", "to 1 bar", two to ten as words)', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2.`)), [EX()]);
  assert.deepEqual(opsOf(ok(`${EXTEND} extend bar 2 to four bars`)), [EX()]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 1 bar.`)), [EX({ bars: 1 })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 64 bars.`)), [EX({ bars: 64 })]);
  assert.equal(describe(ok(`${EXTEND} Extend bar 2 to 1 bar.`)), `${EXTEND} Extend bar 2 to 1 bar, repeating with fills.`);
});
test('the style and the tempo are the head\'s words: "building up", "adding ghost notes", the raw names, "20 percent slower" / "10 percent faster"; the canonical sentence says the style always and the tempo only when it is not 0', () => {
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, building up.`)), [EX({ style: 'building' })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, adding ghost notes.`)), [EX({ style: 'ghost_notes' })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, building.`)), [EX({ style: 'building' })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, ghost_notes.`)), [EX({ style: 'ghost_notes' })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, repeating with fills, 20 percent slower.`)), [EX({ tempo_change_pct: -20 })]);
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, 10% faster, building up.`)), [EX({ style: 'building', tempo_change_pct: 10 })], 'any order');
  assert.deepEqual(opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, 0 percent slower.`)), [EX()], '0 is no change (and -0 never appears)');
  assert.ok(Object.is((opsOf(ok(`${EXTEND} Extend bar 2 to 4 bars, 0 percent slower.`))[0] as { tempo_change_pct: number }).tempo_change_pct, 0));
  assert.equal(describe(ok(`${EXTEND} Extend bar 2 to 6 bars, 10% faster, building up.`)), `${EXTEND} Extend bar 2 to 6 bars, building up, 10 percent faster.`);
  assert.equal(describe(ok(`${EXTEND} Extend bar 2 to 6 bars, adding ghost notes, 90 percent slower.`)), `${EXTEND} Extend bar 2 to 6 bars, adding ghost notes, 90 percent slower.`);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars, 95 percent slower.`).message, /0 to 90 percent slower/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars, 101 percent faster.`).message, /0 to 100 percent faster/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars, 20 percent.`).message, /slower|faster/);
});
const EXT_PLACES: Array<[string, unknown, string]> = [
  ['and put them at the end', EX({ after: 'end' }), 'at the end'], ['at the end', EX({ after: 'end' }), 'at the end'], ['and put them at the start', EX({ after: 0 }), 'at the start'], ['and put them after bar 2', EX({ after: 2 }), 'after bar 2'],
  ['and put them after bar 6', EX({ after: 6 }), 'after bar 6'], ['and put them before bar 2', EX({ after: 1 }), 'after bar 1'], ['before bar 1', EX({ after: 0 }), 'at the start'], ['and put them between bars 2 and 3', EX({ after: 2 }), 'after bar 2'], ['put them in between 4 and 5', EX({ after: 4 }), 'after bar 4'],
];
for (const [said, op, words] of EXT_PLACES) {
  test(`Extend: a place word ("${said}") makes it an INSERT, the original stays; canonical says "${words}"`, () => {
    const p = ok(`${EXTEND} Extend bar 2 to 4 bars ${said}.`);
    assert.deepEqual(opsOf(p), [op]);
    assert.equal(describe(p), `${EXTEND} Extend bar 2 to 4 bars, repeating with fills, and put them ${words}.`);
    assert.deepEqual(ok(describe(p)), p, 'the canonical sentence reads back to the same params');
  });
}
test('Extend: one new bar says "it"; a seed-free, style-and-tempo sentence with a place round-trips; every style and place', () => {
  const one = ok(`${EXTEND} Extend bar 3 to 1 bar and put it at the end.`);
  assert.equal(describe(one), `${EXTEND} Extend bar 3 to 1 bar, repeating with fills, and put it at the end.`);
  assert.deepEqual(ok(describe(one)), one);
  for (const style of ['repeating with fills', 'building up', 'adding ghost notes']) for (const place of ['', ' and put them at the start', ' and put them after bar 5', ' and put them at the end']) for (const tempo of ['', ', 20 percent slower', ', 15 percent faster']) {
    const p = ok(`${EXTEND} Extend bar 3 to 5 bars, ${style}${tempo}${place}.`);
    assert.deepEqual(ok(describe(p)), p, `${style}${tempo}${place}`);
  }
});
test('Extend is valid after every head and after other steps (also the head Extend [[bar]] stays a HEAD)', () => {
  assert.deepEqual(opsOf(ok(`${TAKE} Extend bar 2 to 4 bars.`)), [EX()]);
  assert.deepEqual(opsOf(ok('Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a vote. Extend bar 1 to 4 bars.')), [EX({ bar: 1 })]);
  assert.deepEqual(opsOf(ok('Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Extend bar 2 to 4 bars.')), [EX()]);
  assert.deepEqual(opsOf(ok(`${TAKE} Delete bar 1. Extend bar 2 to 2 bars. Copy bar 1.`)), [{ op: 'delete', runs: [[1, 1]] }, EX({ bars: 2 }), { op: 'copy', runs: [[1, 1]] }]);
  assert.equal((ok('Extend [[bar_005]] to 8 bars, repeating with fills.') as { kind: string }).kind, 'extend');
});
test('Extend refusals in words: N out of range or not whole, bar 0, no "bars", several bars (code refused, with the sentence to say instead), a style or a tempo said twice, an unknown place', () => {
  assert.match(bad(`${EXTEND} Extend bar 2 to 0 bars.`).message, /1 to 64/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 65 bars.`).message, /1 to 64/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 2.5 bars.`).message, /whole number/);
  assert.match(bad(`${EXTEND} Extend bar 0 to 4 bars.`).message, /bar number|1 or more/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4.`).message, /"bars"/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars, building up, adding ghost notes.`).message, /said twice/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars, 10 percent faster, 20 percent slower.`).message, /said twice/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars to 5 bars.`).message, /said twice/);
  assert.match(bad(`${EXTEND} Extend bar 2 to 4 bars, put them somewhere.`).message, /place/);
  for (const t of ['Extend bars 2 and 3 to 4 bars.', 'Extend bar 2 and bar 3 to 4 bars.', 'Extend bar 2, bar 3 to 4 bars.']) {
    const e = bad(`${EXTEND} ${t}`); assert.equal(e.code, 'refused', t); assert.match(e.message, /one bar at a time/); assert.match(e.message, /Say "Extend bar 2 to 4 bars\."/, t);
  }
  assert.equal(bad(`${EXTEND} Extend bar 2 to 4 bars, put them between bars 2 and 5.`).code, undefined, 'a plain unreadable line, the service may be asked');
});

// ---- the order rule, the head rule, the list ---------------------------------------------------------------------------------------------------------------------------------------------
test('the order rule: a Mix step and an Extend step after a Thin out or a Double up are refused with the code "order" (never re-sorted); the same steps before them are fine; the validators say the same', () => {
  const dense = `${TAKE} Thin out bars 1 to 2, by half, keeping the downbeat.`;
  for (const line of ['Mix bars 2 and 3.', 'Extend bar 2 to 4 bars.', 'Extend bar 2 to 4 bars and put them at the end.']) assert.equal(bad(`${dense} ${line}`).code, 'order', line);
  assert.ok(parse(`${TAKE} Mix bars 2 and 3. Extend bar 2 to 4 bars. Thin out bars 1 to 2, by half, keeping the downbeat.`, V).ok, 'steps first, then density: fine');
  for (const op of [MX(), EX()]) assert.equal(validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }, op] } as never).ok, false);
});
test('a line whose first sentence is a Mix step or an Extend step has no head: code "head", in words that name the line', () => {
  const m = bad('Mix bars 2 and 3.'); assert.equal(m.code, 'head'); assert.match(m.message, /Extend, Mix, Morph or Take/); assert.match(m.message, /Mix bars N and M/);
  const e = bad('Extend bar 2 to 4 bars.'); assert.equal(e.code, 'head'); assert.match(e.message, /Extend, Mix, Morph or Take/); assert.match(e.message, /Extend bar N to K bars/);
  assert.equal(bad('Morph bars 2 and 3 across 5 bars.').code, 'head');
  assert.match(bad('Morph bars 2 and 3 across 5 bars.').message, /Morph bars N and M across K bars/, 'the Morph words are as they were');
});
test('isHeadLine / subjectOf: Mix bars N and Extend bar N are steps (not heads, no conflict subject), the head words are unchanged', () => {
  const rows: Array<[string, boolean]> = [['Mix [[bar_005]] and [[bar_006]].', true], ['Extend [[bar_005]] to 8 bars.', true], ['Extend bar_005 to 8 bars.', true], ['Mix bar_005 and bar_006.', true], ['mix', true], ['Extend', true], ['Mix bars', true], ['Extend bar', true], ['Mix barsx 2', true], ['Extend bar2', true],
    ['Mix bars 2 and 3.', false], ['Mix bar 2 and bar 3', false], ['mix  bars  2', false], ['MIX BAR 2', false], ['Extend bar 2 to 4 bars.', false], ['extend bars 2', false], ['  Extend bar 12 to 4 bars', false], ['Extend\tbar\t2', false], ['Mixed bars 2', false], ['Extended bar 2', false]];
  for (const [t, want] of rows) {
    assert.equal(isHeadLine(t), want, JSON.stringify(t));
    if (!want) assert.notEqual(subjectOf(t, 'phrase'), 'head', JSON.stringify(t));
  }
  assert.equal(subjectOf('Mix bars 2 and 3.', 'phrase'), null); assert.equal(subjectOf('Extend bar 2 to 4 bars.', 'phrase'), null);
});

// ---- every derived part says it --------------------------------------------------------------------------------------------------------------------------------------------------------------
const FULL = `${EXTEND} Mix bars 2 and 3, 70 percent bar 2, as a vote, threshold 40 percent, with ghost notes, and put it after bar 5. Extend bar 2 to 3 bars, building up, 20 percent slower. Mix bars 1 and 4, as a path, in seeded order, seed 9, and put it at the end. Extend bar 1 to 2 bars, adding ghost notes, and put them at the start.`;
test('json cache: both steps are written and read back; the validators know their fields', () => {
  const p = ok(FULL) as PhraseParams;
  const json = formatPhraseJson(p);
  assert.match(json, /\{"op": "mix_bars", "a": 2, "b": 3, "weight": 0\.7, "threshold": 0\.4, "ghost": true, "mode": "vote", "after": 5\}/);
  assert.match(json, /\{"op": "extend_bar", "bar": 2, "bars": 3, "style": "building", "tempo_change_pct": -20\}/);
  assert.match(json, /\{"op": "mix_bars", "a": 1, "b": 4, "weight": 0\.5, "threshold": 0\.5, "ghost": false, "mode": "path", "order": "seeded", "seed": 9, "after": "end"\}/);
  assert.match(json, /\{"op": "extend_bar", "bar": 1, "bars": 2, "style": "ghost_notes", "tempo_change_pct": 0, "after": 0\}/);
  const back = readPhraseNote(`---\ntype: data\ncontent_type: json\n---\n\n\`\`\`json\n${json}\n\`\`\`\n`);
  assert.ok(back.ok, back.ok ? '' : back.message); assert.deepEqual(back.ok && canonical(back.value as GrammarParams), canonical(p as GrammarParams));
});
test('the Recipe says both steps in the Description\'s own words (also as the FIRST step of a Take and after a Mix or Morph head)', () => {          // 2026-11-26-1047 (deliberate): the Recipe is no longer read back
  for (const text of [FULL, `${TAKE} Mix bars 2 and 3. Extend bar 2 to 3 bars.`, `${TAKE} Extend bar 2 to 3 bars, and put them at the end.`, 'Morph [[bar_003]] into [[bar_001]] over 5 bars, in musical order. Mix bars 1 and 2.', 'Mix [[bar_005]] and [[bar_006]], 70 percent [[bar_005]], as a path, in musical order. Extend bar 1 to 2 bars.']) {
    const p = ok(text);
    const steps = phraseRecipeSteps(p as PhraseParams);
    assert.ok(steps.some((s) => /^(?:Mix bars \d+ and \d+, \d+ percent bar \d+, as a (?:vote|path)|Extend bar \d+ to \d+ bars?, )/.test(s)), steps.join(' | '));
  }
});
test('the Python facet says both steps with the engine\'s own functions (mix_rhythm / the path\'s morph_rhythm, extend_rhythm), the place as a slice, an Extend with no place as a replace of bar k', () => {
  const py = (t: string): string => phrasePython(ok(`${EXTEND} ${t}`) as PhraseParams);
  assert.match(py('Mix bars 2 and 3, 70 percent bar 2, threshold 40 percent, with ghost notes.'), /mix_rhythm\(a=bars\[1\], b=bars\[2\], weight=0\.7, threshold=0\.4, ghost=True\)/);
  assert.match(py('Mix bars 2 and 3.'), /bars\[2:2\] = _new/);
  assert.match(py('Mix bars 2 and 3 at the end.'), /bars = bars \+ _new/);
  assert.match(py('Mix bars 2 and 3, as a path, in seeded order, seed 5.'), /morph_rhythm_info\(a=bars\[1\], b=bars\[2\], order='seeded', seed=5\)/);
  assert.match(py('Mix bars 2 and 3, as a path, in seeded order, seed 5.'), /morph_rhythm\(a=bars\[1\], b=bars\[2\], bars=1, order='seeded', seed=5, position=/);
  assert.match(py('Extend bar 2 to 4 bars, building up, 20 percent slower.'), /extend_rhythm\(data=bars\[1\], bars=4, style='building', tempo_change_pct=-20\)/);
  assert.match(py('Extend bar 2 to 4 bars.'), /bars\[1:2\] = _new/, 'replace: bar 2 is the slice 1:2');
  assert.match(py('Extend bar 2 to 4 bars and put them after bar 6.'), /bars\[6:6\] = _new/);
  assert.match(py('Extend bar 2 to 4 bars and put them at the end.'), /bars = bars \+ _new/);
});

// ---- the validators: every field, every wrong value, the whole answer -------------------------------------------------------------------------------------------------------------------------
const MIXV = { op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'vote', after: 2 };
const EXV = { op: 'extend_bar', bar: 2, bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 };
const ask = (op: Record<string, unknown>): string => { const r = validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [op] } as never); return r.ok ? `OK ${JSON.stringify((r.value as { ops: unknown[] }).ops[0])}` : `ERR ${r.message}`; };
const WHOLE = (f: string, v: string): string => `ERR ops[0].${f} must be a bar number of this phrase (a whole number, 1 or more), got ${v}.`;
test('validateMixBars: the exact answer for every field and every wrong value (words, the value kept: the seed and the order only of a path, a seed only of the seeded order, a missing mode is a vote)', () => {
  const m = (o: Record<string, unknown>, drop = ''): string => { const op: Record<string, unknown> = { ...MIXV, ...o }; if (drop) delete op[drop]; return ask(op); };
  assert.equal(m({}), `OK ${JSON.stringify(MIXV)}`);
  for (const [f, v, shown] of [['a', 0, '0'], ['a', -1, '-1'], ['a', 2.5, '2.5'], ['a', '2', '"2"'], ['a', null, 'null'], ['b', 0, '0'], ['b', 2.5, '2.5'], ['b', '3', '"3"'], ['b', null, 'null']] as const) assert.equal(m({ [f]: v }), WHOLE(f, shown), `${f}=${String(v)}`);
  assert.equal(m({}, 'a'), WHOLE('a', 'undefined')); assert.equal(m({}, 'b'), WHOLE('b', 'undefined'));
  assert.equal(m({ a: 4, b: 4 }), 'ERR ops[0]: a and b must be two different bars, got bar 4 twice.');
  for (const [f, v, shown] of [['weight', -0.1, '-0.1'], ['weight', 1.1, '1.1'], ['weight', '0.5', '"0.5"'], ['weight', null, 'null'], ['threshold', -1, '-1'], ['threshold', 2, '2'], ['threshold', 'x', '"x"']] as const) assert.equal(m({ [f]: v }), `ERR ops[0].${f} must be a number from 0 to 1, got ${shown}.`, `${f}=${String(v)}`);
  assert.equal(m({ weight: 0 }), `OK ${JSON.stringify({ ...MIXV, weight: 0 })}`); assert.equal(m({ weight: 1 }), `OK ${JSON.stringify({ ...MIXV, weight: 1 })}`);
  assert.equal(m({ ghost: 'yes' }), 'ERR ops[0].ghost must be true or false, got "yes".');
  assert.equal(m({ mode: 'blend' }), 'ERR ops[0].mode must be "vote" or "path", got "blend".');
  assert.equal(m({}, 'mode'), `OK ${JSON.stringify(MIXV)}`, 'a missing mode is a vote');
  assert.equal(m({ mode: 'path', order: 'seeded', seed: 7 }), `OK ${JSON.stringify({ op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'seeded', seed: 7, after: 2 })}`);
  assert.equal(m({ mode: 'path' }), `OK ${JSON.stringify({ op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'musical', seed: 0, after: 2 })}`, 'a path says its order and seed');
  assert.equal(m({ mode: 'path', order: 'by_channel', seed: 9 }), `OK ${JSON.stringify({ op: 'mix_bars', a: 2, b: 3, weight: 0.5, threshold: 0.5, ghost: false, mode: 'path', order: 'by_channel', seed: 0, after: 2 })}`, 'a seed outside the seeded order is 0');
  assert.equal(m({ mode: 'path', order: 'x' }), 'ERR ops[0].order must be one of musical, seeded, by_channel, got "x".');
  assert.equal(m({ mode: 'path', order: 'seeded', seed: -1 }), 'ERR ops[0].seed must be a whole number, 0 or more, got -1.');
  assert.equal(m({ mode: 'path', order: 'seeded', seed: 1.5 }), 'ERR ops[0].seed must be a whole number, 0 or more, got 1.5.');
  assert.equal(m({ order: 'musical' }), 'ERR ops[0]: order and seed only apply to a mix as a path (set "mode": "path").');
  assert.equal(m({ seed: 3 }), 'ERR ops[0]: order and seed only apply to a mix as a path (set "mode": "path").');
  assert.equal(m({ mode: 'path', threshold: 0.4 }), 'ERR ops[0]: threshold and ghost notes only apply to a mix as a vote.');
  assert.equal(m({ mode: 'path', ghost: true }), 'ERR ops[0]: threshold and ghost notes only apply to a mix as a vote.');
  for (const [v, shown] of [[-1, '-1'], ['middle', '"middle"'], [1.5, '1.5'], [null, 'null']] as const) assert.equal(m({ after: v }), `ERR ops[0].after must be the bar the new bar follows (0 = at the start) or "end", got ${shown}.`, `after=${String(v)}`);
  assert.equal(m({}, 'after'), 'ERR ops[0].after must be the bar the new bar follows (0 = at the start) or "end", got undefined.');
  assert.equal(m({ after: 0 }), `OK ${JSON.stringify({ ...MIXV, after: 0 })}`); assert.equal(m({ after: 'end' }), `OK ${JSON.stringify({ ...MIXV, after: 'end' })}`);
  assert.equal(m({ extra: 1 }), 'ERR ops[0]: unexpected field "extra" (mix_bars holds only op, a, b, weight, threshold, ghost, mode, order, seed, after).');
});
test('validateExtendBar: the exact answer for every field and every wrong value (bars 1 to 64, the three styles, tempo -90 to 100, `after` absent = replace)', () => {
  const e = (o: Record<string, unknown>, drop = ''): string => { const op: Record<string, unknown> = { ...EXV, ...o }; if (drop) delete op[drop]; return ask(op); };
  assert.equal(e({}), `OK ${JSON.stringify(EXV)}`);
  for (const [v, shown] of [[0, '0'], [-1, '-1'], [2.5, '2.5'], ['2', '"2"'], [null, 'null']] as const) assert.equal(e({ bar: v }), WHOLE('bar', shown), `bar=${String(v)}`);
  assert.equal(e({}, 'bar'), WHOLE('bar', 'undefined'));
  for (const v of [0, 65, 2.5, -1]) assert.equal(e({ bars: v }), `ERR ops[0].bars must be a whole number of bars from 1 to 64, got ${v}.`, `bars=${v}`);
  assert.equal(e({ bars: '4' }), 'ERR ops[0].bars must be a whole number of bars from 1 to 64, got "4".');
  assert.equal(e({ bars: 1 }), `OK ${JSON.stringify({ ...EXV, bars: 1 })}`); assert.equal(e({ bars: 64 }), `OK ${JSON.stringify({ ...EXV, bars: 64 })}`);
  assert.equal(e({}, 'bars'), 'ERR ops[0].bars must be a whole number of bars from 1 to 64, got undefined.');
  assert.equal(e({ style: 'wild' }), 'ERR ops[0].style must be one of repeat_with_fills, building, ghost_notes, got "wild".');
  assert.equal(e({ style: 'building' }), `OK ${JSON.stringify({ ...EXV, style: 'building' })}`);
  assert.equal(e({}, 'style'), `OK ${JSON.stringify(EXV)}`, 'a missing style is the head\'s default');
  assert.equal(e({ tempo_change_pct: -91 }), 'ERR ops[0].tempo_change_pct must be a number from -90 to 100, got -91.');
  assert.equal(e({ tempo_change_pct: 101 }), 'ERR ops[0].tempo_change_pct must be a number from -90 to 100, got 101.');
  assert.equal(e({ tempo_change_pct: '5' }), 'ERR ops[0].tempo_change_pct must be a number from -90 to 100, got "5".');
  assert.equal(e({ tempo_change_pct: -90 }), `OK ${JSON.stringify({ ...EXV, tempo_change_pct: -90 })}`); assert.equal(e({ tempo_change_pct: 100 }), `OK ${JSON.stringify({ ...EXV, tempo_change_pct: 100 })}`);
  assert.equal(e({}, 'tempo_change_pct'), `OK ${JSON.stringify(EXV)}`, 'a missing tempo is 0');
  for (const [v, shown] of [[-1, '-1'], ['middle', '"middle"'], [1.5, '1.5'], [null, 'null']] as const) assert.equal(e({ after: v }), `ERR ops[0].after must be the bar the new bars follow (0 = at the start) or "end", got ${shown}.`, `after=${String(v)}`);
  assert.equal(e({ after: 0 }), `OK ${JSON.stringify({ ...EXV, after: 0 })}`); assert.equal(e({ after: 'end' }), `OK ${JSON.stringify({ ...EXV, after: 'end' })}`); assert.equal(e({ after: 99 }), `OK ${JSON.stringify({ ...EXV, after: 99 })}`);
  assert.equal(e({ extra: 1 }), 'ERR ops[0]: unexpected field "extra" (extend_bar holds only op, bar, bars, style, tempo_change_pct, after).');
});
test('after a head (Extend, Mix, Morph) every one of the structure steps is accepted, a thin out is refused in words that name all the steps', () => {
  const heads: PhraseParams[] = [{ kind: 'extend', source: 'bar_005', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }, { kind: 'mix', a: 'bar_005', b: 'bar_006', weight: 0.5, threshold: 0.5, ghost: false }, { kind: 'morph', a: 'bar_005', b: 'bar_006', bars: 5, order: 'musical', seed: 0 }];
  for (const head of heads) {
    const all = [{ op: 'keep', runs: [[1, 2]] }, { op: 'morph_between', a: 1, b: 2, bars: 3, order: 'musical', seed: 0, after: 1 }, MIXV, EXV, { ...EXV, after: 'end' }];
    const r = validatePhrase({ ...head, ops: all } as never); assert.ok(r.ok, `${head.kind}: ${r.ok ? '' : r.message}`);
    const t = validatePhrase({ ...head, ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 }] } as never);
    assert.equal(t.ok, false); assert.match(t.ok === false ? t.message : '', /\(keep, delete, copy, move, morph_between, mix_bars, extend_bar\) can follow an extend, a mix or a morph, got thin_out/);
  }
  const unknown = validatePhrase({ kind: 'transform', source: 'phrases/phrase_003', ops: [{ op: 'blend' }] } as never);
  assert.match(unknown.ok === false ? unknown.message : '', /"morph_between", "mix_bars" or "extend_bar", got "blend"/);
});

// ---- fuzz (card section 24) ---------------------------------------------------------------------------------------------------------------------------------------------------------------
const LINES = ['Mix bars 2 and 3.', 'Mix bar 2 and bar 4, 70 percent bar 4, as a path, in seeded order, seed 5, and put it after bar 4.', 'Mix bars 3 and 2, as a vote, threshold 40 percent, with ghost notes, and put it at the end.', 'Mix bars 1 and 2, as a path, in by-channel order, put it before bar 1.',
  'Extend bar 2 to 4 bars.', 'Extend bar 2 to 6 bars, building up, 20 percent slower.', 'Extend bar 3 to 1 bar, adding ghost notes, and put it at the end.', 'Extend bar 1 to 2 bars, repeating with fills, 10 percent faster, and put them after bar 5.'];
test('CORRUPTION FUZZ: every sentence reads; damage each token of it (one at a time) and every damaged sentence is refused', () => {
  let damaged = 0;
  for (const line of LINES) {
    assert.ok(parse(`${EXTEND} ${line}`, V).ok, line);
    const tokens = line.match(/\S+/g)!;
    for (let i = 0; i < tokens.length; i++) {
      const swapped = tokens.map((t, j) => (j === i ? (/[.,]$/.test(t) ? `ZZZ${t.slice(-1)}` : 'ZZZ') : t)).join(' ');
      assert.ok(!parse(`${EXTEND} ${swapped}`, V).ok, `token ${i} of "${line}" damaged -> "${swapped}" should be refused`);
      damaged++;
    }
  }
  assert.ok(damaged > 90);
});
test('NEVER THROWS: cut, repeated and shuffled tokens of every sentence give an answer (ok or an error with a place), never an exception', () => {
  let seed = 7; const rnd = (n: number): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed % n; };
  const all = LINES.join(' ').match(/\S+/g)!;
  for (let i = 0; i < 400; i++) {
    const line = LINES[rnd(LINES.length)]; const tokens = line.match(/\S+/g)!;
    const variants = [
      tokens.slice(0, rnd(tokens.length + 1)).join(' '),
      [...tokens, ...tokens.slice(rnd(tokens.length))].join(' '),
      tokens.map((t) => ({ t, k: rnd(1000) })).sort((x, y) => x.k - y.k).map((x) => x.t).join(' '),
      Array.from({ length: 1 + rnd(10) }, () => all[rnd(all.length)]).join(' '),
    ];
    for (const v of variants) for (const head of [EXTEND, TAKE, 'Mix [[bar_005]] and [[bar_006]].', '']) {
      const r = parse(`${head} ${v}`.trim(), V);
      assert.ok(r.ok === true || (typeof r.error.message === 'string' && r.error.line >= 1 && r.error.column >= 1), v);
    }
  }
});
