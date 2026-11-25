// 2026-11-24-1040 (mutation pass): pins for the survivors of the generated pass over the 1040 diff. Each test was run RED against its surviving mutant (hand mutant, scripts/dev/mutate.mjs --hand) and is green on the real code.
//   1. src/list-model.lean.ts:41 `paintNames: () => 0` -> `() => 1`: the lean list model paints no bar names, and says so (the number painted is 0, as the full model's paintBarNotes counts what it painted).
//   3. src/phrase-grammar-core.ts:265 ('keep' / 'delete' -> '') and :272 (`verb === 'copy' || verb === 'move'` -> true): Keep and Delete take NO place words. `Keep bar 3 after bar 5.` is refused at the word `after` (not accepted with the place dropped), and `and put it ...` after a Keep or
//      a Delete is read as another bar list (so refused at `put`, as it always was), not probed as a place (which would refuse at the `and`).
//   2. src/phrase-core.ts:420 'moved bars follow' -> '': the words of the refusal of a Move's bad `after` (the old pins say only "ops[0].after must be"): the whole sentence, as Copy's and the Morph/Mix/Extend ones are pinned.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { listModel as lean } from './list-model.lean.ts';
import { validatePhrase } from './phrase-core.ts';
import { parse } from './phrase-grammar-core.ts';
import { PHRASE_VAULT } from './test-support/phrase-list-fixtures.ts';

test('lean: the list model paints no bar names, and its answer says none were painted (0)', () => {
  assert.strictEqual(lean.repair.paintNames({} as never, {} as never), 0);
});

test('a Move whose `after` is not a bar or "end" is refused in the words the driver reads: "the bar the moved bars follow", the value as it was written', () => {
  const v = (after: unknown): string => { const r = validatePhrase({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'move', runs: [[1, 1]], after }] }); return r.ok ? 'OK' : r.message; };
  for (const [value, shown] of [[-1, '-1'], ['middle', '"middle"'], [1.5, '1.5'], [null, 'null']] as const) {
    assert.equal(v(value), `ops[0].after must be the bar the moved bars follow (0 = at the start) or "end", got ${shown}.`);
  }
  // Copy keeps its own words (the same line serves both)
  const c = validatePhrase({ kind: 'transform', source: 'phrases/phrase_006', ops: [{ op: 'copy', runs: [[1, 1]], after: -1 }] });
  assert.equal(c.ok ? 'OK' : c.message, 'ops[0].after must be the bar the copies follow (0 = at the start) or "end", got -1.');
});

const refused = (sentence: string): { message: string; line: number; column: number } => {
  const r = parse(`Take [[phrase_006]]. ${sentence}`, PHRASE_VAULT);
  assert.equal(r.ok, false, `${sentence} should be refused`);
  return (r as unknown as { error: { message: string; line: number; column: number } }).error;
};

test('Keep and Delete take no place words: the sentence is refused at the place word, in the grammar\'s own words (a place is Copy\'s, Move\'s, Morph\'s, Mix\'s and Extend\'s)', () => {
  assert.deepEqual(refused('Keep bar 3 after bar 5.'), { message: 'Expected the end of the sentence, but found "after".', line: 1, column: 33 });
  assert.deepEqual(refused('Delete bars 1 to 2 at the end.'), { message: 'Expected the end of the sentence, but found "at".', line: 1, column: 41 });
  assert.deepEqual(refused('Delete bar 2 to the start.'), { message: 'Expected the end of the sentence, but found "to".', line: 1, column: 35 });
  for (const s of ['Keep bar 3 after bar 5.', 'Delete bar 3 after bar 5.', 'Keep bar 3 at the end.']) assert.equal(parse(`Take [[phrase_006]]. ${s}`, PHRASE_VAULT).ok, false, s);
});

test('after a Keep or a Delete, `and put it ...` / `and place ...` is read as one more bar list (and refused at the word that is not a bar), never as a place: the words are not "Expected the end of the sentence"', () => {
  assert.deepEqual(refused('Keep bar 3 and put it at the end.'), { message: 'Expected "bar N" or "bars N to M", but found "put".', line: 1, column: 37 });
  assert.deepEqual(refused('Delete bar 3, and put it at the end.'), { message: 'Expected "bar N" or "bars N to M", but found "put".', line: 1, column: 40 });
  assert.deepEqual(refused('Delete bar 3 and place after bar 5.'), { message: 'Expected "bar N" or "bars N to M", but found "place".', line: 1, column: 39 });
  assert.deepEqual(refused('Keep bar 3 and put it.'), { message: 'Expected "bar N" or "bars N to M", but found "put".', line: 1, column: 37 });
});

test('pin: the same words ARE a place after a Copy and a Move (so the two tests above are about the verb, not the words)', () => {
  for (const s of ['Copy bar 3 after bar 5.', 'Move bar 3 after bar 5.', 'Copy bar 3 and put it at the end.', 'Move bar 3 and put it at the end.']) assert.equal(parse(`Take [[phrase_006]]. ${s}`, PHRASE_VAULT).ok, true, s);
});
