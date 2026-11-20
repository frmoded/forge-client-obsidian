// 2026-11-19-0996b (BAR WORDS INSIDE A PHRASE) - the PURE half of the click, written RED first: which typed texts make a click on a bar insert its POSITION (the verbs Duplicate, Copy, Move, Delete, Remove, Keep, Morph, Mix, Extend, first word of the text,
// any case) and what is inserted (` bar 3`, then ` and bar 5`), and the one change in the action reader: `Duplicate bar 3.` is a sentence of the phrase LIST (it has a number, never a link), while `Duplicate [[bar_007]].` (the 0992 note copy) is still the action
// sentence and every other 0992 refusal still holds.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { barInsertion, barNumberOf, barWordVerb, readActionText } from './duplicate-sentence-core.ts';

test('barWordVerb: the first word of the text decides, any case, whole words only; other text and the empty text are not bar words', () => {
  for (const v of ['Duplicate', 'Copy', 'Move', 'Delete', 'Remove', 'Keep', 'Morph', 'Mix', 'Extend']) {
    assert.equal(barWordVerb(v), v.toLowerCase(), v);
    assert.equal(barWordVerb(v.toUpperCase()), v.toLowerCase());
    assert.equal(barWordVerb(`  ${v.toLowerCase()} bar 3`), v.toLowerCase(), 'leading white space, more words');
    assert.equal(barWordVerb(`${v} bar 3 and`), v.toLowerCase());
  }
  for (const t of ['', '   ', 'Foo', 'Please duplicate', 'Duplicates', 'unduplicate bar 3', 'Copyright', 'Mixed', 'Extended bar', 'Moved', 'Keeper', 'Remover', 'Deleted', 'Take [[phrase_003]]', 'Thin out bars 1 to 2', 'Make it 8 bars long', 'Bar 3 is replaced by [[bar_009]]', 'Morphing']) assert.equal(barWordVerb(t), null, JSON.stringify(t));
});

test('barInsertion: ` bar 3` after a verb, ` and bar 5` after a bar reference, no extra space after white space or at the start; the number is the bar as the Score shows it now', () => {
  assert.equal(barInsertion('Duplicate', 3), ' bar 3');
  assert.equal(barInsertion('Duplicate ', 3), 'bar 3', 'the caret already follows a space');
  assert.equal(barInsertion('Move', 8), ' bar 8');
  assert.equal(barInsertion('Duplicate bar 3', 5), ' and bar 5');
  assert.equal(barInsertion('Duplicate bar 3 ', 5), 'and bar 5');
  assert.equal(barInsertion('Delete bar 3 and bar 5', 7), ' and bar 7');
  assert.equal(barInsertion('Delete bars 3 to 5', 8), ' and bar 8');
  assert.equal(barInsertion('Keep bars 2, 4', 6), ' and bar 6', 'a list written with commas');
  assert.equal(barInsertion('Morph bar 2', 3), ' and bar 3');
  assert.equal(barInsertion('Delete bar 3 and', 5), ' bar 5', 'the person typed "and" themselves');
  assert.equal(barInsertion('Delete bar 3 and ', 5), 'bar 5');
  assert.equal(barInsertion('Delete bar 3,', 5), ' bar 5');
  assert.equal(barInsertion('', 3), 'bar 3', 'at the very start there is no leading space');
  assert.equal(barInsertion('Move bar 3 back', 5), ' bar 5', 'after a direction word it is a new bar word');
  assert.equal(barInsertion('Copy\n', 2), 'bar 2');
  assert.equal(barInsertion('Delete (', 2), 'bar 2', 'after an opening bracket, as the link insertion does');
});

test('readActionText: `Duplicate bar 3.` and `Duplicate bars 3 to 5.` are NOT action texts (they are sentences of the list); `Duplicate [[bar_007]].` still is; the 0992 refusals hold', () => {
  for (const t of ['Duplicate bar 3.', 'Duplicate bars 3 to 5.', 'duplicate bar 3', 'DUPLICATE BARS 3 TO 5 AND BAR 8.', 'Duplicate bar 3. Duplicate bar 5.', 'Keep bars 1 to 2. Duplicate bar 3.', 'Duplicate bar 3. Move bar 2 back.', 'Duplicate bar 3\nDuplicate bar 4']) assert.deepEqual(readActionText(t), { kind: 'none' }, t);
  assert.deepEqual(readActionText('Duplicate [[bar_007]].'), { kind: 'duplicate', target: 'bar_007' });
  assert.deepEqual(readActionText('duplicate [[bars/bar_007|seven]]'), { kind: 'duplicate', target: 'bars/bar_007' });
  const refused = (t: string): string => { const r = readActionText(t); assert.equal(r.kind, 'refused', t); return (r as { message: string }).message; };
  assert.match(refused('Duplicate'), /Duplicate what/);
  assert.match(refused('Duplicate bar_007.'), /needs a link/, 'bar_007 is a note name, not "bar 7": still the 0992 refusal');
  assert.match(refused('Duplicate [[bar_007]]. Keep bars 1 to 2.'), /on its own/);
  assert.match(refused('Duplicate [[bar_007]]. Duplicate [[bar_008]].'), /one note at a time/);
  assert.match(refused('Duplicate [[bar_007]]. Duplicate bar 3.'), /on its own/, 'one action sentence with a list sentence: refused as 0992 refused any second sentence');
  assert.match(refused('Duplicate bar 3. Duplicate [[bar_007]].'), /on its own/);
  assert.equal(readActionText('Keep bars 1 to 2. Keep bar 3.').kind, 'none');
});

test('barNumberOf: the bar number of what was clicked is its `bar` param (1-based, as the selection menu reads it); a mix is one bar (bar 1); anything else cannot tell', () => {
  assert.equal(barNumberOf({ bar: 3, bars: 8 }, false), 3);
  assert.equal(barNumberOf({ bar: 1 }, true), 1);
  assert.equal(barNumberOf({ a: 'bar_005', b: 'bar_006', weight: 0.5 }, true), 1, 'a mix has no `bar`: it is one bar');
  for (const p of [{}, { bar: 0 }, { bar: -2 }, { bar: 2.5 }, { bar: '3' }, { bar: null }, null, undefined]) assert.equal(barNumberOf(p as never, false), null, JSON.stringify(p));
});
