// 2026-11-24-1031 (pitch in bars, Stage 1b) - the phrase GRAMMAR on MELODY bars. A phrase is ALL rhythm bars or ALL melody bars. A melody phrase opens with the PLAIN REPEAT, `Repeat [[bar_101]] for 10 bars.` (the bar N times, nothing added: an Extend adds
// fills, which are about beats), and takes `Bar N is replaced by [[bar_NNN]].`, Keep, Delete, Copy (with its place words) and Move. Everything that works on hits (Extend with fills, Make it N percent slower, Make it N bars long, Take, Thin out, Double up,
// Mix, Morph, and the steps Mix/Morph/Extend bars) is refused AT SENTENCE TIME in plain words ("That works on beats, not on notes."), never in the Beat Box's. A rhythm phrase is read as it always was (the pins at the bottom).
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { canonical, describe, parse, type GrammarVault } from './phrase-grammar-core.ts';
import { VAULT } from './test-support/sentence-list-fixtures.ts';

const MELODY_BARS = ['bar_101', 'bar_102', 'bar_103'];
const V: GrammarVault = { ...VAULT, bars: [...(VAULT.bars as string[]), ...MELODY_BARS], phrases: [...(VAULT.phrases as string[]), 'phrase_101'], melody: MELODY_BARS, melodyPhrases: ['phrase_101'] };
const BEATS = 'That works on beats, not on notes.';
const ok = (text: string, vault: GrammarVault = V) => { const r = parse(text, vault); assert.equal(r.ok, true, `${text}: ${r.ok ? '' : r.error.message}`); return (r as { ok: true; params: any }).params; };
const refused = (text: string, vault: GrammarVault = V): string => { const r = parse(text, vault); assert.equal(r.ok, false, `${text} should be refused`); return (r as { ok: false; error: { message: string } }).error.message; };

// ---- the plain repeat -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('Repeat [[bar]] for N bars is the head of a melody phrase: an extend that repeats and adds nothing; it says itself back as the same sentence', () => {
  const p = ok('Repeat [[bar_101]] for 10 bars.');
  assert.deepEqual(p, { kind: 'extend', source: 'bar_101', bars: 10, style: 'repeat', tempo_change_pct: 0 });
  assert.equal(describe(p), 'Repeat [[bar_101]] for 10 bars.');
  assert.deepEqual(parse(describe(p), V), { ok: true, params: canonical(p) });
  assert.equal(describe(ok('Repeat [[bar_101]] for 1 bar.')), 'Repeat [[bar_101]] for 1 bar.');
  assert.equal(ok('repeat bar_101 for ten bars.').bars, 10, 'any case, a bare name, a number word');
});

test('the repeat takes the bars, the forks, and the structure steps Keep, Delete, Copy (with place words) and Move, in any order after the head', () => {
  const p = ok('Repeat [[bar_101]] for 10 bars. Bar 2 is replaced by [[bar_102]]. Bar 3 is replaced by [[bar_103]]. Keep bars 1 to 5. Copy bar 2 and put it at the end. Move bar 1 one bar right. Delete bar 4.');
  assert.deepEqual(p.overrides, { 2: 'bars/bar_102', 3: 'bars/bar_103' });
  assert.deepEqual(p.ops.map((o: any) => o.op), ['keep', 'copy', 'move', 'delete']);
  assert.equal(p.ops[1].after, 'end');
  assert.deepEqual(parse(describe(p), V), { ok: true, params: canonical(p) }, 'the list says it back and reads it back');
  const nine = ok(['Repeat [[bar_101]] for 10 bars.', ...[2, 3].map((n) => `Bar ${n} is replaced by [[bar_10${n}]].`)].join(' '));
  assert.equal(Object.keys(nine.overrides).length, 2);
});

test('a fork past the last bar is refused as for any phrase; a number of bars outside 1 to 64 is too', () => {
  assert.match(refused('Repeat [[bar_101]] for 3 bars. Bar 4 is replaced by [[bar_102]].'), /Expected a bar of this phrase \(1 to 3\), but found 4/);
  assert.match(refused('Repeat [[bar_101]] for 65 bars.'), /from 1 to 64/);
  assert.match(refused('Repeat [[bar_101]] for 0 bars.'), /from 1 to 64/);
  assert.match(refused('Repeat [[bar_101]].'), /Expected "for N bars"/);
});

