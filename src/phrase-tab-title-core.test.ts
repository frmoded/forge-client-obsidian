// 2026-10-30-1010 (0900 item (e)) - the title of a phrase's tab: a transform says what it is a transform of; every other phrase is its file name, as ever.
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { phraseTabTitle } from './phrase-tab-title-core.ts';
import type { PhraseParams } from './phrase-core.ts';

const transform = (source: string): PhraseParams => ({ kind: 'transform', source, ops: [{ op: 'thin_out', first: 1, last: 2, amount: 0.5 } as any] });

test('a transform: its own name, then what it is a transform of (the source\'s name, not its folder)', () => {
  assert.equal(phraseTabTitle('phrase_011', transform('phrases/phrase_003')), 'phrase_011 · transform of phrase_003');
  assert.equal(phraseTabTitle('phrase_011', transform('phrase_003')), 'phrase_011 · transform of phrase_003', 'a bare name works too');
  assert.equal(phraseTabTitle('phrase_012', transform('phrases/phrase_011')), 'phrase_012 · transform of phrase_011', 'a transform of a transform names its direct source');
});

test('every other phrase, and a phrase that has not been read, is its file name: nothing about the title of an extend, a morph or a mix changes', () => {
  const others: PhraseParams[] = [
    { kind: 'extend', source: 'bar_007', bars: 4, style: 'repeat_with_fills', tempo_change_pct: 0 },
    { kind: 'morph', a: 'bar_007', b: 'bar_008', bars: 5, order: 'musical', seed: 0 } as any,
    { kind: 'mix', a: 'bar_007', b: 'bar_008', weight: 0.5, threshold: 0.5, ghost: false },
  ];
  for (const p of others) assert.equal(phraseTabTitle('phrase_004', p), 'phrase_004', p.kind);
  assert.equal(phraseTabTitle('phrase_004', null), 'phrase_004');
});

test('a transform whose source has no name (a damaged note) keeps the file name rather than a title that ends in "of"', () => {
  assert.equal(phraseTabTitle('phrase_011', transform('phrases/')), 'phrase_011');
  assert.equal(phraseTabTitle('phrase_011', transform('')), 'phrase_011');
  assert.equal(phraseTabTitle('phrase_011', transform('x')), 'phrase_011 · transform of x', 'the shortest name there is still counts as a name (the edge between "no name" and "a name")');
});
