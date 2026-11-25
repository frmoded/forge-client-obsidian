// 2026-11-24-1031 (pitch in bars, Stage 1b) - the mutation pass of the melody phrase answered (the survivors in the grammar and the recipe reader): the exact words of every refusal a person can read, the boundary of the changes a melody phrase takes,
// a fork after one structure step, a sentence of a melody phrase that is none the grammar knows, and a capital W in the recipe.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parse, type GrammarVault } from './phrase-grammar-core.ts';
import { parseRecipe } from './recipe-grammar-core.ts';
import { VAULT } from './test-support/sentence-list-fixtures.ts';

const MELODY_BARS = ['bar_101', 'bar_102', 'bar_103'];
const V: GrammarVault = { ...VAULT, bars: [...(VAULT.bars as string[]), ...MELODY_BARS], phrases: [...(VAULT.phrases as string[]), 'phrase_101'], melody: MELODY_BARS, melodyPhrases: ['phrase_101'] };
const say = (text: string, vault: GrammarVault = V): { ok: true; params: any } | { ok: false; message: string; column: number } => {
  const r = parse(text, vault);
  return r.ok ? { ok: true, params: (r as { params: any }).params } : { ok: false, message: r.error.message, column: r.error.column };
};
const refused = (text: string): { message: string; column: number } => { const r = say(text); assert.equal(r.ok, false, `${text} should be refused`); return r as { message: string; column: number }; };

test('a sentence after the head of a melody phrase that is none of the ones it takes is refused in the words that list them (it is not ignored)', () => {
  const r = refused('Repeat [[bar_101]] for 3 bars. Hello there.');
  assert.equal(r.message, 'Expected "Keep ...", "Delete ...", "Copy ...", "Move ..." or "Bar N is replaced by [[a melody bar]]", but found "Hello".');
  assert.equal(r.column, 32, 'at the first word of the sentence');
  assert.equal(say('Repeat [[bar_101]] for 3 bars.').ok, true, 'the head alone is a phrase');
  assert.equal(say('Repeat [[bar_101]] for 3 bars. Keep bars 1 to 2.').ok, true, 'and so is a head with a sentence it takes');
});

test('a melody phrase takes at most 16 changes: 16 are read, 17 are refused in the words that count them', () => {
  const deletes = (n: number): string => ['Repeat [[bar_101]] for 64 bars.', ...Array.from({ length: n }, (_, i) => `Delete bar ${i + 1}.`)].join(' ');
  const sixteen = say(deletes(16)); assert.equal(sixteen.ok, true); if (sixteen.ok) assert.equal(sixteen.params.ops.length, 16);
  const r = refused(deletes(17));
  assert.equal(r.message, 'Expected at most 16 changes, but found 17.');
  assert.equal(r.column, 1, 'at the head of the phrase');
});

test('after ONE structure step the forks number the bars AFTER it: a Copy at the end makes a bar 4 of a 3-bar head, and bar 4 may be replaced; with no step it may not', () => {
  const p = say('Repeat [[bar_101]] for 3 bars. Copy bar 2 and put it at the end. Bar 4 is replaced by [[bar_102]].');
  assert.equal(p.ok, true, p.ok ? '' : p.message);
  if (p.ok) { assert.deepEqual(p.params.overrides, { 4: 'bars/bar_102' }); assert.equal(p.params.ops.length, 1); }
  assert.match(refused('Repeat [[bar_101]] for 3 bars. Bar 4 is replaced by [[bar_102]].').message, /Expected a bar of this phrase \(1 to 3\), but found 4/);
});

test('a bar of the other kind in a fork is refused in the whole sentence, whichever way it goes', () => {
  assert.equal(refused('Repeat [[bar_101]] for 3 bars. Bar 2 is replaced by [[bar_001]].').message,
    'A phrase is all rhythm bars or all melody bars: bar_001 is a rhythm bar and this phrase is made of melody bars.');
  assert.equal(refused('Extend [[bar_001]] to 4 bars, repeating with fills. Bar 2 is replaced by [[bar_101]].').message,
    'A phrase is all rhythm bars or all melody bars: bar_101 is a melody bar and this phrase is made of rhythm bars.');
});

test('a composition that plays beats and notes is refused in the whole sentence, whichever section comes first', () => {
  assert.equal(refused('Play [[phrase_001]] for 2 bars. Then play [[phrase_101]] for 2 bars.').message,
    'A composition plays beats or notes, not both: phrase_101 is a melody phrase, and an earlier section plays beats.');
  assert.equal(refused('Play [[phrase_101]] for 2 bars. Then play [[phrase_001]] for 2 bars.').message,
    'A composition plays beats or notes, not both: phrase_001 plays beats, and an earlier section plays notes.');
  assert.equal(say('Play [[phrase_101]] for 2 bars. Then play [[phrase_101]] for 2 bars.').ok, true, 'notes and notes are one kind');
});

test('in the recipe a melody bar is repeated as it is: "with" after its bars is refused in the words about beats, with a capital W as with a small one', () => {
  const WORDS = 'That works on beats, not on notes. A melody bar is repeated as it is: "Repeat it for N bars."';
  for (const w of ['with fills', 'With fills', 'WITH FILLS']) {
    const r = parseRecipe(`Take [[bar_101]]. Repeat it for 4 bars ${w}.`, V);
    assert.equal(r.ok, false, w); if (!r.ok) assert.equal(r.error.message, WORDS, w);
  }
  assert.equal(parseRecipe('Take [[bar_101]]. Repeat it for 4 bars.', V).ok, true, 'a plain repeat of a melody bar is read');
});