test('Repeat names a MELODY bar: a rhythm bar is refused in words that say what to say instead; a name that is not a bar is refused as any bar is', () => {
  const m = refused('Repeat [[bar_001]] for 4 bars.');
  assert.match(m, /Repeat is for melody bars/); assert.match(m, /bar_001 is a rhythm bar/); assert.match(m, /Extend \[\[bar_001\]\] to 4 bars, repeating with fills/);
  assert.doesNotMatch(m, /Beat Box|Rhythm Box|channels/);
  assert.match(refused('Repeat [[bar_999]] for 4 bars.'), /bar_999/);
  assert.match(refused('Repeat [[phrase_101]] for 4 bars.'), /a bar of this vault/);
});

test('a vault that names no melody bar (every vault of today, the lean edition) reads Repeat as a refusal and every other sentence as it always did', () => {
  const m = refused('Repeat [[bar_001]] for 4 bars.', VAULT);
  assert.match(m, /Repeat is for melody bars/);
});

test('"Repeat that" is still a composition sentence and is refused in a phrase as before', () => {
  assert.match(refused('Repeat that 2 more times.'), /belongs to a composition/);
});

// ---- a phrase is all rhythm bars or all melody bars ----------------------------------------------------------------------------------------------------------------------------------------------
test('a mixed phrase is refused in plain words, once, whichever kind the head is: a rhythm bar replacing a bar of a melody phrase, a melody bar replacing a bar of a rhythm phrase', () => {
  const a = refused('Repeat [[bar_101]] for 4 bars. Bar 2 is replaced by [[bar_001]].');
  assert.match(a, /A phrase is all rhythm bars or all melody bars/); assert.match(a, /bar_001 is a rhythm bar/); assert.match(a, /melody bars/);
  const b = refused('Extend [[bar_001]] to 4 bars, repeating with fills. Bar 2 is replaced by [[bar_102]].');
  assert.match(b, /A phrase is all rhythm bars or all melody bars/); assert.match(b, /bar_102 is a melody bar/);
  const c = refused('Take [[phrase_001]]. Bar 2 is replaced by [[bar_102]].');
  assert.match(c, /A phrase is all rhythm bars or all melody bars/);
  for (const m of [a, b, c]) assert.doesNotMatch(m, /rhythm data|channels|Beat Box/i);
});

// ---- the verbs that work on hits ------------------------------------------------------------------------------------------------------------------------------------------------------------------------
test('Extend with fills, Mix and Morph of a melody bar are refused at sentence time in plain words', () => {
  for (const s of ['Extend [[bar_101]] to 4 bars, repeating with fills.', 'Extend [[bar_101]] to 4 bars.', 'Mix [[bar_101]] and [[bar_102]], 50 percent [[bar_101]], as a vote.', 'Mix [[bar_001]] and [[bar_101]], 50 percent [[bar_001]], as a vote.', 'Morph [[bar_101]] into [[bar_102]] over 4 bars, in musical order.', 'Morph [[bar_001]] into [[bar_103]] over 4 bars, in musical order.']) {
    const m = refused(s);
    assert.ok(m.startsWith(BEATS), `${s}: ${m}`);
    assert.doesNotMatch(m, /rhythm data|channels|Beat Box|Rhythm Box|A melody bar cannot be used in a phrase yet/i, s);
  }
  assert.match(refused('Extend [[bar_101]] to 4 bars.'), /Repeat \[\[bar_101\]\] for 4 bars/, 'and it says what to say instead');
});

test('Make it N percent slower, Make it N bars long, Thin out, Double up and the steps Mix, Morph and Extend bars are refused on a melody phrase, in plain words, with the code the service cannot fix', () => {
  const head = 'Repeat [[bar_101]] for 8 bars. ';
  const lines: Array<[string, RegExp]> = [
    ['Make it 20 percent slower.', /own tempo/], ['Make it 20 percent faster.', /own tempo/], ['Make it 4 bars long.', /Repeat \[\[bar_101\]\] for N bars/],
    ['Thin out bars 2 to 3, by half, keeping the downbeat.', /./], ['Double up bars 2 to 3.', /./], ['Mix bars 2 and 3.', /./], ['Morph bars 2 and 3 across 5 bars.', /./], ['Extend bar 2 to 4 bars, repeating with fills.', /./],
  ];
  for (const [line, extra] of lines) {
    const r = parse(head + line, V);
    assert.equal(r.ok, false, line);
    if (r.ok) continue;
    assert.ok(r.error.message.startsWith(BEATS), `${line}: ${r.error.message}`);
    assert.match(r.error.message, extra, line);
    assert.equal(r.error.code, 'head', `${line}: the service cannot fix it`);
    assert.doesNotMatch(r.error.message, /rhythm data|channels|Beat Box|Rhythm Box/i, line);
  }
});

test('Take: a melody phrase is refused in plain words at sentence time (a melody BAR already is: it is not a phrase)', () => {
  const m = refused('Take [[phrase_101]].');
  assert.ok(m.startsWith(BEATS), m); assert.match(m, /Keep, Delete, Copy and Move/);
  assert.match(refused('Take [[bar_101]].'), /a phrase, an arrangement or a composition of this vault/);
  ok('Take [[phrase_001]]. Keep bar 2.');
});

test('an arrangement refuses a melody phrase in plain words, naming what it needs; a rhythm phrase on a kit is read as it always was', () => {
  const m = refused('Play [[phrase_101]] on the [[rock]] kit. Together.');
  assert.match(m, /A melody phrase cannot be played on a kit/); assert.match(m, /a kit plays beats/); assert.match(m, /track of its own/);
  assert.doesNotMatch(m, /rhythm data|channels|Beat Box/i);
  ok('Play [[phrase_001]] on the [[rock]] kit. Together.');
});

// ---- a composition plays a melody phrase ------------------------------------------------------------------------------------------------------------------------------------------------------------
test('a composition plays a melody phrase through the existing Play sentence, for a number of bars, with Repeat that; beats and notes in one composition are refused in plain words', () => {
  assert.deepEqual(ok('Play [[phrase_101]].'), { kind: 'composition', sections: [{ source: 'phrases/phrase_101' }] });
  assert.deepEqual(ok('Play [[phrase_101]] for 4 bars. Repeat that once more.').sections, [{ source: 'phrases/phrase_101', length: 4, repeat: 1 }]);
  const m = refused('Play [[phrase_001]] for 4 bars. Then play [[phrase_101]] for 4 bars.');
  assert.match(m, /A composition plays beats or notes, not both/); assert.match(m, /phrase_101 is a melody phrase/);
  assert.match(refused('Play [[phrase_101]]. Then play [[phrase_001]].'), /A composition plays beats or notes, not both.*phrase_001 plays beats/);
  assert.equal(parse('Play [[phrase_101]]. Then play [[phrase_101]] for 2 bars.', V).ok, true);
  assert.equal(parse('Play [[phrase_001]]. Then play [[arr_001]] for 2 bars.', V).ok, true, 'beats and beats is as it was');
});


// ---- P3: a rhythm phrase is read as it always was ----------------------------------------------------------------------------------------------------------------------------------------------------
test('P3: every rhythm sentence parses the same with and without the melody lists, and says itself back the same', () => {
  const sentences = [
    'Extend [[bar_001]] to 4 bars, repeating with fills.', 'Extend [[bar_005]] to 8 bars, building up, 20 percent slower. Bar 3 is replaced by [[bar_007]]. Make it 6 bars long.',
    'Mix [[bar_001]] and [[bar_003]], 50 percent [[bar_001]], as a vote. Threshold 40 percent.', 'Morph [[bar_003]] into [[bar_001]] over 4 bars, in musical order. Bar 2 is replaced by [[bar_005]].',
    'Take [[phrase_001]]. Thin out bars 1 to 2, by half, keeping the downbeat. Keep bars 1 to 3.', 'Play [[phrase_001]] on the [[rock]] kit. Play [[phrase_002]] on the [[latin]] kit. Together.',
    'Play [[phrase_001]] for 4 bars. Then play [[phrase_002]] for 2 bars. Repeat that once more.', 'Extend [[bar_001]] to 4 bars, repeating with fills. Copy bar 2 and put it at the end.',
    'Extend [[bar_001]] to 4 bars, repeating with fills. Mix bars 1 and 2.', 'Extend [[bar_001]] to 4 bars, repeating with fills. Thin out bars 1 to 2.',
  ];
  for (const s of sentences) {
    const base = parse(s, VAULT);
    assert.deepEqual(parse(s, { ...VAULT, melody: [], melodyPhrases: [] }), base, s);
    assert.deepEqual(parse(s, { ...VAULT, melody: MELODY_BARS, melodyPhrases: ['phrase_101'] }), base, `${s}: lists that name nothing of the sentence change nothing`);
    if (base.ok) assert.equal(describe(base.params), describe((parse(s, V) as any).params), s);
  }
  assert.equal(describe({ kind: 'extend', source: 'bar_001', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 }), 'Extend [[bar_001]] to 4 bars, repeating with fills.');
});
